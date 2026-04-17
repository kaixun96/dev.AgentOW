# dev.AgentOW

**A**gent for **O**dsp-**W**eb — multi-agent orchestration for odsp-web feature development.

A Claude Code plugin that provides MCP tools, agents, skills, and hooks for developing in the odsp-web monorepo inside GitHub Codespaces.

## Prerequisites

- Claude Code CLI
- GitHub Codespace with odsp-web cloned at `/workspaces/odsp-web`
- Playwright MCP server (for evaluator browser verification)

## Installation

### 1. Install the plugin

```bash
cd /workspaces/odsp-web
claude plugin marketplace add kaixun96/dev.AgentOW
claude plugin install agentOW@agentOW --scope project
```

No cloning, no building — the plugin is ready to use.

### 2. Install tmux (if not already installed)

```bash
sudo apt-get install -y tmux
```

### 3. Enable Agent Teams

Add to your Claude Code settings (`~/.claude/settings.json`):

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

### 4. Register Playwright MCP (for evaluator)

```bash
claude mcp add --scope user playwright -- npx @playwright/mcp@latest --user-data-dir=/workspaces/.playwright-profile
```

On first use, the evaluator will open a browser. Log in to SharePoint manually once — the session persists for future runs.

### 5. Restart Claude Code and verify

```bash
claude plugin list        # agentOW should be enabled
claude mcp list           # ow server should be connected
claude agent              # agents should be listed
```

## Upgrading

```bash
claude plugin update agentOW@agentOW
```

Then restart Claude Code for changes to take effect.

## Quick Start

### Full workflow (orchestrated)

In any Claude Code session, use the `/ow-team` skill:

```
/ow-team
> Implement a feature that adds a loading spinner to the photo grid component
```

Or just describe what you want — the skill triggers on keywords like "run the agent workflow", "implement a feature", etc.

This creates a persistent team of 5 agents. The orchestrator drives the full pipeline:

1. **ow-planner** researches the codebase and drafts an implementation plan
2. **ow-orchestrator** presents the plan to you for approval
3. **ow-generator** implements the plan — code, build, test, start dev server
4. **ow-evaluator** verifies acceptance criteria via Playwright MCP on SharePoint pages
5. If evaluator finds issues, generator fixes them (max 5 cycles)
6. **ow-review-agent** performs code review (+ superpowers deep review if available)
7. Orchestrator pushes the branch and creates a draft PR on Azure DevOps

> **Note:** Do NOT use `claude agent ow-orchestrator` directly — use `/ow-team` which properly sets up the Agent Team with all members.

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
| **Agents** | Workflow separation | orchestrator, planner, generator, evaluator, reviewer |
| **Skills** | Knowledge injection | build rules, test rules, git conventions, PR workflow, monorepo reference |

### MCP Tools (15 total)

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
| `ow-version` | Check plugin version and update availability |
| `ow-pr-create` | Push branch and create draft PR on Azure DevOps |

### Agents

| Agent | Model | Role |
|-------|-------|------|
| `ow-orchestrator` | opus | Coordinate full pipeline (read-only) |
| `ow-planner` | opus | Research + plan (read-only) |
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
| `ow-ref-external-tools` | killswitch, GUID, bluebird, ADO work item |
| `ow-team` | Launch full agent team workflow |

## Repository

- **GitHub**: https://github.com/kaixun96/dev.AgentOW
