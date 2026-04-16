---
name: ow-team
description: "Use when the user asks to run the full odsp-web agent workflow, kick off the agent team, run end-to-end development, orchestrate the full cycle, or wants autonomous feature implementation. Creates a persistent team of 5 agents — orchestrator runs the full pipeline while you step back."
---

# odsp-web Agent Team

Create a persistent agent team for the full development pipeline. **You are a launcher** — set up the session, read agent definitions, create the team, spawn agents, start monitoring, then step back.

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

### Agent 1 — ow-orchestrator (active, spawn FIRST)

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

  CRITICAL: After sending SendMessage to a teammate, you MUST wait for
  their response message before doing anything else. The full pipeline
  (planner → approval → generator → evaluator → review → PR) must run
  as one continuous flow. Never go idle between steps.

  Start immediately with Step 1 (invoke ow-planner).
```

### Agents 2–5 — idle members (spawn AFTER orchestrator)

For each idle agent, use this template:

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

---

## Step 5: Start Monitoring and Step Back

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

**After starting Monitor, stop.** Do NOT invoke any other tools, agents, or commands unless the user explicitly asks.

---

## Rules

- **You are a launcher, not the orchestrator.** Never plan, build, coordinate, or read the report file yourself.
- **Do not use the `Agent` tool after Step 4.**
- Read all agent MD files (Step 2) before calling TeamCreate or spawning any agent.
- Spawn the orchestrator **first** so it is running before the idle agents join.
- If the user asks for a status update, use `SendMessage` to query `ow-orchestrator` by name — the orchestrator is the single source of truth.
- If the user asks to shut down, send `{"type": "shutdown_request"}` via `SendMessage` to `ow-orchestrator` first; it will relay the shutdown to its team members.
- Team members must NEVER message each other directly — all communication is brokered through `ow-orchestrator`.
