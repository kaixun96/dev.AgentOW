# AgentOW review contract

The reviewer is an independent pre-PR quality gate, not a summary generator. Author and reviewer work as a pair to improve the product: a defect found before merge is a customer issue and downstream investigation avoided, not a personal failure by the author. Reviews should be direct, respectful, evidence-backed, and educational without weakening the merge standard.

## Before reviewing code

Spend a short, bounded orientation pass on the request, plan, PR title/description when available, linked work item, feature design, or bug reproduction. Record:

1. what issue or feature the change claims to address;
2. whether the change is necessary and appropriately scoped;
3. whether the implementation direction matches that intent;
4. which acceptance criteria and user-visible behaviors must remain true.

Missing optional context is not itself a defect, but the reviewer must state what was unavailable and must not invent intent. A change that materially mismatches its stated purpose is blocking.

### Reviewability gate

Before detailed review, decide whether the change can be reviewed reliably as one unit. This is not the same as whether an agent can read every line. Measure Git numstat, then enumerate independent behavior units and high-risk domains (for example security, permissions, destructive writes, privacy/telemetry, shared UI, migration compatibility, or performance).

- At 5,000 or more total changed lines, the change is always `must-split`; generated/mechanical claims cannot override this hard ceiling.
- At 2,000 or more substantive changed lines, the change is always `must-split`.
- At 40 or more files, three or more independent behavior units, or four or more high-risk domains, presume `must-split`.
- A structurally large change below 2,000 substantive lines may remain reviewable only when it is one coherent behavior unit spanning at most two high-risk domains and every changed path has numstat-bound mechanical/generated evidence.
- Reading every file, spending more time, or finding several defects is not evidence that the review is exhaustive.

A `must-split` review still performs a preliminary risk scan so known defects are not lost, but it must:

1. add an Important `reviewability` finding;
2. state that findings are preliminary and non-exhaustive;
3. propose at least two distinct, evidenced, independently reviewable split boundaries;
4. never APPROVE or imply that no additional defects remain.

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
    "profiles": ["global", "sp-client when any changed path is under sp-client/"],
    "rolloutProtection": {
      "runtimePaths": ["sp-client/src/example.ts"],
      "reviewContext": "existing-pr|pre-pr",
      "descriptionStatus": "documented|missing|planned",
      "descriptionEvidence": ["artifact:pr-description"],
      "protectionStatus": "protected|incomplete|unprotected|not-applicable",
      "gateType": "killswitch|flight|killswitch+flight|unprotected|not-applicable",
      "gateIdentifiers": ["<KS/Flight name or ID>"],
      "existingUpstreamGate": false,
      "entryPointEvidence": ["sp-client/src/entry.ts:1"],
      "gateCheckEvidence": ["sp-client/src/entry.ts:10"],
      "newPathEvidence": ["sp-client/src/example.ts:1"],
      "fallbackEvidence": ["sp-client/src/entry.ts:12"],
      "newPathState": "ks-not-activated|flight-enabled|ks-not-activated-and-flight-enabled",
      "fallbackState": "ks-activated|flight-disabled|ks-activated-or-flight-disabled",
      "disabledStateTestEvidence": ["sp-client/src/example.test.ts:1"],
      "pathCoverage": [
        {
          "path": "sp-client/src/example.ts",
          "changedEvidence": ["sp-client/src/example.ts:1"],
          "gateEvidence": ["sp-client/src/entry.ts:10"],
          "fallbackEvidence": ["sp-client/src/entry.ts:12"],
          "conclusion": "<how this exact changed runtime path is protected>"
        }
      ],
      "conclusion": "<exact gate coverage result>"
    },
    "reviewLedger": {
      "status": "applied|absent",
      "ledgerPath": "<path consulted>",
      "entryCount": 0,
      "carriedCount": 0
    },
    "priorArt": [
      {
        "symbol": "<symbol exported from a shared-code path>",
        "path": "<changed path where it is defined>",
        "searched": "<repo search performed>",
        "result": "none|reused|justified",
        "existing": "<path:line of the implementation that already exists>",
        "justification": "<why the existing implementation cannot be used>"
      }
    ],
    "externalContracts": [
      {
        "symbol": "<external symbol the change relies on>",
        "module": "<package or library it comes from>",
        "verifiedBehavior": "<what its source actually does>",
        "evidence": "<path:line outside the changed set>"
      }
    ],
    "profileChecks": [
      {
        "id": "<profile-defined check ID>",
        "status": "reviewed|not-applicable",
        "evidence": ["src/example.ts:1"],
        "reason": "<required when not applicable>",
        "conclusion": "<specific result>"
      }
    ],
    "reviewability": {
      "status": "reviewable|must-split",
      "changedFileCount": 1,
      "additions": 10,
      "deletions": 2,
      "generatedOrMechanicalLines": 0,
      "mechanicalBreakdown": [],
      "independentBehaviorUnits": [{ "name": "<behavior unit>", "paths": ["src/example.ts"] }],
      "highRiskDomains": ["<applicable risk domain>"],
      "rationale": "<why one review is or is not reliable>",
      "completenessClaim": "exhaustive|preliminary-non-exhaustive",
      "splitBoundaries": [{ "name": "<independent split>", "paths": ["src/example.ts"], "rationale": "<why this is independently reviewable>", "evidence": ["src/example.ts:1"] }]
    }
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
  "findings": [
    {
      "id": "<finding ID>",
      "severity": "Critical|Important|Minor",
      "category": "<dimension key>",
      "path": "<changed path>",
      "line": 1,
      "description": "<what is wrong>",
      "impact": "<what it costs>",
      "suggestedFix": "<the change to make>",
      "evidence": ["<path:line>"],
      "classSweep": {
        "query": "<regex describing the defect class>",
        "scope": ["<every changed file swept>"],
        "accountedFor": ["<path:line found and explained rather than reported>"]
      }
    }
  ],
  "previouslyAccepted": [],
  "counts": { "critical": 0, "important": 0, "minor": 0 }
}
```

Every behavior unit path must be Git-changed, and their union must cover every changed file. Every non-zero `generatedOrMechanicalLines` claim requires `mechanicalBreakdown` entries with a changed path, exact line count, specific rationale, and cited generation/mechanical evidence. Entry lines must sum exactly to the claim, and the aggregate claimed for each path cannot exceed that path's Git numstat churn. A structural large-change exception requires mechanical evidence for every changed path. A `must-split` report requires at least two distinct `splitBoundaries`, each with a specific name, changed paths, rationale, and evidence. Their union must cover every changed file; multi-file changes cannot assign a path to multiple splits. Its summary must explicitly say the scan is preliminary or non-exhaustive.

The complete set of dimension keys is enforced by `tools/validate-review-report.mjs`.

`preReview.profiles` records the applied standards. It always includes `global`; when any changed file is under `sp-client/`, it must also include `sp-client` and the reviewer must read `docs/sp-client-review-profile.md`.

For SP-Client, `preReview.rolloutProtection` is mandatory. The validator derives runtime paths from Git and requires exact coverage. `protected` runtime changes require documented/planned gate metadata, identifiers, code citations for entry/gate/new/fallback paths, correct direction, disabled-state test evidence, and one `pathCoverage` entry for every Git-derived runtime path. Each entry must cite that exact changed file plus its gate and fallback. `incomplete` and `unprotected` states let the reviewer report missing coverage, wrong direction, fallback, or tests, but require a Critical or Important `rolloutProtection` finding. A `missing` PR-description status also requires that finding. `not-applicable` is accepted only when Git contains no SP-Client runtime path.

## Validation and orchestration

Before accepting the verdict, the orchestrator runs:

```bash
git diff --no-renames --name-only <mergeBase>...HEAD > <sessionDir>/review-changed-files.txt
git diff --no-renames --numstat <mergeBase>...HEAD > <sessionDir>/review-numstat.txt
node "${CLAUDE_PLUGIN_ROOT}/tools/validate-review-report.mjs" \
  <sessionDir>/review.json \
  --expected-head "$(git rev-parse HEAD)" \
  --expected-diff-digest "$(git diff --no-renames <mergeBase>...HEAD | sha256sum | cut -d' ' -f1)" \
  --changed-files <sessionDir>/review-changed-files.txt \
  --diff-numstat <sessionDir>/review-numstat.txt
```

Malformed, incomplete, or stale review output is a reviewer-spec failure. Re-dispatch the reviewer once against the unchanged implementation. It does not consume a product fix cycle. If validation still fails, stop rather than shipping an unsupported approval.

Any Critical or Important finding enters the product fix loop. After code changes, run a new review against the new commit; never reuse an earlier verdict.

## Review ledger

A branch is reviewed many times: once per fix cycle, and again whenever anyone re-reviews the shipped PR. Because a verdict is never reused, each of those runs starts blank, so an issue that was already raised and consciously accepted is raised again. A PR that was reviewed to completion therefore keeps collecting the same comments.

The ledger is the memory that fixes this. It records, per branch, the findings that were accepted rather than fixed.

Identity cannot be the line number, the category, or the wording; all three drift between reviews of the same defect. In one real run the same magic constant was reported as `maintainability` at line 146, then `designMaintainability` at line 152, then again at 146. What stayed constant was the source line being complained about, so `tools/review-ledger.mjs` anchors identity to that text and hashes it with the path. When the code is edited the anchor stops matching and the finding is correctly treated as new.

The reviewer must, before finalizing:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/review-ledger.mjs" match \
  --report <sessionDir>/review.json --ledger <ledgerPath> --repo /workspaces/odsp-web
```

Every finding the matcher reports as `carried` belongs in `previouslyAccepted`, not in `findings`. Re-raising an accepted finding is a reviewer-spec failure, and the orchestrator's validator re-runs the match itself rather than trusting the claim.

## Findings are classes, not lines

A finding names a defect class that happened to be spotted at one location. Reporting the
location and moving on is how a second instance of the same defect ships: the author fixes the
line that was cited, and the one that was not stays broken.

Every Critical and Important finding therefore carries `classSweep`:

```json
"classSweep": {
  "query": "<regex describing the defect class>",
  "scope": ["<every changed file swept>"],
  "accountedFor": ["<path:line found and explained rather than reported>"]
}
```

- `query` must match the finding's own cited line. A query that does not match the defect it
  reports is measuring something else.
- `scope` must include every changed file that shares the cited file's extension. Sweeping only
  the file the defect was spotted in reproduces the miss this exists to prevent.
- Every line the query matches inside `scope` must be accounted for: reported as its own
  finding, or listed in `accountedFor` because that instance is genuinely safe.

The validator runs `query` itself over `scope` and rejects the report when a match is left
unaccounted for, so the sweep cannot be claimed without being performed. `reviewability`
findings are exempt, because they describe the shape of the change rather than a code pattern.

## Capability the platform already provides

Every other dimension asks whether the change is wrong. This one asks whether it should exist.
Shared code is where capability gets reinvented — a hand-rolled announcement helper, a wrapper
around a formatting utility the repo already uses in hundreds of files, a literal where a token
with that exact value is defined.

`preReview.priorArt` answers each symbol exported from a shared-code path — any path with a
`common`, `shared`, `utilities`, `utils`, `helpers`, `hooks`, or `components` segment — against
what already exists:

- `none` — the search found nothing equivalent;
- `reused` — an existing implementation was adopted, cited in `existing`;
- `justified` — a new implementation is kept, cited against `existing` with a `justification`.

The validator derives the symbol list from the changed sources rather than from the report, so
an export cannot be skipped by not mentioning it. Feature pages and layouts are exempt: they
are inherently novel, and demanding a search for each one is noise.

## Contracts the change depends on

Consumer analysis looks downstream, at who calls the changed code. Defects also live upstream,
in what the changed code calls and what that thing actually promises — a component's treatment
of its children, a platform structure's units or time base, a monitor's event lifecycle, a
type's real exported shape. Code that relies on a wrong assumption about a dependency reads
correctly in isolation; only the dependency's source shows the defect.

`preReview.externalContracts` records each external symbol whose semantics the change depends
on for correctness, with `evidence` citing that symbol's own source. The cited path must be
outside the changed set — a contract cannot be evidenced from the file under review. When the
change genuinely relies on no external contract, use an empty array plus
`preReview.externalContractsNotApplicableReason`.

`preReview.reviewLedger` is mandatory:

```json
"reviewLedger": {
  "status": "applied|absent",
  "ledgerPath": "<path consulted>",
  "entryCount": 0,
  "carriedCount": 0
}
```

`absent` is valid only when no ledger exists yet for the branch, and then `entryCount` and `carriedCount` must both be `0`.

`previouslyAccepted` lists what was carried forward, so the artifact stays self-describing:

```json
"previouslyAccepted": [
  { "fingerprint": "<32-char hash>", "path": "src/example.ts", "reason": "<why it was accepted>" }
]
```

A carried finding is not counted in `counts` and does not affect the verdict. Carrying an accepted nit forward is not approval of the code; it is a record that the decision was already made.

## Disposing of Minor findings

A Minor finding that is neither fixed nor recorded is the direct cause of a shipped PR that still comments on itself. Before shipping, every Minor must be either:

- **fixed**, so the anchor changes and the finding disappears on its own; or
- **accepted**, with a reason recorded in the ledger and rendered into the PR description.

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/review-ledger.mjs" accept \
  --report <sessionDir>/review.json --ledger <ledgerPath> \
  --accept MINOR-1="<why this does not need to block or change this PR>" \
  --repo /workspaces/odsp-web --branch <branch>
```

The reason must be a reason, not a restatement: the tool rejects anything under 40 characters or equal to the finding description. A shipped PR carries the accepted set in its description so that a reviewer on another machine, agent or human, sees the same decisions.

