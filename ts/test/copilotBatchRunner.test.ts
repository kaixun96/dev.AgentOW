import assert from "node:assert/strict";
import * as cp from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import { BatchStateStore } from "../src/ow/tools/batchState.js";
import { runCopilotBatch } from "../src/ow/tools/copilotBatchRunner.js";
import { getProcessIdentity, terminateProcessGroup } from "../src/ow/tools/processTree.js";

function run(command: string, args: string[], cwd: string): void {
  const result: cp.SpawnSyncReturns<string> = cp.spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${command} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
}

function writeExecutable(root: string, name: string, source: string): string {
  const executablePath: string = `${root}/${name}`;
  fs.writeFileSync(executablePath, `#!/usr/bin/env node\n${source}`, "utf8");
  fs.chmodSync(executablePath, 0o755);
  return executablePath;
}

async function waitForFile(filePath: string, timeoutMs = 2_000): Promise<void> {
  const deadline: number = Date.now() + timeoutMs;
  while (!fs.existsSync(filePath) && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(fs.existsSync(filePath), true, `Timed out waiting for ${filePath}`);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function createRepository(root: string): { repositoryRoot: string; remoteRoot: string } {
  const repositoryRoot: string = `${root}/repository`;
  const remoteRoot: string = `${root}/origin.git`;
  fs.mkdirSync(repositoryRoot, { recursive: true });
  fs.mkdirSync(remoteRoot, { recursive: true });
  run("git", ["init", "--bare"], remoteRoot);
  run("git", ["init", "-b", "main"], repositoryRoot);
  run("git", ["config", "user.email", "batch-test@example.com"], repositoryRoot);
  run("git", ["config", "user.name", "Batch Test"], repositoryRoot);
  fs.writeFileSync(`${repositoryRoot}/README.md`, "batch test\n", "utf8");
  run("git", ["add", "README.md"], repositoryRoot);
  run("git", ["commit", "-m", "Initial commit"], repositoryRoot);
  run("git", ["remote", "add", "origin", remoteRoot], repositoryRoot);
  run("git", ["push", "-u", "origin", "main"], repositoryRoot);
  return { repositoryRoot, remoteRoot };
}

function createFakeCopilot(root: string): string {
  const fakeCopilot: string = `${root}/fake-copilot.mjs`;
  fs.writeFileSync(
    fakeCopilot,
    `#!/usr/bin/env node
import fs from "node:fs";

const args = process.argv.slice(2);
const promptIndex = args.indexOf("--prompt");
const prompt = promptIndex >= 0 ? args[promptIndex + 1] : "";
const resultPath = prompt.match(/\\/[^\\s]+\\/task([0-9]+)-result\\.json/)?.[0];
if (!resultPath) process.exit(2);
const taskIndex = Number(resultPath.match(/task([0-9]+)-result\\.json/)?.[1]);
const callsPath = resultPath.replace(/task[0-9]+-result\\.json$/, "fake-calls.log");
fs.appendFileSync(callsPath, JSON.stringify({ taskIndex, resume: args.some((arg) => arg.startsWith("--resume=")) }) + "\\n");

if (taskIndex === 2 && !args.some((arg) => arg.startsWith("--resume="))) {
  process.exit(0);
}

const result = {
  status: "success",
  prUrl: "https://dev.azure.com/onedrive/ODSP-Web/_git/odsp-web/pullrequest/" + (1000 + taskIndex),
  branch: "user/test/task-" + taskIndex,
  commit: "commit-" + taskIndex,
  error: ""
};
const temporaryPath = resultPath + ".tmp";
fs.writeFileSync(temporaryPath, JSON.stringify(result));
fs.renameSync(temporaryPath, resultPath);
`,
    "utf8",
  );
  fs.chmodSync(fakeCopilot, 0o755);
  return fakeCopilot;
}

test("BatchStateStore persists terminal checkpoints atomically", () => {
  const root: string = fs.mkdtempSync(`${os.tmpdir()}/agentow-state-`);
  try {
    const repositoryRoot: string = `${root}/repository`;
    const batchDir: string = `${repositoryRoot}/.aero/batch-state-test`;
    fs.mkdirSync(repositoryRoot, { recursive: true });
    const store: BatchStateStore = BatchStateStore.create({
      batchDir,
      repositoryRoot,
      tasks: ["first", "second"],
      taskTimeoutMinutes: 30,
      maxAttempts: 2,
      supervisorWindow: "batch-state-test",
    });

    store.startTask(1);
    store.startAttempt(1, "copilot-start");
    store.setChildProcess(1, 12345);
    const afterStart = store.read();
    assert.equal(afterStart.tasks[0].attempts, 1);
    assert.equal(afterStart.tasks[0].childPid, 12345);

    store.completeTask(1, {
      status: "success",
      prUrl: "https://dev.azure.com/onedrive/ODSP-Web/_git/odsp-web/pullrequest/1",
      branch: "user/test/one",
      commit: "abc",
      error: "",
      stash: "",
    });
    store.completeTask(2, {
      status: "failed",
      prUrl: "",
      branch: "user/test/two",
      commit: "def",
      error: "expected failure",
      stash: "",
    });

    const completed = store.read();
    assert.equal(completed.status, "completed");
    assert.equal(completed.currentTaskIndex, 0);
    assert.match(fs.readFileSync(completed.summaryPath, "utf8"), /✅ success/);
    assert.match(fs.readFileSync(completed.tasks[1].checkpointPath, "utf8"), /expected failure/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("durable runner resumes an interrupted task and continues serially", async () => {
  const root: string = fs.mkdtempSync(`${os.tmpdir()}/agentow-runner-`);
  try {
    const { repositoryRoot } = createRepository(root);
    const batchDir: string = `${repositoryRoot}/.aero/batch-runner-test`;
    const fakeCopilot: string = createFakeCopilot(root);
    BatchStateStore.create({
      batchDir,
      repositoryRoot,
      tasks: ["first task", "second task"],
      taskTimeoutMinutes: 1,
      maxAttempts: 3,
      supervisorWindow: "batch-runner-test",
    });

    await runCopilotBatch(batchDir, {
      copilotBin: fakeCopilot,
      pluginRoot: root,
      heartbeatIntervalMs: 10,
    });

    const state = new BatchStateStore(batchDir).read();
    assert.equal(state.status, "completed");
    assert.equal(state.tasks[0].status, "success");
    assert.equal(state.tasks[0].attempts, 1);
    assert.equal(state.tasks[1].status, "success");
    assert.equal(state.tasks[1].attempts, 2);
    assert.equal(state.tasks[1].prUrl.endsWith("/1002"), true);

    const calls: string[] = fs.readFileSync(`${batchDir}/fake-calls.log`, "utf8").trim().split("\n");
    assert.deepEqual(
      calls.map((line) => JSON.parse(line) as { taskIndex: number; resume: boolean }),
      [
        { taskIndex: 1, resume: false },
        { taskIndex: 2, resume: false },
        { taskIndex: 2, resume: true },
      ],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("timeout waits for the old Copilot process to exit before retrying", async () => {
  const root: string = fs.mkdtempSync(`${os.tmpdir()}/agentow-timeout-`);
  try {
    const { repositoryRoot } = createRepository(root);
    const batchDir: string = `${repositoryRoot}/.aero/batch-timeout-test`;
    const fakeCopilot: string = writeExecutable(root, "timeout-copilot.mjs", `
import fs from "node:fs";

const args = process.argv.slice(2);
const prompt = args[args.indexOf("--prompt") + 1] ?? "";
const resultPath = prompt.match(/\\/[^\\s]+\\/task1-result\\.json/)?.[0];
if (!resultPath) process.exit(2);
const eventsPath = resultPath.replace("task1-result.json", "timeout-events.log");
const firstExitPath = resultPath.replace("task1-result.json", "first-process-exited");
const isResume = args.some((arg) => arg.startsWith("--resume="));

if (!isResume) {
  fs.appendFileSync(eventsPath, "first-start\\n");
  process.on("SIGTERM", () => {
    setTimeout(() => {
      fs.writeFileSync(firstExitPath, "exited");
      fs.appendFileSync(eventsPath, "first-exit\\n");
      process.exit(0);
    }, 150);
  });
  setInterval(() => {}, 1000);
} else {
  fs.appendFileSync(eventsPath, fs.existsSync(firstExitPath) ? "resume-after-exit\\n" : "resume-overlap\\n");
  fs.writeFileSync(resultPath, JSON.stringify({
    status: "success",
    prUrl: "https://dev.azure.com/onedrive/ODSP-Web/_git/odsp-web/pullrequest/2001",
    branch: "user/test/timeout",
    commit: "timeout-commit",
    error: ""
  }));
}
`);
    BatchStateStore.create({
      batchDir,
      repositoryRoot,
      tasks: ["timeout task"],
      taskTimeoutMinutes: 0.001,
      maxAttempts: 2,
      supervisorWindow: "batch-timeout-test",
    });

    await runCopilotBatch(batchDir, {
      copilotBin: fakeCopilot,
      pluginRoot: root,
      heartbeatIntervalMs: 10,
    });

    const state = new BatchStateStore(batchDir).read();
    assert.equal(state.tasks[0].status, "success");
    assert.equal(state.tasks[0].attempts, 2);
    assert.deepEqual(
      fs.readFileSync(`${batchDir}/timeout-events.log`, "utf8").trim().split("\n"),
      ["first-start", "first-exit", "resume-after-exit"],
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("persisted stop state makes the runner terminate its active child", async () => {
  const root: string = fs.mkdtempSync(`${os.tmpdir()}/agentow-stop-`);
  let batchDir = "";
  try {
    const { repositoryRoot } = createRepository(root);
    batchDir = `${repositoryRoot}/.aero/batch-stop-test`;
    const fakeCopilot: string = writeExecutable(root, "stop-copilot.mjs", `
import fs from "node:fs";

const args = process.argv.slice(2);
const prompt = args[args.indexOf("--prompt") + 1] ?? "";
const resultPath = prompt.match(/\\/[^\\s]+\\/task1-result\\.json/)?.[0];
if (!resultPath) process.exit(2);
const startedPath = resultPath.replace("task1-result.json", "child-started");
const stoppedPath = resultPath.replace("task1-result.json", "child-stopped");
fs.writeFileSync(startedPath, String(process.pid));
process.on("SIGTERM", () => {
  fs.writeFileSync(stoppedPath, "stopped");
  setTimeout(() => process.exit(0), 50);
});
setInterval(() => {}, 1000);
`);
    const store: BatchStateStore = BatchStateStore.create({
      batchDir,
      repositoryRoot,
      tasks: ["stoppable task"],
      taskTimeoutMinutes: 1,
      maxAttempts: 1,
      supervisorWindow: "batch-stop-test",
    });

    const runner: Promise<void> = runCopilotBatch(batchDir, {
      copilotBin: fakeCopilot,
      pluginRoot: root,
      heartbeatIntervalMs: 10,
    });
    await waitForFile(`${batchDir}/child-started`);
    store.stop("test stop");
    await runner;

    const state = store.read();
    assert.equal(state.status, "stopped");
    assert.equal(state.supervisorPid, 0);
    assert.equal(state.tasks[0].childPid, 0);
    assert.equal(fs.existsSync(`${batchDir}/child-stopped`), true);
  } finally {
    if (batchDir && fs.existsSync(`${batchDir}/state.json`)) {
      const state = new BatchStateStore(batchDir).read();
      const activeTask = state.tasks.find((task) => task.childPid > 0);
      if (activeTask) {
        await terminateProcessGroup(activeTask.childPid, activeTask.childIdentity);
      }
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("malformed result JSON falls back to final.md", async () => {
  const root: string = fs.mkdtempSync(`${os.tmpdir()}/agentow-result-fallback-`);
  try {
    const { repositoryRoot } = createRepository(root);
    const batchDir: string = `${repositoryRoot}/.aero/batch-result-fallback-test`;
    const fakeCopilot: string = writeExecutable(root, "fallback-copilot.mjs", `
import fs from "node:fs";

const args = process.argv.slice(2);
const prompt = args[args.indexOf("--prompt") + 1] ?? "";
const resultPath = prompt.match(/\\/[^\\s]+\\/task([0-9]+)-result\\.json/)?.[0];
const finalPath = prompt.match(/\\/[^\\s]+\\/final\\.md/)?.[0];
if (!resultPath || !finalPath) process.exit(2);
const taskIndex = Number(resultPath.match(/task([0-9]+)-result\\.json/)?.[1]);
fs.writeFileSync(resultPath, taskIndex === 1 ? "{malformed" : JSON.stringify({
  status: "success",
  prUrl: "",
  branch: "user/test/fallback",
  commit: "fallback-commit",
  error: ""
}));
fs.mkdirSync(finalPath.slice(0, finalPath.lastIndexOf("/")), { recursive: true });
fs.writeFileSync(finalPath, "Status: success\\nPR: https://dev.azure.com/onedrive/ODSP-Web/_git/odsp-web/pullrequest/" + (3000 + taskIndex) + "\\n");
`);
    BatchStateStore.create({
      batchDir,
      repositoryRoot,
      tasks: ["malformed result task", "missing PR result task"],
      taskTimeoutMinutes: 1,
      maxAttempts: 1,
      supervisorWindow: "batch-result-fallback-test",
    });

    await runCopilotBatch(batchDir, {
      copilotBin: fakeCopilot,
      pluginRoot: root,
      heartbeatIntervalMs: 10,
    });

    const state = new BatchStateStore(batchDir).read();
    assert.equal(state.tasks[0].status, "success");
    assert.equal(state.tasks[0].prUrl.endsWith("/3001"), true);
    assert.equal(state.tasks[1].status, "success");
    assert.equal(state.tasks[1].prUrl.endsWith("/3002"), true);
    assert.equal(state.tasks[1].branch, "user/test/fallback");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("stash conflicts are snapshotted and do not block the next task", async () => {
  const root: string = fs.mkdtempSync(`${os.tmpdir()}/agentow-conflict-recovery-`);
  try {
    const { repositoryRoot } = createRepository(root);
    const batchDir: string = `${repositoryRoot}/.aero/batch-conflict-recovery-test`;
    const fakeCopilot: string = writeExecutable(root, "conflict-copilot.mjs", `
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
const prompt = args[args.indexOf("--prompt") + 1] ?? "";
const resultPath = prompt.match(/\\/[^\\s]+\\/task([0-9]+)-result\\.json/)?.[0];
if (!resultPath) process.exit(2);
const taskIndex = Number(resultPath.match(/task([0-9]+)-result\\.json/)?.[1]);
const git = (...gitArgs) => spawnSync("git", gitArgs, { cwd: process.cwd(), encoding: "utf8" });

if (taskIndex === 1) {
  git("switch", "-c", "conflict-side");
  fs.writeFileSync("README.md", "side change\\n");
  git("add", "README.md");
  git("commit", "-m", "Side change");
  git("switch", "-");
  fs.writeFileSync("README.md", "task change\\n");
  git("add", "README.md");
  git("commit", "-m", "Task change");
  git("merge", "conflict-side");
  fs.writeFileSync(resultPath, JSON.stringify({
    status: "failed",
    prUrl: "",
    branch: "",
    commit: "",
    error: "intentional conflict"
  }));
} else {
  fs.writeFileSync(resultPath, JSON.stringify({
    status: "success",
    prUrl: "https://dev.azure.com/onedrive/ODSP-Web/_git/odsp-web/pullrequest/4002",
    branch: "user/test/after-conflict",
    commit: "after-conflict",
    error: ""
  }));
}
`);
    BatchStateStore.create({
      batchDir,
      repositoryRoot,
      tasks: ["conflicting task", "following task"],
      taskTimeoutMinutes: 1,
      maxAttempts: 1,
      supervisorWindow: "batch-conflict-recovery-test",
    });

    await runCopilotBatch(batchDir, {
      copilotBin: fakeCopilot,
      pluginRoot: root,
      heartbeatIntervalMs: 10,
    });

    const state = new BatchStateStore(batchDir).read();
    assert.equal(state.status, "completed");
    assert.equal(state.tasks[0].status, "stashed-failure");
    assert.match(state.tasks[0].stash, /^snapshot:/);
    const snapshotDir: string = state.tasks[0].stash.slice("snapshot:".length);
    assert.equal(fs.existsSync(`${snapshotDir}/working.patch`), true);
    assert.match(fs.readFileSync(`${snapshotDir}/status.txt`, "utf8"), /README\.md/);
    assert.equal(state.tasks[1].status, "success");

    const gitStatus: cp.SpawnSyncReturns<string> = cp.spawnSync(
      "git",
      ["status", "--porcelain", "--untracked-files=all", "--", ".", ":(exclude).aero/**"],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    assert.equal(gitStatus.status, 0);
    assert.equal(gitStatus.stdout.trim(), "");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("ordinary leftovers are preserved by immutable stash commit SHA", async () => {
  const root: string = fs.mkdtempSync(`${os.tmpdir()}/agentow-stash-`);
  try {
    const { repositoryRoot } = createRepository(root);
    const batchDir: string = `${repositoryRoot}/.aero/batch-stash-test`;
    const fakeCopilot: string = writeExecutable(root, "stash-copilot.mjs", `
import fs from "node:fs";

const args = process.argv.slice(2);
const prompt = args[args.indexOf("--prompt") + 1] ?? "";
const resultPath = prompt.match(/\\/[^\\s]+\\/task1-result\\.json/)?.[0];
if (!resultPath) process.exit(2);
fs.writeFileSync("README.md", "uncommitted task change\\n");
fs.writeFileSync(resultPath, JSON.stringify({
  status: "failed",
  prUrl: "",
  branch: "",
  commit: "",
  error: "intentional failure"
}));
`);
    BatchStateStore.create({
      batchDir,
      repositoryRoot,
      tasks: ["stash task"],
      taskTimeoutMinutes: 1,
      maxAttempts: 1,
      supervisorWindow: "batch-stash-test",
    });

    await runCopilotBatch(batchDir, {
      copilotBin: fakeCopilot,
      pluginRoot: root,
      heartbeatIntervalMs: 10,
    });

    const state = new BatchStateStore(batchDir).read();
    assert.equal(state.tasks[0].status, "stashed-failure");
    assert.match(state.tasks[0].stash, /^[0-9a-f]{40}$/);
    run("git", ["cat-file", "-e", `${state.tasks[0].stash}^{commit}`], repositoryRoot);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("process-group termination waits for the parent and descendants to exit", async () => {
  const root: string = fs.mkdtempSync(`${os.tmpdir()}/agentow-process-tree-`);
  let parentPid = 0;
  try {
    const pidsPath: string = `${root}/pids.json`;
    const processScript: string = writeExecutable(root, "process-tree.mjs", `
import { spawn } from "node:child_process";
import fs from "node:fs";

const descendantReadyPath = process.argv[2] + ".descendant-ready";
const descendantSource = "const fs = require('node:fs'); fs.writeFileSync(process.argv[1], 'ready'); process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);";
const descendant = spawn(process.execPath, ["-e", descendantSource, descendantReadyPath], { stdio: "ignore" });
const readyTimer = setInterval(() => {
  if (fs.existsSync(descendantReadyPath)) {
    clearInterval(readyTimer);
    fs.writeFileSync(process.argv[2], JSON.stringify({ parent: process.pid, descendant: descendant.pid }));
  }
}, 10);
process.on("SIGTERM", () => setTimeout(() => process.exit(0), 150));
setInterval(() => {}, 1000);
`);
    const parent: cp.ChildProcess = cp.spawn(process.execPath, [processScript, pidsPath], {
      detached: true,
      stdio: "ignore",
    });
    parentPid = parent.pid ?? 0;
    await waitForFile(pidsPath);
    const pids = JSON.parse(fs.readFileSync(pidsPath, "utf8")) as { parent: number; descendant: number };
    const identity: string = getProcessIdentity(pids.parent);
    assert.notEqual(identity, "");

    await terminateProcessGroup(pids.parent, identity, 300);

    assert.equal(isProcessAlive(pids.parent), false);
    assert.equal(isProcessAlive(pids.descendant), false);
  } finally {
    if (parentPid > 0 && isProcessAlive(parentPid)) {
      try {
        process.kill(-parentPid, "SIGKILL");
      } catch {
        // Best-effort test cleanup.
      }
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
