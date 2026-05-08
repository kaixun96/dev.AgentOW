---
name: ow-batch
description: "Use when the user wants to run multiple tasks autonomously and find all PRs ready in the morning. Examples: 'run these 10 tasks overnight', 'process this task list while I'm away', 'batch run all bugs from this list'. Each task gets a fresh agent team and produces its own PR. Failures in one task do not affect the rest."
---

# odsp-web Agent Batch Mode

Run a list of tasks sequentially, each producing its own PR. Designed for "drop it before leaving, come back to a list of PRs" scenarios.

**You are a batch dispatcher.** For each task in the list:
1. Set up a per-task session directory
2. Spawn a fresh agent team in `--auto` mode
3. Wait for the orchestrator to complete (PR created or failure reported)
4. Kill the team to free resources
5. Append the result (PR URL or error) to the batch summary
6. Continue with the next task — never stop the batch on a single task failure

When all tasks are done, present a summary table to the user.

> **Why batch needs its own skill:** /ow-team is a one-shot launcher. Running it 12 times manually means 12 manual context resets between tasks. /ow-batch automates the loop while keeping each task's agent team fully isolated (separate team name, separate session dir).

---

## Step 1: Get the Task List

The user provides tasks in one of these forms:

**Inline list:**
```
/ow-batch
1. Add loading spinner to PhotoGrid
2. Fix elevation background on mobile
3. Remove unused imports from sp-pages
```

**From a file:**
```
/ow-batch tasks.md
```

Each task should be one feature/fix. Parse into an array `{tasks}`.

If no tasks are provided, ask the user for them. **This is the ONLY interactive prompt** — everything else runs autonomously.

Set up the batch:

```bash
batchTimestamp=$(date +%Y%m%d-%H%M%S)
batchDir=/workspaces/odsp-web/.aero/batch-${batchTimestamp}
mkdir -p ${batchDir}
batchSummary=${batchDir}/summary.md
batchLog=${batchDir}/batch.log
```

Initialize the summary:

```markdown
# Batch Run — {batchTimestamp}

Total tasks: {N}
Started: {ISO timestamp}

| # | Task | Status | PR | Session |
|---|------|--------|-----|---------|
```

Tell the user:
```
🌙 BATCH MODE — running {N} tasks autonomously.
   Batch dir: {batchDir}
   Summary:   {batchSummary}
   You can leave — each task runs in --auto mode and produces its own PR.
   Results will be in summary.md when all tasks finish.
```

---

## Step 2: For Each Task

Loop through `{tasks}`. For task `i` (1-indexed):

### 2a. Set up per-task session

```bash
sessionName=batch-${batchTimestamp}-task${i}-<short-kebab-from-task>
sessionDir=/workspaces/odsp-web/.aero/${sessionName}
mkdir -p ${sessionDir}/plans
touch ${sessionDir}/report.json
touch ${sessionDir}/progress.log

teamName=ow-${sessionName}
```

### 2b. Append to batch log

```bash
echo "[$(date +%H:%M:%S)] ▶️  Task ${i}/${N} starting: ${taskDescription}" >> ${batchLog}
```

### 2c. Read agent MD files (only on first task — cache them in memory for the batch)

| Variable | File path |
|----------|-----------|
| `{orchestratorMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-orchestrator.md` |
| `{plannerMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-planner.md` |
| `{generatorMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-generator.md` |
| `{evaluatorMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-evaluator.md` |
| `{reviewMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-review-agent.md` |

### 2d. Create team

```json
TeamCreate({
  "team_name": "{teamName}",
  "description": "Batch task ${i}/${N}: ${taskDescription}",
  "agent_type": "coordinator"
})
```

### 2e. Spawn agents (idle first, orchestrator last)

For each idle agent (`ow-planner`, `ow-generator`, `ow-evaluator`, `ow-review-agent`):

```
Agent({
  subagent_type: "general-purpose",
  team_name: "{teamName}",
  name: "{agentName}",
  prompt: "
    You are {agentName}. Follow this agent definition exactly:

    ======= AGENT DEFINITION START =======
    {agentMd}
    ======= AGENT DEFINITION END =======

    Team: {teamName}
    Session workspace: {sessionDir}
    Shared report file: {sessionDir}/report.json

    ACTIVATION: Do NOT start working until ow-orchestrator contacts you
    via SendMessage. Wait silently until then.

    ## Shutdown protocol
    If you receive {\"type\":\"shutdown_request\"}, immediately call
    SendMessage back with {\"type\":\"shutdown_response\",\"approve\":true}
    and stop all work.
  "
})
```

Then spawn orchestrator:

```
Agent({
  subagent_type: "general-purpose",
  team_name: "{teamName}",
  name: "ow-orchestrator",
  prompt: "
    You are ow-orchestrator. Follow this agent definition exactly:

    ======= AGENT DEFINITION START =======
    {orchestratorMd}
    ======= AGENT DEFINITION END =======

    Session context (already initialized — skip Step 0):
      Team:         {teamName}
      sessionDir:   {sessionDir}
      reportFile:   {sessionDir}/report.json
      progressLog:  {sessionDir}/progress.log
      planDir:      {sessionDir}/plans/
      User task:    {taskDescription}
      autoMode:     true
      batchMode:    true

    Team members (already spawned):
      - ow-planner
      - ow-generator
      - ow-evaluator
      - ow-review-agent

    AUTO MODE: skip plan approval, skip review-critical confirmation.

    BATCH MODE — CRITICAL FINAL STEP:
    When the entire pipeline completes (PR created OR failure), you MUST
    send a SendMessage to 'team-lead' as your VERY LAST action. Do NOT
    just write the result in plain text — plain text does not propagate
    to the dispatcher.

    The SendMessage payload MUST be a single line, prefixed with
    'BATCH_RESULT:' so the dispatcher can parse it reliably:

      Success:   SendMessage(to='team-lead', message='BATCH_RESULT: success | PR: <url>')
      Failure:   SendMessage(to='team-lead', message='BATCH_RESULT: failure | ERROR: <reason>')

    Send this exactly ONCE, after everything else is done. The dispatcher
    is blocked waiting for this message — without it, the entire batch
    deadlocks.

    Do NOT call AskUserQuestion. Do NOT prompt the user.
    Start immediately with Step 1 (invoke ow-planner).
  "
})
```

### 2f. Wait for completion (with recovery on timeout)

Wait for one of these signals, whichever comes first:

1. **BATCH_RESULT SendMessage** from orchestrator (preferred path)
2. **30-minute "stall" checkpoint** — first attempt to recover
3. **60-minute hard timeout** — final give-up

**On BATCH_RESULT received:**
- `BATCH_RESULT: success | PR: <url>` → success.
- `BATCH_RESULT: failure | ERROR: <reason>` → failure.

**On 30-min stall checkpoint (first recovery attempt):**

The timeout firing is itself a wake event for the dispatcher — use it to actively recover, not give up. The mechanism: SendMessage to a team agent **always** wakes it into a new turn (this is a harness guarantee, unlike idle notifications). So we send a targeted nudge and wait another 30 min.

```bash
tail -5 ${sessionDir}/progress.log
```

First, check if work is actually done but BATCH_RESULT was forgotten:
- If `✅ Workflow complete` is in the log → mark success-recovered-from-log, parse URL, done.

Otherwise, identify the stuck agent from the last log entry, then SendMessage to nudge:

| Last log entry pattern | Stuck on | Wake target |
|------------------------|----------|-------------|
| `🚀 Session started` / `📋 Planner started` | Planning | `ow-planner` |
| `✅ Plan approved` / `🔨 Generator started (cycle N)` | Generator coding/building | `ow-generator` |
| `🔨 Generator code_done` (no `build_done` follow-up) | Generator should continue to build/test | `ow-generator` |
| `🔨 Generator build_done` / `🔍 Eval started` | Orchestrator collecting responses | `ow-orchestrator` |
| `✅ ALL PASS` / `📝 Quick review` | Orchestrator running review/PR | `ow-orchestrator` |
| `📝 Review completed` / `🚀 Creating PR` | Orchestrator creating PR | `ow-orchestrator` |
| anything else | Catch-all | `ow-orchestrator` |

Send the nudge:

```
SendMessage to <wake target>:
  "WAKE — pipeline has been idle for 30+ minutes. Last log entry:
   '<last_line>'. Resume your next step now. If you are blocked,
   send your status (build_done with status:failure, or BATCH_RESULT
   failure to team-lead). Do not stay idle."
```

Append to batch.log: `[$(date +%H:%M:%S)] 🔔 Task ${i} stalled at 30min, waking ${wakeTarget}`

Then continue waiting another 30 min (total 60 min budget).

**On 60-min hard timeout (final):**

Check progress.log one last time:
- If `✅ Workflow complete` appears → success-recovered-from-log.
- Otherwise → timeout, give up. Append: `[$(date +%H:%M:%S)] ⏰ Task ${i} timed out after 60min (wake attempt did not recover)`.

Append the appropriate batch.log entry:
- Success via SendMessage: `[$(date +%H:%M:%S)] ✅ Task ${i} complete: PR <url>`
- Success recovered from log: `[$(date +%H:%M:%S)] ⚠️  Task ${i} complete (recovered from log): PR <url>`
- Failure: `[$(date +%H:%M:%S)] ❌ Task ${i} failed: <reason>`
- Timeout: `[$(date +%H:%M:%S)] ⏰ Task ${i} timed out after 60min`

**Why this works (and the previous active-wait didn't):** the 30-min checkpoint is a one-shot wake of the dispatcher (from the timeout itself), not an attempt at periodic polling. SendMessage to a team agent is guaranteed to wake it (forces a new turn). So we get exactly ONE nudge attempt at the right moment, then exactly ONE final timeout — bounded, predictable, no dead code.

### 2g. Kill the team

Send `{"type":"shutdown_request"}` to all 5 agents via SendMessage. This frees memory before the next task starts.

### 2h. Append to summary

Append a row to `{batchSummary}`:

```markdown
| {i} | {taskDescription} | ✅ success / ❌ failed / ⏰ timeout | {PR URL or "—"} | {sessionDir} |
```

### 2i. Continue to next task

Do NOT abort the batch on a single failure. Move to task `i+1`.

---

## Step 3: Final Report

After all tasks finish, write the final summary section:

```markdown
## Summary

- Total: {N}
- ✅ Success: {successCount} (with PRs)
- ❌ Failed: {failureCount}
- ⏰ Timed out: {timeoutCount}

Finished: {ISO timestamp}
Total duration: {minutes}min

## Failed tasks (if any)

| # | Task | Reason | Session for debugging |
|---|------|--------|----------------------|
| {i} | ... | ... | {sessionDir} |
```

Tell the user:

```
🌅 BATCH COMPLETE

  Total: {N}
  ✅ {successCount} PRs created
  ❌ {failureCount} failed
  ⏰ {timeoutCount} timed out

  Summary: {batchSummary}
  PR URLs in summary table.

  For failed tasks, check the session dir's progress.log and report.json.
```

---

## Rules

- **Never abort the batch on a single task failure.** Log it, move on.
- **Each task gets its own team.** Different team_name, different session dir. Full isolation.
- **Never call AskUserQuestion mid-batch.** Once the batch starts, you are autonomous.
- **Write to batch.log frequently** so the user can monitor progress via `tail -f batch.log` if they check in mid-run.
- **Cache agent MD files in memory** — read once at batch start, reuse across all tasks.
- **Always kill teams between tasks** to prevent memory accumulation.
- **The summary.md is the source of truth** for what got done. Make it complete.
