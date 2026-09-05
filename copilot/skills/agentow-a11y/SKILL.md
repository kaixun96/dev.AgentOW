---
name: agentow-a11y
description: "Fix an odsp-web Accessibility bug through a lightweight evidence-first pipeline. Codespaces skip host-only Windows AT tests unless an external evidence bridge is available; Windows hosts install safe scriptable prerequisites and run supported tests directly. After bounded evidence routes are exhausted, agentOW may open an explicitly unverified draft PR without claiming AT validation. Triggers on: A11y bug, accessibility bug, WCAG, screen reader, NVDA, Narrator, Voice Access, keyboard focus, ARIA, accessible name, live region."
---

# agentOW Accessibility remediation mode

This is an isolated flow. Do not start or resume the standard `agentow` pipeline, do not dispatch
the standard planner/evaluator, and do not write A11y knowledge into standard planning artifacts.

The main session is the orchestrator and implementer. Dispatch only
`@agentow-copilot:a11y-evaluator` for Twin evidence validation and the existing
`@agentow-copilot:reviewer` after strict verification passes.

## Execution environment contract

Detect the execution environment before creating the run:

- `codespace`: `CODESPACES == "true"` or `CODESPACE_NAME` is non-empty.
- `windows-host`: not a Codespace and the current host is Windows.
- `unsupported-host`: every other environment.

Record `executionEnvironment`, the detection signal, and `repoRoot` in `a11y/intake.json` and
`final.md`. Never infer Windows AT availability merely because a bridge command or a path was
provided.

In a Codespace, agentOW never installs or launches NVDA, Narrator, Voice Access, ETW, VB-CABLE,
audio routing, Windows UI Automation, OS-level input, console-session transfer, or unattended
screen-reader recording. Twinbot or another dispatcher-provided external evaluator may produce that
evidence. If no external route exists, record each applicable host-only test as `skipped-environment`,
explain that it requires a Windows host, and continue through the existing unverified fallback.
A deliberate environment skip is not a failed test and must not be retried three times.

On an independently controlled Windows host, the main session may run real AT only through the
procedures in `${CLAUDE_PLUGIN_ROOT}/docs/a11y/windows-host-testing.md`. That guide is self-contained;
`/agentow-a11y` does not require or invoke an external test skill. A Twin-managed DevBox is not
independently controlled: Twinbot retains exclusive ownership of its browsers and AT, so agentOW
must use the Twin evidence bridge there. Install only the safe scriptable prerequisites described
in the host guide. Never bypass security prompts, silently install a driver or language pack, claim
an RDP session is equivalent to the console session, or run NVDA and Narrator simultaneously. The
evidence evaluator validates artifacts but never controls AT or edits product code.

On an unsupported host, run only host-supported browser/static checks and mark Windows-only checks
`skipped-environment`; never attempt Windows installation commands.

## Step 0: Create the isolated run

1. Resolve `repoRoot`: use `/workspaces/odsp-web` in a Codespace; otherwise use the current odsp-web
   Git worktree root. Confirm it is clean. Stop on pre-existing changes; never auto-stash them.
2. Fetch `origin/main`, then unconditionally run
   `git -C "<repoRoot>" switch --detach origin/main`. Reproduction must not be attached to `main`
   or any other branch.
3. Create:

   ```text
   <repoRoot>/.aero/a11y-<slug>-<timestamp>/
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
   - `${CLAUDE_PLUGIN_ROOT}/docs/a11y/pr-evidence-capture-guide.md`
   - `${CLAUDE_PLUGIN_ROOT}/docs/a11y/windows-host-testing.md`
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

- NVDA speech defect: screenshot + NVDA transcript + UI Automation/focus state + genuine AFTER video.
- Narrator-only defect: screenshot + Narrator ETW + UI Automation state + genuine AFTER video.
- Unattended screen-reader recording: validated MP4 with real speech and visible focus, recording
  quality metrics, extracted focus frame, and the applicable NVDA transcript or Narrator ETW.
- Voice Access defect: screenshot + result JSON + captured audio/volume evidence.
- Keyboard/focus defect: screenshot + focus sequence + OS-input log.
- Contrast/reflow defect: screenshot + measurement or viewport evidence.

Voice Access also requires `capture-state` and `overlay-map`: hide the debug bar, clear dialogs,
match viewport/scroll/target geometry, and attribute each number to page DOM/UIA, browser chrome, or
OS surfaces. Never infer ownership from visual proximity; unmapped numbers are inconclusive.

## Step 2: Twin reproduction gate
<!-- agentow-contract:a11y:reproduce-before-implement -->

Write `a11y/reproduce/evaluator-request.json`.

Route evidence collection by `executionEnvironment`:

- In a Codespace, use a dispatcher-provided external evidence bridge when one exists. Otherwise
  record the applicable Windows-only procedures as `skipped-environment`, including NVDA speech,
  Narrator ETW, unattended screen-reader recording, Voice Access/audio, Windows UI Automation, and
  real OS input. Do not install or launch their dependencies in the Codespace.
- On an independently controlled Windows host, run the prerequisite preflight from
  `windows-host-testing.md`. Install missing safe scriptable dependencies, then run the applicable
  keyboard, browser, WCAG, NVDA, Narrator, unattended recording, or Voice Access procedure directly.
  Unattended recording is available only after its one-time machine setup passes preflight; a run
  must not create an elevated task, install a driver, approve UAC, or improvise session transfer.
  Convert the produced artifacts to the `evidence-contract.md` request/result shape before
  validation. On a Twin-managed DevBox, use its Twin evidence bridge instead of this direct route.
- On an unsupported host, mark Windows-only procedures `skipped-environment` and run only supported
  checks.

For an external evidence bridge:

- If a Twin evaluator command is provided, invoke it with request/result paths.
- If Twin already provided a result artifact, copy only the immutable result metadata/URI into the
  run; do not copy private profiles or credentials.
- Make up to three meaningful attempts to acquire and validate real-AT reproduction evidence. An
   attempt must try an available route or correct a concrete bridge, request, environment, or
   evidence defect; never repeat an identical unavailable command merely to reach the limit. If no
   evidence route exists, capability discovery exhausts the available routes immediately. A
   Codespace `skipped-environment` entry consumes no attempt.

After the selected producer writes the result, dispatch `@agentow-copilot:a11y-evaluator` with
phase `reproduce`. Also run `validate-a11y-evidence.mjs` directly.

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
3. For a heading change, create `heading-outline.md` before any source edit. Record the complete live
   heading outline, target, nearest parent heading, relevant sibling headings, selected level, and
   rationale. Derive the level only from those verified relationships, never from visual styling, a
   component name, or an assumed hierarchy. If any required field is missing or ambiguous, record
   `Verdict: INCONCLUSIVE` and stop before Step 4; do not implement a heading level.
4. Read directly applicable routed project instructions.
5. Identify the smallest source change that addresses the reproduced behavior.
   For React or Next.js runtime code, read `skills/vercel-react-best-practices/SKILL.md` and its
   compiled `AGENTS.md`; apply only version-compatible rules relevant to the changed path.
   When using Fluent V9 `useAnnounce()` under a guaranteed ancestor `AriaLiveAnnouncer`, call its
   provider-backed `announce` function directly. Fix missing provider or test setup at that
   boundary instead of adding a feature-local announcer.
6. Write a short implementation note, not a long general plan:

   ```markdown
   # A11y implementation note
   - Reproduced failure or reported failure when unverified:
   - Root cause:
   - Files:
   - Existing pattern reused:
   - Acceptance replay:
   - Heading outline artifact (heading changes only):
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

Use the same environment route and evidence producer selected for reproduction to replay the
scenario and write `evaluator-result.json`. Codespaces must not attempt host-only Windows AT
locally; when no external bridge exists, retain the matching `skipped-environment` entries.
For every screen-reader bug, strict PASS also requires an exact-HEAD continuous AFTER recording
with synchronized real AT audio and visible focus/cursor movement. Transcript, ETW, AX/UIA,
screenshots, and tests can support but never replace this recording.
Reviewer annotations must not cover the pixels, border, focus indicator, text, or color being
validated. Put callouts outside the target, use leader lines, and retain an unobstructed equal-scale
target crop.
Dispatch
`@agentow-copilot:a11y-evaluator` with phase `verify`, the immutable baseline request/result paths,
then run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/validate-a11y-evidence.mjs" \
  --phase verify \
  --request "<verify-request>" \
  --result "<verify-result>" \
  --baseline-request "<reproduce-request>" \
  --baseline-result "<reproduce-result>" \
  --repo-root "<repoRoot>"
```

Gate:

- For a heading change, exact-scenario AFTER evidence must recapture the same complete live outline
  and re-check the target, nearest parent, and relevant siblings against `heading-outline.md`.
  Missing, changed, or ambiguous surrounding context is `inconclusive`, not PASS.
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
- Execution environment: <codespace | windows-host | unsupported-host>
- Reported bug and expected behavior: <summary>
- Real-AT attempts: <count and routes>
- Environment-skipped tests: <host-only tests and reason, or none>
- Blocker: <Twin/AT/environment/evidence blocker>
- Not validated: <NVDA/Narrator/Voice Access/keyboard/UIA/screenshots as applicable>
- Supporting checks: <build, scoped tests, lint, static checks and results>
- Residual risk: The accessibility fix has not been verified with the required real AT.
```

Do not include a fabricated BEFORE/AFTER evidence table, evidence hashes, or `PASS` result in a
fallback PR. State what was not run as plainly as what did run.

Attach reviewer-safe evidence through `ow-pr-attach` so it updates the PR description, never a
comment thread. Every screenshot, recording, annotation, attachment URL, and actual PR-page check
must satisfy `${CLAUDE_PLUGIN_ROOT}/docs/a11y/pr-evidence-capture-guide.md`. Prefer:

- annotated BEFORE/AFTER screenshots;
- normalized NVDA transcript excerpts;
- a summarized Narrator ETW report plus ETL when policy allows;
- Voice Access result JSON, volume summary, and screenshot;
- focus sequence or UI Automation state.

In strict mode, for semantic-only changes whose rendered pixels are intentionally unchanged, raw
full-page BEFORE/AFTER screenshots are route and geometry evidence, not proof of the fix. Do not
present a pixel-identical image table as though it shows the behavior change. The PR must attach
both one full-page context image showing where the target lives and one reviewer-safe matched
semantic capture proving what changed; neither replaces the other. Build the semantic capture from
the verified DOM/accessibility-tree facts: show the same target crop and geometry beside the exact
BEFORE and AFTER computed names, roles, states, or relationships. Explain the difference in the
image and PR text. A KS-activated state is still required to prove emergency rollback, but a
separate rollback screenshot is required only when rollback changes pixels; otherwise show the
rollback semantic facts in the matched capture. In fallback mode, list the unavailable semantic
evidence in `Not validated`; never synthesize a matched capture from source inference.

Do not attach raw credentials, profiles, tokens, unrelated desktop content, or private knowledge
documents.

Write `final.md` with validation mode, branch, commit, PR, build, reproduce verdict, verify verdict,
scenario hash, available evidence hashes, exhausted attempt log, supporting checks, reviewer
verdict, residual risk, and any remaining non-blocking notes.

## Batch semantics

Each A11y item gets one isolated run/branch/PR. Missing requirements or a demonstrated unresolved
product failure end only that item. Exhausted evidence capability may use `unverified-fallback`;
continue to the next batch item after recording whether a draft PR was created. Batch summaries
separate `skipped-environment` from attempted-and-failed tests.
