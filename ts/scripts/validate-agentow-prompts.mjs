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
      "read them and summarize the exact guard/checklist items that apply"
    ]
  },
  {
    file: "copilot/agents/evaluator.agent.md",
    snippets: [
      "`contextDocuments` — optional feature/domain docs.",
      "apply the documented domain-specific guards"
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

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log("agentOW prompt guards validated");
}
