---
name: agentow-a11y
description: "Fix an odsp-web Accessibility bug through a lightweight reproduce-first pipeline. Twinbot owns real DevBox assistive technology and supplies hashed evidence; agentOW edits only after reproduction and ships only after the exact scenario passes. Triggers on: A11y bug, accessibility bug, WCAG, screen reader, NVDA, Narrator, Voice Access, keyboard focus, ARIA, accessible name, live region."
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
- If neither route is available, write `final.md` with status `needs-twin-evaluator` and stop.

After Twin writes the result, dispatch `@agentow-copilot:a11y-evaluator` with phase `reproduce`.
Also run `validate-a11y-evidence.mjs` directly.

Gate:

| Result | Action |
|---|---|
| `reproduced` + evaluator PASS | Continue |
| `not-reproduced` | Stop; no branch, code, or PR |
| `blocked` | Stop with exact blocker |
| `inconclusive` | Stop; never guess |
| invalid/mismatched evidence | Stop as `INVALID_EVIDENCE` |

Preserve the approved reproduce request/result as immutable files. Record the SHA-256 of the exact
reproduce result file bytes; it becomes `baselineEvidenceSha256`.

## Step 3: Minimal source investigation

Only after reproduction:

1. Trace the failing element/event to its implementation.
2. Read the predecessor/native SPDS or Fluent implementation before hand-writing ARIA, focus,
   keyboard, live-region, or announcement behavior.
3. Read directly applicable routed project instructions.
4. Identify the smallest source change that addresses the reproduced behavior.
5. Write a short implementation note, not a long general plan:

   ```markdown
   # A11y implementation note
   - Reproduced failure:
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
- `blocked` or `inconclusive`: stop. Unlike standard visual delivery, A11y mode never creates an
  explicitly unverified draft.

Static axe, accessibility-tree, and code checks cannot upgrade missing real-AT evidence.

## Step 6: Review
<!-- agentow-contract:a11y:review -->

After strict verify PASS, dispatch `@agentow-copilot:reviewer` with:

- original bug and implementation note;
- changed files and actual diff;
- A11y knowledge manifest;
- reproduce and verify evaluator reports;
- evidence metadata and hashes;
- `${CLAUDE_PLUGIN_ROOT}/skills/ow-review/references/accessibility.md`.

Critical/Important findings return to Step 4 and require a complete Step 5 replay. Never reuse a
PASS from an older commit.
<!-- agentow-contract:a11y:evidence-bound-to-head -->

## Step 7: Ship and preserve evidence
<!-- agentow-contract:a11y:delivery:draft-pr -->

Create the draft PR only after verification and review pass.

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

Attach reviewer-safe evidence through `ow-pr-attach` so it updates the PR description, never a
comment thread. Prefer:

- annotated BEFORE/AFTER screenshots;
- normalized NVDA transcript excerpts;
- a summarized Narrator ETW report plus ETL when policy allows;
- Voice Access result JSON, volume summary, and screenshot;
- focus sequence or UI Automation state.

For semantic-only changes whose rendered pixels are intentionally unchanged, raw full-page
BEFORE/AFTER screenshots are route and geometry evidence, not proof of the fix. Do not present a
pixel-identical image table as though it shows the behavior change. Generate one reviewer-safe
matched semantic capture from the verified DOM/accessibility-tree facts: show the same target crop
and geometry beside the exact BEFORE and AFTER computed names, roles, states, or relationships.
Explain the difference in the image and PR text. A KS-activated state is still required to prove
emergency rollback, but a separate rollback screenshot is required only when rollback changes
pixels; otherwise show the rollback semantic facts in the matched capture.

Do not attach raw credentials, profiles, tokens, unrelated desktop content, or private knowledge
documents.

Write `final.md` with branch, commit, PR, build, reproduce verdict, verify verdict, scenario hash,
evidence hashes, reviewer verdict, and any remaining non-blocking notes.

## Batch semantics

Each A11y item gets one isolated run/branch/PR. `not-reproduced`, `blocked`, `inconclusive`, and
invalid evidence end only that item. Continue to the next batch item without source changes.
