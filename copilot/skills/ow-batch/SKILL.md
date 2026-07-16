---
name: ow-batch
description: "Run multiple odsp-web agentOW tasks autonomously, serially, and durably. Starts a tmux supervisor with persisted state, per-task Copilot sessions, timeouts, retries, and automatic continuation after failures or parent-session interruption. Triggers on: ow-batch, batch agentow, run these tasks overnight, process this task list, multiple PRs."
---

# Durable agentOW Batch Mode (Copilot CLI)

Run an ordered list of odsp-web tasks serially. Each task gets a fresh autonomous Copilot session and should produce its own draft PR. The batch must continue after a task failure, a child-session interruption, or the parent Copilot conversation ending.

## Architecture: detached supervisor, not a conversation loop

`ow-batch` is a dispatcher for the `ow-batch-start` MCP tool.

The tool creates a persisted state machine under `/workspaces/odsp-web/.aero/batch-*/` and starts a supervisor in a detached tmux window. The supervisor:

1. prepares a clean `origin/main` baseline;
2. starts one `copilot -p "/agentow --auto ..."` child session;
3. waits for a terminal task result;
4. retries an interrupted child by resuming its named Copilot session;
5. applies a hard timeout to every attempt;
6. records terminal failure and preserves dirty or conflicted work before continuing;
7. advances to the next task without waiting for the parent conversation.

The main Copilot session does **not** implement batch tasks itself. It launches, reports, resumes, or stops the supervisor.

## Reliability contract

The following are hard invariants:

- Exactly one task runs at a time against `/workspaces/odsp-web`.
- Ending or interrupting the parent Copilot turn does not terminate the batch.
- Every task has a finite attempt timeout and finite retry count.
- A timed-out child process group fully exits before another attempt starts.
- Exhausted retries produce a terminal task checkpoint; they never leave the batch waiting forever.
- Dirty failed work is preserved by immutable stash commit SHA; conflicted work that cannot be stashed is saved as patches plus untracked files before the worktree is cleaned.
- `state.json` is written atomically and is the machine source of truth.
- `summary.md`, `batch.log`, and `task<N>.checkpoint.md` are durable human-readable mirrors.
- A missing supervisor can be restarted from `state.json` without repeating completed tasks.
- A single task failure never stops later tasks.
- Explicit stop terminates both the supervisor and the active Copilot process group.

A forced Codespace shutdown can stop all local processes. That is an infrastructure pause, not silent data loss: the next `ow-batch` invocation or status check must call `ow-batch-resume` and continue from persisted state.

## Step 1: Parse tasks

Accept tasks from an inline numbered list or a referenced file:

```text
/ow-batch
1. Add loading spinner to PhotoGrid
2. Fix elevation background on mobile
```

```text
/ow-batch tasks.md
```

Normalize the input into an ordered array where each element is one independently shippable feature or fix. Preserve work-item IDs and hard requirements in each task description. Split combined tasks before launch.

If no new task list is supplied, treat the invocation as a recovery/status request:

1. call `ow-batch-status` for the latest batch;
2. if its state is `running` and `supervisorActive` is false, call `ow-batch-resume`;
3. report the persisted status and paths.

## Step 2: Preflight

1. Call `ow-status`.
2. Confirm `/workspaces/odsp-web` has no pre-existing user changes.
3. If it is dirty, stop and ask the user to clean, commit, or stash it. Never auto-stash changes that existed before the batch.
4. Do not manually create batch files; `ow-batch-start` owns initialization so state and summary cannot diverge.

## Step 3: Launch the durable supervisor

Call:

```text
ow-batch-start({
  tasks: [...],
  taskTimeoutMinutes: 180,
  maxAttempts: 3
})
```

Use a longer timeout only when the task list is known to contain unusually expensive builds or visual environments. Never remove the timeout or use unlimited retries.

The tool returns:

- `batchDir`
- `statePath`
- `summaryPath`
- `logPath`
- `tmuxTarget`

After the tool succeeds, report those paths and end the turn. Do not run Task 1 directly in the parent session and do not poll the supervisor.

## Step 4: Status and automatic recovery

When the user asks for status, or when this skill is invoked again without a new task list:

1. call `ow-batch-status`;
2. trust `state.json`, not stale conversational memory;
3. if `state.status == "running"` and `supervisorActive == false`, immediately call `ow-batch-resume`;
4. call `ow-batch-status` once more and report the resumed target;
5. do not restart tasks whose status is terminal.

Do not repeatedly poll a healthy supervisor. The tmux process and persisted files are the execution surface.

## Step 5: Stop

Only stop a running batch when the user explicitly asks:

```text
ow-batch-stop({ batchDir, reason })
```

Stopping first persists a terminal `stopped` state, then terminates the active Copilot process group and supervisor window. Never kill batch processes by name or delete state files manually.

## Artifacts

Each durable batch contains:

```text
/workspaces/odsp-web/.aero/batch-<timestamp>/
├── state.json
├── summary.md
├── batch.log
├── supervisor.lock
├── task<N>.log
├── task<N>-result.json
├── task<N>.checkpoint.md
├── task<N>-recovery-*/       # only when conflicted work cannot be stashed
└── task<N>-agentow/
    ├── plan.md
    ├── progress.log
    ├── report.json
    ├── implementation/
    ├── evaluation/
    ├── review.md
    └── final.md
```

`state.json` is authoritative. Markdown files are for inspection and PR handoff.

## Prohibited legacy behavior

Do not:

- execute all tasks as a long loop in the current conversation;
- rely on normal context compaction for durability;
- wait indefinitely for a tool, subagent, build, evaluator, or PR;
- launch tasks in parallel against the shared checkout;
- create parallel odsp-web worktrees;
- discard uncommitted task work;
- infer task success without a terminal result and, for `success`, a draft PR URL;
- stop the batch because one task failed.

## Completion

The supervisor marks the batch `completed` only after every task has a terminal status. A completed batch requires:

- one checkpoint per task;
- a PR URL for every `success` or `success-with-blockers` task;
- preserved stash SHA or recovery-snapshot metadata for every `stashed-failure`;
- a final `summary.md` and `batch.log` completion event.

Use `ow-batch-status` to present the final table. Do not reconstruct results from conversation history.
