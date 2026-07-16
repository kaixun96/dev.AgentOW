import * as fs from "node:fs";
import * as path from "node:path";

export const BATCH_STATE_VERSION = 1;

export type BatchStatus = "running" | "completed" | "stopped";
export type BatchTaskStatus =
  | "pending"
  | "in_progress"
  | "success"
  | "success-with-blockers"
  | "completed-no-pr"
  | "failed"
  | "stashed-failure";

export interface BatchTaskState {
  index: number;
  description: string;
  status: BatchTaskStatus;
  phase: string;
  attempts: number;
  childPid: number;
  childIdentity: string;
  copilotSessionName: string;
  agentowSessionDir: string;
  resultPath: string;
  logPath: string;
  checkpointPath: string;
  startedAt: string;
  attemptStartedAt: string;
  heartbeatAt: string;
  completedAt: string;
  prUrl: string;
  branch: string;
  commit: string;
  error: string;
  stash: string;
}

export interface BatchState {
  version: number;
  batchId: string;
  status: BatchStatus;
  repositoryRoot: string;
  batchDir: string;
  summaryPath: string;
  logPath: string;
  supervisorWindow: string;
  supervisorPid: number;
  currentTaskIndex: number;
  taskTimeoutMinutes: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string;
  tasks: BatchTaskState[];
}

export interface CreateBatchStateOptions {
  batchDir: string;
  repositoryRoot: string;
  tasks: string[];
  taskTimeoutMinutes: number;
  maxAttempts: number;
  supervisorWindow: string;
}

export interface CompleteTaskOptions {
  status: BatchTaskStatus;
  prUrl: string;
  branch: string;
  commit: string;
  error: string;
  stash: string;
}

const TERMINAL_TASK_STATUSES: ReadonlySet<BatchTaskStatus> = new Set([
  "success",
  "success-with-blockers",
  "completed-no-pr",
  "failed",
  "stashed-failure",
]);

function now(): string {
  return new Date().toISOString();
}

function assertBatchDir(batchDir: string, repositoryRoot: string): void {
  const resolvedBatchDir: string = path.resolve(batchDir);
  const aeroRoot: string = path.resolve(repositoryRoot, ".aero");
  if (resolvedBatchDir !== aeroRoot && !resolvedBatchDir.startsWith(`${aeroRoot}${path.sep}`)) {
    throw new Error(`Batch directory must be under ${aeroRoot}: ${resolvedBatchDir}`);
  }
}

function taskStatusLabel(status: BatchTaskStatus): string {
  switch (status) {
    case "success":
      return "✅ success";
    case "success-with-blockers":
      return "⚠️ success-with-blockers";
    case "completed-no-pr":
      return "⚠️ completed-no-pr";
    case "failed":
      return "❌ failed";
    case "stashed-failure":
      return "❌ stashed-failure";
    case "in_progress":
      return "▶️ in progress";
    default:
      return "pending";
  }
}

function applyStoppedState(state: BatchState, reason: string, clearSupervisor: boolean): void {
  state.status = "stopped";
  state.completedAt = now();
  if (clearSupervisor) {
    state.supervisorPid = 0;
  }
  if (state.currentTaskIndex > 0) {
    const task: BatchTaskState | undefined = state.tasks[state.currentTaskIndex - 1];
    if (task?.index === state.currentTaskIndex) {
      task.error = reason;
      task.heartbeatAt = now();
    }
  }
}

function createTask(batchDir: string, batchId: string, description: string, index: number): BatchTaskState {
  const timestamp: string = now();
  return {
    index,
    description,
    status: "pending",
    phase: "pending",
    attempts: 0,
    childPid: 0,
    childIdentity: "",
    copilotSessionName: `${batchId}-task${index}`,
    agentowSessionDir: `${batchDir}/task${index}-agentow`,
    resultPath: `${batchDir}/task${index}-result.json`,
    logPath: `${batchDir}/task${index}.log`,
    checkpointPath: `${batchDir}/task${index}.checkpoint.md`,
    startedAt: "",
    attemptStartedAt: "",
    heartbeatAt: timestamp,
    completedAt: "",
    prUrl: "",
    branch: "",
    commit: "",
    error: "",
    stash: "",
  };
}

export function isTerminalTaskStatus(status: BatchTaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.has(status);
}

export class BatchStateStore {
  readonly statePath: string;
  readonly lockPath: string;

  constructor(readonly batchDir: string) {
    this.statePath = `${batchDir}/state.json`;
    this.lockPath = `${batchDir}/supervisor.lock`;
  }

  static create(options: CreateBatchStateOptions): BatchStateStore {
    if (options.tasks.length === 0) {
      throw new Error("At least one batch task is required.");
    }
    assertBatchDir(options.batchDir, options.repositoryRoot);
    fs.mkdirSync(options.batchDir, { recursive: true });

    const store = new BatchStateStore(options.batchDir);
    if (fs.existsSync(store.statePath)) {
      throw new Error(`Batch state already exists: ${store.statePath}`);
    }

    const createdAt: string = now();
    const batchId: string = path.basename(options.batchDir);
    const tasks: BatchTaskState[] = options.tasks.map((description, offset) =>
      createTask(options.batchDir, batchId, description, offset + 1),
    );
    const state: BatchState = {
      version: BATCH_STATE_VERSION,
      batchId,
      status: "running",
      repositoryRoot: options.repositoryRoot,
      batchDir: options.batchDir,
      summaryPath: `${options.batchDir}/summary.md`,
      logPath: `${options.batchDir}/batch.log`,
      supervisorWindow: options.supervisorWindow,
      supervisorPid: 0,
      currentTaskIndex: 1,
      taskTimeoutMinutes: options.taskTimeoutMinutes,
      maxAttempts: options.maxAttempts,
      createdAt,
      updatedAt: createdAt,
      completedAt: "",
      tasks,
    };
    store.writeState(state);
    store.writeSummary(state);
    store.appendLog(`🌙 Batch started — ${tasks.length} tasks`);
    return store;
  }

  read(): BatchState {
    const state: BatchState = JSON.parse(fs.readFileSync(this.statePath, "utf8")) as BatchState;
    if (state.version !== BATCH_STATE_VERSION) {
      throw new Error(`Unsupported batch state version ${state.version}: ${this.statePath}`);
    }
    for (const task of state.tasks) {
      task.childIdentity ??= "";
    }
    assertBatchDir(state.batchDir, state.repositoryRoot);
    return state;
  }

  update(mutator: (state: BatchState) => void, updateSummary = false): BatchState {
    const state: BatchState = this.read();
    mutator(state);
    state.updatedAt = now();
    this.writeState(state);
    if (updateSummary) {
      this.writeSummary(state);
    }
    return state;
  }

  setSupervisorPid(pid: number): BatchState {
    return this.update((state) => {
      state.supervisorPid = pid;
    });
  }

  startTask(index: number): BatchState {
    return this.update((state) => {
      const task: BatchTaskState = this.getTask(state, index);
      const timestamp: string = now();
      task.status = "in_progress";
      task.phase = "preparing";
      task.startedAt = task.startedAt || timestamp;
      task.heartbeatAt = timestamp;
      task.error = "";
      state.currentTaskIndex = index;
    }, true);
  }

  startAttempt(index: number, phase: string): BatchState {
    return this.update((state) => {
      const task: BatchTaskState = this.getTask(state, index);
      task.status = "in_progress";
      task.phase = phase;
      task.attempts++;
      task.childPid = 0;
      task.childIdentity = "";
      task.attemptStartedAt = now();
      task.heartbeatAt = now();
      state.currentTaskIndex = index;
    }, true);
  }

  heartbeat(index: number, phase: string): BatchState {
    return this.update((state) => {
      const task: BatchTaskState = this.getTask(state, index);
      task.phase = phase;
      task.heartbeatAt = now();
    });
  }

  setChildProcess(index: number, childPid: number, childIdentity = ""): BatchState {
    return this.update((state) => {
      const task: BatchTaskState = this.getTask(state, index);
      task.childPid = childPid;
      task.childIdentity = childIdentity;
      task.heartbeatAt = now();
    });
  }

  completeTask(index: number, options: CompleteTaskOptions): BatchState {
    if (!isTerminalTaskStatus(options.status)) {
      throw new Error(`Cannot complete task with non-terminal status: ${options.status}`);
    }
    const state: BatchState = this.update((draft) => {
      const task: BatchTaskState = this.getTask(draft, index);
      const timestamp: string = now();
      task.status = options.status;
      task.phase = "complete";
      task.childPid = 0;
      task.childIdentity = "";
      task.heartbeatAt = timestamp;
      task.completedAt = timestamp;
      task.prUrl = options.prUrl;
      task.branch = options.branch;
      task.commit = options.commit;
      task.error = options.error;
      task.stash = options.stash;

      const nextTask: BatchTaskState | undefined = draft.tasks.find((candidate) => !isTerminalTaskStatus(candidate.status));
      if (nextTask) {
        draft.currentTaskIndex = nextTask.index;
      } else {
        draft.status = "completed";
        draft.currentTaskIndex = 0;
        draft.completedAt = timestamp;
        draft.supervisorPid = 0;
      }
    }, true);
    this.writeCheckpoint(this.getTask(state, index));
    return state;
  }

  requestStop(reason: string): BatchState {
    return this.update((state) => {
      applyStoppedState(state, reason, false);
    }, true);
  }

  stop(reason: string): BatchState {
    return this.update((state) => {
      applyStoppedState(state, reason, true);
    }, true);
  }

  acquireLock(): void {
    if (!this.tryAcquireLock()) {
      const existingPid: number = Number.parseInt(fs.readFileSync(this.lockPath, "utf8"), 10);
      throw new Error(`Batch supervisor is already running with PID ${existingPid}.`);
    }
  }

  tryAcquireLock(): boolean {
    fs.mkdirSync(this.batchDir, { recursive: true });
    try {
      const fd: number = fs.openSync(this.lockPath, "wx");
      fs.writeFileSync(fd, String(process.pid), "utf8");
      fs.closeSync(fd);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }

    const existingPid: number = Number.parseInt(fs.readFileSync(this.lockPath, "utf8"), 10);
    if (!Number.isFinite(existingPid)) {
      const lockAgeMs: number = Date.now() - fs.statSync(this.lockPath).mtimeMs;
      if (lockAgeMs < 30_000) {
        return false;
      }
    }
    if (Number.isFinite(existingPid)) {
      try {
        process.kill(existingPid, 0);
        return false;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
          throw error;
        }
      }
    }
    fs.rmSync(this.lockPath, { force: true });
    try {
      const fd: number = fs.openSync(this.lockPath, "wx");
      fs.writeFileSync(fd, String(process.pid), "utf8");
      fs.closeSync(fd);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        return false;
      }
      throw error;
    }
  }

  releaseLock(): void {
    fs.rmSync(this.lockPath, { force: true });
  }

  appendLog(message: string): void {
    const timestamp: string = new Date().toISOString().slice(11, 19);
    fs.appendFileSync(`${this.batchDir}/batch.log`, `[${timestamp}] ${message}\n`, "utf8");
  }

  private getTask(state: BatchState, index: number): BatchTaskState {
    const task: BatchTaskState | undefined = state.tasks[index - 1];
    if (!task || task.index !== index) {
      throw new Error(`Unknown batch task index ${index}.`);
    }
    return task;
  }

  private writeState(state: BatchState): void {
    const temporaryPath: string = `${this.statePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(state), "utf8");
    fs.renameSync(temporaryPath, this.statePath);
  }

  private writeSummary(state: BatchState): void {
    const lines: string[] = [
      `# agentOW Copilot Batch — ${state.batchId}`,
      "",
      `Total tasks: ${state.tasks.length}`,
      `Started: ${state.createdAt}`,
      `Status: ${state.status}`,
      "",
      "| # | Task | Status | PR | Notes |",
      "|---|------|--------|----|-------|",
    ];
    for (const task of state.tasks) {
      const pr: string = task.prUrl ? `[PR](${task.prUrl})` : "—";
      const notes: string = task.error || task.stash || task.phase;
      lines.push(`| ${task.index} | ${task.description.replace(/\|/g, "\\|")} | ${taskStatusLabel(task.status)} | ${pr} | ${notes.replace(/\|/g, "\\|")} |`);
    }
    if (state.status === "completed") {
      lines.push("", `Finished: ${state.completedAt}`);
    }
    fs.writeFileSync(state.summaryPath, `${lines.join("\n")}\n`, "utf8");
  }

  private writeCheckpoint(task: BatchTaskState): void {
    const lines: string[] = [
      `# Task ${task.index} checkpoint`,
      "",
      `- Task: ${task.description}`,
      `- Status: ${task.status}`,
      `- PR: ${task.prUrl || "—"}`,
      `- Branch: ${task.branch || "—"}`,
      `- Commit: ${task.commit || "—"}`,
      `- agentOW session: ${task.agentowSessionDir}`,
      `- Attempts: ${task.attempts}`,
      `- Remaining blockers: ${task.error || "none"}`,
      `- Stash: ${task.stash || "none"}`,
    ];
    fs.writeFileSync(task.checkpointPath, `${lines.join("\n")}\n`, "utf8");
  }
}
