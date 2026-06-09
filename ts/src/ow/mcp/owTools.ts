import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as cp from "node:child_process";
import * as fs from "node:fs";
import { OW } from "../../shared/constants.js";
import { RushCli } from "../tools/rushCli.js";
import { TmuxManager } from "../tools/tmuxManager.js";
import { GitClient } from "../tools/gitClient.js";
import { PrClient } from "../tools/prClient.js";
import { PrAttach } from "../tools/prAttach.js";
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

function execSimple(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.exec(cmd, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout.trim());
    });
  });
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

  // ── 2. ow-rush ────────────────────────────────────────────────────────────
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
    description: "Upload files (typically PNG screenshots) as attachments to an existing PR on Azure DevOps, then optionally append a comment or extend the PR description. Use {{name}} placeholders in commentMarkdown / appendToDescription to reference uploaded attachment URLs.",
    inputSchema: {
      prId: z.number().describe("Pull request ID to attach files to"),
      attachments: z.array(z.object({
        name: z.string().describe("Filename used on ADO, e.g. 'before-pr2219557.png'"),
        localPath: z.string().describe("Absolute path to the local file to upload"),
      })).describe("Files to upload as PR attachments"),
      commentMarkdown: z.string().optional().describe("Markdown for a new PR comment thread. Use {{name}} (matching attachment.name) to embed attachment URLs."),
      appendToDescription: z.string().optional().describe("Markdown to append to the PR's existing description. Use {{name}} placeholders for attachment URLs."),
    },
  }, async (input, extras) => {
    const result = await prAttach.attach({
      prId: input.prId,
      attachments: input.attachments,
      commentMarkdown: input.commentMarkdown,
      appendToDescription: input.appendToDescription,
    }, extras.signal);
    return successResultWithDebug(logger, "ow-pr-attach", result);
  });
}
