---
name: ow-batch
description: "Run multiple odsp-web agentOW tasks autonomously in Copilot CLI, one task per headless /agentow --auto run. Use when the user provides a list of features/bugs and wants each task to produce its own draft PR without stopping the whole batch on individual failures. Triggers on: ow-batch, batch agentow, run these tasks overnight, process this task list, multiple PRs."
---

# agentOW Batch Mode (Copilot CLI)

Run a list of odsp-web tasks sequentially. Each task gets a fresh headless Copilot CLI session running `/agentow --auto`, and each task should produce its own branch and draft PR. Failures in one task must not stop the batch.

## Why Copilot batch is different from Claude `/ow-batch`

Claude uses Agent Teams and can spawn a fresh team per task. Copilot CLI does not expose the same team primitive, and the `ow` MCP server is rooted at `/workspaces/odsp-web`, so do **not** use git worktrees for parallel execution. Run tasks **serially** in the main odsp-web checkout, using a fresh `copilot -p` process per task for session isolation.

## Step 1: Parse tasks

Accept tasks from:

```text
/ow-batch
1. Add loading spinner to PhotoGrid
2. Fix elevation background on mobile
```

or:

```text
/ow-batch tasks.md
```

If no tasks are provided, ask the user once for the task list. After the list is confirmed, run autonomously.

Normalize tasks into an ordered list. Each task must be one feature/fix. If an item contains multiple independent changes, split it before starting.

## Step 2: Create batch artifacts

Create:

```text
/workspaces/odsp-web/.aero/batch-<YYYYMMDD-HHMMSS>/
├── batch.log
├── summary.md
└── task<N>.log
```

Initialize `summary.md`:

```markdown
# agentOW Copilot Batch — <timestamp>

Total tasks: <N>
Started: <ISO timestamp>

| # | Task | Status | PR | Notes |
|---|------|--------|----|-------|
```

Append to `batch.log` before every state transition.

## Step 3: Preflight

Before the first task:

1. Run `copilot --version` and record it in `batch.log`.
2. Run `git -C /workspaces/odsp-web status --short`.
3. If the worktree has user changes before batch starts, stop and ask the user to clean/stash/commit them. Do not stash pre-existing user changes automatically.
4. Run `git -C /workspaces/odsp-web fetch origin`.

## Step 4: Run each task

For each task `i`:

### 4a. Prepare checkout

Before launching the task, return to a clean main baseline:

```bash
git -C /workspaces/odsp-web checkout main
git -C /workspaces/odsp-web pull --ff-only origin main
```

If checkout fails because the previous task left uncommitted changes:

1. Preserve them, do not discard:
   ```bash
   git -C /workspaces/odsp-web stash push -u -m "agentow-batch-task<i>-failed"
   ```
2. Record the stash name in `summary.md` notes.
3. Continue with the next task from main.

### 4b. Launch headless agentOW

Run a fresh Copilot CLI process from `/workspaces/odsp-web`:

```bash
copilot --autopilot --allow-all --max-autopilot-continues 20 \
  -p "/agentow --auto <task text>"
```

Redirect stdout/stderr to the per-task log:

```text
/workspaces/odsp-web/.aero/batch-<timestamp>/task<i>.log
```

If `--allow-all` is not supported by the installed Copilot CLI, retry with `--yolo`. If `--autopilot` is not supported, retry with plain `copilot -p`, but record the degraded mode in `batch.log`.

### 4c. Parse result

After the process exits:

1. Check exit code.
2. Search the task log for an ADO PR URL:
   ```regex
   https://dev\.azure\.com/onedrive/ODSP-Web/_git/odsp-web/pullrequest/[0-9]+
   ```
3. Also search recent `.aero/*/final.md` and `progress.log` if the URL is not in stdout.
4. Record:
   - `success` if exit code is 0 and PR URL found
   - `completed-no-pr` if exit code is 0 but no PR URL found
   - `failed` if exit code is non-zero
   - `stashed-failure` if uncommitted changes had to be stashed after failure

### 4d. Append summary row

Append one row to `summary.md`:

```markdown
| <i> | <task> | ✅ success / ⚠️ completed-no-pr / ❌ failed | <PR or —> | <task log path / stash note> |
```

Do not stop the batch on failure. Continue to task `i+1`.

## Step 5: Final summary

After all tasks finish, append:

```markdown
## Summary

- Total: <N>
- ✅ Success: <count>
- ⚠️ Completed without PR: <count>
- ❌ Failed: <count>
- Stashes created: <count>
- Finished: <ISO timestamp>
```

Tell the user:

```text
Batch complete.
Summary: /workspaces/odsp-web/.aero/batch-<timestamp>/summary.md
Logs:    /workspaces/odsp-web/.aero/batch-<timestamp>/task*.log
```

## Rules

- Run tasks serially. Do not run multiple `/agentow` tasks concurrently against the same `/workspaces/odsp-web` checkout.
- Never discard uncommitted changes. Stash task leftovers with a descriptive `agentow-batch-task<N>-failed` message.
- Do not auto-stash changes that existed before the batch started; ask the user to resolve them.
- Every task gets a fresh `copilot -p` process.
- Every task runs `/agentow --auto`.
- Every task writes a row to `summary.md`, even if it fails before agentOW starts.
- `summary.md` is the source of truth for the batch.
