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

If the request names a feature area with external context docs (for example a dotfiles knowledge-center entry), route and read those docs now. Feature-specific rules and execution guards live in those context docs, not in this skill. Pass every relevant path to all downstream agents.

Dispatch `@agentow-copilot:planner` with:

```yaml
request: <refined request>
repoRoot: /workspaces/odsp-web
sessionDir: /workspaces/odsp-web/.aero/<session>
reportFile: /workspaces/odsp-web/.aero/<session>/report.json
progressLog: /workspaces/odsp-web/.aero/<session>/progress.log
artifactPath: /workspaces/odsp-web/.aero/<session>/planning/planner-report.md
contextDocuments:
  - <every routed feature/domain context document>
```

Wait for its findings report (classification, root cause, files to change, patterns, tests, visual surface trace, context guards, and any required root/wrapper layout ownership audit). If `planning/planner-report.md` or the planner NDJSON line is missing, treat planner as failed.

If routed context requires an audit/table/measurement and the planner report does not contain it, treat planner as failed. "Read the context" is not compliance evidence.

Read the findings. If the planner reports it could not locate the root cause or surface, decide: ask the user for a pointer (interactive), or proceed with its best understanding and record the gap (auto).

## Step 3: Plan + approval

Using the planner's findings, write a short plan:
- Spec (2-3 sentences)
- Acceptance criteria (clear pass/fail)
- Tasks (exact files, what changes)
- Visual surface trace (from the planner, for the evaluator later)
- Context compliance checklist (each routed guard and its required artifact)
- Root/wrapper layout ownership table when any JSX root/wrapper is replaced
- Repeated-item geometry target (selector, axis, metric) when Cards/rows/tiles/items repeat

Save it locally to `/workspaces/odsp-web/.aero/<session>/plan.md` (a local working doc, not committed).

Append `[HH:MM:SS] 📋 Plan ready — <N> tasks` after writing the plan.

**Interactive:** show the plan to the user. Get approval or revise. Loop until approved.
**Auto:** proceed.

Append `[HH:MM:SS] ✅ Plan approved (auto|user)` before implementation starts.

## Step 4: Implement (you write the code)

Append `[HH:MM:SS] 🔨 Implementation started (cycle N)` before editing.

1. **Branch.** If on `main`, create `user/<alias>/<feature>` from `origin/main` (use `ow-git`). `<alias>` from `whoami`.
2. **Write the code** yourself, following the planner's "patterns to follow". Surgical changes only — every line traces to the request.
   - Complete every context compliance item before build.
   - For every removed/replaced root class/style, preserve or move consumer-owned external layout while leaving replacement-component internal chrome to the component defaults.
   - Do not proceed if any layout declaration in the planner's ownership table has no disposition.
3. **rush update** (via `ow-rush`) if you changed any `package.json`.
4. **Build:** `ow-build` on the affected project. If it fails:
   - Classify: rush infra error (`shrinkwrap-deps.json` missing, `inputsSnapshot not found`) → run `ow-rush install` once, retry. Auth/network error → stop and report. Code error → fix and rebuild (max 3 attempts).
   - If the MCP request times out but a `rush build -t <project>` process is still running, do **not** treat it as build failure. Log `⚠️ Build tool timeout — tracking underlying Rush process`, wait for the real Rush process to exit, then read `common/temp/markdown-summary/build-summary.md` and the raw log. Record this in `agent-metrics.md` as `tool-timeout / self-recovered-by-process-tracking`.
5. **Test:** `ow-test` scoped to the changed modules (not the full suite). If no tests exist for the modules, note it; don't run 600 unrelated tests.
6. **Dev server / debug link:** follow the feature context docs for the surface's verification contract. For UI-visible changes, prefer `ow-start` + `ow-debuglink` before PR validation builds finish; if the context docs require additional guards, execute those guards and record the result.
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
- context compliance evidence, including the completed root/wrapper layout ownership table and post-change disposition

Append a generator/implementation NDJSON line to `report.json`.

## Step 5: Verify (dispatch evaluator)

Append `[HH:MM:SS] 🔍 Evaluator started (cycle N)` before dispatching.

Dispatch `@agentow-copilot:evaluator` with the request, acceptance criteria, surface trace, changed files, cycle number, debug link, routed `contextDocuments`, `planPath`, `implementationArtifactPath`, `sessionDir`, `reportFile`, `progressLog`, and `artifactPath=/workspaces/odsp-web/.aero/<session>/evaluation/iter<N>/evaluator-report.md`. Wait for PASS/FAIL + blockers.

For UI-visible changes, visual validation is mandatory and the evaluator owns it:
- BEFORE and AFTER screenshot paths must be present in the evaluator result.
- Primary `beforePath` / `afterPath` must be full browser-page/viewport screenshots that include the surrounding page context, not Drawer/Dialog/component-only crops. Their dimensions must match the evaluator's recorded viewport.
- Optional close-up crops belong only in `beforeCropPath` / `afterCropPath`; they are supplemental evidence.
- When the plan/context marks a repeated or dense UI surface, close-up BEFORE/AFTER crops are mandatory supplemental evidence, not optional. They must contain at least two adjacent items at the same scale.
- For repeated Cards/rows/tiles/items, the evaluator must record BEFORE/AFTER `getBoundingClientRect()` data and computed adjacent gap. A non-zero BEFORE gap becoming zero/negative AFTER is a product FAIL unless explicitly required.
- If screenshots are missing, visual validation failed, or the evaluator says Playwright/browser tools were unavailable, treat the evaluator result as **FAIL** even if code inspection passed.
- Before accepting PASS, independently `view` both primary images and run `file -- "<beforePath>" "<afterPath>"`; do not trust filenames, `captureMethod`, `dimensionEvidence`, or the evaluator's dimension claim without this cross-check.
- If either primary image lacks surrounding page context or its actual PNG dimensions do not match the recorded viewport, classify it as `evaluator-spec` and re-dispatch the evaluator once in the same implementation cycle.
- If repeated-item crops or geometry evidence are required but missing/malformed, classify it as `evaluator-spec` and re-dispatch the evaluator once in the same implementation cycle.
- Before accepting repeated-item PASS, independently `view` both crops and inspect the numeric geometry evidence; do not accept "looks right".
- Screenshots created manually by the main session do **not** satisfy evaluator validation. If the main session writes a temporary spec to unblock an investigation, move that logic into the evaluator retry prompt and re-dispatch the evaluator.
- Surface the exact failure reason to the user and record it in `progress.log`, `report.json`, and `final.md` if the run stops.
- Do not claim the UI was verified without screenshot evidence.

Before accepting any evaluator claim about auth, FIC, tenant suitability, test-page availability, or a fixture gap, inspect its `coverageManifest`. A single URL, credential, tenant, or site failure is resource-local evidence only.

- Missing manifest or `coverageManifest.status="incomplete"` → append `[HH:MM:SS] 🔎 Environment discovery retry — evaluator evidence incomplete`, then re-dispatch the evaluator in `environment_discovery` mode in the **same implementation cycle**. Do not edit code, rebuild, retest, increment the generator cycle, or proceed to PR shipment.
- A self-declared complete manifest is still malformed unless predicates are cited, every supported pool has a result, tenants are deduplicated, discovery paths are complete or explicitly blocked with evidence, and every unique discovered candidate has exactly one disposition. For a gap, require `candidatesDiscovered == candidatesProbed == candidateResults.length`, all candidate results rejected with evidence, no `unprobed` entries, and a non-empty `exhaustionReason` proving no discovery path remains. Downgrade any malformed manifest to `environment-discovery-incomplete`, retarget its blocker to `evaluator-environment`, and redispatch it through the same-cycle environment gate.
- Complete manifest with an eligible candidate → require the evaluator to capture screenshots on that candidate.
- Complete manifest with no eligible candidate → classify as an external `fixture-gap`; do not route it to the implementer as a code defect.

## Step 6: Fix loop

**Environment-discovery incomplete (any cycle):** re-dispatch only `@agentow-copilot:evaluator` in the same implementation cycle with the missing coverage requirements. If the retry is still incomplete, stop rather than auto-shipping an unsupported environment claim.

**Evaluator-spec FAIL (any cycle):** re-dispatch only `@agentow-copilot:evaluator` once in the same implementation cycle with the spec blocker. Do not edit code, rebuild, retest, or consume a product fix cycle. If the retry still violates the evaluator contract, stop and report the blocker rather than looping or auto-shipping.

**Complete external fixture gap:** do not change product code. In interactive mode, show the coverage summary and ask whether to ship a draft with the blocker. In auto/batch mode, the run may continue only as `success-with-blockers`, preserving the complete manifest in `report.json` and `final.md`.

**Product/code FAIL and cycle < 5:** YOU fix the blockers (you still have full context — no re-investigation needed). Re-build, re-test, re-dispatch `@agentow-copilot:evaluator`. Increment cycle.

Before starting each fix cycle, append `[HH:MM:SS] 🔁 Fix cycle N+1 — <reason>`.

**Product/code FAIL and cycle ≥ 5:**
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
contextDocuments:
  - <every routed feature/domain context document>
planPath: /workspaces/odsp-web/.aero/<session>/plan.md
implementationArtifactPath: /workspaces/odsp-web/.aero/<session>/implementation/iter<N>.md
evaluatorArtifactPath: /workspaces/odsp-web/.aero/<session>/evaluation/iter<N>/evaluator-report.md
```

Read the verdict. If `review.md` or the reviewer NDJSON line is missing, treat reviewer as failed.

**REQUEST_CHANGES with Critical issues:**
- Within the cycle limit, treat critical review findings like evaluator blockers — go back to Step 6 and fix them (they catch things UI verification misses: killswitch direction, type weakening, security).
- Interactive at the cycle limit: ask the user whether to ship anyway.
- Auto at the cycle limit: ship (draft PR).

**APPROVE / COMMENT / Important-or-Minor only:** continue.

## Step 8: Ship

1. **Push** the branch and **create the draft PR:** `ow-pr-create` with title (from the plan spec) and description (Summary + Changes — no auto-generated "Testing" section).
2. **Visual validation for UI changes:** prefer evaluator screenshots from the local `rush start` debug link because it is available immediately after implementation. If local debug validation captures BEFORE/AFTER successfully, attach those screenshots to the PR description. Only fall back to `ow-pr-debug-query` / `finalValidationMode=pr-cdn-fic` when local debug validation fails for environment/tooling reasons (for example localhost cert/assembly-load failure, missing browser MCP, or a surface that only reproduces against PR CDN).
3. **Attach screenshots** for UI changes. Attach only evaluator-produced screenshot paths. The primary BEFORE/AFTER table in the PR description MUST embed the full-page/viewport `beforePath` and `afterPath`. Component crops may be attached as clearly labeled supplemental detail links, but must never replace the primary images. Include `visualValidation.source` in the PR description (`local-rush-start` or `pr-cdn-fic`) so reviewers know which path produced the images. If the evaluator did not capture valid full-page/viewport BEFORE/AFTER screenshots, do not present the run as visually verified; include the visual-validation failure reason in the PR description only if the user explicitly chooses to ship a draft anyway.
   - If visual validation fails because a surface needs seeded data or a tenant capability, write `fixtureGap: true`, the missing fixture, and the complete `coverageManifest` in `final.md` / `report.json`. Batch mode reads this as `success-with-blockers`, not plain success. An incomplete manifest blocks shipment.
4. **Report** the PR URL to the user.

Write `/workspaces/odsp-web/.aero/<session>/final.md` with final build/test/evaluation/review status, PR URL if any, screenshot paths if captured, and any remaining blockers.

Append `[HH:MM:SS] ✅ Workflow complete` after `final.md` is written.

## Notes

- One feature/bug per run. For multiple, use `ow-batch`; it runs this pipeline serially in the main session and checkpoints between tasks.
- Specs/plans stay local (`.aero/`), never committed, never referenced from code.
- If the user says "skip the review" / "don't make a PR" / "just code it" — follow them. The user is in control.
