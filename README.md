# agentOW

agentOW is a GitHub Copilot CLI harness for ODSP-Web development. It takes a feature, bug, review,
Accessibility remediation, or batch request through source-grounded planning, implementation,
validation, review, and Draft PR delivery inside a GitHub Codespace.

The Copilot CLI edition is the only supported edition.

## Install

```bash
copilot plugin marketplace add kaixun96/dev.AgentOW
copilot plugin install agentow-copilot@agentOW
```

### Recommended first run: initialize prerequisites

Initialize trusted prerequisites before the first task:

```text
/ow-init
```

Restart Copilot CLI when initialization installs or enables plugins. If Azure authentication is
missing, run `CODESPACES=false az login` in the current Codespace terminal and rerun `/ow-init`.

## Commands

| Command | Purpose |
|---|---|
| `/agentow` | Full feature/bug pipeline |
| `/agentow --auto` | Zero-interaction full pipeline |
| `/agentow --poc` | Fast runnable proof of concept, not production-ready |
| `/agentow-a11y` | Evidence-first Accessibility remediation |
| `/agentow-a11y-explore-test` | Exploratory WCAG testing and deterministic reporting |
| `/ow-a11y-host-setup` | Prepare a Windows host for real-AT and audio evidence |
| `/ow-batch` | Serial, checkpointed batch execution |
| `/ow-review` | Review a branch or existing ADO PR without editing or shipping |
| `/ow-context-feedback` | Update linked durable context from later feedback |
| `/ow-share-insights` | Preview and explicitly opt in to sharing a privacy-filtered run report |
| `/ow-init` | Initialize prerequisites without changing product code |
| `/ow-doctor` | Force environment diagnosis and repair |

The main Copilot session owns orchestration and implementation so fix-cycle context is retained.
Planner, evaluator, A11y evaluator, A11y explore planner/category tester, reviewer, and
context-maintainer agents are bounded stateless workers.

agentOW is a routing/execution layer. Feature-specific rules and execution guards should live in the routed context docs rather than in generic harness prompts. Context maintenance never adds a user gate.

## Durable delivery

Each run writes a `.aero/<session>/` tree containing:

- `run-state.json`, request/lifecycle journals, checkpoints, and timing;
- privacy-filtered HTML and JSON run insights, generated locally and shared only after explicit
  per-report consent;
- planner mode, plan, implementation, evaluator, review, and final artifacts;
- content-hashed artifact index and report recovery journal;
- linked-context routing, evidence, candidates, and apply results;
- progress output suitable for detached reconciliation.

Visible STANDARD changes require representative BEFORE/AFTER evidence. Accessibility-primary work
uses `/agentow-a11y`; unavailable real-AT validation may produce only an explicitly labeled
`UNVERIFIED A11Y` Draft after bounded attempts, supporting checks, and review.

Critical and Important review findings block PR creation. PR tools create or update Draft PRs only,
and attachments update the PR description rather than posting comment threads.

## Documentation

- [Detailed usage guide](docs/USING-AGENTOW.md)
- [中文使用指南](docs/USING-AGENTOW.zh-CN.md)
- [Copilot plugin architecture](copilot/README.md)
- [Capability bootstrap](docs/capability-bootstrap.md)
- [Run lifecycle](docs/run-lifecycle.md)
- [Run insights and consent](docs/run-insights.md)
- [Context maintenance](docs/context-maintenance.md)
- [Review contract](docs/review-contract.md)
- [Harness contract](docs/harness-contract.md)
- [Success metrics](docs/value-metrics.md)
- [Personal-account evaluator browser](docs/personal-evaluator-browser.md)

## Architecture

```text
Copilot CLI plugin (copilot/)
  ├── AGENTS.md
  ├── agents/
  ├── skills/
  ├── docs/
  ├── tools/          generated from shared root tools
  └── ts/dist/        generated from shared TypeScript MCP source

Shared development source
  ├── ts/
  ├── tools/
  ├── contracts/
  ├── docs/
  ├── skills/ow-review/references/
  └── review rule registries
```

The root `skills/ow-review/references/` directory is shared review knowledge, not a second plugin
edition. `npm run build` validates the harness, builds the MCP server, and refreshes the packaged
Copilot mirrors.

## Contributing

All changes go through pull requests:

1. Branch from `main`.
2. Make and validate the change.
3. Run:

   ```bash
   cd ts
   npm run build
   npm run typecheck
   ```

4. Open a PR against `kaixun96/dev.AgentOW:main`.

Repository: https://github.com/kaixun96/dev.AgentOW
