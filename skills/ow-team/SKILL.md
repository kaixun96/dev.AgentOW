---
name: ow-team
description: "Use when the user asks to run the full odsp-web agent workflow, kick off the agent team, run end-to-end development, orchestrate the full cycle, or wants autonomous feature implementation. Creates a persistent team of 5 agents — orchestrator runs the full pipeline while you step back."
---

# odsp-web Agent Team

Create a persistent agent team for the full development pipeline. **You play three roles:**

1. **Brainstormer** — before launching the team, run `superpowers:brainstorming` to fully understand what the user wants. This produces a refined, unambiguous request.
2. **Launcher** — set up the session, read agent definitions, create the team, spawn agents, start monitoring.
3. **User-relay (after launch)** — relay user Q&A between `ow-orchestrator` and the user. Team members cannot call `AskUserQuestion` directly (they are idle workers, not interactive threads), so the orchestrator sends user-facing questions to you via `SendMessage`, and you forward the user's reply back to the orchestrator.

Never make implementation or coordination decisions yourself — you are a brainstormer, launcher, and transport layer.

> **Why Team mode over Subagent serial:** Team agents are persistent — the generator in cycle 2 is the same instance as cycle 1, retaining full context of what it tried, what failed, and what code it wrote. Subagent serial mode destroys this context between cycles.

> **Why inline agent definitions:** After context compaction, agents that were told to "read a file" lose the content. Embedding the full MD content in the spawn prompt ensures the agent definition survives compaction.

---

## Step 0: Detect Mode and Announce

Check the skill arguments and user prompt for the `--auto` flag:

- If args contain `--auto` (or user says "fully autonomous", "no questions", "just do it") → **AUTO MODE**
- Otherwise → **INTERACTIVE MODE** (default)

Set `{autoMode}` = `true` or `false`.

| Mode | Brainstorm | Plan approval | Review critical confirmation |
|------|-----------|---------------|------------------------------|
| **Interactive** (default) | ✅ runs | ✅ asks user | ✅ asks user |
| **Auto** (`--auto`) | ❌ skipped | ❌ auto-approve | ❌ auto-proceed (still fixes within cycle limit) |

**Announce the mode to the user immediately, before any other work.** This is mandatory — the user must know upfront which mode is active.

If AUTO MODE:
```
🤖 AUTO MODE ENABLED — no further interaction required.
   Pipeline will run end-to-end and return a draft PR URL.
   Brainstorm: skipped. Plan approval: auto. Review critical: auto-fix (max 5 cycles).
```

If INTERACTIVE MODE:
```
💬 INTERACTIVE MODE — you will be asked to:
   1. Confirm intent during brainstorming (a few questions)
   2. Approve the implementation plan
   3. Decide whether to proceed if review finds critical issues
   To skip all prompts next time, use: /ow-team --auto
```

---

## Step 1: Capture User Request and Setup Session

Record the user's exact request as `userPrompt`. Derive a kebab-case slug (under 24 chars) from the request, then **append a timestamp suffix to guarantee a unique folder** — without it, two Claude sessions working the same bug derive the same slug and clobber each other's `report.json` / `progress.log`.

```bash
slug=<kebab-case-of-request>          # e.g. add-loading-spinner
sessionName=${slug}-$(date +%H%M%S)   # e.g. add-loading-spinner-143022
mkdir -p /workspaces/odsp-web/.aero/${sessionName}/plans
touch /workspaces/odsp-web/.aero/${sessionName}/report.json
touch /workspaces/odsp-web/.aero/${sessionName}/progress.log
```

> The `-$(date +%H%M%S)` suffix is mandatory. The folder MUST be unique per run. Never reuse or hardcode a bare slug.

Record variables:

| Variable | Value |
|----------|-------|
| `{sessionName}` | `<slug>-<HHMMSS>` (unique per run) |
| `{sessionDir}` | `/workspaces/odsp-web/.aero/{sessionName}/` |
| `{reportFile}` | `{sessionDir}/report.json` |
| `{progressLog}` | `{sessionDir}/progress.log` |
| `{planDir}` | `{sessionDir}/plans/` |
| `{teamName}` | `ow-{sessionName}` |
| `{userPrompt}` | user's exact request |

Tell the user: `Session workspace initialized at {sessionDir}.`

Write the mode to progress.log so it's visible in the Monitor stream:
```bash
echo "[$(date +%H:%M:%S)] 🤖 Mode: AUTO (no user interaction)" >> {progressLog}
# OR for interactive:
echo "[$(date +%H:%M:%S)] 💬 Mode: INTERACTIVE (will ask for plan approval)" >> {progressLog}
```

**Launch the progress-watcher backstop in the background.** This is a Node daemon that tails `report.json` (NDJSON) and watches `evaluation/iter*/` for new screenshots / findings, then appends human-readable lines to `progress.log` whenever the orchestrator forgets to. Without this, long pipelines look frozen to the user because the orchestrator LLM skips low-priority echo calls under load.

```bash
nohup node ${CLAUDE_PLUGIN_ROOT}/tools/progress-watcher.mjs {sessionDir} > {sessionDir}/.progress-watcher.out 2>&1 &
echo "watcher pid: $!" >> {progressLog}
```

The watcher exits cleanly when the user kills the team or session. It's idempotent — safe to start multiple times (subsequent starts re-tail from the saved offset).

---

## Step 1.5: Brainstorm (superpowers) — INTERACTIVE MODE ONLY

**If `{autoMode}` is true, SKIP this step entirely.** Set `{refinedRequest} = {userPrompt}` and proceed to Step 2.

In AUTO MODE, the orchestrator will use the raw user request. The planner is responsible for handling ambiguity by making reasonable assumptions and noting them in the plan.

Otherwise (interactive mode), invoke the `superpowers:brainstorming` skill via the `Skill` tool:

```
Skill(skill="superpowers:brainstorming")
```

Follow the brainstorming skill's process:
1. Explore project context (check relevant files in `/workspaces/odsp-web`)
2. Ask clarifying questions — one at a time, multiple choice preferred
3. Propose 2-3 approaches with trade-offs and your recommendation
4. Present design and get user approval

**When brainstorming completes**, you will have a clear, refined understanding of what to build. Compose a `{refinedRequest}` that captures all clarified context — this replaces the raw `{userPrompt}` as input to the orchestrator and planner.

**Skip brainstorming if** the request is trivially simple and unambiguous (e.g. "fix the typo in PhotoGrid.tsx line 42"). In that case, set `{refinedRequest} = {userPrompt}` and proceed.

Write progress:
```bash
echo "[$(date +%H:%M:%S)] 💡 Brainstorm completed — user intent confirmed" >> {progressLog}
```

---

## Step 2: Read All Agent MD Files + Behavioral Guidelines

Read all agent MD files plus the shared behavioral guidelines using the `Read` tool. Store the full content of each.

| Variable | File path |
|----------|-----------|
| `{orchestratorMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-orchestrator.md` |
| `{plannerMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-planner.md` |
| `{generatorMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-generator.md` |
| `{evaluatorMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-evaluator.md` |
| `{evaluatorRuleMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-evaluator-rule.md` |
| `{evaluatorVisionMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-evaluator-vision.md` |
| `{reviewMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-review-agent.md` |
| `{behaviorGuidelines}` | `${CLAUDE_PLUGIN_ROOT}/docs/BEHAVIORAL-GUIDELINES.md` |

Read all 8 in parallel. Do not proceed until all reads are complete. `{behaviorGuidelines}` is the shared behavioral baseline inlined into every agent below.

---

## Step 3: Confirm the implicit team

There is **no setup step** to create a team. As of Claude Code 2.1.x the `TeamCreate`/`TeamDelete` tools were removed: with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` set, every session already has one implicit team. You spawn teammates directly with the `Agent` tool's `name` parameter (Step 4).

> If teammate spawning fails, the env flag is almost certainly missing — confirm `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is in `~/.claude/settings.json` and Claude Code was restarted after adding it.

---

## Step 4: Spawn the Agents

Spawn all 5 agents using the `Agent` tool. Use `subagent_type: general-purpose` for all.

> **Why general-purpose:** Custom `subagent_type` values like `agentOW:*` are not supported for team member spawning. Agent behavior comes entirely from the `prompt` parameter — each agent receives its full definition inlined.

### Agents 1–6 — idle members (spawn FIRST, before orchestrator)

Spawn all 6 idle agents FIRST so they are ready to receive messages when the orchestrator starts.

| `name` | MD variable |
|--------|-------------|
| `ow-planner` | `{plannerMd}` |
| `ow-generator` | `{generatorMd}` |
| `ow-evaluator` | `{evaluatorMd}` |
| `ow-evaluator-rule` | `{evaluatorRuleMd}` |
| `ow-evaluator-vision` | `{evaluatorVisionMd}` |
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

  ======= BEHAVIORAL BASELINE (applies to all your work) =======
  {behaviorGuidelines}
  ======= END BEHAVIORAL BASELINE =======

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

### Agent 7 — ow-orchestrator (active, spawn LAST)

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

  ======= BEHAVIORAL BASELINE (applies to all your work) =======
  {behaviorGuidelines}
  ======= END BEHAVIORAL BASELINE =======

  Session context (already initialized — skip Step 0):
    Team:         {teamName}
    sessionDir:   {sessionDir}
    reportFile:   {reportFile}
    progressLog:  {progressLog}
    planDir:      {planDir}
    User task:    {refinedRequest}
    autoMode:     {autoMode}

  NOTE: The user request above has been refined through a brainstorming
  session (interactive mode) or used directly (auto mode). Do NOT
  re-brainstorm. Proceed directly to Step 1 (invoke ow-planner).

  If autoMode is true:
  - SKIP plan approval (Step 1a). Auto-approve immediately and tell
    the planner "approved" via SendMessage.
  - SKIP review critical confirmation (Step 5b). Proceed to PR creation
    even if review found critical issues. The PR is draft, so a human
    can review before publishing.
  - Do NOT call AskUserQuestion at all in auto mode.

  Team members (already spawned and waiting for your instructions):
    - ow-planner
    - ow-generator
    - ow-evaluator
    - ow-evaluator-rule
    - ow-evaluator-vision
    - ow-review-agent

  CRITICAL: After sending SendMessage to a teammate, you MUST wait for
  their response message before doing anything else. The full pipeline
  (planner → approval → generator → evaluator → review → PR) must run
  as one continuous flow. Never go idle between steps.

  Start immediately with Step 1 (invoke ow-planner).
```

---

## Step 5: Start Monitoring and Serve as User-Relay

After all 7 agents are spawned, tell the user:

```
Team "{teamName}" is live.

  ow-orchestrator      — running (driving the pipeline)
  ow-planner           — idle (waiting for orchestrator)
  ow-generator         — idle (waiting for orchestrator)
  ow-evaluator         — idle (dry-run + code-inspection)
  ow-evaluator-rule    — idle (UI verification: rule half)
  ow-evaluator-vision  — idle (UI verification: cold-eye vision half)
  ow-review-agent      — idle (waiting for orchestrator)

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
- Read all agent MD files (Step 2) before spawning any agent.
- Spawn the orchestrator **first** so it is running before the idle agents join.
- If the user asks for a status update, use `SendMessage` to query `ow-orchestrator` by name — the orchestrator is the single source of truth.
- If the user asks to shut down, send `{"type": "shutdown_request"}` via `SendMessage` to `ow-orchestrator` first; it will relay the shutdown to its team members.
- Team members must NEVER message each other directly — all communication is brokered through `ow-orchestrator`.
- **Relay, don't decide.** When the orchestrator asks for user input via SendMessage, forward the raw content to the user; do not answer on their behalf.
- **Don't probe too early.** Agents going idle after a SendMessage is normal. Wait at least 5 minutes before checking whether an agent is actually stuck.
