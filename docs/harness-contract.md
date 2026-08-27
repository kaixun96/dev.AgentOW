# Harness contract validation

agentOW treats its agents, skills, tools, lifecycle gates, and delivery boundaries as one
machine-checkable contract. Run:

```bash
cd ts
npm run validate-harness-contract
```

The command runs negative fixtures and validates the live repository against
`contracts/harness-contract.json`. It executes before the existing prompt guards in `npm run build`.

## What is validated

- agent and skill frontmatter shape and unique names;
- least-privilege tool sets for planner, evaluator, reviewer, context maintainer, and orchestrator;
- `ow-*` agent tools against the TypeScript MCP registry;
- `@agentow-copilot:*` references against installed Copilot agents;
- marketplace, plugin manifest, and MCP mirror consistency;
- ordered lifecycle markers for STANDARD, POC, and A11y flows;
- generated tool, review-reference, and documentation mirrors;
- draft-only PR creation/update and the no-comment attachment path;
- review evidence binding to the current Git HEAD and diff digest.

The older `validate-agentow-prompts.mjs` remains intentional. It protects detailed domain wording
and regression lessons. The harness contract validator owns structural relationships and
least-privilege boundaries instead of replacing those prompt checks.

## Contract markers

Safety-critical phases carry HTML comment markers such as:

```html
<!-- agentow-contract:gate:review:profiles=poc,standard -->
```

The comments are colocated with the phase they describe and do not affect rendered Markdown.
`markerContracts` requires them to exist in lifecycle order. Add a marker only for a structural
gate; normal prose changes do not need contract updates.

## Changing the contract

1. Update the implementation and `contracts/harness-contract.json` together.
2. Add or update a negative fixture when introducing a new rule type.
3. Run `npm run validate-harness-contract`.
4. Run the complete `npm run build` and `npm run typecheck`.

Do not weaken a role policy merely to make a prompt change pass. If a new permission or bypass is
required, document the capability boundary and make the contract change explicit in review.

## Output

The normal command prints concise failures. Automation can request structured output:

```bash
node scripts/validate-harness-contract.mjs --json
```

Each finding includes a stable rule ID, severity, file, and actionable message.
