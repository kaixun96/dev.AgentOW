# agentOW for GitHub Copilot CLI

This directory is the packaged agentOW plugin. The main Copilot session is both orchestrator and
implementer; bounded stateless agents handle research, evaluation, Accessibility evidence, review,
and context maintenance.

## Install

```bash
copilot plugin marketplace add kaixun96/dev.AgentOW
copilot plugin install agentow-copilot@agentOW
```

### Recommended first run

Enter `/ow-init`. This does not start planning or modify product code. Restart Copilot CLI if
initialization changes plugins or settings. If Azure authentication is missing, run
`CODESPACES=false az login` in the current Codespace terminal, then rerun `/ow-init`.

## Execution model

- `/agentow` runs the STANDARD or POC feature pipeline.
- `/agentow-a11y` runs isolated evidence-first Accessibility remediation.
- `/ow-a11y-host-setup` prepares a Windows evaluator for real-AT and audio evidence.
- `/ow-batch` executes tasks serially with durable checkpoints.
- `/ow-review` reviews without editing or shipping.
- `/ow-context-feedback` applies later evidence to the linked context library.

The implementer remains in the main session across fix cycles. Stateless agents keep large
read-only investigations and independent verification out of the implementation context.

## Durability

Runs use `.aero/<session>/` as the continuity authority:

```text
run-state.json
request-history.ndjson
lifecycle.ndjson
report.json
report-recovery.ndjson
artifact-index.json
checkpoints/
planning/
implementation/
evaluation/
context/
review.md
review.json
final.md
```

A detached watcher reconciles screenshots and other artifacts after interruption. Same-task
requirement changes checkpoint the prior revision and reopen the existing run.

## Shared MCP server

The TypeScript MCP source lives at repository root under `ts/`. `npm run build` compiles it and
copies the self-contained bundle to `copilot/ts/dist/`. Root `tools/` and selected shared docs,
review references, and registries are mirrored into this directory for packaging.

The runtime manifest and `.mcp.json` launch:

```text
${CLAUDE_PLUGIN_ROOT}/ts/dist/ow/index.js mcp
```

`CLAUDE_PLUGIN_ROOT` is the host-provided plugin-root variable name used by Copilot CLI.

## Structure

```text
copilot/
├── .claude-plugin/plugin.json
├── .mcp.json
├── AGENTS.md
├── agents/
├── skills/
├── docs/
├── tools/
├── review-rule-registry.json
├── graduation-review-rule-registry.json
└── ts/dist/
```

`.claude-plugin` is the marketplace manifest format consumed by Copilot CLI. The directory name is
not a second runtime edition.

See the repository [README](../README.md) and [usage guide](../docs/USING-AGENTOW.md).
