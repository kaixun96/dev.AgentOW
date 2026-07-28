# AgentOW review contract

The reviewer is an independent pre-PR quality gate, not a summary generator. Author and reviewer work as a pair to improve the product: a defect found before merge is a customer issue and downstream investigation avoided, not a personal failure by the author. Reviews should be direct, respectful, evidence-backed, and educational without weakening the merge standard.

## Before reviewing code

Spend a short, bounded orientation pass on the request, plan, PR title/description when available, linked work item, feature design, or bug reproduction. Record:

1. what issue or feature the change claims to address;
2. whether the change is necessary and appropriately scoped;
3. whether the implementation direction matches that intent;
4. which acceptance criteria and user-visible behaviors must remain true.

Missing optional context is not itself a defect, but the reviewer must state what was unavailable and must not invent intent. A change that materially mismatches its stated purpose is blocking.

## Required two-pass method

### Pass 1: risk and scope inventory

1. Compute `mergeBase`, `reviewedHead`, and the SHA-256 digest of `git diff <mergeBase>...HEAD`.
2. Enumerate every changed file from Git. Never trust a caller-provided list as complete. For deleted files, read the merge-base version.
3. Classify each file as low, medium, or high risk with a concrete rationale.
4. Identify affected contracts, direct callers/consumers, tests, configuration, generated artifacts, and routed instructions/context.

### Pass 2: adversarial verification

Trace the risky paths through the full changed files and relevant consumers. Check every canonical dimension:

- behavior and acceptance criteria;
- design and maintainability;
- callers and consumers;
- tests and regression coverage;
- types and API/data contracts;
- errors, cleanup, concurrency, and edge cases;
- security and privacy;
- performance and allocation;
- accessibility and UI behavior;
- localization;
- compatibility and killswitch behavior;
- telemetry;
- repository instructions and routed context;
- dependencies, generated artifacts, and tooling.

Each dimension must be `reviewed` with `file:line`, `command:...`, or `artifact:...` evidence, or `not-applicable` with a specific reason explaining why the dimension cannot affect this diff. Generic claims such as "looks good", "standard change", or "not applicable" are invalid evidence.

Every changed file must include non-empty consumer and test evidence. A file cannot cite itself (including through a normalized path alias) as its direct consumer, and file-based test evidence must point to a test/spec file or directory rather than a helper whose name merely contains "test". When no consumer or test exists, use the canonical safe form `command:rg <consumer-query|test-query> <repo-relative-bounded-path> => no matches` (an optional `--glob <glob>` is allowed). Shell composition, absolute/parent/root paths, arbitrary commands, and artifact references are invalid substitutes. Explain why absence is safe; an empty array or padded "not applicable" statement is invalid. Reviewed dimensions require distinct conclusions that name the dimension-specific concern, rather than repeated boilerplate with counters or dimension names appended.

Apply these concrete standards when relevant:

- Prefer clear, minimal design; flag unnecessary change, deprecated APIs, unexplained hardcoding, duplicated logic, weak naming, overly broad types, unsafe non-null assertions, and public contracts without adequate documentation.
- Comments explain why, not what. A `TODO` requires a linked work item; avoid leaving deferred work when it is required for correctness.
- New or changed behavior needs meaningful unit/regression coverage unless a specific, evidence-backed reason makes a test impractical.
- Handle API failures and cleanup paths explicitly. Never branch on localized API error-message text.
- New behavior preserves a safe killswitch/flight-off fallback and browser compatibility where applicable.
- Interactive UI is keyboard focusable and exposes correct role, state, and accessible name. Check light, dark, and high-contrast behavior, including a 4.5:1 text contrast target.
- Localize eligible UI strings through resources/placeholders and use i18n utilities for date, number, currency, address, and phone formatting. Do not localize brand names, usernames, user input, or telemetry.
- Do not log personal data, resource names, or tenant-location data where policy forbids it; do not prefill user feedback with user/resource data.
- Inspect telemetry for data classification, useful success/failure coverage, stable event semantics, and absence of sensitive payloads.
- Treat unexplained bundle-size growth, credible hot-path regressions, and UI that conflicts with common design as blocking until measured or confirmed.

## Blocking rules

Request changes when any of these are credible and evidenced:

- the change is too large to review reliably and must be split;
- logic is wrong, behavior regresses, or implementation materially mismatches the stated intent;
- the design creates an avoidable correctness or maintainability risk;
- privacy/security policy is violated or required review is missing;
- significant size or performance risk is unmeasured;
- changed behavior lacks unit/regression coverage without a specific good reason;
- UI is inaccessible, visibly broken, or conflicts with the approved/common design without designer confirmation.

Optional manual testing may supplement evidence, but never substitutes for code, test, and artifact analysis.

## Severity and verdict

| Severity | Meaning | Result |
|---|---|---|
| Critical | Credible security, data loss, outage, severe functional, or visible layout regression | Must fix |
| Important | Credible correctness, contract, consumer-impact, maintainability, missing-test, accessibility, performance, or instruction-compliance defect that should not merge | Must fix |
| Minor | Non-blocking educational improvement with no credible merge risk | Prefix the description with `Nit:`; comment only |

Style preference and speculative redesign are not findings.

`Nit:` is never mandatory for the current PR. If an issue must be resolved before merge, classify it as Critical or Important instead of disguising it as a nit.

Verdicts are deterministic:

- `REQUEST_CHANGES`: one or more Critical or Important findings.
- `COMMENT`: Minor findings only.
- `APPROVE`: zero findings and complete, current-diff coverage.

Draft PR status, AUTO mode, and retry limits do not turn unresolved blocking findings into approval.

## Canonical artifact

The reviewer writes both a concise `review.md` and a machine-readable `review.json`:

```json
{
  "schemaVersion": 1,
  "reviewedHead": "<40-char commit>",
  "mergeBase": "<40-char commit>",
  "diffDigest": "<64-char sha256>",
  "verdict": "APPROVE|COMMENT|REQUEST_CHANGES",
  "summary": "<grounded summary>",
  "preReview": {
    "intent": "<issue or feature being addressed>",
    "evidence": ["artifact:<plan/request/work-item evidence>"],
    "necessityAndScope": "<why the change is necessary and appropriately scoped>",
    "intentMatch": "<whether implementation matches the stated intent>",
    "profiles": ["global", "sp-client when any changed path is under sp-client/"]
  },
  "riskMap": [
    {
      "path": "src/example.ts",
      "risk": "low|medium|high",
      "rationale": "<specific risk>"
    }
  ],
  "coverage": {
    "changedFiles": [
      {
        "path": "src/example.ts",
        "reviewedWholeFile": true,
        "evidence": ["src/example.ts:42"],
        "directConsumersChecked": ["src/caller.ts:19"],
        "consumerDisposition": "<consumer impact or why none exist>",
        "testsChecked": ["src/example.test.ts:20"],
        "testDisposition": "<coverage result or why tests are not applicable>",
        "disposition": "<what was verified>"
      }
    ],
    "dimensions": {
      "behavior": { "status": "reviewed", "evidence": ["src/example.ts:42"], "conclusion": "<result>" }
    }
  },
  "secondPass": {
    "completed": true,
    "checks": [
      {
        "hypothesis": "<credible failure mode>",
        "evidence": ["src/example.ts:42"],
        "result": "<proved safe or finding ID>"
      }
    ]
  },
  "findings": [],
  "counts": { "critical": 0, "important": 0, "minor": 0 }
}
```

The complete set of dimension keys is enforced by `tools/validate-review-report.mjs`.

`preReview.profiles` records the applied standards. It always includes `global`; when any changed file is under `sp-client/`, it must also include `sp-client` and the reviewer must read `docs/sp-client-review-profile.md`.

## Validation and orchestration

Before accepting the verdict, the orchestrator runs:

```bash
git diff --name-only <mergeBase>...HEAD > <sessionDir>/review-changed-files.txt
node "${CLAUDE_PLUGIN_ROOT}/tools/validate-review-report.mjs" \
  <sessionDir>/review.json \
  --expected-head "$(git rev-parse HEAD)" \
  --expected-diff-digest "$(git diff <mergeBase>...HEAD | sha256sum | cut -d' ' -f1)" \
  --changed-files <sessionDir>/review-changed-files.txt
```

Malformed, incomplete, or stale review output is a reviewer-spec failure. Re-dispatch the reviewer once against the unchanged implementation. It does not consume a product fix cycle. If validation still fails, stop rather than shipping an unsupported approval.

Any Critical or Important finding enters the product fix loop. After code changes, run a new review against the new commit; never reuse an earlier verdict.
