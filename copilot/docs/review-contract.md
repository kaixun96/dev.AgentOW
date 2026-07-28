# AgentOW review contract

The reviewer is an independent pre-PR quality gate, not a summary generator. It reviews the committed diff and surrounding code with an adversarial posture: identify how the change could fail, then prove or disprove each credible failure mode with repository evidence.

## Required two-pass method

### Pass 1: risk and scope inventory

1. Compute `mergeBase`, `reviewedHead`, and the SHA-256 digest of `git diff <mergeBase>...HEAD`.
2. Enumerate every changed file from Git. Never trust a caller-provided list as complete. For deleted files, read the merge-base version.
3. Classify each file as low, medium, or high risk with a concrete rationale.
4. Identify affected contracts, direct callers/consumers, tests, configuration, generated artifacts, and routed instructions/context.

### Pass 2: adversarial verification

Trace the risky paths through the full changed files and relevant consumers. Check every canonical dimension:

- behavior and acceptance criteria;
- callers and consumers;
- tests and regression coverage;
- types and API/data contracts;
- errors, cleanup, concurrency, and edge cases;
- security and privacy;
- performance and allocation;
- accessibility and UI behavior;
- localization;
- compatibility and killswitch behavior;
- repository instructions and routed context;
- dependencies, generated artifacts, and tooling.

Each dimension must be `reviewed` with `file:line`, `command:...`, or `artifact:...` evidence, or `not-applicable` with a specific reason explaining why the dimension cannot affect this diff. Generic claims such as "looks good", "standard change", or "not applicable" are invalid evidence.

Every changed file must include non-empty consumer and test evidence. A file cannot cite itself (including through a normalized path alias) as its direct consumer, and file-based test evidence must point to a test/spec file or directory rather than a helper whose name merely contains "test". When no consumer or test exists, use the canonical safe form `command:rg <consumer-query|test-query> <repo-relative-bounded-path> => no matches` (an optional `--glob <glob>` is allowed). Shell composition, absolute/parent/root paths, arbitrary commands, and artifact references are invalid substitutes. Explain why absence is safe; an empty array or padded "not applicable" statement is invalid. Reviewed dimensions require distinct conclusions that name the dimension-specific concern, rather than repeated boilerplate with counters or dimension names appended.

## Severity and verdict

| Severity | Meaning | Result |
|---|---|---|
| Critical | Credible security, data loss, outage, severe functional, or visible layout regression | Must fix |
| Important | Credible correctness, contract, consumer-impact, maintainability, missing-test, accessibility, performance, or instruction-compliance defect that should not merge | Must fix |
| Minor | Non-blocking improvement with no credible merge risk | Comment only |

Style preference and speculative redesign are not findings.

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
