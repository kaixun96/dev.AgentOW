---
name: ow-team
description: "Use when the user asks to run the full odsp-web agent workflow, kick off the agent team, run end-to-end development, orchestrate the full cycle, or wants autonomous feature implementation. Creates a persistent team of 5 agents — orchestrator runs the full pipeline while you step back."
---

# odsp-web Agent Team

Create a persistent agent team for the full development pipeline. **You play two roles:**

1. **Launcher** — set up the session, read agent definitions, create the team, spawn agents, start monitoring.
2. **User-relay (after launch)** — relay user Q&A between `ow-orchestrator` and the user. Team members cannot call `AskUserQuestion` directly (they are idle workers, not interactive threads), so the orchestrator sends user-facing questions to you via `SendMessage`, and you forward the user's reply back to the orchestrator.

Never make implementation, planning, or coordination decisions yourself — you are strictly a transport layer for the orchestrator ↔ user channel.

> **Why Team mode over Subagent serial:** Team agents are persistent — the generator in cycle 2 is the same instance as cycle 1, retaining full context of what it tried, what failed, and what code it wrote. Subagent serial mode destroys this context between cycles.

> **Why inline agent definitions:** After context compaction, agents that were told to "read a file" lose the content. Embedding the full MD content in the spawn prompt ensures the agent definition survives compaction.

---

## Step 1: Capture User Request and Setup Session

Record the user's exact request as `userPrompt`. Derive a kebab-case session name (under 30 chars).

```bash
mkdir -p /workspaces/odsp-web/.aero/<session-name>/plans
touch /workspaces/odsp-web/.aero/<session-name>/report.json
touch /workspaces/odsp-web/.aero/<session-name>/progress.log
```

Record variables:

| Variable | Value |
|----------|-------|
| `{sessionName}` | kebab-case name |
| `{sessionDir}` | `/workspaces/odsp-web/.aero/{sessionName}/` |
| `{reportFile}` | `{sessionDir}/report.json` |
| `{progressLog}` | `{sessionDir}/progress.log` |
| `{planDir}` | `{sessionDir}/plans/` |
| `{teamName}` | `ow-{sessionName}` |
| `{userPrompt}` | user's exact request |

Tell the user: `Session workspace initialized at {sessionDir}. Reading agent definitions...`

---

## Step 2: Read All Agent MD Files

Read all 5 agent MD files using the `Read` tool. Store the full content of each.

| Variable | File path |
|----------|-----------|
| `{orchestratorMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-orchestrator.md` |
| `{plannerMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-planner.md` |
| `{generatorMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-generator.md` |
| `{evaluatorMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-evaluator.md` |
| `{reviewMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-review-agent.md` |

Read all 5 in parallel. Do not proceed until all reads are complete.

---

## Step 3: Create the Team

Call `TeamCreate`:

```json
{
  "team_name": "{teamName}",
  "description": "odsp-web full development cycle — planner → generator → evaluator loop",
  "agent_type": "coordinator"
}
```

---

## Step 4: Spawn the Agents

Spawn all 5 agents using the `Agent` tool. Use `subagent_type: general-purpose` for all.

> **Why general-purpose:** Custom `subagent_type` values like `agentOW:*` are not supported for team member spawning. Agent behavior comes entirely from the `prompt` parameter — each agent receives its full definition inlined.

### Agents 1–4 — idle members (spawn FIRST, before orchestrator)

Spawn all 4 idle agents FIRST so they are ready to receive messages when the orchestrator starts.

| `name` | MD variable |
|--------|-------------|
| `ow-planner` | `{plannerMd}` |
| `ow-generator` | `{generatorMd}` |
| `ow-evaluator` | `{evaluatorMd}` |
| `ow-review-agent` | `{reviewMd}` |

```
subagent_type: general-purpose
team_name: {teamName}
name: {agentName}
prompt:
  You are {agentName}. Follow this agent definition exactly:

  ======= AGENT DEFINITION START =======
  {agentMd}
  ======= AGENT DEFINITION END =======

  Team: {teamName}
  Session workspace: {sessionDir}
  Shared report file: {reportFile}

  ACTIVATION: Do NOT start working until ow-orchestrator contacts you
  via SendMessage. Wait silently until then.

  ## Shutdown protocol
  If you receive a message with {"type":"shutdown_request"}, immediately
  call SendMessage back to the sender with:
    {"type":"shutdown_response","request_id":"<echo the request_id>","approve":true}
  Then stop all work.
```

### Agent 5 — ow-orchestrator (active, spawn LAST)

> **Why last:** The orchestrator immediately sends SendMessage to ow-planner on startup. If planner hasn't been spawned yet, the message is lost and the pipeline deadlocks. Spawning idle agents first ensures all teammates are ready.

```
subagent_type: general-purpose
team_name: {teamName}
name: ow-orchestrator
prompt:
  You are ow-orchestrator. Follow this agent definition exactly:

  ======= AGENT DEFINITION START =======
  {orchestratorMd}
  ======= AGENT DEFINITION END =======

  Session context (already initialized — skip Step 0):
    Team:         {teamName}
    sessionDir:   {sessionDir}
    reportFile:   {reportFile}
    progressLog:  {progressLog}
    planDir:      {planDir}
    User task:    {userPrompt}

  Team members (already spawned and waiting for your instructions):
    - ow-planner
    - ow-generator
    - ow-evaluator
    - ow-review-agent

  CRITICAL: After sending SendMessage to a teammate, you MUST wait for
  their response message before doing anything else. The full pipeline
  (planner → approval → generator → evaluator → review → PR) must run
  as one continuous flow. Never go idle between steps.

  Start immediately with Step 1 (invoke ow-planner).
```

---

## Step 5: Start Monitoring and Serve as User-Relay

After all 5 agents are spawned, tell the user:

```
Team "{teamName}" is live.

  ow-orchestrator   — running (driving the pipeline)
  ow-planner        — idle (waiting for orchestrator)
  ow-generator      — idle (waiting for orchestrator)
  ow-evaluator      — idle (waiting for orchestrator)
  ow-review-agent   — idle (waiting for orchestrator)

Session workspace: {sessionDir}
Progress log:      {progressLog}

The orchestrator will ask for your approval on the implementation plan.
```

Start monitoring the progress log:

```bash
Monitor: tail -f {progressLog}
```

This streams orchestrator status updates to the user's terminal as they happen.

**After starting Monitor, your job becomes user-relay.** Do NOT invoke any other tools (no Agent, no Bash on source, no Read/Edit/Write on code). Your ONLY active behavior from this point onward:

### When ow-orchestrator sends you a message

If the message contains a question/plan/status that needs user input:
1. Present the orchestrator's message content to the user **verbatim** (so the user sees the raw content, not your paraphrase).
2. Wait for the user's reply.
3. Forward the user's reply back to `ow-orchestrator` via `SendMessage`, prefixing it so the orchestrator knows it's a user response (e.g. `"USER RESPONSE: <raw text>"`).

If the message is a status/progress update (not a question): optionally summarize to the user, but do nothing else.

### When the user sends you a message mid-pipeline

- **Status question** ("what's going on?") → forward to `ow-orchestrator` via `SendMessage`, then relay the reply.
- **Course correction** ("change the plan", "stop the cycle", "skip tests") → forward verbatim to `ow-orchestrator`.
- **Shutdown request** ("stop", "cancel") → send `{"type": "shutdown_request"}` to `ow-orchestrator`.

### Do NOT

- Reply to the orchestrator's user-relay questions yourself. Always route through the user.
- Intervene with sub-agents directly (e.g. DM'ing `ow-planner`) — it violates the orchestrator's authority. If the orchestrator appears stuck, **wait at least 5 minutes** before probing — planner research and generator builds legitimately take 2-5 min. Only if still stuck, `SendMessage` to `ow-orchestrator` (not the sub-agent) asking for a status check.
- Read or write source code under `/workspaces/odsp-web/`.
- Make scope, plan, or approval decisions.

---

## Rules

- **You are a launcher + user-relay, never the orchestrator.** Never plan, build, coordinate, or read the report file yourself.
- **Do not use the `Agent` tool after Step 4.**
- Read all agent MD files (Step 2) before calling TeamCreate or spawning any agent.
- Spawn the orchestrator **first** so it is running before the idle agents join.
- If the user asks for a status update, use `SendMessage` to query `ow-orchestrator` by name — the orchestrator is the single source of truth.
- If the user asks to shut down, send `{"type": "shutdown_request"}` via `SendMessage` to `ow-orchestrator` first; it will relay the shutdown to its team members.
- Team members must NEVER message each other directly — all communication is brokered through `ow-orchestrator`.
- **Relay, don't decide.** When the orchestrator asks for user input via SendMessage, forward the raw content to the user; do not answer on their behalf.
- **Don't probe too early.** Agents going idle after a SendMessage is normal. Wait at least 5 minutes before checking whether an agent is actually stuck.
