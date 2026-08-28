import fs from "node:fs";

const repoRootUrl = new URL("../../", import.meta.url);

function mirroredSnippetChecks(sourceFile, mirrorFile, snippets) {
  return [
    { file: sourceFile, snippets },
    { file: mirrorFile, snippets },
  ];
}

const reviewMissSnippets = [
  "## M1. The diff contradicting itself",
  "## M2. Impossible first paint from independently derived state"
];

const sharedUtilityReuseSnippets = [
  "Do not limit this pass to exported symbols",
  "High-signal ODSP-Web reuse map",
  "@msinternal/odsp-utilities",
  "@msinternal/sp-component-utilities",
  "@msinternal/odsp-utilities-bundle",
  "@msinternal/sharepoint-ui-react-utilities",
  "@msinternal/playwright-utilities",
  "Prove contract fit before requesting reuse",
  "A name match is not proof of compatibility",
  "Count the copies and diff them mechanically",
  "itself is not automatically blocking",
  "This reference owns reuse discovery"
];

const commonReviewIssueSnippets = [
  "Evaluate a Flight/KS before any new-path-only helper",
  "Trace imports and calls transitively",
  "Gate behavior, not syntax",
  "The helper executing in both states is not itself a rollout defect",
  "For `Promise.all`, decide whether any failure should fail the feature",
  "Use `useCallback` only when identity reaches a memoized/expensive child",
  "Put API operation QoS at the provider/data-source boundary",
  "Consume `ServiceScope`/`PageContext` only after readiness",
  "Use one shared, normalized, same-origin, fail-closed navigation resolver",
  "behavior-owning consumer boundary",
  "Do not require tests that merely mock",
  "one-line wrapper returns the mock value",
  "Do not turn this reference into mechanical policy"
];

const graduationReviewSnippets = [
  "this is the only review policy and artifact contract to apply",
  "Do not",
  "read or apply the general `docs/review-contract.md`",
  "Graduation-only report contract",
  "`tools/validate-graduation-review-report.mjs`",
  '"reviewMode": "graduation-only"',
  '"ruleResults"',
  '"ruleId": "<exact id from review-rule-inventory.json>"',
  '"directionEvidence"',
  '"callSitesChecked"',
  '"cleanupEvidence"',
  '"ruleChecks"',
  '"rule": "selected-branch|fixed-carriers|fixed-inputs|obsolete-control-flow|discarded-evaluations|transitive-gates|stale-artifacts|runtime-entry-points|coverage-and-tests|scope-purity|minor-cleanup"',
  '"status": "clear|finding|suggestion|not-applicable"',
  "exactly one `ruleChecks` entry for each of these classes",
  "An omitted rule",
  "class is an incomplete review and cannot produce `APPROVE`",
  '"reviewedVersion": "head|merge-base"',
  '"classSweepEvidence"',
  '"gateName": "<retired gate identifier>"',
  '"residualCandidates"',
  '"kind": "fixed-return-helper|retained-export|fixed-parameter|fixed-conditional"',
  '"independentSemanticEvidence"',
  '"externalCallerEvidence"',
  "review-gates.txt",
  "review-deleted-files.txt",
  "review-residual-candidates.jsonl",
  "graduation-review-rule-registry.json",
  "every non-example prose, list, and",
  "ruleResults` must exactly cover every inventory ID",
  "Reported gate names must exactly",
  "command:rg <query> <repo-relative-scope> => no matches",
  "deleted file uses `reviewedVersion: \"merge-base\"`",
  "must exactly equal the gates",
  "trust boundary, permission or validation check",
  "`changedFiles` must exactly match Git",
  "Do not",
  "include generic reviewability, profile checks, prior-art, external-contract",
  "Do not apply graduation rules merely because a changed file mentions a gate",
  "Do not turn a graduation-only review into an opportunity to polish nearby logic",
  "Graduation-only PRs have no PR-size or split limit",
  "Do not request a split, emit a `reviewability`",
  "classify the PR as `must-split`",
  "This exemption does not apply",
  "does not reduce exhaustive",
  "Trust the author-owned graduation decision",
  "Reviewers must not re-evaluate that operational decision",
  "Missing or apparently",
  "incomplete rollout-state prose is not a finding",
  "When a PR description is available, read it before reviewing code",
  "Flight described as never enabled selects the",
  "Accept that statement without",
  "independently validating rollout status",
  "absence of the description is not a finding",
  "implementation mismatch; do not challenge whether the stated status is true",
  "code-equivalence fields, not rollout-state proof",
  "construct the gate truth table before judging the diff",
  "infer the selected branch",
  "Do not judge whether the selected branch matches current portal",
  "reviewer owns no",
  "operational-state approval gate",
  "Do not raise findings for missing author-supplied rollout evidence",
  "local or exported `true`/`false` constant",
  "is still an ungraduated gate",
  "find every reference",
  "This propagation crosses function boundaries",
  "inspect the function definition and every call site",
  "remove the parameter from the",
  "not replace the argument with `true`/`false`",
  "external callers cannot be ruled out, preserve the parameter",
  "isDashboardPersonalizationEnabled: true",
  "emit a non-blocking **Minor** suggestion immediately",
  "does not require the",
  "reviewer to perform a repository-wide caller scan",
  "Upgrade it to **Important** only when available source evidence already proves",
  "values that are not gate booleans but exist only to share the same expression across",
  "local temporary with exactly one",
  "This includes JSX elements",
  "preserves evaluation count, order, timing, side effects, and object",
  "A retired gate invocation must not survive only to discard its result",
  "`void retiredGate()`",
  "stale gate references, not behavior preservation",
  "gate-only property reads and optional chains whose values are discarded",
  "`void ref.current?.offsetWidth`",
  "Browser DOM geometry reads",
  "performance cost is a reason to remove an obsolete read",
  "custom getter, Proxy trap, or method",
  "trace its complete value-supply chain",
  "component props, function parameters, destructuring, forwarding wrappers",
  "property-read pseudo-side effects keep obsolete DOM work and the ref chain alive",
  "remove containerDivRef from locals, props, parameters, and callers",
  "Fixed-return wrappers require symbol closure",
  "export function isSchedulingEnabledForCoAuth(): boolean { return true; }",
  "possibility of unknown callers is not evidence",
  "changed by graduation to return a fixed",
  "Find every symbol reference across the repository",
  "Substitute the fixed return literal at every call site and simplify mechanically",
  "Delete former return operands that were converted into standalone",
  "does not create an independent side-effect contract",
  "delete the wrapper, export/imports, underlying gate references",
  "stop and report the unresolved ownership instead of approving a fixed wrapper",
  "This propagation is transitive",
  "Incorrect: both former boolean results are now discarded",
  "Correct when repository-wide references prove no independent contract remains",
  "Selecting one gate's permanent branch can also make another gate behaviorally irrelevant",
  "that KS as a value-discarded call",
  "remove its wrapper, ID/GUID, registration, imports, mocks",
  "gate invocation as an accidental side-effect mechanism",
  "Incorrect: the KS no longer selects behavior but remains executable",
  "Correct: remove the behaviorally unused KS call",
  "Incorrect: the gate call is gone, but its obsolete control-flow shape remains",
  "Correct: inline the surviving value and simplify every consumer",
  "Gate-derived function parameters require the same cleanup",
  "Incorrect: the permanent value is still represented as configurable input",
  "Correct when every call site passed the enabled state",
  "Branch-sharing temporaries must not survive as single-use indirection",
  "Incomplete: the branch is gone, but its sharing temporary remains",
  "Correct when the temporary existed only to serve both branches",
  "Remove JSX Fragments introduced only to group siblings inside a retired gate expression",
  "an unkeyed Fragment is redundant",
  "Incomplete: the condition is gone, but its grouping Fragment remains",
  "Preferred cleanup",
  "Do not apply this mechanically to a keyed Fragment",
  "could change reconciliation, identity",
  "non-blocking **Minor** suggestion",
  "starts with `Nit:`",
  "Do not request changes or block approval for this cleanup alone",
  "Remove a JSX prop assignment that graduation leaves permanently `undefined`",
  "`hasOwnProperty`",
  "explicitly undefined prop",
  "`propName={undefined}`",
  "receiver contract is external, unavailable, or can observe property presence",
  "allowedAspectRatios={heroAspectRatio ? [heroAspectRatio] : undefined}",
  "<AdvancedEditor allowedAspectRatios={undefined} />",
  "Preferred when receiver inspection proves absent and explicit undefined are equivalent",
  "Inspect JSX props made permanently `undefined`",
  "suggest deleting the whole prop assignment as `Minor`/`Nit:`",
  "Collapse a style modifier that graduation makes permanent",
  "only for the same single consumption site",
  "move the modifier's declarations",
  "Incomplete: permanent modifier remains as a separate single-use style",
  "Preferred cleanup when both style slots have only this consumer",
  "Require a symbol/reference search for both style slots",
  "composition order resolves conflicting properties",
  "selectors, media queries, tokens, or runtime-dependent declarations",
  "separate modifier existed to represent the retired branch",
  "approval or use this rule for general style consolidation",
  "Find all symbol references to the gate-derived value across the repository",
  "For each function parameter or options property carrying that value, inspect every call site",
  "Find local values introduced only for reuse across the retired branches",
  "Preserve every non-gate operand, predicate, operator, fallback value, call, and evaluation order",
  "do not change `some` to `every`",
  "removing the gate does not authorize changing the existing predicate",
  "Preserve comments by default",
  "Do not delete, rewrite, shorten, or otherwise polish comments merely because the gate is removed",
  "Graduation-related tests may be deleted, renamed, reorganized, rewritten, or added",
  "do not report an issue merely because the",
  "a surviving-branch suite may be renamed or restructured",
  "an old fallback/control test may be rewritten",
  "graduation-related tests may be added",
  "Tests added or changed with no relationship to the graduation",
  "non-blocking **Minor** suggestion prefixed `Nit:`",
  "Unrelated test additions alone must not produce `REQUEST_CHANGES`",
  "unrelated behavior means production behavior; unrelated test-only scope",
  "follows the non-blocking Minor rule above",
  "running an existing scoped test is validation, not a test implementation task",
  "Do not convert the review contract's internal artifact fields into author-facing PR-description",
  "does not require a generic test plan",
  "per-Flight-family rollback/recovery section",
  "Absence of those sections is not a finding",
  "default recovery for an incorrect",
  "Do not require author-supplied PR-description content about Flight/KS state",
  "rings, scopes, exclusions, portal operations, or graduation authorization",
  "Do not raise a finding merely because a graduation-only PR description omits generic test results",
  "These are not required",
  "Rollout-state or authorization evidence gaps are outside graduation review scope",
  "Preferred:** update the unit-test coverage threshold",
  "Recommend a separate follow-up PR",
  "Allowed alternative:** the developer may instead add the minimum meaningful tests",
  "Do not predict a coverage failure or create a test task before running",
  "The PR description must state that graduation caused the threshold failure",
  "Search by gate identifier, GUID, helper name, attribution comment",
  "Reject value-discarded gate calls",
  "Reject discarded gate-only property and DOM reads",
  "trace its ref/object supply chain through props, parameters, forwarding wrappers",
  "For every wrapper changed to return a literal",
  "Inspect JSX made unconditional by graduation",
  "permanent `css(base, modifier)` composition",
  "suggest merging the modifier into the base",
  "It must not produce `REQUEST_CHANGES`",
  "uncertain Fragments receive no cleanup finding",
  "style semantics are uncertain, raise no consolidation finding",
  "A JSX prop left as `propName={undefined}` after graduation",
  "raise no removal finding",
  "fixed-return wrapper or any transitive consumer unsimplified",
  "retains a value-discarded gate invocation",
  "retains a discarded gate-only",
  "property or DOM read or its unused ref/prop/parameter supply chain",
  "Do not raise graduation findings"
];

const localizationFormattingSnippets = [
  "hard-coded user-visible strings and non-visible assistive text",
  "announcements, and live-region content",
  "dynamic data from an API, such as a user name",
  "translator comment for each string",
  "explain every placeholder",
  "Do not lock placeholders",
  "formatter argument matches the placeholder",
  "Keep punctuation inside the localized string",
  "Localize complete sentences, not fragments assembled in code",
  "StringHelper.formatWithLocalizedCountValue",
  "Use plural wording for `0`",
  "all three cases in tests",
  "physical-direction CSS",
  "CSS-in-JS, and inline styles",
  "Created at {0} by {1}",
  "name + \" - \" + description",
  "resource.replace(\"{0}\", value)",
  "local formatting helpers, and manual interpolation",
  "props.text || strings.fallbackStr",
  "split plural resources, interval metadata",
  "machine-readable pipeline syntax",
  "Duplicated resources can diverge across translations",
  "site or user locale and locale skeletons",
  "resource provenance and casing",
  "Do not place interactive links inside checkbox or radio labels",
  "Verify claimed resolutions in the actual PR source"
];

const accessibilitySnippets = [
  "rendered UI surface that can affect interaction",
  "accessibility-relevant style: color/contrast",
  "typography/text spacing, zoom/reflow, overflow/truncation",
  "style/token-only diff proven to change only decorative spacing, radii, or shadows",
  "cannot affect reflow, clipping, targets, focus, readability, or semantics",
  "Every rendered UI change must be reviewed against the applicable WCAG 2.1 Level A and AA",
  "complete keyboard-only and screen-reader operation",
  "screen-reader operation. Accessibility is a required",
  "review dimension on every PR: record it as reviewed",
  "not claim that code inspection alone proves WCAG conformance",
  "require focused automated or manual evidence",
  "record the criterion as not verified",
  "SPDS is a style redesign built on Fluent V9, not a separate accessibility implementation",
  "inherit the underlying Fluent V9 semantics",
  "apply the same Fluent V9 accessibility behavior",
  "Do not recommend a separate",
  "only when SPDS explicitly documents a behavioral accessibility",
  "## Cross-cutting rendered UI checks",
  "**Design tokens and accessible states:**",
  "Treat token misuse as an accessibility defect when it breaks contrast",
  "raw spacing value as WCAG nonconformance without a user impact",
  "**Hand-rolled interaction:**",
  "verify its full name/role/value, keyboard, focus",
  "**Styles tied to element identity:**",
  "trace every reused",
  "Do not assume a class remains accessible",
  "**Presentational-role misuse:**",
  "`role=\"presentation\"` or `role=\"none\"`",
  "rendered accessibility tree and descendants",
  "**Named groups:**",
  "`fieldset`/`legend`",
  "visual heading alone is not proof",
  "**Zoom and reflow:** at 400% zoom",
  "must not require two-dimensional scrolling",
  "preserve the WCAG exception",
  "**Contrast:** require at least $4.5:1$ for normal text and $3:1$ for large text",
  "focus indicators require at least $3:1$",
  "**Truncation:**",
  "keyboard, touch, and screen-reader users",
  "A `title` attribute alone is not a reliable",
  "**Heading semantics:**",
  "do not enforce a universal single-`h1` rule",
  "**Duplicate or conflicting ARIA:**",
  "Report duplicate names/descriptions, conflicting",
  "component already produces the required semantics",
  "## SPDS and Fluent V9 MessageBar announcement contract",
  "every SPDS component backed by it",
  "one `AriaLiveAnnouncer` toward the top of the React tree",
  "do not add another one at the feature or MessageBar level",
  "Do not add `role=\"alert\"`, `role=\"status\"`, or an ad hoc `aria-live` attribute",
  "Use the documented `intent` preset",
  "`politeness` prop unless an accessibility owner",
  "### Fluent V8 MessageBar announcement contract",
  "`delayedRender` behavior",
  "`error`, `blocked`, and `severeWarning`",
  "Do not ask the author to add `Announced`",
  "If `delayedRender={false}`",
  "built-in announcement is disabled or broken",
  "no explicit announcement",
  "For V9, the same no-duplication rule applies",
  "The intent owns that message announcement",
  "different async transition that the MessageBar does not announce",
  "<AriaLiveAnnouncer>",
  "<div className={styles.downloadError}>",
  "do not add `@msinternal/screen-reader-alert` to duplicate a Fluent V9 `MessageBar` announcement",
  "Screen-reader announcements — Fluent V9 or SharePoint shared React API",
  "Fluent V9 provides the equivalent general-purpose utility",
  "Fluent V9 `useAnnounce()` or `@msinternal/screen-reader-alert` is acceptable",
  "already established by the host: use `useAnnounce()`",
  "never invoke both for the same event",
  "## Async collection state and announcement contract",
  "Missing accessibility code does not make these workflows out of scope",
  "absence of `aria-live`, announcement code, or",
  "initial → loading",
  "load more → appended",
  "sort/filter/search → replaced or reordered results",
  "visible feedback, screen-reader",
  "`aria-busy` communicates processing state but does not replace",
  "Component-owned announcements count as screen-reader feedback",
  "V8 MessageBar satisfies its own error/warning transition",
  "V9 MessageBar under `AriaLiveAnnouncer`",
  "loading completion, loaded",
  "different async transition that the MessageBar does not announce",
  "Choose the fix from the owning component stack",
  "**SPDS or Fluent UI React V9:** use the same Fluent V9 accessibility implementation",
  "then follow the underlying Fluent V9 component's loading, sort, focus, and announcement contract",
  "Do not invent an",
  "SPDS-specific announcement path",
  "use `useAnnounce()` connected to an ancestor",
  "`useTypingAnnounce()` only for its documented typing scenario",
  "**Fluent UI React V8:**",
  "`Announced` only when that installed version and surface use",
  "default V8 MessageBar already announces its own content",
  "do not add `Announced` for that",
  "**SharePoint-owned surface without a component-owned mechanism:**",
  "`useScreenReaderAlert`/`ScreenReaderAlert`) are both valid",
  "Do not require migration from",
  "announce the same transition twice",
  "**Custom/native component outside those stacks:**",
  "For a paged or sortable collection",
  "to \"add aria-live\" is insufficient",
  "raise an **Important** accessibility finding",
  "Use **Minor** only when the transition is already perceivable",
  "sighted users can see a spinner or changed rows",
  "Missing announcement code is",
  "visible, screen-reader, and focus outcomes",
  "Apply the dynamic focus transition contract below",
  "remove the focused node or another focus target",
  "Raise an **Important** accessibility finding when a keyboard-triggered operation",
  "leave focus on `body`, a detached node, a non-interactive wrapper",
  "already lands on a logical, visible, enabled destination",
  "does not lower severity without interaction-contract and focused",
  "#### Dynamic focus transition contract",
  "Do not limit focus review to opening and closing dialogs",
  "focused element before the transition and its destination after the transition",
  "selection-derived toolbars, async rerenders, virtualized rows, toast actions",
  "`document.activeElement` on `body`",
  "| Refresh, retry, paging, sort, filter, or data replacement |",
  "semantic equivalent after commit, not `body`",
  "| Focused row/item is removed |",
  "never rely on browser fallback",
  "| Selection change mounts or unmounts toolbar commands |",
  "If the focused command disappears",
  "| Last item is deselected and selection-only UI disappears |",
  "Do not steal focus from a still-mounted row",
  "| Toast, inline action, confirmation, Replace/Keep both, or retry action completes and disappears |",
  "| Loading, save, upload, or background operation completes |",
  "announce the result separately rather than moving focus",
  "Do not accept \"by design\" as sufficient evidence",
  "A focus move may be intentional without",
  "the post-update active element. A generic tab-order test",
  "not prove focus retention",
  "#### Choose the fix from the focus owner",
  "rendered component stack, installed package",
  "**SPDS or Fluent UI React V9 component contract:**",
  "documented Tabster focus entry, containment, navigation, and trigger restoration",
  "use `trapFocus` only on a surface whose V9",
  "Do not add imperative `focus()` or `A11yManager`",
  "**Fluent V9 restoration utilities:**",
  "`useRestoreFocusTarget` and `useRestoreFocusSource` pairing",
  "Do not mix these hooks",
  "**Local V9 lifecycle replacement:**",
  "persistent toast target while the toast remains",
  "whole toast closes, restore to the",
  "does not by itself justify `A11yManager`",
  "**SharePoint page/canvas or cross-view ownership:**",
  "`saveActiveElementAs`/`restoreFocus` pattern",
  "**Legacy, custom, or unmanaged DOM:**",
  "`Focus` utilities when Tabster",
  "SharePoint/SPFx page-level accessibility infrastructure, not a replacement",
  "Two focus owners can race",
  "can focus a DOM node that no longer exists",
  "semantic replacement or deterministic fallback",
  "Every focus finding's suggested fix must name",
  "supported by that stack; when the active element is",
  "what happens if that node no longer exists",
  "Do not suggest only “restore focus,”",
  "Fluent migration layer rather than native V9",
  "Do not recommend those compatibility APIs to a native V9 subtree"
];

const sharepointDesignSystemSnippets = [
  "highest supported ODSP-Web design-system layer",
  "Do not skip a higher layer merely to obtain a small styling or API preference",
  "@msinternal/sharepoint-ui-react-stable-bundle",
  "@msinternal/sharepoint-ui-react-stable",
  "under `sp-client/`",
  "under `odsp-common/`",
  "@msinternal/sharepoint-ui-react",
  "Fluent UI React V9",
  "custom HTML/CSS component only when all three layers cannot meet the requirement",
  "documented props, slots, appearance options, typography presets, and design tokens",
  "Do not target generated or private Fluent implementation selectors such as `.fui-*`",
  "existing ODSP-Web shared wrapper, helper, or component",
  "semantic structure, keyboard behavior, focus handling, high-contrast and theme support",
  "documented gap showing why SPDS",
  "preserves design-system semantics, accessibility, theming, responsiveness, and upgrade resilience",
  "Can SPDS meet this requirement?",
  "Custom HTML/CSS requires a documented gap in all three layers",
  "Breadcrumb overflow action versus navigation",
  "`BreadcrumbItem > Menu > MenuTrigger > Button`",
  "`BreadcrumbButton` only for genuine breadcrumb navigation nodes"
];

const uxArchitectureBundleSnippets = [
  "it is not SharePoint- or SPDS-specific",
  "Source/component decomposition and runtime bundle splitting are separate decisions",
  "responsibility-to-module map",
  "nearest common owner",
  "File length alone is not a finding",
  "Do not introduce `React.lazy`, dynamic `import()`, `Suspense`, or a new chunk solely because source code moved",
  "`eager`, `lazy`, or `unchanged`",
  "Reject extraction that only moves lines or hides coupling",
  "Do not raise a finding from file length alone",
  "This reference owns rendered-feature decomposition"
];

const sizeRegressionSnippets = [
  "the regressed scenario and policy criterion",
  "FMP, FCI, or All timing bucket",
  "The official local/PR policy report is the source of truth",
  "A package declaration is not a bundling instruction",
  "If and only if the policy result reports a regression",
  "Do not increase the allowance first",
  "diagnostic evidence, not a replacement for the official policy result",
  "Every finding must name the likely owning import/package/configuration boundary"
];

const checks = [
  {
    file: "copilot/skills/agentow-a11y/SKILL.md",
    snippets: [
      "Make up to three meaningful attempts to acquire and validate real-AT reproduction evidence",
      "capability discovery exhausts the available routes immediately",
      "validationMode: \"unverified-fallback\"",
      "User authorization may select this fallback early",
      "The fallback authorizes investigation, implementation, review, and an explicitly unverified draft",
      "never authorizes claims that NVDA, Narrator, Voice Access, keyboard focus, UI Automation, or",
      "changed product still fails is not an unavailable-validator case",
      "verifyVerdict: \"UNVERIFIED\"",
      "## UNVERIFIED A11Y - validation unavailable",
      "Do not include a fabricated BEFORE/AFTER evidence table",
      "In strict mode, for semantic-only changes",
      "In fallback mode, list the unavailable semantic",
      "never synthesize a matched capture from source inference",
      "Detect the execution environment before creating the run",
      "host-only test as `skipped-environment`",
      "A deliberate environment skip is not a failed test",
      "does not require or invoke an external test skill",
      "windows-host-testing.md",
      "Twinbot retains exclusive",
    ],
  },
  {
    file: "copilot/docs/a11y/windows-host-testing.md",
    snippets: [
      "Safe scriptable installation",
      "NVAccess.NVDA",
      "Gyan.FFmpeg",
      "AudioDeviceCmdlets",
      "Do not automate installation of VB-CABLE",
      "Never run NVDA and Narrator simultaneously",
      "explicit authorization",
      "unsupported host tests are `skipped-environment`",
      "Twinbot retains exclusive control",
    ],
  },
  {
    file: "copilot/docs/a11y/README.md",
    snippets: [
      "continue only through the explicitly labeled",
      "Missing real-AT evidence remains `INCONCLUSIVE`, never PASS",
      "A valid real-AT result showing that the changed product still fails",
    ],
  },
  {
    file: "copilot/docs/a11y/evidence-contract.md",
    snippets: [
      "through at most three meaningful attempts",
      "may enter `unverified-fallback` for source investigation, implementation",
      "retain `UNVERIFIED`; do not convert it to PASS",
      "Fallback delivery requires a draft PR labeled `UNVERIFIED A11Y`",
      "A valid result proving the changed product still fails blocks delivery",
    ],
  },
  {
    file: "copilot/skills/ow-batch/SKILL.md",
    snippets: [
      "exhaust the available real-AT routes or at most three",
      "explicitly labeled `unverified-fallback`",
      "A demonstrated unresolved product",
    ],
  },
  ...mirroredSnippetChecks(
    "skills/ow-review/SKILL.md",
    "copilot/skills/ow-review/SKILL.md",
    [
      "Before reading any review contract, inspect the immutable diff and classify it",
      "`reviewPolicy=graduation-only`",
      "Do not read",
      "`docs/review-contract.md`, profiles, review-miss documents",
      "Skip this step when `reviewPolicy=graduation-only`",
      "validate-graduation-review-report.mjs",
      "use only the graduation reference's review procedure",
      "review-gates.txt",
      "review-deleted-files.txt",
      "review-residual-candidates.jsonl",
      "helper/wrapper name, GUID/ID",
      "export/import, alias, fixed parameter, and",
      "downstream call chain",
      "fixed-return-helper",
      "--expected-head",
      "--expected-merge-base",
      "--expected-diff-digest",
      "--changed-files",
      "--deleted-files",
      "--expected-gates",
      "--residual-candidates",
      "--rule-inventory",
      "--rule-registry",
      "every graduation rule ID",
      "build-review-rule-inventory.mjs",
      "graduation-review-rule-registry.json",
      "review-rule-registry.json",
      "--registry",
      "review-rule-inventory.json",
      "ruleInventoryPath",
      "prDescriptionPath",
      "--rule-inventory",
      "--rule-registry",
    ],
  ),
  {
    file: "tools/build-review-rule-inventory.mjs",
    snippets: [
      "extractRules",
      "review-rule:",
      "textDigest",
      "duplicate review rule id",
      "cannot be combined with --reference",
      "reviewedHead, mergeBase, and diffDigest",
      "reference must be a readable repo-relative path",
    ],
  },
  {
    file: "copilot/skills/agentow/SKILL.md",
    snippets: [
      "agentOW is the routing and execution layer; feature-specific rules and execution guards live in those context docs, not in this skill.",
      "## Durable conversation and follow-up protocol",
      "run-state.mjs",
      "progress-watcher.mjs",
      "never append `report.json` directly",
      "reportWriterCommand",
      "Immediately after the evaluator returns",
      "A later same-task requirement change reopens this same run",
      "Automatically select `FAST` or `FULL`",
      "planning/planner-mode.json",
      "Missing evidence is `FULL`, not an assumption.",
      "FAST → FULL escalation",
      "Do not dispatch the planner agent.",
      "The change is one behavior in at most two product files.",
      "Only after source-path routing passes",
      "do not append a duplicate",
      "`context-completion pass`",
      "`context-routing-unstable`",
      "read every routed document before selecting planner mode",
      "exhaustive `sourcePaths`",
      "`--poc` selects **POC profile**",
      "`--poc --auto` is valid",
      "promote this POC",
      "\"mode\":\"poc\"",
      "Tests skipped — POC profile",
      "mode: poc-advisory",
      "POC — NOT PRODUCTION READY",
      "agentOW must never merge them",
      "final status `poc-complete`",
      "require `POC_SAFE_TO_DEMO` before continuing",
      "`ow-pr-update` with its existing `prId`",
      "Do not require `visualValidation.scenarios` or a BEFORE path",
      "does not run or show the requested result is not useful",
      "classify the immutable Git diff before reading any review contract",
      "`reviewPolicy=graduation-only`",
      "do not read the general",
      "For `reviewPolicy=graduation-only`, omit `reviewLedgerPath`",
      "return without entering generic review passes",
      "validate-graduation-review-report.mjs",
      "review-gates.txt",
      "review-deleted-files.txt",
      "--expected-head",
      "--expected-merge-base",
      "--expected-diff-digest",
      "--changed-files",
      "--deleted-files",
      "--expected-gates",
    ]
  },
  {
    file: "copilot/agents/planner.agent.md",
    snippets: [
      "`contextDocuments` — optional feature/domain docs already routed by the dispatcher.",
      "read them and summarize the exact guard/checklist items that apply",
      "`exactFixtureRequired` — defaults to `false`",
      "A test page is a starting candidate, not fixture identity",
      "Capability predicates",
      "Candidate discovery hints",
      "scenario matrix",
      "Do not create a Cartesian product",
      "\"scenarioCount\":1",
      "`plannerMode` — always `full`",
      "`plannerPass` — 1 for initial research",
      "\"mode\":\"full\"",
      "\"pass\":<plannerPass>",
      "## Source paths consulted",
      "\"sourcePaths\""
    ]
  },
  ...mirroredSnippetChecks(
    "docs/USING-AGENTOW.md",
    "docs/USING-AGENTOW.zh-CN.md",
    [
      "planning/planner-mode.json"
    ]
  ),
  {
    file: "copilot/agents/evaluator.agent.md",
    snippets: [
      "`contextDocuments` — optional feature/domain docs.",
      "apply the documented domain-specific guards",
      "One resource-local failure is not fleet-wide evidence.",
      "`coverageManifest`",
      "`failureKind: \"environment-discovery-incomplete\"`",
      "`verificationMode == \"environment_discovery\"`",
      "A configured probe cap or unavailable discovery mechanism makes coverage `incomplete`",
      "Any `unprobed` candidate makes the manifest incomplete",
      "`candidatesDiscovered == candidatesProbed == candidateResults.length`",
      "every candidate result is `rejected` with an evidence path",
      "full browser page/viewport",
      "primary-screenshot-not-full-viewport",
      "`visualValidation.beforePath` / `afterPath` MUST point to full-page/viewport PNGs",
      "Run `file -- \"<beforePath>\" \"<afterPath>\"`",
      "`captureMethod` is `page`",
      "### Screenshot engines",
      "personal-persistent-profile",
      "`visualValidation.source` to `personal-persistent-profile`, `local-rush-start`, or `pr-cdn-fic`",
      "`scenarioMatrix` is a hard coverage contract",
      "`scenarioCoverage` is `complete`",
      "scenario-matrix-incomplete",
      "`verificationMode == \"poc\"`",
      "`comparison=\"after-only\"`",
      "POC PASS means only",
      "\"productionReady\":false"
    ]
  },
  {
    file: "copilot/skills/agentow/SKILL.md",
    snippets: [
      "Environment-discovery incomplete (any cycle)",
      "Evaluator-spec FAIL (any cycle)",
      "same implementation cycle",
      "An incomplete manifest blocks shipment.",
      "Downgrade any malformed manifest to `environment-discovery-incomplete`",
      "a non-empty `exhaustionReason` proving no discovery path remains",
      "retarget its blocker to `evaluator-environment`",
      "do not route it to the implementer as a code defect",
      "Primary `beforePath` / `afterPath` must be full browser-page/viewport screenshots",
      "Component crops may be attached as clearly labeled supplemental detail links",
      "independently `view` both primary images and run `file -- \"<beforePath>\" \"<afterPath>\"`",
      "If the retry still violates the evaluator contract, stop and report the blocker",
      "Playwright MCP and `browser_*` tools are not validation routes",
      "Every required scenario matrix row",
      "agentow:visual-validation:start",
      "agentow:disposable:start label"
    ]
  },
  {
    file: "copilot/AGENTS.md",
    snippets: [
      "one failed URL, credential, tenant, or site is resource-local evidence",
      "Missing or incomplete coverage triggers evaluator-only environment discovery",
      "Primary PR screenshots must show the full browser page/viewport",
      "the main session must independently view both primary images",
      "bounded scenario matrix",
      "one-row-per-scenario table"
      ,"`--poc`, optionally with `--auto`"
      ,"`promote this POC` reuses the same `.aero` run"
      ,"Fold fixed conditions completely"
    ]
  },
  {
    file: "copilot/agents/reviewer.agent.md",
    snippets: [
      "`poc-advisory`",
      "POC_SAFE_TO_DEMO",
      "\"productionReady\":false",
      "Only a Critical safety finding blocks the POC",
      "Do not continue into Pass 1"
    ]
  },
  ...mirroredSnippetChecks(
    "docs/USING-AGENTOW.md",
    "docs/USING-AGENTOW.zh-CN.md",
    [
      "/agentow --poc",
      "/agentow --poc --auto",
      "promote this POC",
      "NOT PRODUCTION READY"
    ]
  ),
  {
    file: "copilot/skills/agentow/SKILL.md",
    snippets: [
      "skip the review",
      "do not create a PR or claim AgentOW approval"
    ]
  },
  {
    file: "agents/ow-planner.md",
    snippets: [
      "**Exact fixture required**",
      "A test page is a starting candidate unless Exact fixture required is true.",
      "**Capability predicates**",
      "**Candidate discovery hints**"
    ]
  },
  {
    file: "agents/ow-evaluator-rule.md",
    snippets: [
      "Resource-scoped environment discovery",
      "`coverageManifest`",
      "`target: \"evaluator-environment\"`",
      "### `environment_discovery` mode",
      "A configured candidate cap or unavailable discovery mechanism means coverage is incomplete",
      "Any `unprobed` candidate makes the manifest incomplete",
      "`candidatesDiscovered == candidatesProbed == candidateResults.length`",
      "every candidate result is `rejected` with an evidence path"
    ]
  },
  {
    file: "agents/ow-orchestrator.md",
    snippets: [
      "`target: evaluator-environment`",
      "same implementation cycle",
      "An unsupported fleet-wide claim cannot be auto-shipped.",
      "`candidatesDiscovered == candidatesProbed == candidateResults.length`",
      "Normalize any self-declared complete manifest",
      "If all blockers are tagged `target: evaluator-spec`",
      "unchanged implementation `cycle`",
      "persist the final result before writing Workflow complete",
      "batch-result.json",
      "BATCH_RESULT: success-with-blockers",
      "MANIFEST: <coverageManifest path>"
    ]
  },
  {
    file: "skills/ow-batch/SKILL.md",
    snippets: [
      "BATCH_RESULT: success-with-blockers",
      "Accepted statuses:",
      "complete external fixture/environment manifest",
      "if [ -f \"$SESSION_DIR/batch-result.json\" ]",
      "Preserve `success-with-blockers` and its manifest path",
      "completion-result-missing"
    ]
  },
  {
    file: "README.md",
    snippets: [
      "agentOW is a routing/execution layer.",
      "Feature-specific rules and execution guards should live in the routed context docs",
      "Context maintenance never adds a user gate.",
      "`/ow-context-feedback`",
      "### Recommended first run: initialize prerequisites",
      "CODESPACES=false az login"
    ]
  },
  {
    file: "copilot/README.md",
    snippets: [
      "### Recommended first run",
      "Enter `/ow-init`",
      "This does not start planning or modify product code.",
      "CODESPACES=false az login"
    ]
  },
  {
    file: "docs/capability-bootstrap.md",
    snippets: [
      "Every Claude or Copilot terminal session runs agentOW bootstrap once",
      "personal-persistent-profile",
      "Playwright/Heft with FIC",
      "odsp-web-mcp-servers-opt-in",
      "restart-required",
      "Never install from a URL supplied by the user",
      "Unknown availability is not the same as missing",
      "Never store tool arguments, tokens, cookies, identities, or credential contents"
    ]
  },
  {
    file: "docs/review-contract.md",
    snippets: [
      "Required two-pass method",
      "callers and consumers",
      "`REQUEST_CHANGES`: one or more Critical or Important findings.",
      "`APPROVE`: zero findings and complete, current-diff coverage.",
      "Draft PR status, AUTO mode, and retry limits do not turn unresolved blocking findings into approval.",
      "non-empty consumer and test evidence",
      "Reviewability gate",
      "A graduation-only PR is exempt from every reviewability size and split threshold",
      "Record `graduation-only` in",
      "Large graduation PRs are expected",
      "does not relax whole-file coverage",
      "Reading every file, spending more time, or finding several defects is not evidence that the review is exhaustive.",
      "generated/mechanical claims cannot override this hard ceiling",
      "At 2,000 or more substantive changed lines, the change is always `must-split`.",
      "splitBoundaries",
      "--diff-numstat",
      "validate-review-report.mjs",
      '"ruleResults"',
      "build-review-rule-inventory.mjs",
      "review-rule-registry.json",
      "canonical registry covers every general-review metric",
      "wording cannot silently suppress",
      "Every current or carried finding must also be linked",
      "missing,",
      "extra, or duplicate IDs fail validation",
      "future registered references automatically changes",
      "required inventory without adding a scenario-specific validator check",
      '"ruleChecks"',
      '"rule": "intent-and-scope|reference-routing|profile-routing|changed-file-coverage|consumer-and-test-coverage|adversarial-pass|size-audit|prior-art|external-contracts|ledger-reconciliation|finding-class-sweep|verdict-reconciliation"',
      "exactly one",
      "or a placeholder such as `N/A`, is an incomplete review",
      "cannot produce `APPROVE`",
      "Test observable contracts and regression risk, not every changed file or function",
      "A trivial Flight/KS constant or pass-through wrapper does not need its own unit test",
      "nearest stable consumer rather than testing a trivial gate wrapper"
    ]
  },
  {
    file: "docs/sp-client-review-profile.md",
    snippets: [
      "Runtime behavior and styling changes must be protected by a flight or killswitch.",
      "Activated means old/fallback behavior; not activated means new behavior.",
      "common-review-issues.md",
      "call-time evaluation requirement",
      "`08/11/2026` already satisfies `MM/DD/YYYY`",
      "A harmless comment-format deviation is at most a `Minor` finding prefixed `Nit:`",
      "bundle delta of 2 KB or more is a review trigger",
      "server-side filtering, transport pagination/continuation, and bounded viewport rendering",
      "typographyStyles",
      "Fluent V9/SPDS primitive",
      "SharePoint theme/Detheme provider flow",
      "spClientRolloutTrace",
      "PR description first",
      "Unit tests cover meaningful changed behavior",
      "Do not require a dedicated test for a `Flights.ts`, `KillSwitches.ts`, or similar module",
      "KS-activated or Flight-off consumer coverage only when this PR changes fallback/disabled behavior",
      "preReview.rolloutProtection",
      "Use `Nit:` only for optional education."
    ]
  },
  {
    file: "copilot/agents/reviewer.agent.md",
    snippets: [
      "Pass 1: immutable scope and risk",
      "Pass 2: adversarial verification",
      "at least one falsifiable failure hypothesis",
      "final dissent pass",
      "direct callers/consumers",
      "Any Critical or Important → `REQUEST_CHANGES`.",
      "artifactJsonPath",
      "Never APPROVE without complete evidence.",
      "sp-client-review-profile.md",
      "preReview.profileChecks",
      "inspect the PR description before code",
      "a gate inside a called helper is coverage when it guards only the added behavior",
      "reaching a changed pure abstraction is not a defect by itself",
      "Repository instruction compliance does not automatically imply `Important`",
      "Compliant code receives no finding",
      "do not equate reading every line with reliable exhaustive review",
      "before reading any review contract",
      "Do not read",
      "`docs/review-contract.md` or continue into any subsequent generic review pass",
      "validate-graduation-review-report.mjs",
      "review-gates.txt",
      "review-deleted-files.txt",
      "--expected-head",
      "--expected-merge-base",
      "--expected-diff-digest",
      "--changed-files",
      "--deleted-files",
      "--expected-gates",
      "return immediately",
      "A mixed graduation/feature PR is not graduation-only",
      "explicit no-size-limit/no-split exemption",
      "reference alone controls policy, evidence",
      "caller-owned gate inventory",
      "Account for every immutable",
      "residual candidate in the report",
      "Complete every per-gate `ruleChecks` class with concrete evidence",
      "an omitted class forbids `APPROVE`",
      "review-residual-candidates.jsonl",
      "gate/Flight name, helper/wrapper name, GUID/ID",
      "export/import, alias, fixed parameter, and",
      "downstream call chain",
      "--residual-candidates",
      "expected merge base",
      "accessibility-relevant styles: color/contrast",
      "style/token-only changes proven limited to decorative spacing, radii, or shadows",
      "rendered collection that loads",
      "missing announcement behavior is itself under review",
      "--expected-head",
      "--expected-merge-base",
      "--expected-diff-digest",
      "--changed-files",
      "--deleted-files",
      "--expected-gates",
      "`preliminary-non-exhaustive` completeness claim",
      "git diff --no-renames",
      "common-review-issues.md",
      "shared-utility-reuse.md",
      "localization-and-formatting.md",
      "sharepoint-design-system-and-ux-components.md",
      "ux-architecture-and-bundle-boundaries.md",
      "size-regression.md",
      "PR's official size-audit report",
      "complete every `preReview.ruleChecks` class",
      "An omitted, duplicated, placeholder, or unsupported rule check",
      "Consume `ruleInventoryPath` as an immutable caller-owned input",
      "exactly one `ruleResults` entry for every inventoried",
      "Do not collapse multiple source rules into one broad dimension conclusion",
      "physical-direction CSS",
      "screen-reader or other assistive text",
      "Reference routing",
      "The artifact requirement remains narrower and mandatory",
      "A data-provider-only PR loads `common-review-issues.md` only",
      "Apply `skills/ow-review/references/graduation.md` only to gates classified as retired",
      "load only `graduation.md` and stop reference routing",
      "this exclusive scope overrides every subsequent instruction"
    ]
  },
  {
    file: "copilot/skills/agentow/SKILL.md",
    snippets: [
      "validate-review-report.mjs",
      "classify it as `reviewer-spec`",
      "REQUEST_CHANGES with any Critical or Important finding",
      "Draft status and AUTO mode do not bypass the review quality gate.",
      "--diff-numstat",
      "sizeAuditStatus: passed-no-regression",
      "analyzer or search for speculative size issues"
    ]
  },
  {
    file: "agents/ow-review-agent.md",
    snippets: [
      "Pass 1: immutable scope and risk",
      "Pass 2: adversarial verification",
      "at least one falsifiable failure hypothesis",
      "final dissent pass",
      "Critical or Important present → `REQUEST_CHANGES`.",
      "review.json",
      "Never APPROVE without complete evidence.",
      "sp-client-review-profile.md",
      "preReview.profileChecks",
      "inspect the PR description before code",
      "a gate inside a called helper is coverage when it guards only the added behavior",
      "reaching a changed pure abstraction is not a defect by itself",
      "Repository instruction compliance does not automatically imply `Important`",
      "Compliant code receives no finding",
      "reading all files does not prove the review is reliable or exhaustive",
      "Before reading any review contract",
      "Do not read",
      "`docs/review-contract.md` or continue into any subsequent generic review pass",
      "validate-graduation-review-report.mjs",
      "return immediately",
      "A mixed graduation/feature PR is not graduation-only",
      "explicit no-size-limit/no-split exemption",
      "reference alone controls policy, evidence",
      "caller-owned gate inventory",
      "expected merge base",
      "accessibility-relevant styles: color/contrast",
      "style/token-only changes proven limited to decorative spacing, radii, or shadows",
      "rendered collection that loads",
      "missing announcement behavior is itself under review",
      "`preliminary-non-exhaustive`",
      "git diff --no-renames",
      "common-review-issues.md",
      "shared-utility-reuse.md",
      "localization-and-formatting.md",
      "sharepoint-design-system-and-ux-components.md",
      "ux-architecture-and-bundle-boundaries.md",
      "size-regression.md",
      "PR's official size-audit report",
      "physical-direction CSS",
      "screen-reader or other assistive text",
      "Reference routing",
      "The artifact requirement remains narrower and mandatory",
      "A data-provider-only PR loads `common-review-issues.md` only",
      "Apply `skills/ow-review/references/graduation.md` only to gates classified as retired",
      "load only `graduation.md` and stop reference routing",
      "this exclusive scope overrides every subsequent instruction"
    ]
  },
  ...mirroredSnippetChecks("docs/review-misses.md", "copilot/docs/review-misses.md", reviewMissSnippets),
  ...mirroredSnippetChecks(
    "skills/ow-review/references/shared-utility-reuse.md",
    "copilot/skills/ow-review/references/shared-utility-reuse.md",
    sharedUtilityReuseSnippets,
  ),
  ...mirroredSnippetChecks(
    "skills/ow-review/references/common-review-issues.md",
    "copilot/skills/ow-review/references/common-review-issues.md",
    commonReviewIssueSnippets,
  ),
  ...mirroredSnippetChecks(
    "skills/ow-review/references/graduation.md",
    "copilot/skills/ow-review/references/graduation.md",
    graduationReviewSnippets,
  ),
  ...mirroredSnippetChecks(
    "skills/ow-review/references/localization-and-formatting.md",
    "copilot/skills/ow-review/references/localization-and-formatting.md",
    localizationFormattingSnippets,
  ),
  ...mirroredSnippetChecks(
    "skills/ow-review/references/accessibility.md",
    "copilot/skills/ow-review/references/accessibility.md",
    accessibilitySnippets,
  ),
  ...mirroredSnippetChecks(
    "skills/ow-review/references/sharepoint-design-system-and-ux-components.md",
    "copilot/skills/ow-review/references/sharepoint-design-system-and-ux-components.md",
    sharepointDesignSystemSnippets,
  ),
  ...mirroredSnippetChecks(
    "skills/ow-review/references/ux-architecture-and-bundle-boundaries.md",
    "copilot/skills/ow-review/references/ux-architecture-and-bundle-boundaries.md",
    uxArchitectureBundleSnippets,
  ),
  ...mirroredSnippetChecks(
    "skills/ow-review/references/size-regression.md",
    "copilot/skills/ow-review/references/size-regression.md",
    sizeRegressionSnippets,
  ),
  {
    file: "agents/ow-orchestrator.md",
    snippets: [
      "validate-review-report.mjs",
      "Before reading any review contract, inspect the immutable Git diff",
      "`reviewPolicy=graduation-only`",
      "Do not read the general",
      "Only for `reviewPolicy=general`, resolve the branch's review ledger",
      "For `reviewPolicy=graduation-only`, omit `contextLinkPath`",
      "return without generic review passes",
      "validate-graduation-review-report.mjs",
      "--expected-head",
      "--expected-merge-base",
      "--expected-diff-digest",
      "--changed-files",
      "--deleted-files",
      "--expected-gates",
      "--residual-candidates",
      "review-residual-candidates.jsonl",
      "build-review-rule-inventory.mjs",
      "review-rule-registry.json",
      "--registry",
      "review-rule-inventory.json",
      "ruleInventoryPath",
      "prDescriptionPath",
      "--rule-inventory",
      "--rule-registry",
      "helper/wrapper name, GUID/ID",
      "export/import, alias, fixed parameter, and",
      "downstream call chain",
      "Missing artifacts, stale diff identity, incomplete coverage",
      "Critical or Important issues",
      "AUTO mode, and batch execution do not bypass the review gate.",
      "Only after the evaluator result and artifacts are final",
      "Dispatch review only after final evaluation artifacts exist.",
      "actual planPath returned by ow-planner",
      "Review validation is an explicit read-only Bash exception",
      "--diff-numstat"
    ]
  },
  {
    file: "copilot/AGENTS.md",
    snippets: [
      "Critical and Important findings block PR creation in every mode.",
      "never skip validated review or ship unresolved Critical/Important findings",
      "A request to skip review also disables AgentOW PR creation"
    ]
  },
  {
    file: "skills/ow-init/SKILL.md",
    snippets: [
      "This command performs setup only.",
      "Initialize agentOW for UI screenshots, Figma designs, Azure DevOps work items, a killswitch, and code review.",
      "--host claude",
      "--force",
      "run `CODESPACES=false az login` in the current Codespace terminal",
      "Exit code `20` means initialization succeeded but Claude must be restarted."
    ]
  },
  {
    file: "copilot/skills/ow-init/SKILL.md",
    snippets: [
      "This command performs setup only.",
      "Initialize agentOW for UI screenshots, Figma designs, Azure DevOps work items, a killswitch, and code review.",
      "--host copilot",
      "--force",
      "run `CODESPACES=false az login` in the current Codespace terminal",
      "Exit code `20` means initialization succeeded but Copilot CLI must be restarted."
    ]
  },
  {
    file: "skills/ow-team/SKILL.md",
    snippets: [
      "Step 1.1: Bootstrap Session Capabilities",
      "agentow-bootstrap.mjs",
      "--host claude",
      "capabilitiesPath",
      "stop before spawning agents",
      "Re-run bootstrap with `--force`"
    ]
  },
  {
    file: "copilot/skills/agentow/SKILL.md",
    snippets: [
      "Step 1.25: Bootstrap session capabilities",
      "agentow-bootstrap.mjs",
      "--host copilot",
      "capabilitiesPath",
      "stop before planning"
    ]
  },
  {
    file: "skills/ow-batch/SKILL.md",
    snippets: [
      "run the session bootstrap once",
      "Do not start any task team"
    ]
  },
  {
    file: "copilot/skills/ow-batch/SKILL.md",
    snippets: [
      "Save the complete normalized task list",
      "Do not begin a batch"
    ]
  },
  {
    file: "agents/ow-planner.md",
    snippets: [
      "`capabilitiesPath`",
      "Plan against available capabilities"
    ]
  },
  {
    file: "copilot/agents/planner.agent.md",
    snippets: [
      "`capabilitiesPath`",
      "do not block on irrelevant optional tools"
    ]
  },
  {
    file: "docs/context-maintenance.md",
    snippets: [
      "auto-commit",
      "patch-only",
      "Plan-stage candidates capture intended decisions",
      "target-document digest at candidate creation",
      "The user's feedback is the trigger to run maintenance; no second confirmation is required.",
      "never silently rebase",
      "target-document digest",
      "Require a clean context worktree",
      "Stage and commit only the candidate's target paths",
      "cannot block build, evaluation, PR creation, or the next batch task"
    ]
  },
  {
    file: "copilot/skills/agentow/SKILL.md",
    snippets: [
      "Step 3.5: Maintain context from the plan",
      "Step 8: Maintain context from the as-built result",
      "This phase never pauses the product workflow.",
      "`~/.config/agentow/runs.ndjson`"
    ]
  },
  {
    file: "copilot/agents/context-maintainer.agent.md",
    snippets: [
      "planned behavior as intent, not fact",
      "inspect the actual commit/diff",
      "Do not invent feature-specific destinations.",
      "targetDocumentDigest"
    ]
  },
  {
    file: "agents/ow-orchestrator.md",
    snippets: [
      "Non-blocking Plan Context Maintenance",
      "Non-blocking As-built Context Maintenance",
      "Context maintenance never asks the user",
      "run **Step 1c**, then proceed to **Step 1.5",
      "contextLinkPath: <contextLinkPath>",
      "contextDocuments: <latest routed document paths>",
      "clean worktree outside the generated patch",
      "never blocks the product PR",
      "capabilitiesPath: <capabilitiesPath>"
    ]
  },
  {
    file: "copilot/skills/ow-context-feedback/SKILL.md",
    snippets: [
      "User feedback is already the trigger.",
      "without asking another question",
      "supersedes"
    ]
  },
  {
    file: "skills/ow-context-feedback/SKILL.md",
    snippets: [
      "spawn one bounded `general-purpose` agent",
      "target-document digest",
      "Stage only candidate target paths."
    ]
  },
  {
    file: "skills/ow-batch/SKILL.md",
    snippets: [
      "`ow-context-maintainer`",
      "routing.v1.json",
      "next routing revision"
    ]
  },
  {
    file: "agents/ow-generator.md",
    snippets: [
      "`contextLinkPath`",
      "`contextDocuments`",
      "sizeAuditStatus: \"passed-no-regression\"",
      "Do not run `analyze-cli` or search for speculative size issues",
      "Prove Flight/KS graduation direction before editing",
      "Never infer direction from names such as `Fix`, `Enabled`, `New`, `Legacy`, `Fallback`, or",
      "KS inactive and Flight enabled by default",
      "Replace only the target Flight/KS expression with that proven literal",
      "Treat the result as the substitution oracle for the final code",
      "process to a Flight using its proven enabled literal",
      "does not become unconditional",
      "graduation is worse than leaving the gate in place",
      "The direction examples above apply only when adding a live KS",
      "For Flight/KS graduation, delete removed-branch cases and gate-only support",
      "freely rename, restructure, rewrite, or add graduation-related tests",
      "do not preserve stale Flight/KS suite names or setup",
      "prefer updating the threshold with no new tests",
      "If the developer chooses to retain the current threshold"
    ]
  },
  {
    file: "copilot/skills/agentow/SKILL.md",
    snippets: [
      "When any task graduates a Flight, KS, Feature, experiment, or rollout flag",
      "For graduation-related lines, that reference is",
      "Preserve unrelated predicates, operators, behavior, comments, and formatting",
      "normal implementation rules only to that separate work",
      "Before editing a Flight/KS graduation, prove direction at every call site",
      "names such as `Fix`, `Enabled`, `New`, `Legacy`, `Fallback`, or `Optimized`",
      "KS inactive",
      "Flight enabled by default",
      "target Flight/KS expression with that",
      "proven literal; simplify mechanically",
      "same substitution process to a Flight using its proven enabled literal",
      "does not become unconditional",
      "reversed graduation is worse than leaving the gate in place",
      "For Flight/KS graduation, delete cases",
      "allow graduation-related test renames",
      "Check their setup and expectations for correctness",
      "prefer updating the threshold with no new",
      "If the developer chooses to retain the current"
    ]
  },
  {
    file: "agents/ow-planner.md",
    snippets: [
      "`contextLinkPath`",
      "`contextDocuments`",
      "Read every `contextDocuments` file",
      "For a Flight/KS graduation",
      "plan graduation-related test renames, rewrites, restructuring, or additions",
      "Require setup and expectations to match the selected old branch",
      "prefer updating that threshold with no new tests",
      "The developer may instead choose minimum surviving-behavior tests"
    ]
  },
  {
    file: "copilot/agents/planner.agent.md",
    snippets: [
      "For a Flight/KS graduation",
      "plan graduation-related test renames, rewrites, restructuring, or additions",
      "Require setup and expectations to match the selected old branch",
      "prefer updating that threshold with no new tests",
      "The developer may instead choose minimum surviving-behavior tests"
    ]
  },
  {
    file: "agents/ow-evaluator.md",
    snippets: [
      "`contextLinkPath`",
      "`contextDocuments`",
      "Read routed context documents"
    ]
  },
  {
    file: "agents/ow-evaluator-rule.md",
    snippets: ["`contextLinkPath`, `contextDocuments`"]
  },
  {
    file: "agents/ow-review-agent.md",
    snippets: ["`contextLinkPath`", "`contextDocuments`"]
  },
  {
    file: "skills/ow-team/SKILL.md",
    snippets: [
      "Spawn all 7 idle agents FIRST",
      "orchestrator last",
      "Spawn all idle agents first and the orchestrator last",
      "routing.v1.json",
      "Reroute `{refinedRequest}`",
      "Never rewrite an earlier revision."
    ]
  },
  {
    file: "skills/ow-batch/SKILL.md",
    snippets: [
      "not part of shutdown acknowledgement",
      "Wait until all 7 return `shutdown_response`",
      "do not create an overlapping team"
    ]
  }
];

const forbiddenChecks = [
  {
    file: "copilot/agents/evaluator.agent.md",
    snippets: [
      "after testing prod/dogfood/msit and a group-connected site",
      "browser_navigate",
      "browser_snapshot",
      "browser_screenshot",
      "source\":\"pr-cdn-fic|local-rush-start|playwright-mcp"
    ]
  },
  {
    file: "tools/agentow-bootstrap.mjs",
    snippets: [
      "pluginName: \"playwright-mcp-servers\"",
      "\"browser.playwright-mcp\"",
      "\"fixture.playwright-profile\""
    ]
  },
  {
    file: "agents/ow-evaluator-rule.md",
    snippets: ["If a freshly created group site still lacks"]
  },
  {
    file: "agents/ow-planner.md",
    snippets: ["- Pattern D (external product dependency)"]
  },
  {
    file: "docs/context-maintenance.md",
    snippets: [
      "awaiting_approval",
      "Context approval is a separate user decision",
      "requiredForRun"
    ]
  },
  {
    file: "copilot/skills/agentow/SKILL.md",
    snippets: ["requiredForRun"]
  },
  {
    file: "agents/ow-orchestrator.md",
    snippets: ["requiredForRun"]
  },
  {
    file: "skills/ow-team/SKILL.md",
    snippets: [
      "Spawn the orchestrator **first**",
      "Proceed to PR creation",
      "even if review found critical issues"
    ]
  },
  {
    file: "copilot/skills/ow-context-feedback/SKILL.md",
    snippets: [
      "On approval",
      "Approval must"
    ]
  },
  {
    file: "copilot/skills/agentow/SKILL.md",
    snippets: ["**FAIL and cycle < 5:** YOU fix"]
  },
  {
    file: "copilot/agents/evaluator.agent.md",
    snippets: [
      "If `adminUser` + `nonAdminUser` cannot be acquired from TRIPS",
      "save BEFORE to `<sessionDir>/evaluation/iter<N>/before-<component>.png`",
      "save AFTER to `<sessionDir>/evaluation/iter<N>/after-<component>.png`"
    ]
  },
  {
    file: "agents/ow-evaluator-rule.md",
    snippets: ["If TRIPS cannot allocate the needed users in both prod and dogfood"]
  },
  {
    file: "copilot/AGENTS.md",
    snippets: [
      "ship even with critical issues",
      "confirm before shipping with critical review issues"
    ]
  },
  {
    file: "agents/ow-orchestrator.md",
    snippets: [
      "evaluator and review-agent start immediately",
      "dispatch evaluator (code inspection) and review-agent simultaneously",
      "Collect all three responses"
    ]
  },
  {
    file: "copilot/skills/agentow/SKILL.md",
    snippets: ["Auto: proceed to ship anyway"]
  }
];

const orderedChecks = [
  {
    file: "skills/ow-team/SKILL.md",
    first: "## Step 1.1: Bootstrap Session Capabilities",
    second: "## Step 1.25: Resolve Linked Context"
  },
  {
    file: "copilot/skills/agentow/SKILL.md",
    first: "## Step 1.25: Bootstrap session capabilities",
    second: "## Step 1.5: Resolve the context library"
  },
  {
    file: "skills/ow-batch/SKILL.md",
    first: "run the session bootstrap once",
    second: "## Step 2: For Each Task"
  }
];

const mirroredChecks = [
  ["docs/capability-bootstrap.md", "copilot/docs/capability-bootstrap.md"],
  ["docs/review-contract.md", "copilot/docs/review-contract.md"],
  ["docs/review-misses.md", "copilot/docs/review-misses.md"],
  ["skills/ow-review/references/accessibility.md", "copilot/skills/ow-review/references/accessibility.md"],
  ["skills/ow-review/references/common-review-issues.md", "copilot/skills/ow-review/references/common-review-issues.md"],
  ["skills/ow-review/references/graduation.md", "copilot/skills/ow-review/references/graduation.md"],
  ["skills/ow-review/references/localization-and-formatting.md", "copilot/skills/ow-review/references/localization-and-formatting.md"],
  ["skills/ow-review/references/shared-utility-reuse.md", "copilot/skills/ow-review/references/shared-utility-reuse.md"],
  ["skills/ow-review/references/sharepoint-design-system-and-ux-components.md", "copilot/skills/ow-review/references/sharepoint-design-system-and-ux-components.md"],
  ["skills/ow-review/references/size-regression.md", "copilot/skills/ow-review/references/size-regression.md"],
  ["skills/ow-review/references/ux-architecture-and-bundle-boundaries.md", "copilot/skills/ow-review/references/ux-architecture-and-bundle-boundaries.md"],
  ["tools/agentow-bootstrap.mjs", "copilot/tools/agentow-bootstrap.mjs"],
  ["tools/validate-graduation-review-report.mjs", "copilot/tools/validate-graduation-review-report.mjs"],
  ["tools/validate-review-report.mjs", "copilot/tools/validate-review-report.mjs"],
  ["tools/review-ledger.mjs", "copilot/tools/review-ledger.mjs"]
];

const platformMirroredChecks = [
  ["skills/ow-review/references/sharepoint-theme-and-detheme.md", "copilot/skills/ow-review/references/sharepoint-theme-and-detheme.md"],
];

let failures = 0;

for (const check of checks) {
  const fileUrl = new URL(check.file, repoRootUrl);
  const content = fs.readFileSync(fileUrl, "utf8");

  for (const snippet of check.snippets) {
    if (!content.includes(snippet)) {
      console.error(`Missing prompt guard in ${check.file}: ${snippet}`);
      failures++;
    }
  }
}

for (const check of forbiddenChecks) {
  const fileUrl = new URL(check.file, repoRootUrl);
  const content = fs.readFileSync(fileUrl, "utf8");

  for (const snippet of check.snippets) {
    if (content.includes(snippet)) {
      console.error(`Forbidden prompt regression in ${check.file}: ${snippet}`);
      failures++;
    }
  }
}

for (const check of orderedChecks) {
  const content = fs.readFileSync(new URL(check.file, repoRootUrl), "utf8");
  const firstIndex = content.indexOf(check.first);
  const secondIndex = content.indexOf(check.second);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex >= secondIndex) {
    console.error(`Prompt ordering regression in ${check.file}: ${check.first} must precede ${check.second}`);
    failures++;
  }
}

for (const [sourceFile, mirrorFile] of mirroredChecks) {
  const source = fs.readFileSync(new URL(sourceFile, repoRootUrl), "utf8");
  const mirrorUrl = new URL(mirrorFile, repoRootUrl);
  if (!fs.existsSync(mirrorUrl) || fs.readFileSync(mirrorUrl, "utf8") !== source) {
    console.error(`Generated Copilot mirror is stale: ${mirrorFile}`);
    failures++;
  }
}

const normalizePlatformMirror = (content) => content
  .replaceAll("\r\n", "\n")
  .replace(/Claude\s+plugin/g, "platform plugin")
  .replace(/Copilot\s+plugin/g, "platform plugin")
  .trimEnd();

for (const [sourceFile, mirrorFile] of platformMirroredChecks) {
  const source = normalizePlatformMirror(fs.readFileSync(new URL(sourceFile, repoRootUrl), "utf8"));
  const mirrorUrl = new URL(mirrorFile, repoRootUrl);
  if (!fs.existsSync(mirrorUrl) || normalizePlatformMirror(fs.readFileSync(mirrorUrl, "utf8")) !== source) {
    console.error(`Platform-aware Copilot mirror is stale: ${mirrorFile}`);
    failures++;
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log("agentOW prompt guards validated");
}
