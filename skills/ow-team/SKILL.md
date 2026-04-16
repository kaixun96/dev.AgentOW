---
name: ow-team
description: "Use when the user asks to run the full odsp-web agent workflow, kick off the agent team, run end-to-end development, orchestrate the full cycle, or wants autonomous feature implementation. Runs a synchronous pipeline: planner → user approval → generator → evaluator → review → PR."
---

# odsp-web Agent Pipeline

Run the full development pipeline synchronously. **You are a dispatcher** — set up the session, fill in variables, fire each agent, show results to user. Do NOT read intermediate files, interpret agent output, or compose custom prompts. Just plug variables into the templates below and execute.

## Pipeline

```
Setup → Planner → User Approval → Generator → Evaluator → [loop if FAIL] → Review → PR
```

All agents run **foreground** (synchronous). Data flows via files — each agent reads what the previous one wrote. You only pass file paths.

---

## Step 1: Setup

Derive a kebab-case `sessionName` from the user's request (under 30 chars). Run:

```bash
mkdir -p /workspaces/odsp-web/.aero/{sessionName}/plans
touch /workspaces/odsp-web/.aero/{sessionName}/report.json
```

Set these variables once — they're reused in every prompt below:

| Variable | Value |
|----------|-------|
| `{sessionDir}` | `/workspaces/odsp-web/.aero/{sessionName}/` |
| `{reportFile}` | `{sessionDir}/report.json` |
| `{planDir}` | `{sessionDir}/plans/` |
| `{planPath}` | `{planDir}/plan.md` |
| `{userPrompt}` | The user's exact request |
| `{featureName}` | Short kebab-case feature name |

Tell the user: `Session: {sessionDir} — starting pipeline.`

---

## Step 2: Planner

Fire and forget — the agent reads the codebase, writes `{planPath}`, returns the plan content.

```
Agent({
  subagent_type: "agentOW:ow-planner",
  description: "Plan: {featureName}",
  prompt: "
    featureName: {featureName}
    userRequest: {userPrompt}
    reportFile: {reportFile}
    planDir: {planDir}
    Return the full plan content when done. Do NOT use SendMessage.
  "
})
```

Show the returned plan to the user. Ask: **approve or revise?**
- Revise → re-invoke planner with feedback appended to `userRequest`.
- Approve → proceed.

---

## Step 3: Generator

```
Agent({
  subagent_type: "agentOW:ow-generator",
  description: "Build: {featureName}",
  mode: "bypassPermissions",
  prompt: "
    planPath: {planPath}
    reportFile: {reportFile}
    cycle: {N}
    blockers: {blockers or []}
    Return: tasks completed, build status, test status. Do NOT use SendMessage.
  "
})
```

Show the summary to the user. If status is `failure` → ask user to retry or stop.

---

## Step 4: Evaluator

```
Agent({
  subagent_type: "agentOW:ow-evaluator",
  description: "Verify: {featureName}",
  mode: "bypassPermissions",
  prompt: "
    planPath: {planPath}
    reportFile: {reportFile}
    cycle: {N}
    Return: PASS/FAIL, criteria results, blockers. Do NOT use SendMessage.
  "
})
```

**If FAIL and cycle < 5:** show blockers to user, go back to Step 3 with `cycle = N+1` and `blockers` from evaluator.
**If FAIL and cycle >= 5:** show blockers, ask user for guidance.
**If PASS:** proceed.

---

## Step 5: Review

```
Agent({
  subagent_type: "agentOW:ow-review-agent",
  description: "Review: {featureName}",
  prompt: "
    reportFile: {reportFile}
    branch: <current git branch>
    Return: verdict, findings, checklist. Do NOT use SendMessage.
  "
})
```

If critical issues → show to user, ask whether to proceed.

---

## Step 6: Create PR

Use `ow-pr-create` with info from `{reportFile}` (the review agent and generator both wrote there).

Report the PR URL to the user.

---

## Rules

- **You are a dispatcher, not an interpreter.** Copy-paste the prompt templates above, fill in variables, fire. Do NOT read `{reportFile}` yourself, do NOT rewrite agent prompts, do NOT add context from previous steps.
- **All agents foreground.** Never use `run_in_background: true`.
- **Data flows via files.** `{planPath}` and `{reportFile}` are the shared state. Each agent reads what it needs from these files.
- **No TeamCreate, no SendMessage, no orchestrator agent.**
- **`subagent_type` loads the agent definition.** Do NOT inline agent MD content in prompts — the subagent_type already provides it.
- User approval between planner and generator — never skip.
- Max 5 generator-evaluator cycles.
