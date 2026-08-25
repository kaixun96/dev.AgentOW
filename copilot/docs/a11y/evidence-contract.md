# Twinbot ↔ agentOW A11y evidence contract

The bridge is artifact-based so DevBox control stays in Twinbot and source control stays in
agentOW. Both sides use JSON version 1.

## Request

agentOW writes `<sessionDir>/a11y/<phase>/evaluator-request.json`:

```json
{
  "version": 1,
  "phase": "reproduce",
  "scenarioId": "dialog-focus-announcement",
  "scenarioHash": "<sha256 of canonical scenario fields>",
  "bug": {"id": "123", "title": "Dialog title is not announced"},
  "target": {
    "url": "https://...",
    "build": "target",
    "fixture": "...",
    "route": "...",
    "flags": [],
    "viewport": {"width": 1280, "height": 720}
  },
  "assistiveTechnology": {
    "name": "NVDA",
    "mode": "speech-viewer",
    "required": true
  },
  "steps": [
    {
      "id": "open-dialog",
      "action": "Activate the trigger",
      "expected": "Dialog title is announced",
      "requiredEvidenceTypes": ["screenshot", "nvda-transcript"]
    }
  ],
  "requiredEvidenceTypes": ["screenshot", "nvda-transcript", "ui-automation"]
}
```

The validator recomputes the canonical scenario hash from scenario ID, URL, fixture, route, flags,
viewport, assistive technology, ordered steps, expected results, and per-step evidence
requirements. The normalized top-level evidence list is also included and must equal the union of
per-step requirements. It excludes phase, build selector, commit, timestamps, output paths, and
implementation details so BEFORE and AFTER share one hash. A caller-supplied hash that does not
match these fields is invalid.

Verify requests use `phase: "verify"`, the changed build, and add:

```json
{
  "baselineEvidenceSha256":"<sha256 of exact approved reproduce result file bytes>",
  "target":{"build":"commit:<sha>","commitSha":"<40-character Git SHA>"}
}
```

## Result

Twinbot writes `<sessionDir>/a11y/<phase>/evaluator-result.json`:

```json
{
  "version": 1,
  "phase": "reproduce",
  "scenarioId": "dialog-focus-announcement",
  "scenarioHash": "<same hash>",
  "outcome": "reproduced",
  "testedBuild": "target",
  "stepResults": [
    {
      "stepId": "open-dialog",
      "status": "fail",
      "actual": "Focus moved, but no dialog title was spoken",
      "evidence": ["speech-before"]
    }
  ],
  "evidence": [
    {
      "id": "speech-before",
      "type": "nvda-transcript",
      "uri": "twin-evidence://<run>/before.log",
      "sha256": "<sha256>"
    }
  ],
  "notes": []
}
```

Allowed outcomes:

| Phase | Outcomes |
|---|---|
| reproduce | `reproduced`, `not-reproduced`, `blocked`, `inconclusive` |
| verify | `pass`, `fail`, `blocked`, `inconclusive` |

Every outcome retains all declared evidence types and links them to each attempted step. A blocked
artifact records the exact missing authorization, fixture, tool, or environment in the applicable
log/transcript rather than silently omitting that artifact. An inconclusive artifact records why
the captured evidence could not distinguish pass from fail.

A verify result repeats `baselineEvidenceSha256` and adds `testedCommitSha`. `pass` requires every
step to pass, every step to link its declared evidence types, and every top-level required evidence
type to be present. The validator resolves `git HEAD` from `--repo-root`; request `commitSha`,
result `testedCommitSha`, and the exact `commit:<HEAD>` build selector must all match it.

## Evidence types

Use the narrowest applicable type:

- `screenshot`
- `playwright-trace`
- `accessibility-tree`
- `axe`
- `keyboard-focus`
- `ui-automation`
- `nvda-transcript`
- `narrator-etl`
- `voice-access-result`
- `voice-access-audio`
- `contrast-measurement`
- `zoom-reflow`

The validator rejects unknown evidence types and enforces:

- every request includes `screenshot`;
- NVDA includes `nvda-transcript`;
- Narrator includes `narrator-etl`;
- Voice Access includes both `voice-access-result` and `voice-access-audio`;
- Keyboard includes `keyboard-focus`;
- Windows UI Automation includes `ui-automation`;
- every test step links the required evidence for its declared assistive technology.

Each artifact has a stable URI and SHA-256. Paths may remain on a private Twin evidence store; the
PR receives only reviewer-safe attachments. Never attach credentials, cookies, browser profiles,
raw tokens, private user data, or unrelated screen content.

## Gates

1. No valid reproduce result: no branch, edit, build, or PR.
2. `not-reproduced`, `blocked`, or `inconclusive`: stop without fixing.
3. Verify scenario/hash mismatch: invalid evidence.
4. Missing required type/hash/step: invalid evidence.
5. Verify `fail`: fix and replay, maximum three implementation cycles.
6. Verify `blocked` or `inconclusive`: stop; A11y mode cannot ship an unverified draft.
7. Verify `pass`: run reviewer, then attach reviewer-safe evidence to the PR description.

Validate each result with:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/validate-a11y-evidence.mjs" \
  --phase verify \
  --request "<verify-request>" \
  --result "<verify-result>" \
  --baseline-request "<reproduce-request>" \
  --baseline-result "<reproduce-result>" \
  --repo-root "/workspaces/odsp-web"
```
