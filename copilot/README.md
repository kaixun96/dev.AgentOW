# agentOW for Copilot CLI

A port of [agentOW](../README.md) to GitHub Copilot CLI. Same goal — odsp-web feature description → draft PR — but re-architected around Copilot CLI's grain instead of Claude Code's Agent Teams.

> **Status: thin slice / proof of concept.** Covers the core pipeline (research → plan → implement → verify → fix loop → review → PR) plus serial batch mode. Standalone screenshots and the adversarial dual-evaluator are NOT ported yet. Several Copilot-specific integration points need verification — see [Needs verification](#needs-verification).

## Why it's structured differently from the Claude version

The Claude version uses a persistent **Agent Team**: orchestrator + planner + generator + evaluators + reviewer, all alive for the session, coordinating via `SendMessage`. Copilot CLI has no equivalent of persistent agents with inter-agent messaging.

So the architecture collapses:

| Claude Code version | Copilot CLI version |
|---------------------|---------------------|
| Separate orchestrator + generator agents | **Main session** is both — it retains context across fix cycles for free |
| planner / evaluator / reviewer as persistent team members | Stateless `.agent.md` subagents, dispatched per-call via `@agentow-copilot:<name>` |
| `TeamCreate` + `SendMessage` + idle/wake/watchdog/deadlock machinery | **None of it** — the main session drives synchronously; no idle agents means no deadlocks |
| Batch = spawn a team per task | Main session runs agentOW tasks serially, checkpointing between tasks |

The key insight: the generator needs context continuity across fix cycles, and the main session already has it. Make the main session the implementer; keep subagents for bounded "look and report" work. Batch mode repeats that pipeline serially in the main session, writes a concise checkpoint after each task, drops completed-task details from active reasoning, and relies on normal CLI compaction when context pressure requires it.

## Session artifacts and visual gate

Copilot runs should keep the same baseline observability as the Claude pipeline:

```text
/workspaces/odsp-web/.aero/<session>/
├── plan.md
├── progress.log
├── report.json
├── planning/
│   ├── planner-mode.json
│   └── planner-report.md
├── implementation/iter<N>.md
├── evaluation/iter<N>/evaluator-report.md
├── evaluation/iter<N>/before-*.png
├── evaluation/iter<N>/after-*.png
├── review.md
└── final.md
```

agentOW automatically chooses a planner mode for each request. `FAST` performs
bounded source verification in the main session when a bug already has a
complete, source-confirmed root-cause packet and a one-behavior/two-file scope.
All other work uses the `FULL` planner agent. Both modes keep the same build,
evaluation, review, and PR gates, and the decision is recorded in
`planning/planner-mode.json`, `progress.log`, and `report.json`.

For visible UI changes, BEFORE/AFTER Playwright screenshots are mandatory. AgentOW uses one screenshot engine: the repository Playwright/Heft harness with FIC authentication. It first validates the local `rush start` bundle, then uses the PR CDN bundle as the only fallback. Playwright MCP is not an AgentOW route. If the evaluator cannot capture real screenshots, it must return `FAIL` with the exact reason (FIC auth prompt, missing debug link, selector mismatch, screenshot failure, etc.). The run must not claim visual verification passed without screenshot paths.

## Shared MCP server

The TypeScript MCP server (`../ts/`) is **reused unchanged** — Copilot CLI has first-class MCP support. The built bundle is copied into this plugin at `ts/dist/ow/index.js`, and `.mcp.json` / `plugin.json` launch that self-contained copy. Both the Claude and Copilot versions can connect to the same tool codebase independently (each CLI spawns its own MCP process).

## Install

Prereqs: Copilot CLI ([install](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli)) + `copilot auth`. The MCP bundle is shipped inside this plugin at `ts/dist/`; maintainers refresh it with `cd ../ts && npm install && npm run build` before publishing.

On the first agentOW invocation in a terminal session, bootstrap checks for a dispatcher-provided personal evaluator and the FIC Playwright/Heft fallback, then installs trusted ODSP/review plugins plus task-triggered Figma/ADO tooling. Enter `/ow-init` for an explicit one-time comprehensive initialization before the first task. Newly installed plugins require restarting Copilot CLI; interactive authentication and consent remain manual when silent renewal cannot complete. Results are written to `.aero/<session>/capabilities.json`.

```bash
copilot plugin marketplace add kaixun96/dev.AgentOW
copilot plugin install agentow-copilot@agentOW
```

### Recommended first run

Initialize all trusted prerequisites before the first product task:

```bash
/ow-init
```

This does not start planning or modify product code. Restart Copilot CLI if requested. If Azure authentication is missing, run `CODESPACES=false az login` in the current Codespace terminal, then rerun `/ow-init`.

Then:

```bash
copilot -p "/agentow fix the elevation background on mobile"          # auto-ish, one shot
copilot -p "/ow-review 1234567"                                       # review an existing PR only
copilot                                                               # interactive session
> /agentow add a loading spinner to PhotoGrid
> /ow-batch tasks.md
> /ow-review                                                          # review the current branch
```

`/ow-review` runs the review gate on its own: no planning, no implementation, no PR. With a PR ID it resolves the PR's source/target branches through `az repos pr show` and materializes the PR head in a temporary detached worktree when it is not the current checkout; with no argument it reviews the current branch against `origin/main`.

Before PR creation, the reviewer performs a risk inventory and an adversarial second pass. Its `review.json` must prove coverage of every changed file, direct consumers, tests, repository/context instructions, and all canonical quality dimensions. Critical and Important findings block every mode until fixed and re-reviewed; AUTO and draft status do not bypass this gate.

## Needs verification (the spike)

These are written per the conventions of working Copilot CLI plugins (ironflow-copilot, slidesshare), but each is an integration point I could not test from here. Verify before relying on the port:

1. **`${CLAUDE_PLUGIN_ROOT}` expansion in plugin-bundled MCP config** — the MCP bundle is self-contained under `copilot/ts/dist/`, but the host still needs to expand `${CLAUDE_PLUGIN_ROOT}` when launching it.
2. **Plugin-bundled MCP auto-load** — confirm Copilot loads `mcpServers` from `.claude-plugin/plugin.json` or `.mcp.json`; otherwise users must merge the same `ow` config into `~/.copilot/mcp-config.json`.
3. **Subagent tool names** — agents declare `tools: [view, grep, glob, shell]` (from ironflow's read-only reviewers + an assumed `shell`). Confirm `shell` is the Copilot name for running commands, and confirm the main session's write/edit tool names.
4. **`@agentow-copilot:<name>` dispatch + parallelism** — ironflow confirms the `@plugin:agent` syntax and single-message parallel dispatch; confirm it works with this plugin's agent names.
5. **Long unattended context behavior** — confirm task checkpoints plus normal Copilot CLI automatic compaction keep long serial batches reliable without nested CLI processes.

## Not ported yet

- **Standalone `/ow-screenshot`** — screenshot existing PRs.
- **Dual adversarial evaluator** (rule + vision ensemble) — the thin slice uses a single evaluator, but Playwright BEFORE/AFTER screenshots are still mandatory for visible UI changes.
- **Brainstorming via superpowers** — Step 1 does lightweight clarification inline.

## File structure

```
copilot/
├── .claude-plugin/plugin.json   plugin manifest
├── .mcp.json                    → ../ts/dist/ow/index.js (shared MCP server)
├── AGENTS.md                    workflow constitution (auto-loaded)
├── CLAUDE.md                    @AGENTS.md
├── agents/
│   ├── planner.agent.md         stateless: research → findings
│   ├── evaluator.agent.md       stateless: verify → PASS/FAIL
│   └── reviewer.agent.md        stateless: review → verdict
└── skills/
    ├── agentow/SKILL.md         main-session orchestration
    └── ow-batch/SKILL.md        serial main-session agentOW loop with task checkpoints
```
