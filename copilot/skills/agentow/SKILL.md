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

**Check the working tree is clean here, in Step 0 — not later, when a checkout fails.** A previous run's abandoned edits (a half-tuned capture spec, a hand-patched `pnpm-lock.yaml`, a modified playwright config) survive in the tree and block the branch switch this run needs. Batch policy forbids auto-stashing them, so the run dies at the starting line having done nothing — observed, 76 seconds in, after the environment had already been prepared. Report the dirty paths in your first message, name them individually, and say plainly that the user must stash or commit them before this run can proceed. Do not discard them and do not stash them yourself; they may be the only copy of a previous run's work.

Create a durable session folder:

```text
/workspaces/odsp-web/.aero/<session>/
├── planning/
├── implementation/
├── evaluation/
├── context/
├── capabilities.json
├── progress.log
└── report.json
```

Append timestamped progress lines before each major state transition. `progress.log` is the user's real-time view when Copilot CLI does not show agent state. Treat it as a first-class UX surface: concise, emoji-prefixed, and complete enough that the user can understand the run by tailing the file. Append NDJSON records to `report.json` for planner, each implementation cycle, evaluator, reviewer, and final result.

Use the shared progress event contract from `AGENTS.md`. At minimum, write:

```text
[HH:MM:SS] 🚀 Session started: <session>
[HH:MM:SS] 💬 USER PROMPT: <prompt>
[HH:MM:SS] 🤖 Mode: AUTO|INTERACTIVE
[HH:MM:SS] 🩺 Bootstrap started
[HH:MM:SS] ✅ Bootstrap ready / ⚠️ Bootstrap restart required / ❌ Bootstrap blocked
[HH:MM:SS] 🧭 Planner mode: FAST|FULL — <reason>
[HH:MM:SS] 📋 Planner started (fast|full)
[HH:MM:SS] ✅ Planner completed (fast|full) — <summary>
[HH:MM:SS] 📋 Plan ready — <N> tasks
[HH:MM:SS] ✅ Plan approved (auto|user)
[HH:MM:SS] 🧠 Context linked — <library id|unlinked>
[HH:MM:SS] 🧠 Context plan update — <result>
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
[HH:MM:SS] 🧠 Context as-built update — <result>
[HH:MM:SS] 🚀 Creating PR...
[HH:MM:SS] ✅ PR created — <url>
[HH:MM:SS] ✅ Workflow complete
```

## Step 1: Understand the request

**Interactive:** if the request is ambiguous or complex, ask the user 1-3 clarifying questions, one at a time, multiple-choice when possible. Stop when you can state clearly what to build and how to verify it. Skip this for trivial unambiguous requests.

**Auto:** skip. Record any assumptions you make in the plan (Step 3) so the user can audit them later.

Compose a refined one-paragraph statement of what to build.

Append the refined request to `progress.log` before dispatching the planner.

## Step 1.25: Bootstrap session capabilities

This step runs before context routing or planning. Read `${CLAUDE_PLUGIN_ROOT}/docs/capability-bootstrap.md`.

1. Write the exact request to `<sessionDir>/request.txt` with a quoted heredoc.
2. Append `[HH:MM:SS] 🩺 Bootstrap started`.
3. Run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/tools/agentow-bootstrap.mjs" \
     --host copilot \
     --session-dir "<sessionDir>" \
     --request-file "<sessionDir>/request.txt"
   ```

4. Read `<sessionDir>/capabilities.json`.
5. Merge current tool-catalog evidence into the artifact only for task-triggered tools such as Figma. FIC Playwright/Heft availability comes from the repo probe, not MCP tool presence. Never store tool arguments, tokens, cookies, identities, or credential contents.
6. If `overall` is `restart-required`, append `⚠️ Bootstrap restart required`, tell the user which plugins/settings were installed and to restart Copilot CLI or the terminal, then stop before planning. The next session re-probes.
7. If `overall` is `blocked`, report the fixed prerequisite and stop. If `setup-required`, stop only when the missing capability is required for this request and has no fallback.
8. Otherwise append `✅ Bootstrap ready` and continue.

The bootstrap marker is per terminal/CLI process, so later agentOW runs in the same session do not repeat baseline installs. A later Figma/ADO/UI task may still install a newly required task-specific capability.

## Step 1.5: Resolve the context library

Read `${CLAUDE_PLUGIN_ROOT}/docs/context-maintenance.md`. Create `<sessionDir>/context/{candidates,apply}` plus empty `evidence.ndjson`.

Resolve the linked context library using the documented discovery order. Write an immutable `<sessionDir>/context/link.json` even when the result is `status: "unlinked"`. Snapshot library identity, source/context revisions, manifest digest, and writability. Write request-based routes and document digests to immutable `context/routing.v1.json`, then read every routed document before selecting planner mode. Initial guards, audits, inventories, tables, and measurements participate in FAST eligibility; they are not deferred until after source routing. Append `[HH:MM:SS] 🧠 Context linked — <library id|unlinked>`.

After source paths are known, route them through the same manifest. FAST must do this before finalizing its report. FULL must route the initial report's paths and run the context-completion loop in Step 2 when new documents appear. Write each next immutable routing revision (normally starting at `context/routing.v2.json`) rather than modifying an earlier revision, read every newly routed document, and pass the latest revision downstream. Feature-specific terms, globs, guards, and update targets come only from the library manifest. Existing ad-hoc `contextDocuments` remain a compatible read-only link.

agentOW is the routing and execution layer; feature-specific rules and execution guards live in those context docs, not in this skill.

## Step 2: Select planner mode + research

Automatically select `FAST` or `FULL`; the user does not need to choose.

### Planner mode decision

Write `<sessionDir>/planning/planner-mode.json` before research:

```json
{
  "mode": "fast|full",
  "reason": "<concise evidence-based reason>",
  "checks": {
    "bugWithExplicitRootCause": true,
    "codeAnchorProvided": true,
    "acceptanceCriteriaClear": true,
    "estimatedFilesAtMostTwo": true,
    "singleBehaviorChange": true,
    "crossPackageOrApiChange": false,
    "architectureOrDataMigration": false,
    "mandatoryContextAudit": false,
    "uiOwnershipUnclear": false
  }
}
```

Append `[HH:MM:SS] 🧭 Planner mode: FAST|FULL — <reason>` to `progress.log` and one NDJSON record to `report.json`:

```json
{"sender":"planner-mode","timestamp":"<ISO>","status":"success","mode":"fast|full","artifactPath":"<sessionDir>/planning/planner-mode.json","reason":"<reason>"}
```

Select `FAST` only when every statement below is proven by the request plus a quick read of the named source:

- It is a bug with an explicit symptom, root cause, code anchor, intended fix, and pass/fail verification.
- The named code exists and the source directly supports the claimed root cause.
- The change is one behavior in at most two product files.
- It does not cross package/API boundaries, alter architecture, require a data migration, or introduce a dependency.
- Routed context does not require a planner-produced audit, inventory, table, or measurement.
- It does not replace a UI root/wrapper, affect repeated-item geometry, or leave surface ownership/open-condition unclear.

Missing evidence is `FULL`, not an assumption. Feature work, broad refactors, exploratory bugs, and requests that only say the root cause is "known" are `FULL`.

### FAST planner

Do not dispatch the planner agent. Append `[HH:MM:SS] 📋 Planner started (fast)`, then perform a bounded source verification in the main session:

1. Read the named code anchor and its direct caller or consumer.
2. Confirm the root cause and intended edit from source.
3. Locate existing tests for the affected module.
4. For visible UI, establish the selector, discriminator, open-condition, and starting route. If any is unclear, escalate to `FULL`.
5. Route the verified source paths through the context manifest, write the next immutable routing revision, and read every newly routed document.
6. Re-evaluate file count, ownership, and context guards. Any scope expansion, contradictory evidence, or required audit/table/measurement escalates to `FULL`.

Only after source-path routing passes, write `planning/planner-report.md` using the planner agent's normal output headings, including citations and an exhaustive `Source paths consulted` section. Mark it `Planner mode: FAST` and record only verified findings. Append the normal planner NDJSON line with `"mode":"fast","pass":1,"sourcePaths":[...]` and append `[HH:MM:SS] ✅ Planner completed (fast) — <classification>, <N> files, visual <pattern>`.

### FULL planner

Append `[HH:MM:SS] 📋 Planner started (full)`.

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
contextLinkPath: /workspaces/odsp-web/.aero/<session>/context/link.json
capabilitiesPath: /workspaces/odsp-web/.aero/<session>/capabilities.json
plannerMode: full
plannerPass: 1
```

Wait for its findings report (classification, root cause, files to change, patterns, tests, visual surface trace, context guards, and any required root/wrapper layout ownership audit). If `planning/planner-report.md` or the planner NDJSON line is missing, treat planner as failed.

The planner NDJSON line must include `"mode":"full"`. The planner agent owns the completion progress line; verify it exists, but do not append a duplicate.

Route the planner NDJSON record's exhaustive `sourcePaths` through the context manifest; do not infer routing inputs from `keyFiles` or prose citations. If this adds context documents the planner did not receive, dispatch the FULL planner again with the latest routing revision and all newly routed documents, marking the request as a `context-completion pass` and incrementing `plannerPass`. Treat the revised `planning/planner-report.md` as canonical. Repeat route → context-completion only until routing is stable, with a maximum of three planner passes total. If a third pass still discovers new routed documents, fail planning with `context-routing-unstable`; never hand an incompletely routed report to implementation.

If routed context requires an audit/table/measurement and the planner report does not contain it, treat planner as failed. "Read the context" is not compliance evidence.

Read the findings. If the planner reports it could not locate the root cause or surface, decide: ask the user for a pointer (interactive), or proceed with its best understanding and record the gap (auto).

### FAST → FULL escalation

If FAST source verification finds contradictory evidence, more than two product files, unclear UI reachability/ownership, a mandatory context audit, or any cross-package/API/architecture/data/dependency impact:

1. Rewrite `planning/planner-mode.json` with `"mode":"full"` and an `escalatedFrom:"fast"` field.
2. Append a second `planner-mode` NDJSON record and `[HH:MM:SS] 🧭 Planner mode: FULL — escalated from FAST: <reason>`.
3. Dispatch the full planner. Do not preserve unsupported FAST assumptions in the plan.

## Step 3: Plan + approval

Using the planner report (FAST or FULL), write a short plan:
- Spec (2-3 sentences)
- Acceptance criteria (clear pass/fail)
- Tasks (exact files, what changes)
- Visual surface trace (from the planner, for the evaluator later) — including the surface's **open-condition**: the code that sets its open state and the application state that must hold for it to render. A control name or URL parameter is not an open-condition.
- Detheme classification for any theme-affecting SharePoint UI: app-chrome-invoked,
  SharePoint-owned full page, customer-content full page, inline pane, or full-overlay drawer.
- For any change that renders or modifies user-facing UI, including components, JSX/HTML,
  layout, styling, typography, colors, spacing, icons, responsive behavior, or theme tokens,
  read both `skills/ow-review/references/sharepoint-design-system-and-ux-components.md` and
  `skills/ow-review/references/sharepoint-theme-and-detheme.md`, plus
  `skills/detheme/SKILL.md`. Include the planner's component-fit analysis in the plan: the
  interaction requirements, strongest supported candidates, requirement-to-capability matrix,
  current Fluent V9 documentation and version-pinned SPDS source consulted, nearby ODSP-Web
  usage, selected component/import route, and rejection rationale for alternatives. For
  sortable/selectable tabular UX, the plan must explicitly compare SPDS `DataGrid` and `Table`.
  Record the Detheme treatment as well. Pure data, service,
  business-logic, configuration, or test-only changes with no rendered UI or styling impact do
  not need these references.
- Context compliance checklist (each routed guard and its required artifact)
- Root/wrapper layout ownership table when any JSX root/wrapper is replaced
- Repeated-item geometry target (selector, axis, metric) when Cards/rows/tiles/items repeat

Save it locally to `/workspaces/odsp-web/.aero/<session>/plan.md` (a local working doc, not committed).

Append `[HH:MM:SS] 📋 Plan ready — <N> tasks` after writing the plan.

**Interactive:** show the plan to the user. Get approval or revise. Loop until approved.
**Auto:** proceed.

Append `[HH:MM:SS] ✅ Plan approved (auto|user)` before implementation starts.

## Step 3.5: Maintain context from the plan

If the context link is resolved:

1. Append a `plan` event to `context/evidence.ndjson` with the approved plan digest, cited decisions, assumptions, and open questions. Planned behavior must be labeled as intent.
2. Dispatch `@agentow-copilot:context-maintainer` with `mode: plan-intent`, the immutable link, evidence path, plan path, and an immutable candidate path under `context/candidates/`.
3. Verify the returned patch digest, unchanged context HEAD/manifest/target-document digests, clean worktree outside the generated patch, allowed target, and absence of path/symlink escape.
4. Follow the manifest policy without asking the user:
   - `auto-commit`: apply, commit, and push only as instructed by that context repository.
   - `patch-only`: preserve the candidate/patch without editing the library.
   - `disabled`: preserve evidence only.
5. Stage only candidate target paths. On dirty worktree, read-only/auth failure, or stale base export a patch/conflict; never silently rebase. Context failure never blocks implementation.
6. Write `context/state.json` and `context/apply/<id>.json`, then append `[HH:MM:SS] 🧠 Context plan update — <result>`.

If plan maintenance changed a routed context document, re-read it before implementation. Do not rerun planning unless the context update introduces a new mandatory guard that invalidates the approved plan.

## Step 4: Implement (you write the code)

Append `[HH:MM:SS] 🔨 Implementation started (cycle N)` before editing.

1. **Branch.** If on `main`, create `user/<alias>/<feature>` from `origin/main` (use `ow-git`). `<alias>` from `whoami`.
2. **Write the code** yourself, following the planner's "patterns to follow". Surgical changes only — every line traces to the request.
   - Complete every context compliance item before build.
   - For any rendered UI, component, layout, or styling change, read and follow the SPDS and
     Detheme references plus `skills/detheme/SKILL.md` before implementation. For non-UI
     changes, skip these references and record that they are not applicable. For any
     theme-affecting SharePoint UI, confirm the planned surface
     classification, and implement its provider, hook, v8, nested-provider, killswitch, and
     SCSS-token guidance as applicable. Do not guess the killswitch/flight for an existing
     surface.
   - Do not implement rendered UI until the plan contains a grounded component-fit analysis.
     Confirm the selected component still satisfies every mapped requirement using its documented
     API and stable SPDS export. If source inspection changes the choice, update the matrix and
     rationale before coding. Do not recreate selection, sorting, grid keyboard navigation, or
     accessibility behavior with low-level `Table` primitives when `DataGrid` owns the required
     interaction model.
   - For every removed/replaced root class/style, preserve or move consumer-owned external layout while leaving replacement-component internal chrome to the component defaults.
   - Do not proceed if any layout declaration in the planner's ownership table has no disposition.
3. **rush update** (via `ow-rush`) if you changed any `package.json`.
4. **Build:** `ow-build` on the affected project. If it fails:
   - Classify: rush infra error (`shrinkwrap-deps.json` missing, `inputsSnapshot not found`) → run `ow-rush install` once, retry. Auth/network error → stop and report. Code error → fix and rebuild (max 3 attempts).
   - If the MCP request times out but a `rush build -t <project>` process is still running, do **not** treat it as build failure. Log `⚠️ Build tool timeout — tracking underlying Rush process`, wait for the real Rush process to exit, then read `common/temp/markdown-summary/build-summary.md` and the raw log. Record this in `agent-metrics.md` as `tool-timeout / self-recovered-by-process-tracking`.
5. **Test:** `ow-test` scoped to the changed modules (not the full suite). If no tests exist for the modules, note it; don't run 600 unrelated tests.
6. **Dev server / debug link:** follow the feature context docs for the surface's verification contract. For UI-visible changes, prefer `ow-start` + `ow-debuglink` before PR validation builds finish; if the context docs require additional guards, execute those guards and record the result.
7. **Commit** (don't push yet).

After commit, append a `code` event to `context/evidence.ndjson` containing the commit SHA, changed files, diff digest, and grounded implementation outcomes. Do not copy unrestricted source into the context artifacts.

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

**Never end the turn while a dispatched subagent is still running.** Wait for its verdict. A run that reports "the browser capture is still running, I'm waiting for its result" and then terminates has abandoned the work mid-flight: the subagent's findings are lost, nothing is written to the artifact, and the next run repeats the whole discovery. If the wait is genuinely unbounded, record what was dispatched and why you stopped, then return a `FAIL` naming that — an explicit abandonment is recoverable, a silent one is not.

For UI-visible changes, visual validation is mandatory and the evaluator owns it:
- BEFORE and AFTER screenshot paths must be present in the evaluator result.
- Primary `beforePath` / `afterPath` must be full browser-page/viewport screenshots that include the surrounding page context, not Drawer/Dialog/component-only crops. Their dimensions must match the evaluator's recorded viewport.
- Optional close-up crops belong only in `beforeCropPath` / `afterCropPath`; they are supplemental evidence.
- When the plan/context marks a repeated or dense UI surface, close-up BEFORE/AFTER crops are mandatory supplemental evidence, not optional. They must contain at least two adjacent items at the same scale.
- For repeated Cards/rows/tiles/items, the evaluator must record BEFORE/AFTER `getBoundingClientRect()` data and computed adjacent gap. A non-zero BEFORE gap becoming zero/negative AFTER is a product FAIL unless explicitly required.
- For Dialog/Drawer/Panel surfaces with grouped footer or toolbar controls, the evaluator must also inspect adjacent control spacing/alignment even when the surface is otherwise styled. If buttons or adjacent actions that were visibly separated in the legacy branch collapse together, lose their gap, or drift into the wrong alignment in AFTER, treat it as **FAIL** with blocker `component-layout-regressed`.
- If screenshots are missing, visual validation failed, or both the reachable personal-profile route and FIC fallback were unavailable, treat the evaluator result as **FAIL** even if code inspection passed.
- Before accepting PASS, independently `view` both primary images and run `file -- "<beforePath>" "<afterPath>"`; do not trust filenames, `captureMethod`, `dimensionEvidence`, or the evaluator's dimension claim without this cross-check.
- If either primary image lacks surrounding page context or its actual PNG dimensions do not match the recorded viewport, classify it as `evaluator-spec` and re-dispatch the evaluator once in the same implementation cycle.
- **Look at the changed component in both images and judge whether it actually rendered.** Right dimensions and page context are not enough — a component whose runtime styles never applied still fills the viewport and still sits in its page. If it has no surface of its own, text overflows or overlaps the page behind it, or the design's background is absent, treat the evidence as invalid: classify `evaluator-spec` with blocker `component-rendered-unstyled` and re-dispatch. An assertion on the component's `data-automation-id` proves only that the element exists.
- If repeated-item crops or geometry evidence are required but missing/malformed, classify it as `evaluator-spec` and re-dispatch the evaluator once in the same implementation cycle.
- Before accepting repeated-item PASS, independently `view` both crops and inspect the numeric geometry evidence; do not accept "looks right".
- Screenshots created manually by the main session do **not** satisfy evaluator validation. If the main session writes a temporary spec to unblock an investigation, move that logic into the evaluator retry prompt and re-dispatch the evaluator.
- Surface the exact failure reason to the user and record it in `progress.log`, `report.json`, and `final.md` if the run stops.
- Do not claim the UI was verified without screenshot evidence.
- If the run is still blocked on the **same screenshot step** after another attempt and you have no materially new evidence, say that explicitly instead of going silent. Append a progress line naming the unchanged blocker and the next single-variable experiment (for example: `still blocked at app shell mount; next retry keeps the same page and adds only a 2s settle before screenshot`). Silence makes the user think the run is abandoned.
- Failing visual validation blocks the *claim*, not the *delivery*. If the implementation is already committed and green, do not end the run empty-handed — see the environment-discovery branch of Step 6 and ship an explicitly unverified draft instead.

Before accepting any evaluator claim about auth, FIC, tenant suitability, test-page availability, or a fixture gap, inspect its `coverageManifest`. A single URL, credential, tenant, or site failure is resource-local evidence only.

- Missing manifest or `coverageManifest.status="incomplete"` → append `[HH:MM:SS] 🔎 Environment discovery retry — evaluator evidence incomplete`, then re-dispatch the evaluator in `environment_discovery` mode in the **same implementation cycle**. Do not edit code, rebuild, retest, increment the generator cycle, or proceed to PR shipment.
- A self-declared complete manifest is still malformed unless predicates are cited, every supported pool has a result, tenants are deduplicated, discovery paths are complete or explicitly blocked with evidence, and every unique discovered candidate has exactly one disposition. For a gap, require `candidatesDiscovered == candidatesProbed == candidateResults.length`, all candidate results rejected with evidence, no `unprobed` entries, and a non-empty `exhaustionReason` proving no discovery path remains. Downgrade any malformed manifest to `environment-discovery-incomplete`, retarget its blocker to `evaluator-environment`, and redispatch it through the same-cycle environment gate.
- Complete manifest with an eligible candidate → require the evaluator to capture screenshots on that candidate.
- Complete manifest with no eligible candidate → classify as an external `fixture-gap`; do not route it to the implementer as a code defect.

## Step 6: Fix loop

**Environment-discovery incomplete (any cycle):** re-dispatch only `@agentow-copilot:evaluator` in the same implementation cycle with the missing coverage requirements. If the retry is still incomplete, do not claim the environment is unsupported and do not claim the UI was verified.

- If nothing has been committed yet, stop and report the blocker.
- If the implementation is already committed and green — `ow-build` passing, `ow-test` passing — then in auto/batch mode **ship it as `success-with-blockers` rather than discarding it**. Continue to review and `ow-pr-create`, and mark the draft PR `unverified`. Do not retry the capture a third time. In interactive mode, show the incomplete manifest and ask.

  The PR description must then carry a verification section stating exactly what was and was not done — build and unit tests passed, visual verification was attempted and could not be completed, BEFORE/AFTER screenshots are still owed, and a human must confirm the rendering before this leaves draft. Record the incomplete manifest and the capture failure verbatim in `report.json` and `final.md`. Never imply the UI was seen.

  The safeguard against hand-waving is the disclosure and the draft state, not the discarding of finished work. A run that verified nothing and says so is useful; a run that silently deletes a green commit is not.

**Evaluator-spec FAIL (any cycle):** re-dispatch only `@agentow-copilot:evaluator` once in the same implementation cycle with the spec blocker. Do not edit code, rebuild, retest, or consume a product fix cycle. If the retry still violates the evaluator contract, stop and report the blocker rather than looping or auto-shipping.

**Complete external fixture gap:** do not change product code. In interactive mode, show the coverage summary and ask whether to ship a draft with the blocker. In auto/batch mode, the run may continue only as `success-with-blockers`, preserving the complete manifest in `report.json` and `final.md`.

**Product/code FAIL and cycle < 5:** YOU fix the blockers (you still have full context — no re-investigation needed). Re-build, re-test, re-dispatch `@agentow-copilot:evaluator`. Increment cycle.

Before starting each fix cycle, append `[HH:MM:SS] 🔁 Fix cycle N+1 — <reason>`.

**Product/code FAIL and cycle ≥ 5:**
- Stop and report the remaining blockers in every mode. Only the separately defined complete external fixture gap may continue as `success-with-blockers`.

**PASS:** continue to Step 7.

## Step 7: Review (dispatch reviewer)

Append `[HH:MM:SS] 📝 Reviewer started` before dispatching.
Read `${CLAUDE_PLUGIN_ROOT}/docs/review-contract.md`. The review is a hard evidence gate in interactive, AUTO, and batch execution.

Resolve the branch's review ledger first, so a finding already dispositioned on this branch is never raised again:

```bash
ledgerSlug=$(printf '%s' "<branch>" | tr '/' '-')
reviewLedgerPath="$HOME/.config/agentow/review-ledger/${ledgerSlug}.json"
```

When the PR already exists, recover the ledger the PR description carries before reviewing, so a re-review from a different machine or session sees the same decisions:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/review-ledger.mjs" parse \
  --description <sessionDir>/pr-description.md --out "$reviewLedgerPath"
```

Dispatch `@agentow-copilot:reviewer` with:

```yaml
branch: <branch>
changedFiles: <changed files>
sessionDir: /workspaces/odsp-web/.aero/<session>
reportFile: /workspaces/odsp-web/.aero/<session>/report.json
progressLog: /workspaces/odsp-web/.aero/<session>/progress.log
artifactPath: /workspaces/odsp-web/.aero/<session>/review.md
artifactJsonPath: /workspaces/odsp-web/.aero/<session>/review.json
reviewLedgerPath: <resolved $reviewLedgerPath>
contextDocuments:
  - <every routed feature/domain context document>
planPath: <actual planPath returned by the planner NDJSON record>
implementationEvidencePath: /workspaces/odsp-web/.aero/<session>/report.json
evaluationArtifactPaths:
  - <every existing artifact path from the final evaluator NDJSON record, including artifactPath/evalReportPath/ruleFindingsPath/visionFindingsPath when present>
```

Read the final evaluator NDJSON record immediately before dispatch. Pass only artifact paths that the record actually returned and that exist; do not synthesize conventional paths. If the final evaluator record or its required artifacts are missing, classify it as `evaluator-spec` and stop or retry under Step 6 rather than reviewing stale evidence.

After the reviewer returns, independently recompute the merge base, HEAD, diff digest, and changed-file list, then validate:

```bash
mergeBase=$(git merge-base origin/main HEAD)
git diff --no-renames --name-only "$mergeBase"...HEAD > <sessionDir>/review-changed-files.txt
git diff --no-renames --numstat "$mergeBase"...HEAD > <sessionDir>/review-numstat.txt
node "${CLAUDE_PLUGIN_ROOT}/tools/validate-review-report.mjs" \
  <sessionDir>/review.json \
  --expected-head "$(git rev-parse HEAD)" \
  --expected-diff-digest "$(git diff --no-renames "$mergeBase"...HEAD | sha256sum | cut -d' ' -f1)" \
  --changed-files <sessionDir>/review-changed-files.txt \
  --diff-numstat <sessionDir>/review-numstat.txt \
  --ledger "$reviewLedgerPath" \
  --repo "$(git rev-parse --show-toplevel)"
```

The validator re-runs the ledger match itself, so a reviewer that re-raises an accepted finding or invents a `previouslyAccepted` entry fails validation rather than reaching the author.

If `review.md`, `review.json`, or the reviewer NDJSON line is missing, or validation fails, classify it as `reviewer-spec`. Re-dispatch the reviewer once against the unchanged implementation cycle with the validation errors. Do not edit code, rebuild, retest, or consume a product fix cycle. If the retry still fails validation, stop; never ship an unsupported review.

**REQUEST_CHANGES with any Critical or Important finding:**
- Convert every blocking finding into a product blocker with its evidence and suggested fix.
- If `cycle < 5`, go back to Step 6, fix, rebuild, retest, re-evaluate, and run a completely new review against the new HEAD.
- At `cycle >= 5`, stop and report unresolved findings in every mode. Draft status and AUTO mode do not bypass the review quality gate.

**APPROVE / COMMENT (Minor only):** every Minor must be dispositioned before shipping. An undispositioned Minor is what makes the next review of this PR look noisy, so choose one per finding:

- **Fix it** when it is cheap and low-risk. Prefer this. Batch the fixes into the existing branch, then re-run the review against the new HEAD.
- **Accept it** when fixing is out of scope, riskier than the nit, or contradicts the plan. Record the decision so no later review re-raises it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/review-ledger.mjs" accept \
  --report <sessionDir>/review.json \
  --ledger "$reviewLedgerPath" \
  --repo "$(git rev-parse --show-toplevel)" \
  --branch "<branch>" \
  --accept '<findingId>=<why this stays as-is in this PR>'
```

The reason is shown to the author and to every later reviewer, so it must say why the nit stays rather than restate the nit; the tool rejects a reason that is too short or that merely repeats the finding. Report accepted Minors in the run summary alongside the fixed ones, then continue.

## Step 8: Maintain context from the as-built result

This phase never pauses the product workflow.

1. Append `evaluation` and `review` evidence events with artifact digests, outcomes, blockers, and citations.
2. Dispatch `@agentow-copilot:context-maintainer` with `mode: as-built`, the actual commit/diff, approved plan, evaluator artifact, reviewer artifact, and prior candidate.
3. The new immutable candidate must correct or supersede plan intent that the code did not implement.
4. Verify and apply it using the same manifest policy and stale-base/read-only safeguards as Step 3.5.
5. Write the result artifacts and append `[HH:MM:SS] 🧠 Context as-built update — <result>`.

No-update, patch-only, disabled, dirty-worktree, read-only, auth, or conflict outcomes are recorded but never block PR creation.

## Step 9: Ship

1. **Push** the branch and **create the draft PR:** `ow-pr-create` with title (from the plan spec) and description (Summary + Changes — no generic auto-generated "Testing" section). For SP-Client runtime changes, the first line must be `Gate: <Flight/KS identifier> — <enabled/new-path direction>; <disabled/fallback direction>`, grounded in the validated `preReview.rolloutProtection` artifact. When the ledger has entries, append its rendered block to the description so the accepted nits and their reasons travel with the PR:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/review-ledger.mjs" render \
  --ledger "$reviewLedgerPath" >> <sessionDir>/pr-description.md
```

   The block is human-readable and carries a machine-readable comment, so a later reviewer on any machine recovers the same decisions with `review-ledger.mjs parse` instead of re-raising them.
2. **Visual validation for UI changes:** prefer a dispatcher-provided, reachable compliant personal-account Playwright profile. It must compare target/current with the changed build under identical flights and set `visualValidation.source=personal-persistent-profile`. A Codespace that cannot reach the Devbox profile falls back immediately to the evaluator's FIC Playwright/Heft spec: local `rush start` first, then `ow-pr-debug-query` / `finalValidationMode=pr-cdn-fic` for a proven route-specific local failure. Playwright MCP and `browser_*` tools are not validation routes.
3. **Attach screenshots** for UI changes. Attach only evaluator-produced screenshot paths. The primary BEFORE/AFTER table in the PR description MUST embed the full-page/viewport `beforePath` and `afterPath`. Component crops may be attached as clearly labeled supplemental detail links, but must never replace the primary images. Include `visualValidation.source` in the PR description (`personal-persistent-profile`, `local-rush-start`, or `pr-cdn-fic`) so reviewers know which path produced the images. Missing or invalid full-page/viewport BEFORE/AFTER screenshots block PR creation unless Step 6 proved a complete external fixture gap; only that case may ship as `success-with-blockers` with the complete coverage manifest.
   - If visual validation fails because a surface needs seeded data or a tenant capability, write `fixtureGap: true`, the missing fixture, and the complete `coverageManifest` in `final.md` / `report.json`. Batch mode reads this as `success-with-blockers`, not plain success. An incomplete manifest blocks shipment.
4. **Report** the PR URL to the user.

Write `/workspaces/odsp-web/.aero/<session>/final.md` with final build/test/evaluation/review status, PR URL if any, screenshot paths if captured, and any remaining blockers.

Include the context library ID, plan-stage result, as-built result, latest candidate path, applied context commit/PR if any, and pending patch/conflict path. Append a compact reference entry to `~/.config/agentow/runs.ndjson` keyed by run ID and PR URL so `/ow-context-feedback` can resume the provenance chain later.

Append `[HH:MM:SS] ✅ Workflow complete` after `final.md` is written.

## Notes

- One feature/bug per run. For multiple, use `ow-batch`; it runs this pipeline serially in the main session and checkpoints between tasks.
- Specs/plans stay local (`.aero/`), never committed, never referenced from code.
- If the user explicitly says "skip the review", do not dispatch reviewer and do not create a PR or claim AgentOW approval. Requests to avoid a PR or only edit code remain valid.
