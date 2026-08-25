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

## Session artifacts

Keep the Copilot run artifact-compatible with the Claude pipeline wherever practical:

```text
/workspaces/odsp-web/.aero/<session>/
├── plan.md
├── progress.log
├── report.json
├── report-recovery.ndjson
├── run-state.json
├── request-history.ndjson
├── lifecycle.ndjson
├── artifact-index.json
├── checkpoints/
├── planning/
│   ├── planner-mode.json
│   └── planner-report.md
├── implementation/
│   └── iter<N>.md
├── evaluation/
│   └── iter<N>/
│       ├── evaluator-report.md
│       ├── before-*.png
│       └── after-*.png
├── context/
│   ├── link.json
│   ├── evidence.ndjson
│   ├── state.json
│   ├── candidates/
│   └── apply/
├── capabilities.json
├── review.md
├── review.json
└── final.md
```

- `progress.log` is mandatory and user-visible. Append a timestamped line before every state transition. Treat it as a first-class product surface, not debug noise.
- `run-state.json` is the continuity authority. User interruptions and post-completion requirement
  changes must be recorded before answering; same-task follow-ups reuse the run and increment its
  revision rather than creating a new `.aero` directory.
- `artifact-index.json` is content-hashed and reconciled from disk. A screenshot or evaluator
  artifact that exists on disk must be represented in `report.json` and `progress.log` even if the
  main conversation was interrupted before the evaluator returned.
- `report-recovery.ndjson` is the append-only supplement when `report.json` ends in an in-flight
  partial record. Consumers read the union and deduplicate artifact IDs; reconciliation may
  backfill artifact records once the report is healthy and never truncates another writer's data.
- `report.json` is NDJSON. Append one JSON object for planner mode, each planner pass, each implementation cycle, evaluator, reviewer, and final status.
- All report writers use `run-state.mjs report` with a one-object JSON file. Direct append to
  `report.json` is forbidden. Readers consume the deduplicated union of the main and recovery
  journals.
- `planning/planner-mode.json`, `planning/planner-report.md`, `implementation/iter<N>.md`, `evaluation/iter<N>/evaluator-report.md`, `review.md`, `review.json`, and `final.md` are mandatory unless the run stops before that phase.
- `context/link.json` is mandatory and records either a resolved context library or `status: "unlinked"`.
- Context evidence is append-only. Plan intent, actual code, evaluation, review, and later feedback must remain distinguishable.
- Context maintenance is non-blocking. It follows the linked library's `auto-commit`, `patch-only`, or `disabled` policy and never adds a user prompt to interactive, AUTO, or batch execution.
- Session bootstrap runs before planning. It installs only fixed packages from the trusted local odsp-web marketplace, redacts evidence, and stops once when newly installed MCP/settings require a host restart.
- Review follows `docs/review-contract.md` plus path-scoped profiles such as `docs/sp-client-review-profile.md`. APPROVE requires validated current-diff identity, every changed file, every canonical coverage dimension, and an adversarial second pass. Critical and Important findings block PR creation in every mode.

## Progress log event contract

Use this exact style. Each line starts with `[HH:MM:SS]`, one emoji, and a short human-readable state. The main session writes orchestration lines; planner/evaluator/reviewer write their own completion lines.

```text
[HH:MM:SS] 🚀 Session started: <session>
[HH:MM:SS] 💬 USER PROMPT: <one-line or heredoc marker>
[HH:MM:SS] 🤖 Mode: AUTO|INTERACTIVE
[HH:MM:SS] 🩺 Bootstrap started
[HH:MM:SS] ✅ Bootstrap ready / ⚠️ Bootstrap restart required / ❌ Bootstrap blocked
[HH:MM:SS] ⏸️ Run interrupted — <reason>
[HH:MM:SS] ▶️ Run resumed — revision <N>, phase <phase>
[HH:MM:SS] 🔁 Requirement revision <N> — checkpoint <path>
[HH:MM:SS] 🧭 Planner mode: FAST|FULL — <reason>
[HH:MM:SS] 📋 Planner started (fast|full)
[HH:MM:SS] ✅ Planner completed (fast|full) — <classification>, <N> files, visual <pattern>
[HH:MM:SS] 📋 Plan ready — <N> tasks
[HH:MM:SS] ✅ Plan approved (auto|user)
[HH:MM:SS] 🌿 Branch ready — <branch>
[HH:MM:SS] 🔨 Implementation started (cycle N)
[HH:MM:SS] ✅ Build passed — <duration or raw log>
[HH:MM:SS] 🧪 Tests passed|skipped|failed — <scope>
[HH:MM:SS] 🖥️ Dev server ready — agentow:rush
[HH:MM:SS] 🔗 Debug link ready
[HH:MM:SS] 💾 Commit created — <sha>
[HH:MM:SS] 🔍 Evaluator started (cycle N)
[HH:MM:SS] 📸 BEFORE captured — <path>
[HH:MM:SS] 📸 AFTER captured — <path>
[HH:MM:SS] ✅ Evaluation PASS
[HH:MM:SS] ❌ Evaluation FAIL — <reason>
[HH:MM:SS] 📝 Reviewer started
[HH:MM:SS] ✅ Review APPROVE
[HH:MM:SS] ⚠️ Review REQUEST_CHANGES — <critical> critical, <important> important
[HH:MM:SS] 🧠 Context linked — <library id|unlinked>
[HH:MM:SS] 🧠 Context plan update — <applied|no-update|patch-only|conflict|disabled>
[HH:MM:SS] 🧠 Context as-built update — <applied|no-update|patch-only|conflict|disabled>
[HH:MM:SS] 🔁 Fix cycle N+1 — <reason>
[HH:MM:SS] 🚀 Creating PR...
[HH:MM:SS] ✅ PR created — <url>
[HH:MM:SS] ✅ Workflow complete
```

If a phase fails, write the failure line immediately with the concrete reason. Do not leave the log idle for more than a few minutes without a state line while work is active.

## Visual validation is a hard gate

For any visible UI change, Playwright screenshots are mandatory. The evaluator must capture BEFORE and AFTER screenshots unless the plan explicitly proves there is no UI surface (`Pattern: skip`) or a Pattern D dependency is probed and confirmed unreachable.

For Twin-mediated runs, the preferred screenshot engine is the owner's compliant personal-account Playwright persistent profile when the dispatcher provides a reachable personal-evaluator script or validated evidence. It compares target/current with the changed build under identical flights. If that route is not reachable from the current host (the normal Codespace case), unavailable, or requires owner interaction, fall back immediately to the repository FIC Playwright/Heft harness: local `rush start` first, then PR CDN for a proven route-specific local failure. Host-local route unavailability is not a product failure. Playwright MCP/browser tools remain unsupported. Do not claim visual verification passed without evaluator-produced screenshot paths.

Authentication and changed-code injection are separate dimensions. FIC or a personal profile proves identity only; it does not prove the PR code loaded. Select and prove the injection route for the changed app:

| Changed app | Required AFTER injection | Required proof |
|---|---|---|
| SP-Client | local or PR `loader` + `debugManifestsFile` | accept debug consent; `prBuildCount > 0`; affected PR bundle resource loaded |
| ODSP-Next | PR `srr` cookie | affected ODSP-Next PR resource loaded |
| OnePlayer | `OnePlayerPRBuild=odsp-web-pr_<id>.<build>` | affected OnePlayer PR resource loaded |

Never use `srr` to validate an SP-Client surface. Loading unrelated PR resources is not enough: the proof must name a bundle that owns or imports the changed surface. A manual or external screenshot run may add evidence, but it cannot turn an evaluator `FAIL` into `PASS` unless it satisfies the same artifact schema and hard gates and the evaluator is rerun against that evidence.

Primary PR screenshots must show the full browser page/viewport, including surrounding page context. Drawer/Dialog/component crops are supplemental only and must not be stored in `visualValidation.beforePath` / `afterPath` or embedded as the primary BEFORE/AFTER table. Before accepting evaluator PASS, the main session must independently view both primary images and compare their actual PNG dimensions with the recorded viewport.

Visible UI plans also carry a bounded scenario matrix derived from source branches, menu options,
enums, and acceptance criteria. The evaluator captures a full-viewport BEFORE/AFTER pair for every
required row (maximum five, no Cartesian expansion). PASS requires complete matrix coverage; one
default pair cannot represent several user-visible options. PR descriptions use a compact
one-row-per-scenario table and replace the prior generated visual block rather than appending it.

Pixel-identical or geometry-identical BEFORE/AFTER is never proof that a UI migration is safe. Treat exact equality as a source-verification alarm: re-check the affected resource, changed-branch DOM discriminator, and expected component semantics. If the PR should change the rendered component but the discriminator is unchanged, return `FAIL` even when both images look acceptable.

Routed feature context is a hard execution contract, not background reading. If a context document requires a table, disposition, crop, or measurement, planner/implementation/evaluator/reviewer artifacts must contain that evidence. Missing evidence blocks PASS.

Theme-affecting SharePoint UI must be classified before planning or coding as app-chrome
invoked, a SharePoint-owned full page, a customer-content full page, an inline pane, or a
full-overlay drawer. Read `skills/detheme/SKILL.md` and apply its classification-specific
provider, hook, v8, killswitch, and SCSS guidance; do not infer treatment from the component
name or apply customer theming to SharePoint-owned chrome.

The linked context library is also maintained from run evidence. Read `docs/context-maintenance.md` before resolving, recording, proposing, or applying context updates. agentOW remains generic: the library manifest owns routes, destinations, domain guards, and commit/push policy. Never hard-code a feature name or personal repository path into agentOW.

Plan-stage context updates describe intent and open decisions only. After implementation and verification, an as-built update must inspect the actual committed diff and may supersede inaccurate plan intent. A read-only library or stale base produces an exported patch/conflict artifact without blocking the product PR.

For root/wrapper replacements, every removed class/style must be opened and classified. The replacement component owns its internal chrome; consumers own external relationships such as margin between siblings, parent gap, wrapping, alignment, and parent-facing sizing/positioning. Repeated Cards/rows/tiles/items additionally require same-scale close-up BEFORE/AFTER crops and numeric adjacent-item bounding-box/gap evidence. Full-page screenshots alone cannot prove repeated-item spacing.

Environment claims have a second hard gate: one failed URL, credential, tenant, or site is resource-local evidence, not proof that all FIC environments are unsuitable. Before `fixtureGap`, the evaluator must enumerate available fresh/cached pools, deduplicate tenants, discover alternate candidates, apply source-cited capability predicates, and emit a complete `coverageManifest`. Missing or incomplete coverage triggers evaluator-only environment discovery in the same implementation cycle and cannot be auto-shipped as verified. Committed, building, passing work is still delivered — as an explicitly unverified draft that states the screenshots are owed — because the gate exists to stop false verification claims, not to throw finished work away.

## The pipeline

```
1. Understand   → (interactive) clarify intent with the user; (auto) proceed
2. Research     → dispatch @planner → get findings
3. Plan         → you write the plan; (interactive) get user approval; (auto) proceed
4. Implement    → YOU write the code, run ow-build, run ow-test
5. Verify       → dispatch @evaluator → mandatory screenshots for UI changes
6. Fix loop     → classify FAIL: environment discovery stays evaluator-only; product defects return to YOU. Max 5 product cycles.
7. Review       → dispatch @reviewer → surface findings
8. Maintain     → update linked context from as-built evidence without a user gate
9. Ship         → ow-pr-create for a new draft PR, ow-pr-update for POC promotion, then ow-pr-attach
```

The `agentow` skill walks you through this in detail. It auto-loads when the user asks to implement a feature or fix a bug in odsp-web.

`ow-batch` is the Copilot batch entry point. The current main session runs multiple agentOW tasks serially in AUTO mode, writing a checkpoint after each task and carrying only batch bookkeeping forward. It does not launch nested Copilot processes, delegate the full pipeline, or use parallel worktrees because the shared `ow` MCP server is rooted at `/workspaces/odsp-web`.

## Modes

- **Interactive** (default) — clarify intent and approve the plan. Validated review remains mandatory; Critical and Important findings must be fixed.
- **Auto** (`--auto` in the prompt) — skip intent and plan-approval questions, but never skip validated review or ship unresolved Critical/Important findings.
- **POC** (`--poc`, optionally with `--auto`) — optimize for a runnable demo: bounded
  main-session planning, mandatory build/typecheck, tests skipped by default, AFTER-only validation
  of the requested/default UI state, and an advisory reviewer that blocks only Critical safety
  defects. Creates a `[POC]` draft PR with explicit skipped-gate disclosure and never auto-merges.
  Authentication/security, destructive data operations, migrations, production configuration, and
  secrets are not eligible for POC mode.
- **Batch** (`/ow-batch`) — serial unattended loop over multiple main-session agentOW AUTO runs. Each task gets fresh bounded planner/evaluator/reviewer subagents, a checkpoint, and one summary row.

`--poc` is an execution profile; `--auto` controls interaction, so they can be combined. A later
`promote this POC` reuses the same `.aero` run, branch, and draft PR, checkpoints the POC revision,
and runs the complete STANDARD planner/test/BEFORE-AFTER/reviewer/context pipeline before removing
the POC warning.

## Core principles

- **DRY, YAGNI** — minimum code that solves the problem; no speculative abstractions.
- **Fold fixed conditions completely** — when a change makes a condition constant, inline the
  surviving expression and remove dead branches, redundant guards, and newly unused symbols. Do
  not preserve obsolete control flow behind a boolean assigned to `true` or `false`.
- **Surgical changes** — every changed line traces to the request. Don't refactor adjacent code, don't fix unrelated dead code (mention it instead).
- **Follow existing patterns** — search odsp-web first; never hand-craft what the monorepo already provides. Match local naming, imports, error handling.
- **Evidence before claims** — run `ow-build` / `ow-test` and read the output before saying it works. "Should work" / "seems fine" = unverified assumption.
- **Scope claims to evidence** — a local environment failure cannot support a fleet-wide conclusion; `fixtureGap` requires a complete coverage manifest.
- **Tool timeout ≠ operation failure** — if `ow-build` / `ow-rush` times out at the MCP layer, check whether the underlying Rush process is still running and wait for the real result. Use `common/temp/markdown-summary/build-summary.md` and raw logs before classifying the build.
- **Verifiers verify independently** — subagents read the actual code, not your self-report.
- **Surface, don't hide** — state assumptions explicitly. In interactive mode, ask when uncertain. In auto mode, record the assumption in the plan so the user can audit it after.
- **Progress before action** — before each major tool/action, write the matching `progress.log` event so the user can follow the run from the file alone.

## odsp-web specifics

- This is a Rush monorepo at `/workspaces/odsp-web`. Never use npm/pnpm/yarn/jest/tsc directly — always rush (via the `ow-build` / `ow-test` / `ow-rush` MCP tools).
- Tests run on compiled `.js` in `lib-commonjs`, not `.ts` source.
- Branch naming: `user/<alias>/<feature>`.
- The `ow` MCP server provides rush/tmux/git/debug-link/PR tools. Call `ow-status` first to orient.

## Instruction priority

1. User's explicit scope and delivery instructions — highest. A request to skip review also disables AgentOW PR creation; never label or ship unreviewed code as AgentOW-approved.
2. This workflow — overrides default behavior.
3. Default system prompt — lowest.
