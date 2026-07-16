import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import {
  BatchStateStore,
  type BatchState,
  type BatchTaskState,
  type BatchTaskStatus,
  isTerminalTaskStatus,
} from "./batchState.js";
import {
  getProcessCommandLine,
  getProcessIdentity,
  isSameProcess,
  terminateNewProcessGroup,
  terminateProcessGroup,
} from "./processTree.js";

interface ProcessResult {
  exitCode: number;
  timedOut: boolean;
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface AgentResult {
  status: BatchTaskStatus;
  prUrl: string;
  branch: string;
  commit: string;
  error: string;
}

class ChildTerminationError extends Error {}

export interface BatchRunnerOptions {
  copilotBin?: string;
  pluginRoot?: string;
  heartbeatIntervalMs?: number;
}

const PR_URL_PATTERN: RegExp =
  /https:\/\/(?:dev\.azure\.com\/onedrive|onedrive\.visualstudio\.com)\/ODSP-Web\/_git\/odsp-web\/pullrequest\/[0-9]+/i;
const VALID_RESULT_STATUSES: ReadonlySet<BatchTaskStatus> = new Set([
  "success",
  "success-with-blockers",
  "completed-no-pr",
  "failed",
  "stashed-failure",
]);
const BATCH_ARTIFACT_EXCLUDE_PATHSPEC = ":(exclude).aero/**";

function derivePluginRoot(): string {
  const bundleDir: string = path.dirname(url.fileURLToPath(import.meta.url));
  return path.resolve(bundleDir, "../../..");
}

function readAgentResult(task: BatchTaskState): AgentResult | null {
  let parsedResult: AgentResult | null = null;
  if (fs.existsSync(task.resultPath)) {
    try {
      const parsed: Partial<AgentResult> = JSON.parse(fs.readFileSync(task.resultPath, "utf8")) as Partial<AgentResult>;
      if (parsed.status && VALID_RESULT_STATUSES.has(parsed.status)) {
        parsedResult = {
          status: parsed.status,
          prUrl: parsed.prUrl ?? "",
          branch: parsed.branch ?? "",
          commit: parsed.commit ?? "",
          error: parsed.error ?? "",
        };
      }
    } catch {
      parsedResult = null;
    }
    const parsedResultDoesNotRequirePr: boolean = parsedResult !== null
      && parsedResult.status !== "success"
      && parsedResult.status !== "success-with-blockers";
    if (parsedResult?.prUrl || parsedResultDoesNotRequirePr) {
      return parsedResult;
    }
  }

  const finalPath: string = `${task.agentowSessionDir}/final.md`;
  if (!fs.existsSync(finalPath)) {
    return null;
  }
  const finalContent: string = fs.readFileSync(finalPath, "utf8");
  const prUrl: string = finalContent.match(PR_URL_PATTERN)?.[0] ?? "";
  const lower: string = finalContent.toLowerCase();
  if (prUrl) {
    return {
      status: parsedResult?.status === "success-with-blockers"
        || lower.includes("success-with-blockers")
        || lower.includes("remaining blockers:") && !lower.includes("remaining blockers: none")
        ? "success-with-blockers"
        : "success",
      prUrl,
      branch: parsedResult?.branch ?? "",
      commit: parsedResult?.commit ?? "",
      error: parsedResult?.error ?? "",
    };
  }
  if (lower.includes("status: failed") || lower.includes("status: failure")) {
    return {
      status: "failed",
      prUrl: "",
      branch: "",
      commit: "",
      error: "agentOW final.md reported failure",
    };
  }
  return null;
}

function buildInitialPrompt(task: BatchTaskState): string {
  return `/agentow --auto

<task>
${task.description}
</task>

<batch_contract>
This task is owned by a durable ow-batch supervisor.

- Use this exact agentOW session directory: ${task.agentowSessionDir}
- Do not ask the user questions.
- Do not start or modify any other batch task.
- Continue through planning, implementation, build/tests, evaluation, review, commit, push, and draft PR creation.
- Do not stop after planning, a build, or a partial implementation.
- Before your final response, atomically write ${task.resultPath} as compact JSON with exactly these fields:
  {"status":"success|success-with-blockers|completed-no-pr|failed","prUrl":"","branch":"","commit":"","error":""}
- "success" requires a draft PR URL. Use "success-with-blockers" only when a draft PR exists with explicit external blockers. Use "completed-no-pr" when implementation is complete but no PR was created. Use "failed" for all other terminal failures.
- Also write the normal ${task.agentowSessionDir}/final.md.
</batch_contract>`;
}

function buildResumePrompt(task: BatchTaskState): string {
  return `Resume the existing agentOW AUTO task. Read ${task.agentowSessionDir}/progress.log, plan.md, report.json, implementation/evaluation artifacts, the current git branch, and the worktree. Continue from the last completed phase; do not restart planning or discard existing work.

Do not finish until ${task.resultPath} exists with compact JSON fields status, prUrl, branch, commit, and error, and ${task.agentowSessionDir}/final.md is complete. A success status requires a draft PR URL.`;
}

function buildRecoveryPrompt(task: BatchTaskState): string {
  return `/agentow --auto

<task>
${task.description}
</task>

<recovery_contract>
A previous Copilot session for this durable batch task became unavailable. Recover from the existing worktree and ${task.agentowSessionDir}; read progress.log, plan.md, report.json, implementation/evaluation artifacts, and git history before taking action. Continue from the last completed phase rather than discarding or repeating valid work. Do not ask the user questions or modify another batch task.

Continue through implementation, build/tests, evaluation, review, commit, push, and draft PR creation. Before finishing, atomically write ${task.resultPath} as compact JSON with fields status, prUrl, branch, commit, and error, and complete ${task.agentowSessionDir}/final.md. A success status requires a draft PR URL.
</recovery_contract>`;
}

function runCommand(command: string, args: string[], cwd: string): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child: cp.ChildProcess = cp.spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: string[] = [];
    const stderr: string[] = [];
    let settled: boolean = false;
    const settle = (result: CommandResult): void => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    child.stdout?.on("data", (chunk: Buffer | string) => stdout.push(String(chunk)));
    child.stderr?.on("data", (chunk: Buffer | string) => stderr.push(String(chunk)));
    child.on("error", (error) => {
      stderr.push(error.message);
      settle({ exitCode: 1, stdout: stdout.join(""), stderr: stderr.join("") });
    });
    child.on("close", (code) => {
      settle({ exitCode: code ?? 1, stdout: stdout.join(""), stderr: stderr.join("") });
    });
  });
}

async function runGit(repositoryRoot: string, args: string[]): Promise<CommandResult> {
  return runCommand("git", ["--no-pager", ...args], repositoryRoot);
}

async function prepareTaskBaseline(state: BatchState, task: BatchTaskState): Promise<void> {
  const status: CommandResult = await runGit(state.repositoryRoot, [
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    ".",
    BATCH_ARTIFACT_EXCLUDE_PATHSPEC,
  ]);
  if (status.exitCode !== 0) {
    throw new Error(`git status failed: ${status.stderr || status.stdout}`);
  }
  if (status.stdout.trim()) {
    throw new Error("Cannot start a new batch task with a dirty worktree.");
  }

  const fetch: CommandResult = await runGit(state.repositoryRoot, ["fetch", "origin"]);
  if (fetch.exitCode !== 0) {
    throw new Error(`git fetch failed: ${fetch.stderr || fetch.stdout}`);
  }
  const baselineBranch: string = `agentow-batch/${state.batchId}-task${task.index}-base`;
  const switched: CommandResult = await runGit(state.repositoryRoot, [
    "switch",
    "-C",
    baselineBranch,
    "origin/main",
  ]);
  if (switched.exitCode !== 0) {
    throw new Error(`git switch failed: ${switched.stderr || switched.stdout}`);
  }
}

async function currentGitMetadata(repositoryRoot: string): Promise<{ branch: string; commit: string }> {
  const [branchResult, commitResult] = await Promise.all([
    runGit(repositoryRoot, ["branch", "--show-current"]),
    runGit(repositoryRoot, ["rev-parse", "HEAD"]),
  ]);
  return {
    branch: branchResult.exitCode === 0 ? branchResult.stdout.trim() : "",
    commit: commitResult.exitCode === 0 ? commitResult.stdout.trim() : "",
  };
}

async function getWorktreeStatus(repositoryRoot: string): Promise<CommandResult> {
  return runGit(repositoryRoot, [
    "status",
    "--porcelain",
    "--untracked-files=all",
    "--",
    ".",
    BATCH_ARTIFACT_EXCLUDE_PATHSPEC,
  ]);
}

async function tryRunGit(repositoryRoot: string, args: string[]): Promise<CommandResult> {
  try {
    return await runGit(repositoryRoot, args);
  } catch (error) {
    return { exitCode: 1, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
  }
}

async function createRecoverySnapshot(
  state: BatchState,
  task: BatchTaskState,
  status: string,
): Promise<string> {
  const snapshotDir: string = `${state.batchDir}/task${task.index}-recovery-${Date.now()}`;
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(`${snapshotDir}/status.txt`, status, "utf8");

  const [workingDiff, indexDiff, unmergedIndex, untracked] = await Promise.all([
    tryRunGit(state.repositoryRoot, ["diff", "--binary", "HEAD"]),
    tryRunGit(state.repositoryRoot, ["diff", "--cached", "--binary", "HEAD"]),
    tryRunGit(state.repositoryRoot, ["ls-files", "-u"]),
    tryRunGit(state.repositoryRoot, [
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      ".",
      BATCH_ARTIFACT_EXCLUDE_PATHSPEC,
    ]),
  ]);
  fs.writeFileSync(`${snapshotDir}/working.patch`, workingDiff.stdout, "utf8");
  fs.writeFileSync(`${snapshotDir}/index.patch`, indexDiff.stdout, "utf8");
  fs.writeFileSync(`${snapshotDir}/unmerged-index.txt`, unmergedIndex.stdout, "utf8");

  const normalizedRoot: string = `${path.resolve(state.repositoryRoot)}${path.sep}`;
  for (const relativePath of untracked.stdout.split("\0").filter(Boolean)) {
    const sourcePath: string = path.resolve(state.repositoryRoot, relativePath);
    if (!sourcePath.startsWith(normalizedRoot) || !fs.existsSync(sourcePath)) {
      continue;
    }
    const destinationPath: string = `${snapshotDir}/untracked/${relativePath}`;
    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    fs.cpSync(sourcePath, destinationPath, { recursive: true, verbatimSymlinks: true });
  }
  return snapshotDir;
}

async function restoreCleanBaseline(repositoryRoot: string): Promise<void> {
  for (const operation of [
    ["merge", "--abort"],
    ["rebase", "--abort"],
    ["cherry-pick", "--abort"],
    ["am", "--abort"],
  ]) {
    await tryRunGit(repositoryRoot, operation);
  }
  const reset: CommandResult = await runGit(repositoryRoot, ["reset", "--hard", "HEAD"]);
  if (reset.exitCode !== 0) {
    throw new Error(`git reset failed: ${reset.stderr || reset.stdout}`);
  }
  const clean: CommandResult = await runGit(repositoryRoot, ["clean", "-fd", "-e", ".aero/"]);
  if (clean.exitCode !== 0) {
    throw new Error(`git clean failed: ${clean.stderr || clean.stdout}`);
  }
  const status: CommandResult = await getWorktreeStatus(repositoryRoot);
  if (status.exitCode !== 0 || status.stdout.trim()) {
    throw new Error(`Failed to restore a clean worktree: ${status.stderr || status.stdout}`);
  }
}

async function preserveDirtyChanges(state: BatchState, task: BatchTaskState): Promise<string> {
  const status: CommandResult = await getWorktreeStatus(state.repositoryRoot);
  if (status.exitCode !== 0 || !status.stdout.trim()) {
    return "";
  }
  const message: string = `${state.batchId}-task${task.index}-leftovers`;
  const stash: CommandResult = await runGit(state.repositoryRoot, [
    "stash",
    "push",
    "-u",
    "-m",
    message,
    "--",
    ".",
    BATCH_ARTIFACT_EXCLUDE_PATHSPEC,
  ]);
  if (stash.exitCode === 0) {
    const remainingStatus: CommandResult = await getWorktreeStatus(state.repositoryRoot);
    if (remainingStatus.exitCode === 0 && !remainingStatus.stdout.trim()) {
      const stashCommit: CommandResult = await runGit(state.repositoryRoot, [
        "rev-parse",
        "--verify",
        "refs/stash",
      ]);
      return stashCommit.exitCode === 0 ? stashCommit.stdout.trim() : message;
    }
  }
  const snapshotDir: string = await createRecoverySnapshot(state, task, status.stdout);
  await restoreCleanBaseline(state.repositoryRoot);
  return `snapshot:${snapshotDir}`;
}

async function waitForDetachedCopilot(
  state: BatchState,
  task: BatchTaskState,
  options: BatchRunnerOptions,
  store: BatchStateStore,
): Promise<ProcessResult> {
  const heartbeatIntervalMs: number = options.heartbeatIntervalMs ?? 60_000;
  const attemptStartedAt: number = Date.parse(task.attemptStartedAt);
  const originalDeadline: number = Number.isFinite(attemptStartedAt)
    ? attemptStartedAt + state.taskTimeoutMinutes * 60_000
    : Date.now() + state.taskTimeoutMinutes * 60_000;
  const lastHeartbeatAt: number = Date.parse(task.heartbeatAt);
  const resumedAfterGap: boolean = Number.isFinite(lastHeartbeatAt)
    && Date.now() - lastHeartbeatAt > heartbeatIntervalMs * 2;
  const deadline: number = resumedAfterGap
    ? Math.max(originalDeadline, Date.now() + heartbeatIntervalMs)
    : originalDeadline;

  while (isSameProcess(task.childPid, task.childIdentity)) {
    if (readAgentResult(task)) {
      return { exitCode: 0, timedOut: false };
    }
    if (Date.now() >= deadline) {
      try {
        await terminateProcessGroup(task.childPid, task.childIdentity);
      } catch (error) {
        throw new ChildTerminationError(
          `Failed to terminate detached Copilot PID ${task.childPid}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      store.setChildProcess(task.index, 0, "");
      return { exitCode: 124, timedOut: true };
    }
    store.heartbeat(task.index, `copilot-running-detached-pid-${task.childPid}`);
    await new Promise<void>((resolve) => setTimeout(resolve, heartbeatIntervalMs));
  }
  store.setChildProcess(task.index, 0, "");
  return { exitCode: 1, timedOut: false };
}

function runCopilot(
  state: BatchState,
  task: BatchTaskState,
  options: BatchRunnerOptions,
  store: BatchStateStore,
): Promise<ProcessResult> {
  if (store.read().status !== "running") {
    return Promise.resolve({ exitCode: 0, timedOut: false });
  }
  return new Promise((resolve, reject) => {
    fs.mkdirSync(task.agentowSessionDir, { recursive: true });
    const copilotBin: string = options.copilotBin ?? process.env.AGENTOW_COPILOT_BIN ?? "copilot";
    const pluginRoot: string = options.pluginRoot ?? process.env.AGENTOW_COPILOT_PLUGIN_ROOT ?? derivePluginRoot();
    const recoveryGeneration: number = Math.floor((task.attempts - 1) / 2);
    const startsNewSession: boolean = task.attempts % 2 === 1;
    const sessionName: string = recoveryGeneration === 0
      ? task.copilotSessionName
      : `${task.copilotSessionName}-recovery-${recoveryGeneration}`;
    const prompt: string = task.attempts === 1
      ? buildInitialPrompt(task)
      : startsNewSession
        ? buildRecoveryPrompt(task)
        : buildResumePrompt(task);
    const args: string[] = [
      "-C",
      state.repositoryRoot,
      "--plugin-dir",
      pluginRoot,
      "--allow-all",
      "--no-ask-user",
      "--autopilot",
      "--max-autopilot-continues",
      "100",
      "--context",
      "long_context",
      "--no-auto-update",
      "--output-format",
      "json",
    ];
    if (startsNewSession) {
      args.push("--name", sessionName);
    } else {
      args.push(`--resume=${sessionName}`);
    }
    args.push("--prompt", prompt);

    const logFd: number = fs.openSync(task.logPath, "a");
    const child: cp.ChildProcess = cp.spawn(copilotBin, args, {
      cwd: state.repositoryRoot,
      detached: true,
      env: {
        ...process.env,
        COPILOT_ALLOW_ALL: "true",
        NO_COLOR: "1",
      },
      stdio: ["ignore", logFd, logFd],
    });
    fs.closeSync(logFd);
    const childPid: number | undefined = child.pid;
    const childIdentity: string = childPid ? getProcessIdentity(childPid) : "";
    let finished: boolean = false;
    if (childPid && !childIdentity) {
      finished = true;
      void (async () => {
        try {
          await terminateNewProcessGroup(childPid);
          resolve({ exitCode: 1, timedOut: false });
        } catch (error) {
          reject(new ChildTerminationError(
            `Unable to terminate unverified Copilot PID ${childPid}: ${error instanceof Error ? error.message : String(error)}`,
          ));
        }
      })();
      return;
    }
    if (childPid) {
      store.setChildProcess(task.index, childPid, childIdentity);
    }
    let monitor: NodeJS.Timeout | undefined;
    const terminateAndSettle = (result: ProcessResult, errorPrefix: string): void => {
      if (finished) {
        return;
      }
      finished = true;
      if (monitor) {
        clearInterval(monitor);
      }
      void (async () => {
        try {
          if (childPid) {
            await terminateProcessGroup(childPid, childIdentity);
          }
          store.setChildProcess(task.index, 0, "");
          resolve(result);
        } catch (error) {
          reject(new ChildTerminationError(
            `${errorPrefix} Copilot PID ${childPid ?? 0}: ${error instanceof Error ? error.message : String(error)}`,
          ));
        }
      })();
    };
    if (store.read().status !== "running") {
      terminateAndSettle({ exitCode: 0, timedOut: false }, "Failed to stop");
      return;
    }

    const startedAt: number = Date.now();
    const timeoutMs: number = state.taskTimeoutMinutes * 60_000;
    const heartbeatIntervalMs: number = options.heartbeatIntervalMs ?? 60_000;
    const monitorIntervalMs: number = Math.min(heartbeatIntervalMs, 1_000);
    let lastHeartbeatAt: number = startedAt;
    monitor = setInterval(() => {
      const currentTime: number = Date.now();
      const elapsedMs: number = currentTime - startedAt;
      if (store.read().status !== "running") {
        terminateAndSettle({ exitCode: 0, timedOut: false }, "Failed to stop");
      } else if (elapsedMs >= timeoutMs) {
        terminateAndSettle({ exitCode: 124, timedOut: true }, "Failed to terminate");
      } else if (currentTime - lastHeartbeatAt >= heartbeatIntervalMs) {
        store.heartbeat(task.index, `copilot-running-${Math.floor(elapsedMs / 60_000)}m`);
        lastHeartbeatAt = currentTime;
      }
    }, monitorIntervalMs);
    monitor.unref();

    child.on("error", (error) => {
      fs.appendFileSync(task.logPath, `\nrunner spawn error: ${error.message}\n`, "utf8");
      if (!finished) {
        finished = true;
        clearInterval(monitor);
        store.setChildProcess(task.index, 0, "");
        resolve({ exitCode: 1, timedOut: false });
      }
    });
    child.on("close", (code) => {
      if (!finished) {
        finished = true;
        clearInterval(monitor);
        store.setChildProcess(task.index, 0, "");
        resolve({ exitCode: code ?? 1, timedOut: false });
      }
    });
  });
}

async function executeTask(
  store: BatchStateStore,
  initialState: BatchState,
  initialTask: BatchTaskState,
  options: BatchRunnerOptions,
): Promise<void> {
  let state: BatchState = initialState;
  let task: BatchTaskState = initialTask;

  if (task.status === "pending") {
    await prepareTaskBaseline(state, task);
    if (store.read().status !== "running") {
      return;
    }
    state = store.startTask(task.index);
    task = state.tasks[task.index - 1];
    store.appendLog(`▶️ Task ${task.index}/${state.tasks.length} started — ${task.description}`);
  }

  if (task.childPid > 0 && !task.childIdentity) {
    const observedIdentity: string = getProcessIdentity(task.childPid);
    const observedCommandLine: string = getProcessCommandLine(task.childPid);
    state = observedIdentity && observedCommandLine.toLowerCase().includes("copilot")
      ? store.setChildProcess(task.index, task.childPid, observedIdentity)
      : store.setChildProcess(task.index, 0, "");
    task = state.tasks[task.index - 1];
  }

  while (task.attempts < state.maxAttempts || task.childPid > 0) {
    state = store.read();
    if (state.status !== "running") {
      return;
    }
    task = state.tasks[task.index - 1];
    const existingResult: AgentResult | null = readAgentResult(task);
    if (existingResult) {
      await finalizeTask(store, state, task, existingResult);
      return;
    }

    if (task.childPid > 0) {
      store.appendLog(`♻️ Task ${task.index} reattached to Copilot PID ${task.childPid}`);
      const detachedResult: ProcessResult = await waitForDetachedCopilot(state, task, options, store);
      state = store.read();
      task = state.tasks[task.index - 1];
      if (state.status !== "running") {
        return;
      }
      const recoveredResult: AgentResult | null = readAgentResult(task);
      if (recoveredResult) {
        await finalizeTask(store, state, task, recoveredResult);
        return;
      }
      const detachedReason: string = detachedResult.timedOut
        ? `Detached Copilot PID ${task.childPid} timed out`
        : `Detached Copilot PID ${task.childPid} exited without a terminal result`;
      store.appendLog(`⚠️ Task ${task.index} ${detachedReason}`);
    }

    const nextAttempt: number = task.attempts + 1;
    const attemptPhase: string = nextAttempt === 1
      ? "copilot-start"
      : nextAttempt % 2 === 1
        ? `copilot-recovery-${nextAttempt}`
        : `copilot-resume-${nextAttempt}`;
    state = store.startAttempt(
      task.index,
      attemptPhase,
    );
    task = state.tasks[task.index - 1];
    if (state.status !== "running") {
      return;
    }

    store.appendLog(`🤖 Task ${task.index} Copilot attempt ${task.attempts}/${state.maxAttempts}`);
    const processResult: ProcessResult = await runCopilot(
      state,
      task,
      options,
      store,
    );
    state = store.read();
    task = state.tasks[task.index - 1];
    if (state.status !== "running") {
      return;
    }
    const result: AgentResult | null = readAgentResult(task);
    if (result) {
      await finalizeTask(store, state, task, result);
      return;
    }

    const reason: string = processResult.timedOut
      ? `Copilot attempt ${task.attempts} timed out after ${state.taskTimeoutMinutes} minutes`
      : `Copilot attempt ${task.attempts} exited ${processResult.exitCode} without a terminal result`;
    store.appendLog(`⚠️ Task ${task.index} ${reason}`);
    state = store.heartbeat(task.index, reason);
    task = state.tasks[task.index - 1];
  }

  const metadata: { branch: string; commit: string } = await currentGitMetadata(state.repositoryRoot);
  const stash: string = await preserveDirtyChanges(state, task);
  const status: BatchTaskStatus = stash ? "stashed-failure" : "failed";
  store.completeTask(task.index, {
    status,
    prUrl: "",
    branch: metadata.branch,
    commit: metadata.commit,
    error: `No terminal agentOW result after ${task.attempts} attempts`,
    stash,
  });
  store.appendLog(`❌ Task ${task.index}/${state.tasks.length} failed — attempts exhausted`);
}

async function finalizeTask(
  store: BatchStateStore,
  state: BatchState,
  task: BatchTaskState,
  result: AgentResult,
): Promise<void> {
  const metadata: { branch: string; commit: string } = await currentGitMetadata(state.repositoryRoot);
  const stash: string = await preserveDirtyChanges(state, task);
  let status: BatchTaskStatus = result.status;
  let error: string = result.error;
  if (stash && status === "success") {
    status = "success-with-blockers";
    error = "PR created, but uncommitted task changes were preserved in a stash.";
  } else if (stash && (status === "failed" || status === "completed-no-pr")) {
    status = "stashed-failure";
  }
  store.completeTask(task.index, {
    status,
    prUrl: result.prUrl,
    branch: result.branch || metadata.branch,
    commit: result.commit || metadata.commit,
    error,
    stash,
  });
  const marker: string = status === "success"
    ? "✅"
    : status === "success-with-blockers"
      ? "⚠️"
      : "❌";
  store.appendLog(`${marker} Task ${task.index}/${state.tasks.length} ${status}${result.prUrl ? ` — ${result.prUrl}` : ""}`);
}

export async function runCopilotBatch(batchDir: string, options: BatchRunnerOptions = {}): Promise<void> {
  const store = new BatchStateStore(batchDir);
  store.acquireLock();
  let state: BatchState | null = null;
  try {
    state = store.setSupervisorPid(process.pid);
    store.appendLog(`♻️ Supervisor active — PID ${process.pid}`);

    while (state.status === "running") {
      const task: BatchTaskState | undefined = state.tasks.find((candidate) => !isTerminalTaskStatus(candidate.status));
      if (!task) {
        state = store.update((draft) => {
          draft.status = "completed";
          draft.currentTaskIndex = 0;
          draft.completedAt = new Date().toISOString();
          draft.supervisorPid = 0;
        }, true);
        break;
      }

      try {
        await executeTask(store, state, task, options);
      } catch (error) {
        const message: string = error instanceof Error ? error.message : String(error);
        if (error instanceof ChildTerminationError) {
          store.update((draft) => {
            draft.status = "stopped";
            draft.supervisorPid = 0;
          }, true);
          store.appendLog(`⛔ Batch stopped — ${message}`);
          break;
        }
        const metadata: { branch: string; commit: string } = await currentGitMetadata(state.repositoryRoot);
        const stash: string = await preserveDirtyChanges(state, task);
        store.completeTask(task.index, {
          status: stash ? "stashed-failure" : "failed",
          prUrl: "",
          branch: metadata.branch,
          commit: metadata.commit,
          error: message,
          stash,
        });
        store.appendLog(`❌ Task ${task.index}/${state.tasks.length} failed — ${message}`);
      }
      state = store.read();
    }

    if (state.status === "completed") {
      store.appendLog("🌅 Batch complete");
    }
  } finally {
    try {
      store.setSupervisorPid(0);
    } catch {
      // Preserve the original runner outcome if state persistence itself failed.
    }
    store.releaseLock();
  }
}
