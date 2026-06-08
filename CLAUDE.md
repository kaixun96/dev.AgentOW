# dev.AgentOW — Developer Guide

## Behavioral Baseline

Both **runtime agents** and **anyone developing this plugin** follow [`docs/BEHAVIORAL-GUIDELINES.md`](docs/BEHAVIORAL-GUIDELINES.md): think before coding, simplicity first, surgical changes, goal-driven execution. The `ow-team` and `ow-batch` launchers inline that doc into every spawned agent's prompt, so editing it once propagates the baseline everywhere.

## Source Layout

```
dev.AgentOW/
├── .claude-plugin/          Plugin manifests (plugin.json, marketplace.json)
├── agents/                  Agent definitions (markdown with YAML frontmatter)
├── skills/                  Skill definitions (SKILL.md per skill)
├── hooks/                   Hook config (hooks.json) + guard scripts
└── ts/                      TypeScript MCP server
    ├── src/shared/          Shared utilities (logger, mcpHelpers, constants, models)
    ├── src/ow/mcp/          MCP tool registration + instructions
    ├── src/ow/tools/        Tool implementations (rush, tmux, git, debuglink)
    └── dist/                Build output (tsup → ESM bundle)
```

## Design Principles

### Three-Part Harness

1. **Tools (MCP)** — Deterministic, stateless operations. Each tool does one thing.
2. **Agents** — Workflow roles with specific permissions. Planning != coding != testing.
3. **Skills** — Domain knowledge injected via hooks before tool use.

### Agent Communication

Agents communicate via a shared NDJSON report file (`report.json`). Each agent appends exactly one JSON line when it finishes. The orchestrator reads the file after each agent completes.

### Permission Model

- **Orchestrator**: read-only (cannot modify code, build, or test)
- **Planner**: read-only (research and plan only)
- **Generator**: full access (code, build, test, dev server)
- **Evaluator**: limited write (can create Playwright test scripts, but not edit source)
- **Reviewer**: read-only

## How to Add a Tool

1. Add the tool implementation in `ts/src/ow/tools/` (or inline in `owTools.ts`)
2. Register it in `ts/src/ow/mcp/owTools.ts` using `registerMcpTool()`
3. Add it to the MCP instructions in `ts/src/ow/mcp/instructions.ts`
4. Rebuild: `cd ts && npm run build`
5. Update agent `allowedTools`/`disallowedTools` as needed

## How to Add an Agent

1. Create `agents/<name>.md` with YAML frontmatter:
   - `model`: opus/sonnet/haiku/inherit
   - `permission`: auto/plan/bypassPermissions
   - `allowedTools` / `disallowedTools`
2. Document the agent's input format, steps, and NDJSON output schema
3. Update the orchestrator to invoke the new agent

## How to Add a Skill

1. Create `skills/<name>/SKILL.md` with frontmatter (`name`, `description`)
2. The `description` field drives skill matching — include trigger keywords
3. Add a hook in `hooks/hooks.json` if the skill should auto-inject before tool use

## How to Add a Hook

1. Edit `hooks/hooks.json` — add a new entry under `PreToolUse` or `PreCompact`
2. Set `matcher` to the tool name regex
3. Point `command` to a script in `hooks/`
4. Hook scripts receive tool input on stdin as JSON, emit `{"systemMessage": "..."}` on stdout

## External Tool Integration

agentOW agents reference MCP tools and skills from other codespace plugins rather than reimplementing them:

- **Killswitch tools** (`odsp-generate-guid`, `odsp-add-killswitch-*`) — from `odsp-web-mcp-servers-opt-out`
- **Bluebird** (`search_code`, `code_history`) — from `odsp-web-mcp-servers-opt-in`
- **ADO** (`wit_get_work_item`, etc.) — from `odsp-web-mcp-servers-opt-in`
- **Code review** (`/cr` skill) — from `code-review-tools` plugin
- **Killswitch conventions** — referenced from `odsp-web-mcp-servers-opt-out/skills/killswitches/SKILL.md`

The `ow-ref-external-tools` skill provides a cheatsheet of all available external tools. Agents reference these tools in their prompts but don't require them — they degrade gracefully if a plugin is not installed.

## Naming Conventions

- Tools: `ow-<category>` (e.g. `ow-build`, `ow-session-open`)
- Skills: `ow-<type>-<topic>` (e.g. `ow-dev-build`, `ow-ref-monorepo`)
- Agents: `ow-<role>` (e.g. `ow-generator`, `ow-planner`)
- Tmux session: `agentow`, windows: `agentow:<name>`

## Building

```bash
cd ts
npm run build      # tsup → dist/ow/index.js
npm run typecheck   # tsc --noEmit
npm run dev         # tsx (for development)
```

## Gotchas

- **`npm run build` auto-syncs to plugin cache** (`agents/*.md`, `docs/*.md`, `ts/dist/*` all copied into `~/.claude/plugins/cache/agentOW/agentOW/<version>/`). After build, **restart Claude Code** to reload the MCP server bundle into the active process — already-running MCP processes hold the old bundle in memory and won't see new code until they restart. Already-running agent SUB-processes (planner/evaluator/etc) also use the markdown they read at activation; they won't see updated agent .md until you start a new session.
- The plugin is installed from a cached copy — confirm sync worked by `diff -q /workspaces/dev.AgentOW/ts/dist/ow/index.js ~/.claude/plugins/cache/agentOW/agentOW/0.3.2/ts/dist/ow/index.js`.
- Hook scripts must be executable (`chmod +x`).
- NDJSON report lines must be valid JSON — use `JSON.stringify()`, not manual string building.
- The orchestrator's `SendMessage` only works with Agent Teams enabled.
