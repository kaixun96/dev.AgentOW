---
name: agentow
description: "Take an odsp-web feature or bug description to a draft PR on Azure DevOps. Use when the user wants to implement a feature, fix a bug, or make a change in the odsp-web monorepo. Drives the full pipeline: research → plan → implement → verify → fix loop → review → PR. Triggers on: implement, fix, add, change, build a feature in odsp-web / sp-pages / sp-client; or when the user says agentow."
---

# agentOW pipeline (Copilot CLI)

You (the main session) drive this end to end. You are the orchestrator AND the implementer — you keep full context across every step and every fix cycle. You dispatch stateless subagents (`planner`, `evaluator`, `reviewer`) only for bounded "look and report" work.

## Mode

If the prompt contains `--auto` (or the user says "no questions" / "just do it"), this is **AUTO mode**: skip every user gate. Otherwise **INTERACTIVE mode**.

Announce the mode in one line before starting, so the user knows what to expect.

## Step 0: Orient

Call `ow-status` (MCP) to confirm the git branch, node, and rush state. Note whether you're on `main` (you'll branch later) or already on a feature branch.

Create a durable session folder:

```text
/workspaces/odsp-web/.aero/<session>/
├── planning/
├── implementation/
├── evaluation/
├── progress.log
└── report.json
```

Append timestamped progress lines before each major state transition. `progress.log` is the user's real-time view when Copilot CLI does not show agent state. Treat it as a first-class UX surface: concise, emoji-prefixed, and complete enough that the user can understand the run by tailing the file. Append NDJSON records to `report.json` for planner, each implementation cycle, evaluator, reviewer, and final result.

Use the shared progress event contract from `AGENTS.md`. At minimum, write:

```text
[HH:MM:SS] 🚀 Session started: <session>
[HH:MM:SS] 💬 USER PROMPT: <prompt>
[HH:MM:SS] 🤖 Mode: AUTO|INTERACTIVE
[HH:MM:SS] 📋 Planner started
[HH:MM:SS] ✅ Planner completed — <summary>
[HH:MM:SS] 📋 Plan ready — <N> tasks
[HH:MM:SS] ✅ Plan approved (auto|user)
[HH:MM:SS] 🔨 Implementation started (cycle N)
[HH:MM:SS] ✅ Build passed / ❌ Build failed — <reason>
[HH:MM:SS] 🧪 Tests passed|skipped|failed — <scope>
[HH:MM:SS] 🖥️ Dev server ready — agentow:rush
[HH:MM:SS] 🔍 Evaluator started (cycle N)
[HH:MM:SS] 📸 BEFORE captured — <path>
[HH:MM:SS] 📸 AFTER captured — <path>
[HH:MM:SS] ✅ Evaluation PASS / ❌ Evaluation FAIL — <reason>
[HH:MM:SS] 📝 Reviewer started
[HH:MM:SS] ✅ Review APPROVE / ⚠️ Review REQUEST_CHANGES — <summary>
[HH:MM:SS] 🚀 Creating PR...
[HH:MM:SS] ✅ PR created — <url>
[HH:MM:SS] ✅ Workflow complete
```

## Step 1: Understand the request

**Interactive:** if the request is ambiguous or complex, ask the user 1-3 clarifying questions, one at a time, multiple-choice when possible. Stop when you can state clearly what to build and how to verify it. Skip this for trivial unambiguous requests.

**Auto:** skip. Record any assumptions you make in the plan (Step 3) so the user can audit them later.

Compose a refined one-paragraph statement of what to build.

Append the refined request to `progress.log` before dispatching the planner.

## Step 2: Research (dispatch planner)

Before dispatching, append `[HH:MM:SS] 📋 Planner started`.

Dispatch `@agentow-copilot:planner` with:

```yaml
request: <refined request>
repoRoot: /workspaces/odsp-web
sessionDir: /workspaces/odsp-web/.aero/<session>
reportFile: /workspaces/odsp-web/.aero/<session>/report.json
progressLog: /workspaces/odsp-web/.aero/<session>/progress.log
artifactPath: /workspaces/odsp-web/.aero/<session>/planning/planner-report.md
```

Wait for its findings report (classification, root cause, files to change, patterns, tests, visual surface trace). If `planning/planner-report.md` or the planner NDJSON line is missing, treat planner as failed.

Read the findings. If the planner reports it could not locate the root cause or surface, decide: ask the user for a pointer (interactive), or proceed with its best understanding and record the gap (auto).

## Step 3: Plan + approval

Using the planner's findings, write a short plan:
- Spec (2-3 sentences)
- Acceptance criteria (clear pass/fail)
- Tasks (exact files, what changes)
- Visual surface trace (from the planner, for the evaluator later)

Save it locally to `/workspaces/odsp-web/.aero/<session>/plan.md` (a local working doc, not committed).

Append `[HH:MM:SS] 📋 Plan ready — <N> tasks` after writing the plan.

**Interactive:** show the plan to the user. Get approval or revise. Loop until approved.
**Auto:** proceed.

Append `[HH:MM:SS] ✅ Plan approved (auto|user)` before implementation starts.

## Step 4: Implement (you write the code)

Append `[HH:MM:SS] 🔨 Implementation started (cycle N)` before editing.

1. **Branch.** If on `main`, create `user/<alias>/<feature>` from `origin/main` (use `ow-git`). `<alias>` from `whoami`.
2. **Write the code** yourself, following the planner's "patterns to follow". Surgical changes only — every line traces to the request.
3. **rush update** (via `ow-rush`) if you changed any `package.json`.
4. **Build:** `ow-build` on the affected project. If it fails:
   - Classify: rush infra error (`shrinkwrap-deps.json` missing, `inputsSnapshot not found`) → run `ow-rush install` once, retry. Auth/network error → stop and report. Code error → fix and rebuild (max 3 attempts).
5. **Test:** `ow-test` scoped to the changed modules (not the full suite). If no tests exist for the modules, note it; don't run 600 unrelated tests.
6. **Dev server:** `ow-start` on the project; poll `ow-session-capture` on `agentow:rush` until `[WATCHING]`. Extract the debug link with `ow-debuglink`.
7. **Commit** (don't push yet).

Write progress events for branch/build/test/dev-server/debug-link/commit using the exact event contract. If any step fails, log the failure before attempting recovery.

Write `/workspaces/odsp-web/.aero/<session>/implementation/iter<N>.md` after each implementation/fix cycle with:
- summary
- files changed
- build result and evidence
- test result and evidence
- dev server/debug link
- commit SHA
- remaining blockers, if any

Append a generator/implementation NDJSON line to `report.json`.

## Step 5: Verify (dispatch evaluator)

Append `[HH:MM:SS] 🔍 Evaluator started (cycle N)` before dispatching.

Dispatch `@agentow-copilot:evaluator` with the request, acceptance criteria, surface trace, changed files, cycle number, debug link, `sessionDir`, `reportFile`, `progressLog`, and `artifactPath=/workspaces/odsp-web/.aero/<session>/evaluation/iter<N>/evaluator-report.md`. Wait for PASS/FAIL + blockers.

For UI-visible changes, visual validation is mandatory:
- BEFORE and AFTER screenshot paths must be present in the evaluator result.
- If screenshots are missing, visual validation failed, or the evaluator says Playwright/browser tools were unavailable, treat the evaluator result as **FAIL** even if code inspection passed.
- Surface the exact failure reason to the user and record it in `progress.log`, `report.json`, and `final.md` if the run stops.
- Do not claim the UI was verified without screenshot evidence.

## Step 6: Fix loop

**FAIL and cycle < 5:** YOU fix the blockers (you still have full context — no re-investigation needed). Re-build, re-test, re-dispatch `@agentow-copilot:evaluator`. Increment cycle.

Before starting each fix cycle, append `[HH:MM:SS] 🔁 Fix cycle N+1 — <reason>`.

**FAIL and cycle ≥ 5:**
- Interactive: show the remaining blockers, ask the user how to proceed.
- Auto: proceed to ship anyway (the PR is draft; a human reviews).

**PASS:** continue to Step 7.

## Step 7: Review (dispatch reviewer)

Append `[HH:MM:SS] 📝 Reviewer started` before dispatching.

Dispatch `@agentow-copilot:reviewer` with:

```yaml
branch: <branch>
changedFiles: <changed files>
sessionDir: /workspaces/odsp-web/.aero/<session>
reportFile: /workspaces/odsp-web/.aero/<session>/report.json
progressLog: /workspaces/odsp-web/.aero/<session>/progress.log
artifactPath: /workspaces/odsp-web/.aero/<session>/review.md
```

Read the verdict. If `review.md` or the reviewer NDJSON line is missing, treat reviewer as failed.

**REQUEST_CHANGES with Critical issues:**
- Within the cycle limit, treat critical review findings like evaluator blockers — go back to Step 6 and fix them (they catch things UI verification misses: killswitch direction, type weakening, security).
- Interactive at the cycle limit: ask the user whether to ship anyway.
- Auto at the cycle limit: ship (draft PR).

**APPROVE / COMMENT / Important-or-Minor only:** continue.

## Step 8: Ship

1. **Push** the branch and **create the draft PR:** `ow-pr-create` with title (from the plan spec) and description (Summary + Changes — no auto-generated "Testing" section).
2. **Attach screenshots** for UI changes. If the evaluator did not capture BEFORE/AFTER screenshots, do not present the run as visually verified; include the visual-validation failure reason in the PR description only if the user explicitly chooses to ship a draft anyway.
3. **Report** the PR URL to the user.

Write `/workspaces/odsp-web/.aero/<session>/final.md` with final build/test/evaluation/review status, PR URL if any, screenshot paths if captured, and any remaining blockers.

Append `[HH:MM:SS] ✅ Workflow complete` after `final.md` is written.

## Notes

- One feature/bug per run. For multiple, run the pipeline once per task (or loop `copilot -p "/agentow <task>"` headless for a batch — each gets a clean session).
- Specs/plans stay local (`.aero/`), never committed, never referenced from code.
- If the user says "skip the review" / "don't make a PR" / "just code it" — follow them. The user is in control.
