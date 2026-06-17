# agentOW for Copilot CLI

A port of [agentOW](../README.md) to GitHub Copilot CLI. Same goal — odsp-web feature description → draft PR — but re-architected around Copilot CLI's grain instead of Claude Code's Agent Teams.

> **Status: thin slice / proof of concept.** Covers the core pipeline (research → plan → implement → verify → fix loop → review → PR). Batch mode, standalone screenshots, and the adversarial dual-evaluator are NOT ported yet. Several Copilot-specific integration points need verification — see [Needs verification](#needs-verification).

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

## Shared MCP server

The TypeScript MCP server (`../ts/`) is **reused unchanged** — Copilot CLI has first-class MCP support. `.mcp.json` points at `../ts/dist/ow/index.js`. Both the Claude and Copilot versions can connect to it independently (each CLI spawns its own MCP process). One tool codebase, two orchestration front-ends.

## Install (local, for the thin slice)

Prereqs: Copilot CLI ([install](https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli)) + `copilot auth`. The `../ts` MCP server must be built (`cd ../ts && npm install && npm run build`).

```bash
# From a Copilot CLI session, add this folder as a local plugin
copilot plugin install ./copilot      # exact local-path syntax: see "Needs verification"

# Register the Playwright MCP (for the evaluator's screenshots)
# (Copilot MCP config: ~/.copilot/mcp-config.json — see "Needs verification")
```

Then:

```bash
copilot -p "/agentow fix the elevation background on mobile"          # auto-ish, one shot
copilot                                                               # interactive session
> /agentow add a loading spinner to PhotoGrid
```

## Needs verification (the spike)

These are written per the conventions of working Copilot CLI plugins (ironflow-copilot, slidesshare), but each is an integration point I could not test from here. Verify before relying on the port:

1. **`${CLAUDE_PLUGIN_ROOT}` expansion in `.mcp.json`** — does Copilot CLI expand it, and is `../ts/...` resolvable from the plugin root? If not, use an absolute path or Copilot's plugin-root env var.
2. **Local plugin install syntax** — the exact `copilot plugin install <local-path>` form (vs. marketplace-only).
3. **MCP config location** — `~/.copilot/mcp-config.json` per the docs; confirm whether plugin-bundled `.mcp.json` is auto-loaded or must be merged in.
4. **Subagent tool names** — agents declare `tools: [view, grep, glob, shell]` (from ironflow's read-only reviewers + an assumed `shell`). Confirm `shell` is the Copilot name for running commands, and confirm the main session's write/edit tool names.
5. **`@agentow-copilot:<name>` dispatch + parallelism** — ironflow confirms the `@plugin:agent` syntax and single-message parallel dispatch; confirm it works with this plugin's agent names.
6. **Headless `--allow-all-tools`** — for the batch loop and unattended runs, confirm headless mode runs the full pipeline (including subagent dispatch) without interactive prompts. ironflow's AGENTS.md flags this as an open adaptation point.

## Not ported yet

- **Batch mode** — will be a `copilot -p` headless loop, not a team-spawn dispatcher.
- **Standalone `/ow-screenshot`** — screenshot existing PRs.
- **Dual adversarial evaluator** (rule + vision ensemble) — the thin slice uses a single evaluator.
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
└── skills/agentow/SKILL.md      main-session orchestration
```
