import fs from "node:fs";

const repoRootUrl = new URL("../../", import.meta.url);

const checks = [
  {
    file: "copilot/skills/agentow/SKILL.md",
    snippets: [
      "For Pattern A/B/C/D-reachable changes, this is a **pre-evaluator contract**",
      "If `debugUrl` is empty, do **not** dispatch the evaluator."
    ]
  },
  {
    file: "copilot/agents/evaluator.agent.md",
    snippets: [
      "return `FAIL` with blocker `orchestrator-debug-url-missing`",
      "FIC is a browser/auth execution path, not a substitute"
    ]
  },
  {
    file: "agents/ow-generator.md",
    snippets: [
      "For UI-visible plans, `debugUrl` is a required handoff.",
      "debugUrlStatus"
    ]
  },
  {
    file: "agents/ow-orchestrator.md",
    snippets: [
      "first require `debugUrlStatus=\"ready\"` and a non-empty `debugUrl`",
      "do not dispatch either evaluator"
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
