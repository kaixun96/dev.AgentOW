import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { OW } from "../../shared/constants.js";
import { RushCli } from "../tools/rushCli.js";
import { TmuxManager } from "../tools/tmuxManager.js";
import { GitClient } from "../tools/gitClient.js";
import { PrClient } from "../tools/prClient.js";
import { PrAttach } from "../tools/prAttach.js";
import { AdoClient } from "../tools/adoClient.js";
import { BatchStateStore, type BatchState, type BatchTaskState } from "../tools/batchState.js";
import {
  getProcessCommandLine,
  getProcessIdentity,
  terminateProcessGroup,
} from "../tools/processTree.js";
import { extractDebugLinks, fetchDebugUrlsFromLanding, buildDebugQueryString, buildFullTestUrl } from "../tools/debugLink.js";
import { FileLogger, RawOutputLog } from "../../shared/logger.js";
import {
  registerMcpTool,
  successResultWithDebug,
  largeOutputResult,
  truncateLines,
  sendLineNotification,
  jsonResult,
  textResult,
} from "../../shared/mcpHelpers.js";

const BATCH_ARTIFACT_EXCLUDE_PATHSPEC = ":(exclude).aero/**";

function execSimple(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.exec(cmd, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
}

function compactTimestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").replace(".", "-").replace("Z", "");
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function findLatestBatchDir(): string | undefined {
  const aeroRoot = `${OW.odspWebRoot}/.aero`;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(aeroRoot, { withFileTypes: true });
  } catch {
    return undefined;
  }
  const candidates: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("batch-")) {
      const batchDir: string = `${aeroRoot}/${entry.name}`;
      if (fs.existsSync(`${batchDir}/state.json`)) {
        candidates.push(batchDir);
      }
    }
  }
  candidates.sort((left, right) => right.localeCompare(left));
  return candidates[0];
}

async function startBatchSupervisor(
  tmux: TmuxManager,
  state: BatchState,
  signal?: AbortSignal,
): Promise<string> {
  const target: string = await tmux.openWindow(state.supervisorWindow, signal);
  const executable: string = path.resolve(process.argv[1]);
  const runnerCommand: string =
    `restarts=0; while [ "$restarts" -lt 10 ]; do ${shellQuote(process.execPath)} ${shellQuote(executable)} batch-runner ` +
    `--batch-dir ${shellQuote(state.batchDir)}; code=$?; [ "$code" -eq 0 ] && break; ` +
    `restarts=$((restarts + 1)); delay=$((restarts * 30)); [ "$delay" -gt 300 ] && delay=300; ` +
    `echo "[$(date +%H:%M:%S)] supervisor exited $code; restart $restarts/10 in $delay seconds" >> ${shellQuote(state.logPath)}; ` +
    `[ "$restarts" -ge 10 ] && break; sleep "$delay"; done; [ "$code" -ne 0 ] && ` +
    `echo "[$(date +%H:%M:%S)] supervisor stopped after $restarts failed restarts" >> ${shellQuote(state.logPath)}`;
  await tmux.send(target, runnerCommand, true, signal);
  return target;
}

export function registerOwTools(
  server: McpServer,
  logger: FileLogger,
  logDir: string,
): void {
  const rush = new RushCli(OW.odspWebRoot, logger);
  const tmux = new TmuxManager();
  const git = new GitClient(OW.odspWebRoot);
  const pr = new PrClient(OW.odspWebRoot, logger);
  const prAttach = new PrAttach(OW.odspWebRoot, logger);
  const ado = new AdoClient(OW.odspWebRoot);

  // ── 1. ow-status ──────────────────────────────────────────────────────────
  registerMcpTool(server, "ow-status", {
    description: "Environment snapshot: git branch, node version, rush install state, tmux sessions. Call this FIRST.",
  }, async (extras) => {
    const [branch, nodeVersion, windows, rushInstalled] = await Promise.all([
      git.branch(extras.signal).catch(() => "unknown"),
      execSimple("node -v").catch(() => "unknown"),
      tmux.listWindows(extras.signal),
      fs.promises.access(`${OW.odspWebRoot}/common/temp/last-install.flag`)
        .then(() => true).catch(() => false),
    ]);
    return successResultWithDebug(logger, "ow-status", {
      branch,
      nodeVersion,
      rushInstalled,
      tmuxWindows: windows,
      cwd: OW.odspWebRoot,
    });
  });

  // ── 2. ow-batch-start ─────────────────────────────────────────────────────
  registerMcpTool(server, "ow-batch-start", {
    description: "Start a durable serial agentOW batch in tmux. Each task runs in a fresh autonomous Copilot session, retries on interruption, and cannot block later tasks indefinitely.",
    inputSchema: {
      tasks: z.array(z.string().min(1)).min(1).max(100).describe("Ordered feature/bug descriptions; one draft PR per task."),
      taskTimeoutMinutes: z.number().int().min(15).max(480).optional().describe("Hard timeout for each Copilot attempt (default: 180)."),
      maxAttempts: z.number().int().min(1).max(5).optional().describe("Copilot attempts per task before recording failure and continuing (default: 3)."),
    },
  }, async (input, extras) => {
    const gitStatus = await git.run([
      "status",
      "--short",
      "--untracked-files=all",
      "--",
      ".",
      BATCH_ARTIFACT_EXCLUDE_PATHSPEC,
    ], extras.signal);
    if (gitStatus.exitCode !== 0) {
      throw new Error(`Unable to inspect odsp-web worktree: ${gitStatus.output}`);
    }
    if (gitStatus.output.trim()) {
      throw new Error(`Cannot start ow-batch with a dirty odsp-web worktree:\n${gitStatus.output}`);
    }

    const timestamp: string = compactTimestamp();
    const batchDir: string = `${OW.odspWebRoot}/.aero/batch-${timestamp}`;
    const supervisorWindow: string = `batch-${timestamp}`;
    const tasks: string[] = input.tasks.map((task) => task.trim());
    const store: BatchStateStore = BatchStateStore.create({
      batchDir,
      repositoryRoot: OW.odspWebRoot,
      tasks,
      taskTimeoutMinutes: input.taskTimeoutMinutes ?? 180,
      maxAttempts: input.maxAttempts ?? 3,
      supervisorWindow,
    });
    try {
      const target: string = await startBatchSupervisor(tmux, store.read(), extras.signal);
      return successResultWithDebug(logger, "ow-batch-start", {
        batchDir,
        statePath: store.statePath,
        summaryPath: `${batchDir}/summary.md`,
        logPath: `${batchDir}/batch.log`,
        tmuxTarget: target,
        taskCount: tasks.length,
        message: "Durable batch supervisor started. The batch continues if this Copilot session exits.",
      });
    } catch (error) {
      store.stop(`Failed to start supervisor: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  });

  // ── 3. ow-batch-status ────────────────────────────────────────────────────
  registerMcpTool(server, "ow-batch-status", {
    description: "Read persisted ow-batch state. Defaults to the most recent durable batch.",
    inputSchema: {
      batchDir: z.string().optional().describe("Absolute batch directory. Omit to inspect the latest durable batch."),
    },
  }, async (input, extras) => {
    const batchDir: string | undefined = input.batchDir ?? findLatestBatchDir();
    if (!batchDir) {
      throw new Error("No durable ow-batch state found.");
    }
    const store = new BatchStateStore(batchDir);
    const state: BatchState = store.read();
    const windows = await tmux.listWindows(extras.signal);
    const supervisorActive: boolean = windows.some((window) => window.name === state.supervisorWindow);
    const logTail: string[] = fs.existsSync(state.logPath)
      ? fs.readFileSync(state.logPath, "utf8").trimEnd().split("\n").slice(-20)
      : [];
    return successResultWithDebug(logger, "ow-batch-status", {
      state,
      supervisorActive,
      logTail,
    });
  });

  // ── 4. ow-batch-resume ────────────────────────────────────────────────────
  registerMcpTool(server, "ow-batch-resume", {
    description: "Restart a missing durable batch supervisor from its persisted state. Safe to call repeatedly.",
    inputSchema: {
      batchDir: z.string().optional().describe("Absolute batch directory. Omit to resume the latest durable batch."),
    },
  }, async (input, extras) => {
    const batchDir: string | undefined = input.batchDir ?? findLatestBatchDir();
    if (!batchDir) {
      throw new Error("No durable ow-batch state found.");
    }
    const store = new BatchStateStore(batchDir);
    const state: BatchState = store.read();
    if (state.status !== "running") {
      return successResultWithDebug(logger, "ow-batch-resume", {
        batchDir,
        resumed: false,
        status: state.status,
      });
    }
    const windows = await tmux.listWindows(extras.signal);
    const existing = windows.find((window) => window.name === state.supervisorWindow);
    if (existing) {
      return successResultWithDebug(logger, "ow-batch-resume", {
        batchDir,
        resumed: false,
        status: state.status,
        tmuxTarget: existing.target,
      });
    }
    const target: string = await startBatchSupervisor(tmux, state, extras.signal);
    store.appendLog("♻️ Missing supervisor restarted from persisted state");
    return successResultWithDebug(logger, "ow-batch-resume", {
      batchDir,
      resumed: true,
      status: state.status,
      tmuxTarget: target,
    });
  });

  // ── 5. ow-batch-stop ──────────────────────────────────────────────────────
  registerMcpTool(server, "ow-batch-stop", {
    description: "Stop a durable batch supervisor and persist the stopped state.",
    inputSchema: {
      batchDir: z.string().optional().describe("Absolute batch directory. Omit to stop the latest durable batch."),
      reason: z.string().optional().describe("Reason recorded in state and batch log."),
    },
  }, async (input, extras) => {
    const batchDir: string | undefined = input.batchDir ?? findLatestBatchDir();
    if (!batchDir) {
      throw new Error("No durable ow-batch state found.");
    }
    const store = new BatchStateStore(batchDir);
    const stopReason: string = input.reason ?? "Stopped by user";
    let state: BatchState = store.requestStop(stopReason);
    const stopDeadline: number = Date.now() + 5_000;
    while (Date.now() < stopDeadline && state.supervisorPid > 0) {
      const activeTask: BatchTaskState | undefined = state.tasks.find((task) => task.childPid > 0);
      if (activeTask) {
        const childIdentity: string = activeTask.childIdentity || getProcessIdentity(activeTask.childPid);
        const childCommandLine: string = getProcessCommandLine(activeTask.childPid);
        if (
          !activeTask.childIdentity
          && childIdentity
          && childCommandLine
          && !childCommandLine.toLowerCase().includes("copilot")
        ) {
          throw new Error(`Refusing to terminate unverified process ${activeTask.childPid}.`);
        }
        await terminateProcessGroup(activeTask.childPid, childIdentity);
        store.setChildProcess(activeTask.index, 0, "");
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
      state = store.read();
    }
    await tmux.killWindow(state.supervisorWindow, extras.signal);
    state = store.read();
    const remainingTask: BatchTaskState | undefined = state.tasks.find((task) => task.childPid > 0);
    if (remainingTask) {
      await terminateProcessGroup(
        remainingTask.childPid,
        remainingTask.childIdentity || getProcessIdentity(remainingTask.childPid),
      );
      store.setChildProcess(remainingTask.index, 0, "");
    }
    const lockDeadline: number = Date.now() + 5_000;
    while (!store.tryAcquireLock()) {
      if (Date.now() >= lockDeadline) {
        throw new Error("Timed out waiting for the batch supervisor to release its lifecycle lock.");
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 100));
    }
    try {
      store.stop(stopReason);
    } finally {
      store.releaseLock();
    }
    store.appendLog(`⏹️ Batch stopped — ${stopReason}`);
    return successResultWithDebug(logger, "ow-batch-stop", {
      batchDir,
      status: "stopped",
    });
  });

  // ── 6. ow-rush ────────────────────────────────────────────────────────────
  registerMcpTool(server, "ow-rush", {
    description: "Run any rush command with structured output and error parsing.",
    inputSchema: {
      command: z.string().describe("Rush subcommand (e.g. 'build', 'test', 'install', 'update')"),
      args: z.string().optional().describe("Additional arguments as a single string"),
    },
  }, async (input, extras) => {
    const args = [input.command, ...(input.args ? input.args.split(/\s+/) : [])];
    const log = new RawOutputLog(logDir, `rush-${input.command}`);
    const result = await rush.run(args, (line) => {
      log.writeLine(line);
      sendLineNotification(extras, "ow-rush", line);
    }, extras.signal);
    const { output, truncated } = truncateLines(result.lines);
    return largeOutputResult(log, logger, "ow-rush", {
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      errors: result.errors,
      warnings: result.warnings,
      truncated,
      output,
      rawOutputPath: log.path,
    });
  });

  // ── 3. ow-build ───────────────────────────────────────────────────────────
  registerMcpTool(server, "ow-build", {
    description: "Run rush build -t <project>. Omit project to build all changed projects.",
    inputSchema: {
      project: z.string().optional().describe("Rush project name or selector (e.g. '@ms/sp-pages', 'tag:spartan-apps')"),
    },
  }, async (input, extras) => {
    const log = new RawOutputLog(logDir, "rush-build");
    const result = await rush.build(input.project, extras.signal);
    const { output, truncated } = truncateLines(result.lines);
    return largeOutputResult(log, logger, "ow-build", {
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      durationHuman: `${(result.durationMs / 1000).toFixed(1)}s`,
      errors: result.errors,
      warnings: result.warnings,
      truncated,
      output,
      project: input.project ?? "(all changed)",
      rawOutputPath: log.path,
    });
  });

  // ── 4. ow-test ────────────────────────────────────────────────────────────
  registerMcpTool(server, "ow-test", {
    description: "Run rush test with Jest output parsing. Returns passed/failed/skipped counts.",
    inputSchema: {
      project: z.string().optional().describe("Rush project name"),
      testPattern: z.string().optional().describe("Test path pattern (omit file extension)"),
    },
  }, async (input, extras) => {
    const log = new RawOutputLog(logDir, "rush-test");
    const result = await rush.test(input.project, input.testPattern, extras.signal);

    // Parse Jest summary from output
    let passed = 0, failed = 0, skipped = 0;
    const failures: string[] = [];
    for (const line of result.lines) {
      const summaryMatch = line.match(/Tests:\s+(\d+)\s+passed/);
      if (summaryMatch) passed = parseInt(summaryMatch[1], 10);
      const failMatch = line.match(/(\d+)\s+failed/);
      if (failMatch) failed = parseInt(failMatch[1], 10);
      const skipMatch = line.match(/(\d+)\s+skipped/);
      if (skipMatch) skipped = parseInt(skipMatch[1], 10);
      if (line.includes("FAIL ")) failures.push(line);
    }

    const { output, truncated } = truncateLines(result.lines);
    return largeOutputResult(log, logger, "ow-test", {
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      passed,
      failed,
      skipped,
      failures,
      errors: result.errors,
      truncated,
      output,
      project: input.project,
      rawOutputPath: log.path,
    });
  });

  // ── 5. ow-start ───────────────────────────────────────────────────────────
  registerMcpTool(server, "ow-start", {
    description: "Start rush start --to <project> in a tmux window. Returns tmux target for polling.",
    inputSchema: {
      project: z.string().describe("Rush project name to start"),
    },
  }, async (input, extras) => {
    const target = await tmux.openWindow(OW.rushWindow, extras.signal);
    await tmux.send(target, `rush start --to ${input.project}`, true, extras.signal);
    return successResultWithDebug(logger, "ow-start", {
      tmuxTarget: target,
      project: input.project,
      message: `rush start --to ${input.project} launched in tmux. Poll with ow-session-capture to check status.`,
    });
  });

  // ── 6. ow-debuglink ───────────────────────────────────────────────────────
  registerMcpTool(server, "ow-debuglink", {
    description: "Extract debug link from rush start session and build fullTestUrl for browser testing. (1) Captures tmux output to find the landing page URL. (2) Fetches landing HTML (skips self-signed TLS) to extract loader + manifests URLs. (3) Optionally builds fullTestUrl = page URL + ?debug=true&loader=...&debugManifestsFile=...&debugFlights=...",
    inputSchema: {
      target: z.string().optional().describe("Tmux target (default: agentow:rush)"),
      sharePointPageUrl: z.string().optional().describe("SharePoint page URL. When provided, returns fullTestUrl with the debug query string appended."),
      flights: z.string().optional().describe("Optional flight numbers, comma-separated (e.g. '1535')."),
    },
  }, async (input, extras) => {
    const target = input.target ?? `${OW.tmuxSession}:${OW.rushWindow}`;
    const captured = await tmux.capture(target, 200, extras.signal);
    const links = extractDebugLinks(captured);

    let loader: string | undefined;
    let manifests: string | undefined;
    let debugQueryString: string | undefined;
    let fullTestUrl: string | undefined;

    if (links.landingPage) {
      try {
        const urls = await fetchDebugUrlsFromLanding(links.landingPage, extras.signal);
        loader = urls.loader;
        manifests = urls.manifests;
        if (loader && manifests) {
          debugQueryString = buildDebugQueryString(loader, manifests, input.flights);
        }
      } catch (err) {
        logger.error("ow-debuglink", `Failed to fetch landing page: ${(err as Error).message}`);
      }
    }

    // Fallback to any debugQueryString printed in tmux (older rush behavior)
    if (!debugQueryString && links.debugQueryString) {
      debugQueryString = links.debugQueryString.replace(/^\?/, "");
    }

    if (input.sharePointPageUrl && debugQueryString) {
      fullTestUrl = buildFullTestUrl(input.sharePointPageUrl, debugQueryString);
    }

    return successResultWithDebug(logger, "ow-debuglink", {
      landingPage: links.landingPage,
      loader,
      manifests,
      debugQueryString,
      fullTestUrl,
      tmuxTarget: target,
    });
  });

  // ── 7. ow-git ─────────────────────────────────────────────────────────────
  registerMcpTool(server, "ow-git", {
    description: "Run git commands with structured output.",
    inputSchema: {
      command: z.string().describe("Git subcommand (e.g. 'status', 'branch', 'diff', 'fetch')"),
      args: z.string().optional().describe("Additional arguments as a single string"),
    },
  }, async (input, extras) => {
    const args = [input.command, ...(input.args ? input.args.split(/\s+/) : [])];
    const result = await git.run(args, extras.signal);
    return successResultWithDebug(logger, "ow-git", {
      exitCode: result.exitCode,
      output: result.output,
    });
  });

  // ── 8. ow-session-open ────────────────────────────────────────────────────
  registerMcpTool(server, "ow-session-open", {
    description: "Open or attach a named tmux window in the agentow session.",
    inputSchema: {
      name: z.string().describe("Window name"),
    },
  }, async (input, extras) => {
    const target = await tmux.openWindow(input.name, extras.signal);
    return successResultWithDebug(logger, "ow-session-open", {
      target,
      message: `Window '${input.name}' ready.`,
    });
  });

  // ── 9. ow-session-send ────────────────────────────────────────────────────
  registerMcpTool(server, "ow-session-send", {
    description: "Send text to a tmux pane.",
    inputSchema: {
      target: z.string().describe("Tmux target (e.g. agentow:rush)"),
      text: z.string().describe("Text to send"),
      pressEnter: z.boolean().optional().describe("Press Enter after text (default: true)"),
    },
  }, async (input, extras) => {
    await tmux.send(input.target, input.text, input.pressEnter ?? true, extras.signal);
    return successResultWithDebug(logger, "ow-session-send", {
      target: input.target,
      sent: input.text,
      pressEnter: input.pressEnter ?? true,
    });
  });

  // ── 10. ow-session-capture ────────────────────────────────────────────────
  registerMcpTool(server, "ow-session-capture", {
    description: "Capture visible output of a tmux pane.",
    inputSchema: {
      target: z.string().describe("Tmux target (e.g. agentow:rush)"),
      lines: z.number().optional().describe("Number of lines to capture (default: 100)"),
    },
  }, async (input, extras) => {
    const captured = await tmux.capture(input.target, input.lines ?? 100, extras.signal);
    const outputLines = captured.split("\n");
    const { output, truncated } = truncateLines(outputLines, 50);
    return successResultWithDebug(logger, "ow-session-capture", {
      target: input.target,
      lineCount: outputLines.length,
      truncated,
      output,
    });
  });

  // ── 11. ow-session-list ───────────────────────────────────────────────────
  registerMcpTool(server, "ow-session-list", {
    description: "List all tmux windows in the agentow session.",
  }, async (extras) => {
    const windows = await tmux.listWindows(extras.signal);
    return successResultWithDebug(logger, "ow-session-list", {
      session: OW.tmuxSession,
      windows,
    });
  });

  // ── 12. ow-session-kill ───────────────────────────────────────────────────
  registerMcpTool(server, "ow-session-kill", {
    description: "Kill a tmux window or the entire agentow session.",
    inputSchema: {
      name: z.string().optional().describe("Window name to kill. Omit to kill entire session."),
    },
  }, async (input, extras) => {
    if (input.name) {
      await tmux.killWindow(input.name, extras.signal);
      return successResultWithDebug(logger, "ow-session-kill", {
        killed: `window '${input.name}'`,
      });
    } else {
      await tmux.killSession(extras.signal);
      return successResultWithDebug(logger, "ow-session-kill", {
        killed: "entire session",
      });
    }
  });

  // ── 13. ow-session-interrupt ──────────────────────────────────────────────
  registerMcpTool(server, "ow-session-interrupt", {
    description: "Send Ctrl+C to a tmux pane to interrupt a running process.",
    inputSchema: {
      target: z.string().describe("Tmux target (e.g. agentow:rush)"),
    },
  }, async (input, extras) => {
    await tmux.interrupt(input.target, extras.signal);
    return successResultWithDebug(logger, "ow-session-interrupt", {
      target: input.target,
      message: "Ctrl+C sent.",
    });
  });

  // ── 14. ow-version ─────────────────────────────────────────────────────
  registerMcpTool(server, "ow-version", {
    description: "Check current plugin version and whether an update is available from the remote repo.",
  }, async (extras) => {
    // Read version from plugin.json
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT ?? `${OW.odspWebRoot}/../dev.AgentOW`;
    let version = "unknown";
    try {
      const pkg = JSON.parse(await fs.promises.readFile(`${pluginRoot}/.claude-plugin/plugin.json`, "utf8"));
      version = pkg.version ?? "unknown";
    } catch { /* ignore */ }

    // Get local and remote HEAD
    let localCommit = "unknown";
    let remoteCommit = "unknown";
    let isUpToDate = false;
    let behindCount = 0;
    try {
      localCommit = (await execSimple(`git -C ${pluginRoot} rev-parse --short HEAD`)).trim();
      await execSimple(`git -C ${pluginRoot} fetch origin main --quiet`);
      remoteCommit = (await execSimple(`git -C ${pluginRoot} rev-parse --short origin/main`)).trim();
      isUpToDate = localCommit === remoteCommit;
      if (!isUpToDate) {
        const count = (await execSimple(`git -C ${pluginRoot} rev-list HEAD..origin/main --count`)).trim();
        behindCount = parseInt(count, 10) || 0;
      }
    } catch { /* ignore - git may not be available */ }

    return successResultWithDebug(logger, "ow-version", {
      version,
      localCommit,
      remoteCommit,
      isUpToDate,
      behindCount,
      ...(isUpToDate ? {} : {
        updateCommand: `cd ${pluginRoot} && git pull && cd ts && npm install && npm run build && claude plugin update agentOW@agentOW`,
      }),
    });
  });

  // ── 15. ow-pr-create ─────────────────────────────────────────────────────
  registerMcpTool(server, "ow-pr-create", {
    description: "Push current branch to origin and create a draft PR on Azure DevOps. Branch must match 'user/<alias>/<feature>' pattern. Returns PR URL.",
    inputSchema: {
      title: z.string().describe("PR title (keep under 70 chars)"),
      description: z.string().describe("PR body in markdown"),
      targetBranch: z.string().optional().describe("Target branch (default: main)"),
      draft: z.boolean().optional().describe("Create as draft (default: true)"),
      workItems: z.string().optional().describe("Space-separated work item IDs to link"),
    },
  }, async (input, extras) => {
    const result = await pr.createPr({
      title: input.title,
      description: input.description,
      targetBranch: input.targetBranch,
      draft: input.draft,
      workItems: input.workItems,
    }, extras.signal);
    return successResultWithDebug(logger, "ow-pr-create", result);
  });

  // ── 16. ow-pr-attach ─────────────────────────────────────────────────────
  registerMcpTool(server, "ow-pr-attach", {
    description: "Upload files (typically PNG screenshots) as attachments to an existing PR on Azure DevOps, then append them to the PR description. Never posts PR comments. Use {{name}} placeholders in appendToDescription to reference uploaded attachment URLs.",
    inputSchema: {
      prId: z.number().describe("Pull request ID to attach files to"),
      attachments: z.array(z.object({
        name: z.string().describe("Filename used on ADO, e.g. 'before-pr2219557.png'"),
        localPath: z.string().describe("Absolute path to the local file to upload"),
      })).describe("Files to upload as PR attachments"),
      appendToDescription: z.string().optional().describe("Markdown to append to the PR's existing description. Use {{name}} placeholders for attachment URLs. If omitted, a simple attachment section is appended."),
    },
  }, async (input, extras) => {
    const result = await prAttach.attach({
      prId: input.prId,
      attachments: input.attachments,
      appendToDescription: input.appendToDescription,
    }, extras.signal);
    return successResultWithDebug(logger, "ow-pr-attach", result);
  });

  // ── 17. ow-pr-debug-query ────────────────────────────────────────────────
  registerMcpTool(server, "ow-pr-debug-query", {
    description: "Fetch the SP-Client Validation CDN debug query from an Azure DevOps PR thread. Uses az token first, then git credential fallback. Also probes loader/manifests HTTP status.",
    inputSchema: {
      prId: z.number().describe("Pull request ID"),
    },
  }, async (input, extras) => {
    const result = await ado.getPrDebugQuery(input.prId, extras.signal);
    return successResultWithDebug(logger, "ow-pr-debug-query", result);
  });
}
