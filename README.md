# dev.AgentOW

**A**gent for **O**dsp-**W**eb — multi-agent orchestration for odsp-web feature development.

A Claude Code plugin that provides MCP tools, agents, skills, and hooks for developing in the odsp-web monorepo inside GitHub Codespaces.

## Prerequisites

- Node.js 22+
- Claude Code CLI
- GitHub Codespace with odsp-web cloned at `/workspaces/odsp-web`
- An Azure DevOps PAT (Personal Access Token) with **Code (Read)** permission
- Playwright MCP server (for evaluator browser verification)

## Installation

### 1. Clone the repo into your Codespace

The plugin must live at `/workspaces/dev.AgentOW` inside the Codespace. Since Codespace git credentials only cover the odsp-web repo, you need a PAT to clone from the Developer project.

**Generate a PAT:**
1. Go to https://dev.azure.com/onedrive/_usersSettings/tokens
2. Create a token with **Code (Read)** scope

**Clone:**
```bash
git clone https://<your-alias>:<PAT>@dev.azure.com/onedrive/Developer/_git/dev.AgentOW /workspaces/dev.AgentOW
```

After cloning, remove the PAT from the remote URL:
```bash
cd /workspaces/dev.AgentOW
git remote set-url origin https://onedrive@dev.azure.com/onedrive/Developer/_git/dev.AgentOW
```

### 2. Build the MCP server

```bash
cd /workspaces/dev.AgentOW/ts
npm install
npm run build
```

### 3. Install tmux (if not already installed)

```bash
sudo apt-get install -y tmux
```

### 4. Register the plugin

```bash
cd /workspaces/odsp-web
claude plugin marketplace add /workspaces/dev.AgentOW
claude plugin install agentOW@agentOW --scope project
```

### 5. Enable Agent Teams (optional, for orchestrator)

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### 6. Register Playwright MCP (for evaluator)

```bash
claude mcp add --scope user playwright -- npx @playwright/mcp@latest --user-data-dir=/workspaces/.playwright-profile
```

On first use, the evaluator will open a browser. Log in to SharePoint manually once — the session persists for future runs.

### 7. Restart Claude Code and verify

```bash
claude plugin list        # agentOW should be enabled
claude mcp list           # ow server should be connected
claude agent              # agents should be listed
```

## Quick Start

### Full workflow (orchestrated)

```
claude agent ow-orchestrator
> Implement a feature that adds a loading spinner to the photo grid component
```

The orchestrator will coordinate:
1. **ow-planner** — research codebase, draft plan, ask for approval
2. **ow-generator** — implement, build, test, start dev server
3. **ow-evaluator** — verify via Playwright MCP on SharePoint pages with debug links
4. Loop if needed (max 5 cycles)
5. **ow-review-agent** — code review
6. **ow-pr-create** — push + draft PR on Azure DevOps

### Individual agents

```
claude agent ow-planner
> Research and plan how to fix the elevation background bug on mobile
```

### MCP tools directly

In any Claude Code session with the plugin installed:
```
Use ow-status to check my environment
Use ow-build to build @ms/sp-pages
Use ow-start to launch the dev server for @ms/sp-pages
```

## Architecture

### Three-Part Harness

| Layer | Purpose | Components |
|-------|---------|------------|
| **Tools (MCP)** | Deterministic operations | rush, tmux, git, debug link |
| **Agents** | Workflow separation | orchestrator, initiator, planner, generator, evaluator, reviewer |
| **Skills** | Knowledge injection | build rules, test rules, git conventions, PR workflow, monorepo reference |

### MCP Tools (14 total)

| Tool | Description |
|------|-------------|
| `ow-status` | Environment snapshot (git branch, node, rush state, tmux) |
| `ow-rush` | Run any rush command |
| `ow-build` | rush build with error parsing |
| `ow-test` | rush test with Jest result parsing |
| `ow-start` | Launch rush start in tmux |
| `ow-debuglink` | Extract debug link from rush start output |
| `ow-git` | Run git commands |
| `ow-session-open` | Open tmux window |
| `ow-session-send` | Send text to tmux pane |
| `ow-session-capture` | Capture tmux pane output |
| `ow-session-list` | List tmux windows |
| `ow-session-kill` | Kill tmux window/session |
| `ow-session-interrupt` | Send Ctrl+C to tmux pane |
| `ow-pr-create` | Push branch and create draft PR on Azure DevOps |

### Agents

| Agent | Model | Role |
|-------|-------|------|
| `ow-orchestrator` | opus | Coordinate full pipeline (read-only) |
| `ow-planner` | opus | Research + plan + user approval (read-only) |
| `ow-generator` | opus | Implement + build + test + dev server |
| `ow-evaluator` | opus | Verify via Playwright MCP on SharePoint + code inspection |
| `ow-review-agent` | inherit | Pre-PR code review (read-only) |

### Skills

| Skill | Trigger |
|-------|---------|
| `ow-dev-build` | rush build/install/update |
| `ow-dev-test` | rush test, Jest |
| `ow-dev-git` | git, branch, checkout |
| `ow-dev-debuglink` | rush start, debug link |
| `ow-ref-monorepo` | monorepo structure, Rush/Heft |
| `ow-dev-pr` | PR, az repos |
| `search-odspweb-wiki` | wiki, documentation |
| `ow-dev-playwright` | Playwright MCP, browser verification |
