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
      "every candidate result is `rejected` with an evidence path"
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
      "do not route it to the implementer as a code defect"
    ]
  },
  {
    file: "copilot/AGENTS.md",
    snippets: [
      "one failed URL, credential, tenant, or site is resource-local evidence",
      "Missing or incomplete coverage triggers evaluator-only environment discovery"
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
    snippets: ["If `adminUser` + `nonAdminUser` cannot be acquired from TRIPS"]
  },
  {
    file: "agents/ow-evaluator-rule.md",
    snippets: ["If TRIPS cannot allocate the needed users in both prod and dogfood"]
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
