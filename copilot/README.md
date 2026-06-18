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
| Batch = spawn a team per task | Batch = `copilot -p "/agentow <task>"` headless loop (cleaner isolation) |

The key insight: the generator needs context continuity across fix cycles, and the main session already has it. Make the main session the implementer; keep subagents for bounded "look and report" work (which also offloads context-heavy reading from the main session). This mirrors the [ironflow-copilot](https://github.com/gim-home/TeamsPluginMarket) plugin's proven main-session-implementer pattern.

## Session artifacts and visual gate

Copilot runs should keep the same baseline observability as the Claude pipeline:

```text
/workspaces/odsp-web/.aero/<session>/
├── plan.md
├── progress.log
├── report.json
├── planning/planner-report.md
├── implementation/iter<N>.md
├── evaluation/iter<N>/evaluator-report.md
├── evaluation/iter<N>/before-*.png
├── evaluation/iter<N>/after-*.png
├── review.md
└── final.md
```

For visible UI changes, BEFORE/AFTER Playwright screenshots are mandatory. If the evaluator cannot capture real screenshots, it must return `FAIL` with the exact reason (missing browser tools, auth prompt, missing debug link, selector mismatch, screenshot failure, etc.). The run must not claim visual verification passed without screenshot paths.

## Shared MCP server

The TypeScript MCP server (`../ts/`) is **reused unchanged** — Copilot CLI has first-class MCP support. The built bundle is copied into this plugin at `ts/dist/ow/index.js`, and `.mcp.json` / `plugin.json` launch that self-contained copy. Both the Claude and Copilot versions can connect to the same tool codebase independently (each CLI spawns its own MCP process).

## Install

Prereqs: Copilot CLI ([install](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli)) + `copilot auth`. The MCP bundle is shipped inside this plugin at `ts/dist/`; maintainers refresh it with `cd ../ts && npm install && npm run build` before publishing.

```bash
copilot plugin marketplace add kaixun96/dev.AgentOW
copilot plugin install agentow-copilot@agentOW
```

Then:

```bash
copilot -p "/agentow fix the elevation background on mobile"          # auto-ish, one shot
copilot -p "/ow-batch 1. Fix bug A 2. Add feature B"                  # serial batch
copilot                                                               # interactive session
> /agentow add a loading spinner to PhotoGrid
> /ow-batch tasks.md
```

## Needs verification (the spike)

These are written per the conventions of working Copilot CLI plugins (ironflow-copilot, slidesshare), but each is an integration point I could not test from here. Verify before relying on the port:

1. **`${CLAUDE_PLUGIN_ROOT}` expansion in plugin-bundled MCP config** — the MCP bundle is self-contained under `copilot/ts/dist/`, but the host still needs to expand `${CLAUDE_PLUGIN_ROOT}` when launching it.
2. **Plugin-bundled MCP auto-load** — confirm Copilot loads `mcpServers` from `.claude-plugin/plugin.json` or `.mcp.json`; otherwise users must merge the same `ow` config into `~/.copilot/mcp-config.json`.
3. **Subagent tool names** — agents declare `tools: [view, grep, glob, shell]` (from ironflow's read-only reviewers + an assumed `shell`). Confirm `shell` is the Copilot name for running commands, and confirm the main session's write/edit tool names.
4. **`@agentow-copilot:<name>` dispatch + parallelism** — ironflow confirms the `@plugin:agent` syntax and single-message parallel dispatch; confirm it works with this plugin's agent names.
5. **Headless permission flags** — `ow-batch` uses `copilot --autopilot --allow-all --max-autopilot-continues 20 -p`. Confirm these flags work in the target Copilot CLI version; fallback is `--yolo`, then plain `copilot -p`.

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
    └── ow-batch/SKILL.md        serial headless /agentow --auto batch loop
```
