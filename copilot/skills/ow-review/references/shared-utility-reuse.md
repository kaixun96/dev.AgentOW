# Shared utility reuse review reference

Use this reference when changed code adds or substantially rewrites a helper, utility, formatter,
parser, normalizer, wrapper, adapter, cross-cutting hook or component, test helper, or repeated
implementation. Before approving net-new utility code, establish whether an existing
implementation fits the caller's actual contract. Reuse is a means to preserve contracts and
reduce drift, not a goal by itself.

## Reuse-first workflow

### 1. Detect likely reinvention

Inspect changed files and symbols for:

- names containing `util`, `helper`, `formatter`, `parser`, `normalizer`, `wrapper`, `adapter`,
  `client`, or `shared`;
- local placeholder substitution, URL or encoding logic, error normalization, feature-gate
  helpers, REST/OData clients, design constants, or Playwright setup, wait, or authentication
  logic;
- thin wrappers over existing APIs;
- copied logic with small naming or option differences;
- feature-local code whose behavior is likely useful across packages.

Do not limit this pass to exported symbols or directories named `shared`, `utilities`, or
`components`. A feature-local helper can still duplicate a platform implementation.

### 2. Search by capability and dependency context

Search for what the code does, not only the new symbol's name. Use input/output concepts,
protocol terms, error shapes, placeholders, headers, and representative call sites. Then check:

- the high-signal package map below;
- imports and dependencies already used by the changed package and nearby packages;
- implementations with the same input/output and failure contract;
- callers of candidate APIs, which often reveal supported options and runtime boundaries;
- deprecated annotations, ownership, maturity, and bundle/externalization constraints.

Record applicable shared-export searches in `preReview.priorArt` as required by the review
contract. For likely utility code outside that schema, retain the search command and conclusion
in the relevant review evidence. This reference broadens discovery to any changed path; it does
not broaden the artifact schema by inventing entries.

### 3. Prove contract fit before requesting reuse

Open the candidate source and representative callers. Verify the candidate:

- preserves required error bodies, details, rejection behavior, and expected-absence handling;
- uses compatible protocol, OData flavor, URL, serialization, and header defaults;
- supports required authentication, request-digest, write, cancellation, and retry flows;
- has the necessary options, verbs, input domain, and output shape;
- is not deprecated or at the wrong maturity/stability level;
- is allowed across the caller's package, runtime, layering, and bundle boundaries;
- does not introduce a dependency or bundle cost that defeats the intended architecture.

A name match is not proof of compatibility. Never force reuse that weakens behavior or crosses an
invalid ownership boundary.

### 4. Choose the smallest sound outcome

- **Exact fit:** use the existing implementation in this PR.
- **Small contract gap:** extend the owning shared utility when that ownership is stable and the
  extension does not distort its API.
- **No fit, one-off behavior:** keep the local implementation with a concise rationale.
- **No fit, demonstrated cross-cutting behavior:** extract to the appropriate shared owner now
  when the consumers and stable contract are known. If immediate extraction would make the PR
  materially less reviewable, keep the local implementation with a concrete work item, owner,
  and proposed shared boundary.
- **Pure pass-through:** call the underlying API directly unless the wrapper adds a real contract,
  policy, typing boundary, observability, dependency seam, or migration boundary.

## High-signal ODSP-Web reuse map

These are starting points, not an exhaustive allowlist. Search the changed package's dependencies
and current repository source before concluding that no candidate exists.

### Core runtime utilities

| Package | Repository path |
|---|---|
| `@msinternal/odsp-utilities` | `odsp-common/odsp-utilities` |
| `@msinternal/utilities-strings` | `odsp-common/utilities/strings` |
| `@msinternal/utilities-error` | `odsp-common/utilities/error` |
| `@msinternal/utilities-features` | `odsp-common/utilities/features` |
| `@msinternal/utilities-url` | `odsp-common/utilities/url` |
| `@msinternal/utilities-resources` | `odsp-common/utilities/resources` |
| `@msinternal/utilities-guid` | `odsp-common/utilities/guid` |

### SP-Client shared utilities

| Package | Repository path |
|---|---|
| `@msinternal/sp-component-utilities` | `sp-client/libraries/sp-component-utilities` |
| `@msinternal/sp-client-shared` | `sp-client/libraries/sp-client-shared` |
| `@msinternal/sp-webpart-shared` | `sp-client/libraries/sp-webpart-shared` |
| `@msinternal/sp-webpart-shared-editmode` | `sp-client/libraries/sp-webpart-shared-editmode` |
| `@msinternal/sp-page-router-shared` | `sp-client/libraries/sp-page-router-shared` |

### SPFx externalized utility bundles

| Package | Repository path |
|---|---|
| `@msinternal/odsp-utilities-bundle` | `sp-client/spfx-externals/odsp-utilities-bundle` |
| `@msinternal/sp-fluentui-v9-utilities-bundle` | `sp-client/spfx-externals/sp-fluentui-v9-utilities-bundle` |
| `@msinternal/sp-fluentui-migration-utilities-bundle` | `sp-client/spfx-externals/sp-fluentui-migration/sp-fluentui-migration-utilities-bundle` |
| `@msinternal/i18n-utilities` | `sp-client/spfx-externals/i18n-utilities` |

### Design-system utilities and tokens

| Package | Repository path |
|---|---|
| `@msinternal/sharepoint-ui-react-utilities` | `design-systems/sharepoint/react-utilities` |
| `@msinternal/sharepoint-ui-tokens` | `design-systems/sharepoint/tokens` |
| `@msinternal/onedrive-ui-tokens` | `design-systems/onedrive/tokens` |

### Test utilities

| Package | Repository path |
|---|---|
| `@msinternal/playwright-utilities` | `tools/playwright-utilities` |
| `@msinternal/playwright-tab-utilities` | `tools/playwright-tab-utilities` |
| `@msinternal/playwright-knowledge-agent-utilities` | `tools/playwright-knowledge-agent-utilities` |
| `@msinternal/playwright-tests-rig` | `tools/playwright-tests-rig` |

## High-value anti-patterns

- Hand-rolled placeholder/string formatting when `Text.format`, `StringHelper`, or another
  established formatter fits.
- New REST/OData clients without checking existing providers and protocol helpers.
- Duplicated error parsing or normalization that can diverge in propagation and telemetry.
- Pass-through wrappers with no added contract or policy.
- Copy-pasted utilities with superficial naming changes.
- Recreated Playwright authentication, setup, waits, fixtures, or page utilities.
- Helpers that combine raw data extraction with UI presentation formatting. Return structured
  data from the utility and format it at the composition boundary unless presentation is the
  explicit reusable contract.
- A new helper that consolidates only some in-scope copies and leaves parallel behavior behind.

## Compare copies before judging duplication

When the changed set or nearby implementation contains multiple copies of the capability:

1. Count the copies and diff them mechanically where practical.
2. Compare behavior, defaults, flags, error handling, and edge cases rather than syntax alone.
3. If the copies disagree, report the concrete divergence and affected behavior. Do not reduce a
  correctness defect to a generic reuse suggestion.
4. If the copies agree, judge reuse using contract fit, ownership, and drift risk. Repetition by
  itself is not automatically blocking.

This rule subsumes the former duplication-specific entry in `docs/review-misses.md`. The broader
M1 rule still applies when the diff performs the same operation inconsistently even without a
new utility abstraction.

## Severity and evidence

Use the review contract's `Critical`, `Important`, and `Minor` severities; do not invent a separate
"Improvement" verdict category.

- **Critical:** duplication or incompatibility creates a credible severe security, privacy, data
  loss, or outage path. Use the review contract's threshold; duplication does not raise severity
  by itself.
- **Important:** copies have diverged in behavior; duplicated code creates a concrete auth,
  URL-validation, protocol, data-integrity, localization, runtime-correctness, or broad consumer
  risk; or a pass-through/mixed-responsibility abstraction creates contract risk that should not
  merge. Name the existing symbol or the smallest compatible shared extension when one exists.
- **Minor:** behavior is correct and the issue is optional readability or low-risk duplication.
  Prefix the finding with `Nit:`. Comment density and minor placement/naming preferences belong
  here unless they hide a real contract defect.
- **No finding:** no candidate fits, the implementation is genuinely local, or reuse would cross
  an invalid dependency/layer boundary. Record the searched evidence and rationale instead of
  manufacturing a reuse request.

## Findings must be actionable

For a reuse finding, cite both the changed implementation and the existing candidate. State:

1. the duplicated capability;
2. why the candidate's contract fits, including relevant error/protocol/runtime details;
3. the concrete replacement or extension direction; and
4. the affected behavior or maintenance risk.

When a candidate still needs investigation, do not report speculation as a defect. Complete the
fit check first or record insufficient evidence.

## Boundaries with other references

Avoid duplicating their detailed policy:

- For placeholders, plural/count resources, ReactNode-aware formatting, and machine-syntax
  localization constraints, apply `localization-and-formatting.md`.
- For SPDS/Fluent components, design tokens, typography, and supported styling APIs, apply
  `sharepoint-design-system-and-ux-components.md`.
- For guard ordering, falsy `ReactNode` cases, async behavior, URL security, and runtime edge
  cases, apply `common-review-issues.md`.
- For comment hygiene, API documentation, and required prior-art artifact structure, apply the
  normative review contract.

This reference owns reuse discovery, candidate fit, ODSP package targeting, and reuse-specific
severity. The other references own correctness within their domains.
