# agentOW Accessibility mode

This directory is the versioned knowledge and contract boundary for `/agentow-a11y`. The standard
agentOW planner/evaluator flow does not load it unless Accessibility is the primary bug.

## Responsibilities

| Layer | Owns |
|---|---|
| Twinbot on DevBox | Real assistive technology, Windows UI Automation, OS input, ETW, audio, browser foreground, screenshots, evidence hashes |
| agentOW in Codespace | Request contract, source lookup, implementation, build, evidence validation, review, branch, PR |
| `a11y-evaluator` | Independent validation of Twin-produced reproduce/verify evidence |

agentOW must not remotely control or emulate DevBox assistive technology. Twinbot must not modify
the odsp-web worktree.

## Source priority

Read the sources applicable to the bug in this order:

1. The bug's exact expected behavior and repro steps.
2. Existing odsp-web implementation and its v8/predecessor behavior, including load-bearing A11y
   comments and timing.
3. SPDS/Fluent component accessibility contract; prefer the component's native behavior.
4. Jimu team guidance and the ADO `odsp-automation-test-tool` `skills/a11y-test` procedures.
5. WCAG 2.2 AA success criteria and Microsoft platform guidance.

Do not paste private Jimu/owner documents into the repository or PR. Record only the portable rule,
source title/URL when shareable, and evidence needed by a reviewer.

## Test pyramid

- NVDA + captured speech for repeatable daily screen-reader regression.
- Narrator + Narrator/UIAutomationCore/Speech-TTS ETW for Narrator-specific behavior.
- Voice Access + virtual audio capture + visible state proof for real voice-command behavior.
- Real OS-level keyboard input for screen-reader focus/navigation. CDP keyboard injection is not
  equivalent evidence because it may not generate the Win32/UIA events consumed by screen readers.
- Playwright accessibility tree and axe are supporting diagnostics, not substitutes for real AT.

Never run NVDA and Narrator simultaneously.

## Rule selection

Map the observed user impact to the most precise applicable criterion. Common mappings:

| Failure | Typical criterion |
|---|---|
| Missing/wrong name, role, state, or value | 4.1.2 |
| Broken structural relationship or reading order | 1.3.1 |
| Visible label not contained in accessible name | 2.5.3 |
| Ambiguous heading or control label | 2.4.6 |
| Focus missing, obscured, trapped, or restored incorrectly | 2.4.3, 2.4.7, 2.4.11 |
| Status/error/loading change not announced | 4.1.3 |
| Keyboard operation unavailable | 2.1.1 |
| Reflow/zoom loss | 1.4.10 |
| Contrast failure | 1.4.3 or 1.4.11 |

WCAG mapping classifies the defect. It does not prove reproduction or repair.

## Implementation rules

- Attempt real-AT reproduction before reading toward a fix. Do not infer reproduction from source.
- Make up to three meaningful attempts to repair an available Twin, request, environment, or
  evidence path. Do not repeat an identical unavailable operation just to increase the count.
- If all available evidence routes are exhausted, continue only through the explicitly labeled
  `unverified-fallback`: use the concrete bug report and source knowledge to implement the smallest
  plausible fix, run all available supporting checks, obtain code review, and create a draft PR.
- Missing real-AT evidence remains `INCONCLUSIVE`, never PASS. The fallback PR must identify every
  unavailable evidence type, attempt, blocker, and residual risk, and must not contain fabricated
  BEFORE/AFTER evidence or accessibility-validation claims.
- A valid real-AT result showing that the changed product still fails is not a validator outage and
  cannot use the fallback while that demonstrated failure remains.
- Read the predecessor/native component before hand-writing ARIA, announcement timing, focus
  management, screen-reader-only styles, or keyboard behavior.
- Preserve behavior outside the requested A11y defect.
- Do not add a test merely to satisfy the pipeline; follow repository and user test policy.
- Never hide a native semantic problem with an unverified `aria-*` patch.
- AFTER must replay the exact scenario hash used for BEFORE.
- Evidence declarations cannot weaken the gate: the validator maps NVDA, Narrator, Voice Access,
  Keyboard, and Windows UI Automation to mandatory AT-specific artifact types for every step.

See:

- `evidence-contract.md` for the artifact handshake.
- `pr-evidence-capture-guide.md` for the normative screenshot, recording, annotation, exact-HEAD,
  PR attachment, and actual PR-page acceptance requirements.
