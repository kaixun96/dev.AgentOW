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

### 2f. Start Watchdog (background polling, observation only)

Before waiting for the result, start a background polling loop that records pipeline state every 5 minutes. This gives you (and the user, on review) visibility into long-running tasks. **The watchdog never kills the team or takes any other action — it is purely observational.**

Reasoning: rush build can legitimately take 15+ minutes. We don't want false alarms or premature termination. We just want a paper trail of "is the pipeline still alive" while we wait.

Run this in the background using Bash with `run_in_background: true`:

```bash
watchdogStart=$(date +%s)
while true; do
  sleep 300  # 5 minutes
  now=$(date +%s)
  elapsedSec=$((now - watchdogStart))
  elapsedMin=$((elapsedSec / 60))

  # Check progress.log mtime
  if [ -f "${sessionDir}/progress.log" ]; then
    logMtime=$(stat -c %Y "${sessionDir}/progress.log" 2>/dev/null || echo 0)
    idleSec=$((now - logMtime))
    idleMin=$((idleSec / 60))
    lastLine=$(tail -1 "${sessionDir}/progress.log" 2>/dev/null || echo "(empty)")
  else
    idleMin="?"
    lastLine="(no progress.log yet)"
  fi

  # Check report.json size as a secondary activity signal
  reportSize=$(stat -c %s "${sessionDir}/report.json" 2>/dev/null || echo 0)

  echo "[$(date +%H:%M:%S)] 🔍 watchdog task ${i}: elapsed=${elapsedMin}min, log_idle=${idleMin}min, report_bytes=${reportSize}, last: ${lastLine}" >> ${batchLog}
done
```

Capture the background process ID (e.g. `watchdogPid`) so you can kill it later.

> **What to watch for in batch.log:** if `log_idle` keeps growing past 15-20 minutes while `elapsed` continues, the pipeline is probably stuck. The watchdog will not act on this — but the existing 30-min hard timeout (Step 2g below) eventually catches it. The watchdog log gives you the diagnostic trail.

### 2g. Active Wait Loop — log-driven completion + idle nudge

**Critical insight:** Claude harness has turn boundaries — when an agent finishes a turn, it goes idle and stays idle until a NEW SendMessage arrives. Agents frequently end turns at semantically-natural points (e.g. right after sending a SendMessage), interpreting "I just sent a message" as "task complete". This causes pipeline-wide deadlocks where everyone is waiting for someone.

The MD instruction "do NOT end your turn between X and Y" is a prompt hint, not a harness guarantee. Models often disregard it.

**Strategy: don't trust SendMessage as the completion signal. Trust progress.log.**

Why progress.log works: `echo ... >> progress.log` is a Bash tool call, executed deterministically by the harness. If the orchestrator wrote `✅ Workflow complete`, the work IS done — even if it then forgot to send BATCH_RESULT.

**This is the active wait loop.** On each idle notification (Claude wakes you periodically), do:

```python
# Pseudocode for the wait logic
while True:
    receive next event (SendMessage OR idle notification OR external trigger)

    # Check 1: Did the orchestrator/anyone send BATCH_RESULT? (rare but happy path)
    if last_message contains "BATCH_RESULT:":
        parse, exit loop

    # Check 2: Did progress.log signal completion? (PRIMARY truth source)
    last_log_line = tail -1 ${sessionDir}/progress.log
    if last_log_line contains "✅ Workflow complete" OR matches "PR: https://..."
        extract PR URL from log (or from latest report.json line)
        log: "✅ Task ${i} complete (detected via progress.log): PR <url>"
        exit loop

    # Check 3: Are we stalled? (active recovery)
    log_idle = current_time - mtime(progress.log)
    if log_idle > 5 minutes:
        # Determine which agent should be active based on last log entry
        last_entry = tail -1 progress.log
        target_agent = match last_entry to expected next actor:
            - "Plan approved" / "Generator started"  → ow-generator
            - "Generator code_done"                   → ow-generator (continue to build)
            - "Generator build_done" / "Eval started" → ow-orchestrator (collect responses)
            - "Eval completed" / "ALL PASS"           → ow-orchestrator (run review/PR)
            - "Review completed"                      → ow-orchestrator (create PR)
            - other                                    → ow-orchestrator (catch-all)

        # Nudge the stuck agent
        SendMessage(to=target_agent,
            message="WATCHDOG NUDGE: pipeline log idle for ${log_idle}min. " +
                    "Last entry: '${last_entry}'. " +
                    "Please continue your next step OR send your status/failure message.")

        log: "🔔 Nudged ${target_agent} (idle ${log_idle}min)"

    # Check 4: Hard timeout
    if total_elapsed > 60 minutes:
        # Final fallback: one more progress.log check
        if last_line of progress.log indicates completion:
            recover URL, mark success
        else:
            mark as timeout
        exit loop
```

**Implementation notes:**
- The "wake on idle notification" happens automatically — every idle notification you receive is an opportunity to run the checks above. Treat each idle wake as one iteration of the loop.
- You have BOTH the background watchdog (Step 2f, writes to batch.log) AND this active wait logic. They complement: the watchdog gives diagnostic visibility; the active wait logic detects completion and nudges.
- Nudging the same agent repeatedly is fine — the model will either continue work or send back a "I'm stuck because X" message, both are useful.

When you exit the loop (any path), kill the watchdog: `kill ${watchdogPid} 2>/dev/null`.

Append the appropriate batch.log entry:
- Detected via SendMessage: `[$(date +%H:%M:%S)] ✅ Task ${i} complete (via SendMessage): PR <url>`
- Detected via progress.log: `[$(date +%H:%M:%S)] ✅ Task ${i} complete (via progress.log): PR <url>`
- Failure detected: `[$(date +%H:%M:%S)] ❌ Task ${i} failed: <reason>`
- Timeout: `[$(date +%H:%M:%S)] ⏰ Task ${i} timed out after 60min`

### 2h. Kill the watchdog and team

```bash
kill ${watchdogPid} 2>/dev/null
```

Send `{"type":"shutdown_request"}` to all 5 agents via SendMessage. This frees memory before the next task starts.

### 2i. Append to summary

Append a row to `{batchSummary}`:

```markdown
| {i} | {taskDescription} | ✅ success / ❌ failed / ⏰ timeout | {PR URL or "—"} | {sessionDir} |
```

### 2j. Continue to next task

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
