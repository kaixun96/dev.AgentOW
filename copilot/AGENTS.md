If you were dispatched as a subagent to execute a specific task, skip this guidance.

# agentOW (Copilot CLI) — odsp-web feature pipeline

Take a feature/bug description and produce a draft PR on Azure DevOps for the odsp-web monorepo, inside a GitHub Codespace.

## Architecture: you are the implementer

Unlike a multi-agent team, **the main session (you) is the orchestrator AND the implementer.** You retain full context across the whole task — including every fix cycle. You do NOT hand coding off to a subagent, because a fresh subagent would lose the context of what it already tried.

Subagents are **stateless verifiers** you dispatch as tools. They look, they report, they vanish:

| Subagent | Role | Stateless? |
|----------|------|-----------|
| `@agentow-copilot:planner` | Research the codebase, return findings (root cause, files to change, surface trace) | Yes — pure research |
| `@agentow-copilot:evaluator` | Verify the change via Playwright + code inspection, return PASS/FAIL + blockers | Yes — pure verification |
| `@agentow-copilot:reviewer` | Pre-PR code review against odsp-web conventions | Yes — pure review |

You keep the work that needs continuity and user interaction: talking to the user, writing the plan, writing the code, driving the fix loop, creating the PR. Subagents do the bounded, context-heavy "look at a lot of code and report" work — which also keeps your own context lean.

## The pipeline

```
1. Understand   → (interactive) clarify intent with the user; (auto) proceed
2. Research     → dispatch @planner → get findings
3. Plan         → you write the plan; (interactive) get user approval; (auto) proceed
4. Implement    → YOU write the code, run ow-build, run ow-test
5. Verify       → dispatch @evaluator → get verdict
6. Fix loop     → verdict FAIL? YOU fix (context retained) → re-dispatch @evaluator. Max 5 cycles.
7. Review       → dispatch @reviewer → surface findings
8. Ship         → ow-pr-create (draft PR), then ow-pr-attach for screenshots if captured
```

The `agentow` skill walks you through this in detail. It auto-loads when the user asks to implement a feature or fix a bug in odsp-web.

## Modes

- **Interactive** (default) — clarify intent, approve the plan, confirm before shipping with critical review issues. ~3-5 user touches.
- **Auto** (`--auto` in the prompt) — skip all gates: no intent questions, auto-approve the plan, ship even with critical issues (PR is draft, a human reviews before publishing). Zero user touches.

## Core principles

- **DRY, YAGNI** — minimum code that solves the problem; no speculative abstractions.
- **Surgical changes** — every changed line traces to the request. Don't refactor adjacent code, don't fix unrelated dead code (mention it instead).
- **Follow existing patterns** — search odsp-web first; never hand-craft what the monorepo already provides. Match local naming, imports, error handling.
- **Evidence before claims** — run `ow-build` / `ow-test` and read the output before saying it works. "Should work" / "seems fine" = unverified assumption.
- **Verifiers verify independently** — subagents read the actual code, not your self-report.
- **Surface, don't hide** — state assumptions explicitly. In interactive mode, ask when uncertain. In auto mode, record the assumption in the plan so the user can audit it after.

## odsp-web specifics

- This is a Rush monorepo at `/workspaces/odsp-web`. Never use npm/pnpm/yarn/jest/tsc directly — always rush (via the `ow-build` / `ow-test` / `ow-rush` MCP tools).
- Tests run on compiled `.js` in `lib-commonjs`, not `.ts` source.
- Branch naming: `user/<alias>/<feature>`.
- The `ow` MCP server provides rush/tmux/git/debug-link/PR tools. Call `ow-status` first to orient.

## Instruction priority

1. User's explicit instructions — highest. "Skip this" / "just do it" wins.
2. This workflow — overrides default behavior.
3. Default system prompt — lowest.
