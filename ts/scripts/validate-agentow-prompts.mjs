import fs from "node:fs";

const repoRootUrl = new URL("../../", import.meta.url);

const checks = [
  {
    file: "copilot/skills/agentow/SKILL.md",
    snippets: [
      "agentOW is the routing and execution layer; feature-specific rules and execution guards live in those context docs, not in this skill."
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
      "Candidate discovery hints"
    ]
  },
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
      "`captureMethod` is `page`"
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
      "If the retry still violates the evaluator contract, stop and report the blocker"
    ]
  },
  {
    file: "copilot/AGENTS.md",
    snippets: [
      "one failed URL, credential, tenant, or site is resource-local evidence",
      "Missing or incomplete coverage triggers evaluator-only environment discovery",
      "Primary PR screenshots must show the full browser page/viewport",
      "the main session must independently view both primary images",
      "detached tmux supervisor",
      "retries interrupted children",
      "advances after terminal failures"
    ]
  },
  {
    file: "copilot/skills/ow-batch/SKILL.md",
    snippets: [
      "Architecture: detached supervisor, not a conversation loop",
      "`ow-batch-start`",
      "Ending or interrupting the parent Copilot turn does not terminate the batch.",
      "Every task has a finite attempt timeout and finite retry count.",
      "A single task failure never stops later tasks.",
      "`state.json` is written atomically",
      "`ow-batch-resume`",
      "Do not run Task 1 directly in the parent session",
      "Do not repeatedly poll a healthy supervisor"
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
      "Feature-specific rules and execution guards should live in the routed context docs"
    ]
  }
];

const forbiddenChecks = [
  {
    file: "copilot/agents/evaluator.agent.md",
    snippets: ["after testing prod/dogfood/msit and a group-connected site"]
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
    file: "copilot/skills/ow-batch/SKILL.md",
    snippets: [
      "Run a list of odsp-web tasks sequentially in the **current main session**",
      "Never launch nested `copilot -p`",
      "rely on normal CLI automatic compaction"
    ]
  }
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

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log("agentOW prompt guards validated");
}
