import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFrontmatter, validateHarnessContract } from "./harness-contract-lib.mjs";

const tsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(tsDir, "..");
const contract = JSON.parse(fs.readFileSync(path.join(repoRoot, "contracts", "harness-contract.json"), "utf8"));

assert.deepEqual(
  parseFrontmatter("---\nname: sample\ntools:\n  - view\n  - shell\n---\n"),
  { name: "sample", tools: ["view", "shell"] },
);
assert.deepEqual(
  parseFrontmatter("---\nname: sample\ndescription: |\n  line one\n  line two\ntools: [view, grep, glob, shell]\n---\n"),
  {
    name: "sample",
    description: "line one\nline two",
    tools: ["view", "grep", "glob", "shell"],
  },
);
assert.equal(parseFrontmatter("---\nname: sample\ndescription: |\n---\n").description, "");
assert.throws(
  () => parseFrontmatter("---\nname: sample\ntools:\n  - view\n  [oops\n---\n"),
  /malformed frontmatter/,
);
assert.throws(
  () => parseFrontmatter("---\nname: \"unterminated\ntools:\n  - view\n---\n"),
  /Unbalanced quoted frontmatter value/,
);

const realFindings = validateHarnessContract({ repoRoot, contract });
assert.deepEqual(realFindings, [], JSON.stringify(realFindings, null, 2));

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agentow-contract-"));
try {
  fs.mkdirSync(path.join(fixtureRoot, "copilot", "agents"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "copilot", "skills", "sample"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, ".claude-plugin"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "copilot", ".claude-plugin"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "ts", "src"), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, "copilot", "agents", "planner.agent.md"),
    "---\nname: planner\ndescription: test\nmodel: inherit\ntools:\n  - view\n  - ow-missing\n---\n",
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "copilot", "agents", "bad.agent.md"),
    "---\nname: bad\ndescription: test\nmodel: inherit\ntools:\n  - view\n  [oops\n---\n",
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "copilot", "skills", "sample", "SKILL.md"),
    "---\nname: sample\ndescription: test\n---\n@agentow-copilot:missing\n",
  );
  fs.writeFileSync(path.join(fixtureRoot, "ts", "src", "tools.ts"), 'registerMcpTool(server, "ow-status", {});\n');
  fs.writeFileSync(path.join(fixtureRoot, "policy.txt"), "caller-controlled\n");
  fs.writeFileSync(path.join(fixtureRoot, "markers.md"), "<!-- second -->\n<!-- first -->\n");
  fs.writeFileSync(
    path.join(fixtureRoot, "commands.md"),
    "<!-- command-start -->\n```bash\nnode -e \"console.log('noop')\" validator.mjs --required\n```\n<!-- command-end -->\n",
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "valid-commands.md"),
    "<!-- command-start -->\n```bash\nnode --no-warnings ./validator.mjs --required\n```\n<!-- command-end -->\n",
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "ts", "src", "pr.ts"),
    "interface Input { draft?: boolean }\nclass PrClient { createPr(input: Input) { const draft = input.draft; const azArgs = ['--draft', String(draft)]; azArgs.push('--work-items', 'x', '--draft', String(input['draft'])); return azArgs; } }\n",
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "ts", "src", "attach.ts"),
    "let commentPosted = false; commentPosted = true; const endpoint = '/threads';\n",
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "ts", "src", "schema.ts"),
    "const inputSchema = { 'draft': true };\n",
  );
  fs.writeFileSync(
    path.join(fixtureRoot, ".claude-plugin", "marketplace.json"),
    JSON.stringify({
      plugins: [
        { name: "sample", source: "./copilot", version: "1.0.0" },
        { name: "retired", source: "./", version: "1.0.0" },
      ],
    }),
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "copilot", ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: "sample", version: "1.0.0", mcpServers: {} }),
  );
  fs.writeFileSync(
    path.join(fixtureRoot, "copilot", ".mcp.json"),
    JSON.stringify({ mcpServers: {} }),
  );

  const fixtureContract = {
    frontmatterNamespaces: [
      {
        name: "copilot-agents",
        directory: "copilot/agents",
        suffix: ".agent.md",
        requiredFields: ["name", "description", "model", "tools"],
      },
      {
        name: "copilot-skills",
        directory: "copilot/skills",
        basename: "SKILL.md",
        requiredFields: ["name", "description"],
      },
    ],
    rolePolicies: [
      { file: "copilot/agents/planner.agent.md", exactTools: ["view"] },
      { file: "copilot/agents/bad.agent.md", exactTools: ["view"] },
    ],
    mcpTools: { registryFile: "ts/src/tools.ts", agentNamespaces: ["copilot-agents"] },
    agentReferences: {
      directory: "copilot",
      prefix: "@agentow-copilot:",
      namespace: "copilot-agents",
    },
    pluginManifests: {
      marketplace: ".claude-plugin/marketplace.json",
      plugins: [
        {
          source: "./copilot",
          manifest: "copilot/.claude-plugin/plugin.json",
          mcpMirror: "copilot/.mcp.json",
        },
      ],
    },
    markerContracts: [{ file: "markers.md", ordered: ["first", "second"] }],
    commandPolicies: [
      {
        id: "TEST_COMMAND",
        file: "commands.md",
        startMarker: "command-start",
        endMarker: "command-end",
        commands: [{ contains: "validator.mjs", requiredArgs: ["--required"] }],
      },
      {
        id: "TEST_VALID_COMMAND",
        file: "valid-commands.md",
        startMarker: "command-start",
        endMarker: "command-end",
        commands: [{ contains: "validator.mjs", requiredArgs: ["--required"] }],
      },
    ],
    typescriptPolicies: [
      {
        id: "TEST_DRAFT",
        file: "ts/src/pr.ts",
        kind: "draft-only-pr-client",
        methods: ["createPr"],
        inputInterfaces: ["Input"],
      },
      {
        id: "TEST_COMMENT",
        file: "ts/src/attach.ts",
        kind: "no-pr-comment-write",
      },
      {
        id: "TEST_PROPERTY",
        file: "ts/src/schema.ts",
        kind: "forbid-property",
        properties: ["draft"],
      },
    ],
    sourcePolicies: [{ id: "TEST_POLICY", file: "policy.txt", forbidden: ["caller-controlled"] }],
  };
  const rules = new Set(validateHarnessContract({ repoRoot: fixtureRoot, contract: fixtureContract }).map((item) => item.rule));
  assert(rules.has("ROLE_EXACT_TOOLS"));
  assert(rules.has("FRONTMATTER_INVALID"));
  assert(rules.has("ROLE_FRONTMATTER_INVALID"));
  assert(rules.has("MCP_TOOL_REFERENCE"));
  assert(rules.has("AGENT_REFERENCE"));
  assert(rules.has("MARKETPLACE_PLUGIN_SET"));
  assert(rules.has("LIFECYCLE_MARKER_ORDER"));
  assert(rules.has("TEST_COMMAND"));
  assert(!rules.has("TEST_VALID_COMMAND"));
  assert(rules.has("TEST_DRAFT"));
  assert(rules.has("TEST_COMMENT"));
  assert(rules.has("TEST_PROPERTY"));
  assert(rules.has("TEST_POLICY"));
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}

console.log("harness contract validator tests passed");
