---
name: ow-batch
description: "Run multiple odsp-web agentOW tasks autonomously and serially in the current Copilot CLI session. Use when the user provides a list of features/bugs and wants each task to produce its own draft PR without stopping the whole batch on individual failures. Triggers on: ow-batch, batch agentow, run these tasks overnight, process this task list, multiple PRs."
---

# agentOW Batch Mode (Copilot CLI)

Run a list of odsp-web tasks sequentially in the **current main session**. For each item, the main session directly runs the complete agentOW pipeline in AUTO mode. Each task should produce its own branch and draft PR. A failure in one task must not stop the remaining tasks.

## Architecture: main-session serial agentOW

The current session is both:

- the batch orchestrator across tasks; and
- the agentOW orchestrator/implementer for the active task.

It dispatches only the bounded planner, evaluator, and reviewer subagents required by the `agentow` skill. Their status remains visible in the current CLI session.

The `ow` MCP server is rooted at `/workspaces/odsp-web`, so tasks must run **serially** in the shared checkout. Do not use parallel worktrees.

Do **not**:

- launch nested `copilot -p` processes;
- delegate the complete agentOW pipeline to a general-purpose subagent;
- run `/clear` or `/new` between tasks.

Those approaches either hide the task context from the main session or abandon the batch.

Copilot CLI does not expose an assistant-callable `/compact` command. Task-boundary context management therefore works by checkpointing and minimizing what is carried forward:

1. Persist a concise checkpoint after every task.
2. Carry only the batch summary, remaining task list, and latest checkpoint forward.
3. Stop referencing completed-task diffs, logs, and subagent conversations.
4. Rely on normal CLI automatic compaction when context pressure requires it.

This is context minimization, not a guaranteed hard reset. It preserves unattended execution while keeping the main session fully informed during each task.

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

If no tasks are provided, ask once for the task list. Normalize it into an ordered list where each item is one feature or fix. Split independent changes before starting.

## Step 2: Create batch artifacts

Create:

```text
/workspaces/odsp-web/.aero/batch-<YYYYMMDD-HHMMSS>/
├── batch.log
├── summary.md
├── task<N>.log
└── task<N>.checkpoint.md
```

Initialize `summary.md`:

```markdown
# agentOW Copilot Batch — <timestamp>

Total tasks: <N>
Started: <ISO timestamp>

| # | Task | Status | PR | Notes |
|---|------|--------|----|-------|
```

Save the complete normalized task list to `<batchDir>/request.txt`, append `🩺 Bootstrap started`, and run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/agentow-bootstrap.mjs" \
  --host copilot \
  --session-dir "<batchDir>" \
  --request-file "<batchDir>/request.txt"
```

Read `<batchDir>/capabilities.json`. If the result is `restart-required`, report the installed items and restart instruction, then stop before task 1. Do not begin a batch with missing task-required capabilities that have no fallback.

Append concise timestamped state transitions to `batch.log`:

```text
[HH:MM:SS] 🌙 Batch started — <N> tasks
[HH:MM:SS] ▶️ Task <i>/<N> started — <task>
[HH:MM:SS] ✅ Task <i>/<N> success — <PR>
[HH:MM:SS] ⚠️ Task <i>/<N> success with blockers — <PR>
[HH:MM:SS] ⚠️ Task <i>/<N> completed without PR
[HH:MM:SS] ❌ Task <i>/<N> failed — <reason>
[HH:MM:SS] 🌅 Batch complete — success <S>, blockers <B>, no-pr <P>, failed <F>
```

## Step 3: Preflight

Before the first task:

1. Run `git -C /workspaces/odsp-web status --short`.
2. If the worktree has pre-existing user changes, stop and ask the user to clean, stash, or commit them. Never auto-stash changes that existed before the batch.
3. Run `git -C /workspaces/odsp-web fetch origin`.

## Step 4: Run each task

For each task `i`:

### 4a. Prepare a clean baseline

Prefer:

```bash
git -C /workspaces/odsp-web checkout main
git -C /workspaces/odsp-web pull --ff-only origin main
```

If local `main` has diverged from `origin/main`, do not reset, rebase, or rewrite it. Create a temporary baseline branch from `origin/main`:

```bash
git -C /workspaces/odsp-web switch -c agentow-batch/<timestamp>-task<i> origin/main
```

If a previous task left uncommitted changes, preserve them:

```bash
git -C /workspaces/odsp-web stash push -u -m "agentow-batch-task<i>-leftovers"
```

Record the stash in `summary.md`, then continue from a clean baseline.

### 4b. Run agentOW directly in the current session

Treat the task exactly as if the user had invoked:

```text
/agentow --auto <normalized task text>
```

Invoke the `agentow` skill if it is not already loaded, then execute its complete pipeline in the current session:

1. The current session performs request refinement, plan synthesis, implementation, build/test, fix cycles, and shipping.
2. Dispatch the agentOW planner, evaluator, and reviewer only for their bounded roles.
3. Use a new agentOW `.aero/<session>` directory for this task.
4. Pass the batch `capabilities.json` to the task planner and downstream pipeline.
5. Run in AUTO mode: record assumptions instead of asking the user.
6. Complete or update the task's draft PR.
7. Do not end the batch after obtaining the PR URL. Continue to result capture and checkpointing.

Write concise task-level state transitions to:

```text
/workspaces/odsp-web/.aero/batch-<timestamp>/task<i>.log
```

Keep detailed reports in the task's own agentOW session directory.

### 4c. Capture the result and clean the checkout

After agentOW finishes:

1. Read its `final.md`.
2. Capture status, PR URL, branch, commit, build/tests, visual verification, screenshots, and remaining blockers.
3. Capture context library ID, plan-stage maintenance result, as-built maintenance result, applied context commit/PR, and any exported patch/conflict.
4. Check worktree cleanliness:

   ```bash
   git -C /workspaces/odsp-web status --porcelain
   ```

5. If uncommitted changes remain, stash them as `agentow-batch-task<i>-leftovers` and record the stash before the next task.
6. Find the PR URL in `final.md`, the task log, or the recent agentOW `progress.log`. Support both URL forms:

   ```regex
   https://dev\.azure\.com/onedrive/ODSP-Web/_git/odsp-web/pullrequest/[0-9]+
   https://onedrive\.visualstudio\.com/ODSP-Web/_git/odsp-web/pullrequest/[0-9]+
   ```

Classify the result:

- `success`: agentOW completed and a PR URL exists.
- `success-with-blockers`: a PR exists but validation has an explicit fixture or environment blocker.
- `completed-no-pr`: implementation completed but no PR URL exists.
- `failed`: agentOW could not complete the task.
- `stashed-failure`: failure also left changes that required preservation.

### 4d. Write the task checkpoint

Write `/workspaces/odsp-web/.aero/batch-<timestamp>/task<i>.checkpoint.md`:

```markdown
# Task <i> checkpoint

- Task: <normalized task>
- Status: <status>
- PR: <url or —>
- Branch: <branch>
- Commit: <sha or —>
- agentOW session: <path>
- Build/tests: <concise result>
- Visual verification: <concise result>
- Remaining blockers: <none or concise list>
- Context maintenance: <library id; plan result; as-built result>
- Context artifact: <applied commit/PR, exported patch, conflict, or none>
- Stash: <name or none>
- Next task: <i+1 task text or batch complete>
```

Append the summary row:

```markdown
| <i> | <task> | ✅ success / ⚠️ success-with-blockers / ⚠️ completed-no-pr / ❌ failed | <PR or —> | <checkpoint path / stash note> |
```

Then enforce the context boundary:

1. Treat the checkpoint as the only task-specific context carried forward.
2. Do not re-read or reason from the completed task's source diff, raw command output, planner report, evaluator report, reviewer report, or conversation turns unless batch bookkeeping is inconsistent.
3. Do not reuse completed planner/evaluator/reviewer agents.
4. Continue directly to task `i+1`.
5. If the CLI automatically compacts, reload `summary.md`, `batch.log`, and the latest checkpoint before proceeding.

## Step 5: Final summary

After all tasks finish, append:

```markdown
## Summary

- Total: <N>
- ✅ Success: <count>
- ⚠️ Success with blockers: <count>
- ⚠️ Completed without PR: <count>
- ❌ Failed: <count>
- Stashes created: <count>
- Finished: <ISO timestamp>
```

Tell the user:

```text
Batch complete.
Summary: /workspaces/odsp-web/.aero/batch-<timestamp>/summary.md
Checkpoints: /workspaces/odsp-web/.aero/batch-<timestamp>/task*.checkpoint.md
Logs: /workspaces/odsp-web/.aero/batch-<timestamp>/task*.log
```

## Rules

- Run tasks serially against `/workspaces/odsp-web`.
- Context maintenance follows each linked library's policy and never pauses a batch task.
- The main session runs every complete agentOW task directly.
- Only planner, evaluator, and reviewer are delegated.
- Never launch nested `copilot -p`, `/clear`, or `/new`.
- Never delegate the complete pipeline to a subagent.
- Never discard uncommitted changes or rewrite pushed history.
- Every task gets a fresh agentOW session directory and fresh bounded subagents.
- Every task writes a summary row and checkpoint, even if it fails.
- After checkpointing, carry forward only batch bookkeeping and rely on normal CLI automatic compaction.
- `summary.md` is the source of truth for the batch.
