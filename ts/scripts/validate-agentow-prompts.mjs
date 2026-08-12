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
  "Evaluate a Flight/KS before any gated helper",
  "Gate execution, not merely value selection",
  "For `Promise.all`, decide whether any failure should fail the feature",
  "Use `useCallback` only when identity reaches a memoized/expensive child",
  "Put API operation QoS at the provider/data-source boundary",
  "Consume `ServiceScope`/`PageContext` only after readiness",
  "Use one shared, normalized, same-origin, fail-closed navigation resolver",
  "Do not turn this reference into mechanical policy"
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

const checks = [
  {
    file: "copilot/skills/agentow/SKILL.md",
    snippets: [
      "agentOW is the routing and execution layer; feature-specific rules and execution guards live in those context docs, not in this skill.",
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
      "exhaustive `sourcePaths`"
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
      "FIC Playwright/Heft — the only screenshot engine",
      "`visualValidation.source` to `local-rush-start` or `pr-cdn-fic`"
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
      "Playwright MCP and browser profiles are not AgentOW validation routes"
    ]
  },
  {
    file: "copilot/AGENTS.md",
    snippets: [
      "one failed URL, credential, tenant, or site is resource-local evidence",
      "Missing or incomplete coverage triggers evaluator-only environment discovery",
      "Primary PR screenshots must show the full browser page/viewport",
      "the main session must independently view both primary images"
    ]
  },
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
      "FIC Playwright/Heft",
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
      "Reading every file, spending more time, or finding several defects is not evidence that the review is exhaustive.",
      "generated/mechanical claims cannot override this hard ceiling",
      "At 2,000 or more substantive changed lines, the change is always `must-split`.",
      "splitBoundaries",
      "--diff-numstat",
      "validate-review-report.mjs"
    ]
  },
  {
    file: "docs/sp-client-review-profile.md",
    snippets: [
      "Runtime behavior and styling changes must be protected by a flight or killswitch.",
      "Activated means old/fallback behavior; not activated means new behavior.",
      "common-review-issues.md",
      "call-time evaluation requirement",
      "bundle delta of 2 KB or more is a review trigger",
      "server-side filtering, transport pagination/continuation, and bounded viewport rendering",
      "typographyStyles",
      "Fluent V9/SPDS primitive",
      "SharePoint theme/Detheme provider flow",
      "spClientRolloutTrace",
      "PR description first",
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
      "A nearby gate is not coverage.",
      "do not equate reading every line with reliable exhaustive review",
      "`preliminary-non-exhaustive` completeness claim",
      "git diff --no-renames",
      "common-review-issues.md",
      "shared-utility-reuse.md",
      "localization-and-formatting.md",
      "sharepoint-design-system-and-ux-components.md",
      "physical-direction CSS",
      "screen-reader or other assistive text",
      "Reference routing",
      "The artifact requirement remains narrower and mandatory",
      "A data-provider-only PR loads `common-review-issues.md` only"
    ]
  },
  {
    file: "copilot/skills/agentow/SKILL.md",
    snippets: [
      "validate-review-report.mjs",
      "classify it as `reviewer-spec`",
      "REQUEST_CHANGES with any Critical or Important finding",
      "Draft status and AUTO mode do not bypass the review quality gate.",
      "--diff-numstat"
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
      "A nearby gate is not coverage.",
      "reading all files does not prove the review is reliable or exhaustive",
      "`preliminary-non-exhaustive`",
      "git diff --no-renames",
      "common-review-issues.md",
      "shared-utility-reuse.md",
      "localization-and-formatting.md",
      "sharepoint-design-system-and-ux-components.md",
      "physical-direction CSS",
      "screen-reader or other assistive text",
      "Reference routing",
      "The artifact requirement remains narrower and mandatory",
      "A data-provider-only PR loads `common-review-issues.md` only"
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
    "skills/ow-review/references/localization-and-formatting.md",
    "copilot/skills/ow-review/references/localization-and-formatting.md",
    localizationFormattingSnippets,
  ),
  ...mirroredSnippetChecks(
    "skills/ow-review/references/sharepoint-design-system-and-ux-components.md",
    "copilot/skills/ow-review/references/sharepoint-design-system-and-ux-components.md",
    sharepointDesignSystemSnippets,
  ),
  {
    file: "agents/ow-orchestrator.md",
    snippets: [
      "validate-review-report.mjs",
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
    snippets: ["`contextLinkPath`", "`contextDocuments`"]
  },
  {
    file: "agents/ow-planner.md",
    snippets: [
      "`contextLinkPath`",
      "`contextDocuments`",
      "Read every `contextDocuments` file"
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
  ["docs/sp-client-review-profile.md", "copilot/docs/sp-client-review-profile.md"],
  ["skills/ow-review/references/shared-utility-reuse.md", "copilot/skills/ow-review/references/shared-utility-reuse.md"],
  ["tools/agentow-bootstrap.mjs", "copilot/tools/agentow-bootstrap.mjs"]
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

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log("agentOW prompt guards validated");
}
