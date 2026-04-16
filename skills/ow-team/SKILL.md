---
name: ow-team
description: "Use when the user asks to run the full odsp-web agent workflow, kick off the agent team, run end-to-end development, orchestrate the full cycle, or wants autonomous feature implementation. Runs a synchronous pipeline: planner → user approval → generator → evaluator → review → PR."
---

# odsp-web Agent Pipeline

Run the full development pipeline synchronously. **You (the main agent) ARE the orchestrator.** No Team, no orchestrator agent — you directly spawn each agent as a foreground sub-agent and chain the results.

## Pipeline

```
Planner (sync) → User Approval → Generator (sync) → Evaluator (sync) → Review (sync) → PR
```

Each agent is spawned via the `Agent` tool in **foreground mode** (not background). It runs to completion and returns its results directly. You then use those results to invoke the next step.

---

## Step 1: Setup Session

Record the user's exact request as `userPrompt`. Derive a kebab-case session name (under 30 chars).

```bash
mkdir -p /workspaces/odsp-web/.aero/<session-name>/plans
touch /workspaces/odsp-web/.aero/<session-name>/report.json
```

Record: `sessionDir`, `reportFile`, `planDir`.

Tell the user: `Session initialized at {sessionDir}. Starting planner...`

---

## Step 2: Read Agent Definitions

Read **4** agent MD files (no orchestrator needed):

| Variable | File path |
|----------|-----------|
| `{plannerMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-planner.md` |
| `{generatorMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-generator.md` |
| `{evaluatorMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-evaluator.md` |
| `{reviewMd}` | `${CLAUDE_PLUGIN_ROOT}/agents/ow-review-agent.md` |

Read all 4 in parallel. Do not proceed until all reads are complete.

---

## Step 3: Invoke Planner (foreground)

Spawn a **foreground** Agent (NOT background):

```
Agent({
  name: "ow-planner",
  subagent_type: "agentOW:ow-planner",
  description: "Plan: <short task description>",
  prompt: "
    You are ow-planner. Follow this agent definition exactly:

    ======= AGENT DEFINITION START =======
    {plannerMd}
    ======= AGENT DEFINITION END =======

    featureName: <feature-name>
    userRequest: <userPrompt>
    reportFile: {reportFile}
    planDir: {planDir}

    When done, return the full plan content in your response.
    Do NOT use SendMessage — just return your results directly.
  "
})
```

The planner runs synchronously and returns the plan in the tool result.

---

## Step 4: User Approval

Present the plan to the user. Ask: "Do you approve this plan? (approve / revise)"

- **Approved** → proceed to Step 5.
- **Revise** → re-invoke the planner with feedback, then re-present. Loop until approved.

---

## Step 5: Invoke Generator (foreground)

```
Agent({
  name: "ow-generator",
  subagent_type: "agentOW:ow-generator",
  description: "Implement: <short task description>",
  mode: "bypassPermissions",
  prompt: "
    You are ow-generator. Follow this agent definition exactly:

    ======= AGENT DEFINITION START =======
    {generatorMd}
    ======= AGENT DEFINITION END =======

    planPath: {planDir}/plan.md
    reportFile: {reportFile}
    cycle: 1
    blockers: []

    When done, return a summary: tasks completed, build status, test status, debug URL.
    Do NOT use SendMessage — just return your results directly.
  "
})
```

Parse the generator's result. If failure → ask user whether to retry or stop.

---

## Step 6: Invoke Evaluator (foreground)

```
Agent({
  name: "ow-evaluator",
  subagent_type: "agentOW:ow-evaluator",
  description: "Evaluate: <short task description>",
  mode: "bypassPermissions",
  prompt: "
    You are ow-evaluator. Follow this agent definition exactly:

    ======= AGENT DEFINITION START =======
    {evaluatorMd}
    ======= AGENT DEFINITION END =======

    planPath: {planDir}/plan.md
    reportFile: {reportFile}
    cycle: 1

    When done, return: overall PASS/FAIL, criteria results, and any blockers.
    Do NOT use SendMessage — just return your results directly.
  "
})
```

### Loop on Failure

If evaluator returns FAIL and cycle < 5:
1. Show blockers to user.
2. Re-invoke generator (Step 5) with `cycle = N+1` and `blockers` from evaluator.
3. Re-invoke evaluator (Step 6).
4. Repeat until PASS or cycle >= 5.

If cycle >= 5: show remaining blockers, ask user for guidance.

---

## Step 7: Invoke Review Agent (foreground)

```
Agent({
  name: "ow-review-agent",
  subagent_type: "agentOW:ow-review-agent",
  description: "Review: <short task description>",
  prompt: "
    You are ow-review-agent. Follow this agent definition exactly:

    ======= AGENT DEFINITION START =======
    {reviewMd}
    ======= AGENT DEFINITION END =======

    reportFile: {reportFile}
    branch: <current branch>

    When done, return: verdict (APPROVE/REQUEST_CHANGES), findings, checklist.
    Do NOT use SendMessage — just return your results directly.
  "
})
```

If critical issues found → show to user, ask whether to proceed.

---

## Step 8: Create PR

Use `ow-pr-create` to push and create a draft PR:

```
title: <from plan spec>
description: |
  ## Summary
  <from plan>

  ## Changes
  <from generator>

  ## Testing
  - Build: {buildStatus}
  - Tests: {testStatus}
  - Evaluation: {evalResult}
  - Review: {reviewVerdict}
```

Report the PR URL to the user.

---

## Rules

- **You ARE the orchestrator.** Drive the pipeline yourself — do not spawn a separate orchestrator agent.
- **All agents run in foreground (synchronous).** Do NOT use `run_in_background: true` for pipeline agents.
- **Agents return results directly.** Tell agents "Do NOT use SendMessage — just return your results directly."
- **No TeamCreate.** No team infrastructure needed — this is a sequential pipeline.
- Each agent's full MD definition must be inlined in the prompt (survives context compaction).
- User approval happens between planner and generator — never skip it.
- Maximum 5 generator-evaluator cycles before escalating to user.
- If any agent fails, present the error and ask user how to proceed.
