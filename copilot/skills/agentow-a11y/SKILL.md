---
name: agentow-a11y
description: "Fix an odsp-web Accessibility bug through a lightweight evidence-first pipeline. Twinbot owns real DevBox assistive technology and supplies hashed evidence when available; after bounded evidence attempts are exhausted, agentOW may implement and open an explicitly unverified draft PR without claiming AT validation. Triggers on: A11y bug, accessibility bug, WCAG, screen reader, NVDA, Narrator, Voice Access, keyboard focus, ARIA, accessible name, live region."
---

# agentOW Accessibility remediation mode

This is an isolated flow. Do not start or resume the standard `agentow` pipeline, do not dispatch
the standard planner/evaluator, and do not write A11y knowledge into standard planning artifacts.

The main session is the orchestrator and implementer. Dispatch only
`@agentow-copilot:a11y-evaluator` for Twin evidence validation and the existing
`@agentow-copilot:reviewer` after strict verification passes.

## Non-negotiable boundary

Twinbot controls the DevBox and real assistive technology. agentOW controls the Codespace and
odsp-web source. agentOW never launches NVDA, Narrator, Voice Access, ETW, virtual audio, or
OS-level input. Twinbot never edits the odsp-web worktree.

## Step 0: Create the isolated run

1. Confirm `/workspaces/odsp-web` is clean. Stop on pre-existing changes; never auto-stash them.
2. Fetch `origin/main`, then unconditionally run
   `git -C /workspaces/odsp-web switch --detach origin/main`. Reproduction must not be attached to
   `main` or any other branch.
3. Create:

   ```text
   /workspaces/odsp-web/.aero/a11y-<slug>-<timestamp>/
   ├── request.txt
   ├── progress.log
   ├── final.md
   └── a11y/
       ├── knowledge-manifest.json
       ├── intake.json
       ├── reproduce/
       │   ├── evaluator-request.json
       │   ├── evaluator-result.json
       │   └── evaluator-report.md
       ├── implementation/
       │   └── iter<N>.md
       └── verify/
           ├── evaluator-request.json
           ├── evaluator-result.json
           └── evaluator-report.md
   ```

4. Read:
   - `${CLAUDE_PLUGIN_ROOT}/docs/a11y/README.md`
   - `${CLAUDE_PLUGIN_ROOT}/docs/a11y/evidence-contract.md`
   - `${CLAUDE_PLUGIN_ROOT}/skills/ow-review/references/accessibility.md`
5. Write `knowledge-manifest.json` listing exact documents, versions/URLs when known, and why each
   applies. Keep this manifest A11y-only.
6. Write concise progress lines for every gate.

## Step 1: Intake — no planner

Do not dispatch the planner. Perform only bounded intake:

1. Parse bug ID/title, exact user impact, supplied repro steps, expected behavior, target URL or
   fixture, applicable AT, and likely WCAG classification.
2. Ask only for a missing fact that prevents a runnable reproduction contract. In AUTO/batch,
   record the missing fact as `blocked` and stop the item.
3. Inspect at most the directly named entry surface and existing test/automation identifiers needed
   to describe the scenario. Do not investigate root cause before reproduction.
4. Write `a11y/intake.json`.
5. Build a deterministic reproduce request following `evidence-contract.md`. Compute one canonical
   `scenarioHash` from fixture, route, flags, viewport, AT, ordered steps, and expectations.
   Each step declares its own `requiredEvidenceTypes` subset; the top-level list is their union.

The request must name required evidence types. Examples:

- NVDA speech defect: screenshot + NVDA transcript + UI Automation/focus state.
- Narrator-only defect: screenshot + Narrator ETW + UI Automation state.
- Voice Access defect: screenshot + result JSON + captured audio/volume evidence.
- Keyboard/focus defect: screenshot + focus sequence + OS-input log.
- Contrast/reflow defect: screenshot + measurement or viewport evidence.

Voice Access also requires `capture-state` and `overlay-map`: hide the debug bar, clear dialogs,
match viewport/scroll/target geometry, and attribute each number to page DOM/UIA, browser chrome, or
OS surfaces. Never infer ownership from visual proximity; unmapped numbers are inconclusive.

## Step 2: Twin reproduction gate
<!-- agentow-contract:a11y:reproduce-before-implement -->

Write `a11y/reproduce/evaluator-request.json`.

Use the dispatcher-provided Twin evidence bridge:

- If a Twin evaluator command is provided, invoke it with request/result paths.
- If Twin already provided a result artifact, copy only the immutable result metadata/URI into the
  run; do not copy private profiles or credentials.
- Make up to three meaningful attempts to acquire and validate real-AT reproduction evidence. An
   attempt must try an available route or correct a concrete bridge, request, environment, or
   evidence defect; never repeat an identical unavailable command merely to reach the limit. If no
   Twin route exists, capability discovery exhausts the available routes immediately.

After Twin writes the result, dispatch `@agentow-copilot:a11y-evaluator` with phase `reproduce`.
Also run `validate-a11y-evidence.mjs` directly.

Gate:

| Result | Action |
|---|---|
| `reproduced` + evaluator PASS | Continue |
| `not-reproduced` | Correct procedural or scenario defects and retry when possible |
| `blocked` | Repair the concrete capability/environment blocker and retry when possible |
| `inconclusive` | Correct the evidence gap and retry when possible; never call it reproduced |
| invalid/mismatched evidence | Correct and retry; never reinterpret it as valid evidence |

When the available routes or three meaningful attempts are exhausted without a valid reproduced
result, do not stop solely because real-AT validation is unavailable. Set
`validationMode: "unverified-fallback"`, record every attempted route and exact blocker in
`final.md`, and continue to source investigation. This fallback requires a concrete reported
actual/expected behavior and runnable acceptance scenario. If those are absent, stop for missing
requirements rather than guessing at the bug. User authorization may select this fallback early
once capability discovery proves no Twin route exists.

The fallback authorizes investigation, implementation, review, and an explicitly unverified draft
PR. It does not turn missing, invalid, blocked, inconclusive, or not-reproduced evidence into PASS,
and it never authorizes claims that NVDA, Narrator, Voice Access, keyboard focus, UI Automation, or
screenshots were validated. Use `validationMode: "strict"` when reproduction passes normally.

Preserve the approved reproduce request/result as immutable files. Record the SHA-256 of the exact
reproduce result file bytes; it becomes `baselineEvidenceSha256`.

## Step 3: Minimal source investigation

After strict reproduction PASS or entry into `unverified-fallback`:

1. Trace the failing element/event to its implementation.
2. Read the predecessor/native SPDS or Fluent implementation before hand-writing ARIA, focus,
   keyboard, live-region, or announcement behavior.
3. Read directly applicable routed project instructions.
4. Identify the smallest source change that addresses the reproduced behavior.
5. Write a short implementation note, not a long general plan:

   ```markdown
   # A11y implementation note
   - Reproduced failure or reported failure when unverified:
   - Root cause:
   - Files:
   - Existing pattern reused:
   - Acceptance replay:
   ```

No planner approval phase exists in A11y mode.

## Step 4: Implement and build
<!-- agentow-contract:a11y:implement-build -->

1. Create a fresh branch from `origin/main` only now.
2. Make the smallest behavior-preserving fix.
3. When adding, moving, renaming, or changing a live killswitch, read and follow
   `docs/killswitch-guidance.md` before editing. Record the behavior owner, centralized module
   search, dependency boundary, original rollback expression, and expected diff size. Do not add
   public API or host callback plumbing when the behavior-owning package can evaluate its own
   killswitch.
4. Follow repository test policy. Do not add tests merely because the pipeline exists.
5. Run the smallest existing build/lint/test commands that cover the changed package.
6. Commit without pushing.
7. Write `a11y/implementation/iter<N>.md` with commit, diff scope, and build result.

Maximum three implementation cycles. A11y mode is not a broad refactoring loop.

## Step 5: Exact-scenario verification
<!-- agentow-contract:a11y:exact-scenario-verify -->

Create `a11y/verify/evaluator-request.json` by copying the canonical reproduction scenario:

- same `scenarioId` and `scenarioHash`;
- same fixture, route, flags, viewport, AT, ordered steps, and expected behavior;
- changed build selector and exact lowercase 40-character commit SHA;
- approved `baselineEvidenceSha256`;
- same required evidence types.

Twinbot replays the scenario and writes `evaluator-result.json`. Dispatch
`@agentow-copilot:a11y-evaluator` with phase `verify`, the immutable baseline request/result paths,
then run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/validate-a11y-evidence.mjs" \
  --phase verify \
  --request "<verify-request>" \
  --result "<verify-result>" \
  --baseline-request "<reproduce-request>" \
  --baseline-result "<reproduce-result>" \
  --repo-root "/workspaces/odsp-web"
```

Gate:

- `pass` + evaluator PASS: continue.
- `fail` caused by product behavior: fix, rebuild, and replay; maximum three cycles.
- evaluator-spec/invalid evidence: request corrected Twin evidence without editing code.
- `blocked` or `inconclusive`: correct the concrete blocker and retry when possible.

In `unverified-fallback`, or when verification capability becomes unavailable after implementation,
make up to three meaningful verification attempts using the same bounded-attempt rule from Step 2.
Run all available scoped builds, tests, lint, static accessibility checks, and source-level contract
checks, but label them as supporting checks. When the routes or attempts are exhausted, record the
exact missing AFTER evidence and continue to review with `verifyVerdict: "UNVERIFIED"`. A valid
real-AT result showing the changed product still fails is not an unavailable-validator case: fix it
and replay, and do not create a PR while that demonstrated product failure remains.

Static axe, accessibility-tree, and code checks cannot upgrade missing real-AT evidence.

## Step 6: Review
<!-- agentow-contract:a11y:review -->

After strict verify PASS or completion of the `unverified-fallback` supporting checks, dispatch
`@agentow-copilot:reviewer` with:

- original bug and implementation note;
- changed files and actual diff;
- A11y knowledge manifest;
- reproduce and verify evaluator reports;
- evidence metadata and hashes;
- validation mode, exhausted attempt log, unavailable evidence types, and supporting checks;
- `${CLAUDE_PLUGIN_ROOT}/skills/ow-review/references/accessibility.md`.

Critical/Important findings return to Step 4. Strict mode requires a complete Step 5 replay. In
fallback mode, rerun affected supporting checks and retry real-AT verification only when the
capability or blocker changed. Never reuse a PASS from an older commit.
<!-- agentow-contract:a11y:evidence-bound-to-head -->

## Step 7: Ship and preserve evidence
<!-- agentow-contract:a11y:delivery:draft-pr -->

Create the draft PR after review passes. Strict mode also requires verification PASS. Fallback mode
may create a draft PR with no real-AT PASS only when all bounded attempts, blockers, supporting
checks, and residual risks are recorded. Prefix the validation section heading with
`UNVERIFIED A11Y` and do not present the PR as accessibility-validated or ready for final approval.

The PR description must stand alone and include:

```markdown
## Accessibility validation

- Bug reproduced before fix: Yes
- Assistive technology: <name/version/mode>
- WCAG: <most precise SCs>
- Scenario hash: `<sha256>`
- BEFORE result: `<failure summary>`
- AFTER result: PASS — `<fixed behavior>`

| Step | BEFORE | AFTER | Evidence |
|---|---|---|---|
```

For `unverified-fallback`, replace that template with:

```markdown
## UNVERIFIED A11Y - validation unavailable

- Validation mode: Unverified fallback
- Reported bug and expected behavior: <summary>
- Real-AT attempts: <count and routes>
- Blocker: <Twin/AT/environment/evidence blocker>
- Not validated: <NVDA/Narrator/Voice Access/keyboard/UIA/screenshots as applicable>
- Supporting checks: <build, scoped tests, lint, static checks and results>
- Residual risk: The accessibility fix has not been verified with the required real AT.
```

Do not include a fabricated BEFORE/AFTER evidence table, evidence hashes, or `PASS` result in a
fallback PR. State what was not run as plainly as what did run.

Attach reviewer-safe evidence through `ow-pr-attach` so it updates the PR description, never a
comment thread. Prefer:

- annotated BEFORE/AFTER screenshots;
- normalized NVDA transcript excerpts;
- a summarized Narrator ETW report plus ETL when policy allows;
- Voice Access result JSON, volume summary, and screenshot;
- focus sequence or UI Automation state.

Do not attach raw credentials, profiles, tokens, unrelated desktop content, or private knowledge
documents.

Write `final.md` with validation mode, branch, commit, PR, build, reproduce verdict, verify verdict,
scenario hash, available evidence hashes, exhausted attempt log, supporting checks, reviewer
verdict, residual risk, and any remaining non-blocking notes.

## Batch semantics

Each A11y item gets one isolated run/branch/PR. Missing requirements or a demonstrated unresolved
product failure end only that item. Exhausted evidence capability may use `unverified-fallback`;
continue to the next batch item after recording whether a draft PR was created.
