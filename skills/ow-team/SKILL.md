---
name: ow-team
description: "Use when the user asks to run the full odsp-web agent workflow, kick off the agent team, run end-to-end development, orchestrate the full cycle, or wants autonomous feature implementation. Creates a team of specialized agents — ow-orchestrator runs autonomously while the main agent steps back."
---

# odsp-web Agent Team

Load this skill to create the odsp-web development team. The main agent's responsibility is:

1. Capture the user's request.
2. Read all agent MD files into memory.
3. Call `TeamCreate`.
4. Spawn agents with definitions **inlined** in each prompt.
5. **Step back — do nothing else unless the user explicitly asks.**

The `ow-orchestrator` agent owns the full workflow from that point.

> **Why inline, not file-link**: After context compaction, agents that were told to "read a file" lose
> the content. Embedding the full MD content in the spawn prompt ensures the agent
> definition survives compaction.

---

## Step 1: Capture User Request

Record the user's exact request as `userPrompt`. Derive a kebab-case session name from the request (e.g. "add loading spinner" → `add-loading-spinner`). Keep under 30 chars.

Run:

```bash
mkdir -p /workspaces/odsp-web/.aero/<session-name>/plans
touch /workspaces/odsp-web/.aero/<session-name>/report.json
touch /workspaces/odsp-web/.aero/<session-name>/progress.log
```

Record:
- `sessionName`: the kebab-case name
- `sessionDir`: `/workspaces/odsp-web/.aero/<session-name>/`
- `reportFile`: `{sessionDir}/report.json`
- `progressLog`: `{sessionDir}/progress.log`
- `planDir`: `{sessionDir}/plans/`
- `teamName`: `ow-<session-name>` (e.g. `ow-add-loading-spinner`)

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

### Agent 1 — ow-orchestrator (active, spawn first)

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

  Team members waiting for your instructions (use SendMessage by name):
    - ow-planner
    - ow-generator
    - ow-evaluator
    - ow-review-agent

  Start immediately with Step 1 (invoke ow-planner).
```

### Agents 2–5 — idle members (spawn after orchestrator)

For each idle agent (`ow-planner`, `ow-generator`, `ow-evaluator`, `ow-review-agent`), use:

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

  ## Shutdown protocol
  If you receive a message with {"type":"shutdown_request"}, immediately call SendMessage
  back to the sender with:
    {"type":"shutdown_response","request_id":"<echo the request_id>","approve":true}
  Then stop all work.
```

---

## Step 5: Step Back

After all 5 agents are spawned, tell the user:

```
Team "{teamName}" is live.

  ow-orchestrator   — running
  ow-planner        — idle (waiting for orchestrator)
  ow-generator      — idle (waiting for orchestrator)
  ow-evaluator      — idle (waiting for orchestrator)
  ow-review-agent   — idle (waiting for orchestrator)

Session workspace: {sessionDir}
Report file:       {reportFile}
Progress log:      {progressLog}

The orchestrator is running the full development cycle autonomously.
It will ask for your approval on the implementation plan.
```

Then start monitoring the progress log so the user sees real-time updates:

```bash
Monitor: tail -f {progressLog}
```

This streams orchestrator status updates to the user's terminal as they happen.

**After starting Monitor, stop.** Do NOT invoke any other tools, agents, or commands unless the user explicitly asks.

---

## Rules

- **You are a launcher, not the orchestrator.** Never plan, build, coordinate, or read the report file yourself.
- **Do not use the `Agent` tool after Step 4.**
- Read all agent MD files (Step 2) before calling TeamCreate or spawning any agent.
- Spawn the orchestrator first so it is running before the idle agents join.
- If the user asks for a status update, use `SendMessage` to query `ow-orchestrator` by name.
- If the user asks to shut down, send `{"type": "shutdown_request"}` via `SendMessage` to `ow-orchestrator`.
- Team members must NEVER message each other directly — all communication is brokered through `ow-orchestrator`.
