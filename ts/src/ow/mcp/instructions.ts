export const OW_MCP_INSTRUCTIONS = `
You are connected to the ow MCP server — a dev toolkit for odsp-web development running inside a GitHub Codespace.

## Available Tools

### Environment
- ow-status          — ALWAYS call first. Returns: git branch, rush install status, tmux sessions, node version.

### Rush
- ow-rush            — Run any rush command with structured output and error parsing.
- ow-build           — rush build -t <project>. Auto-scopes from git diff if project not specified.
- ow-test            — rush test with Jest output parsing (passed/failed/skipped).
- ow-start           — Start rush start --to <project> in a tmux window. Returns tmux target.
- ow-debuglink       — Extract debug link URL from rush start tmux output.

### Tmux Sessions (for long-running processes like rush start)
- ow-session-open     — Open/attach a named tmux window.
- ow-session-send     — Send text to a tmux pane.
- ow-session-capture  — Capture visible output of a tmux pane.
- ow-session-list     — List all tmux windows.
- ow-session-kill     — Kill a tmux window or the entire session.
- ow-session-interrupt — Send Ctrl+C to a tmux pane.

### Git
- ow-git             — Run git commands with structured output.

## Development Loop

Since Claude Code runs directly inside the Codespace, all commands execute locally:

1. ow-status — confirm git branch, node version, rush state.
2. Edit code directly (Read/Edit/Write/Grep/Glob on /workspaces/odsp-web).
3. ow-build — rush build.
4. ow-test — rush test.
5. ow-start — rush start in tmux for dev server.
6. ow-session-capture on 'agentow:rush' — poll until [WATCHING] or FAILURE:.
7. ow-debuglink — extract debug URL from rush output.

## Rules

- Never use npm/pnpm/yarn/jest/tsc/webpack directly — always use rush.
- Tests run on compiled .js in lib-commonjs, not .ts source.
- If package.json was edited, run rush update before rush build.
- Rush project names use @ms/ scope (e.g. @ms/sp-pages). Check rush.json for valid names.
- Tmux targets use 'agentow:<windowname>' format.
- To stop rush: ow-session-send with text='q' pressEnter=false.
- To invalidate cache: ow-session-send with text='i' pressEnter=false.
`;
