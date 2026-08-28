---
name: agentow
description: "Take an odsp-web feature or bug description to a draft PR on Azure DevOps. Use when the user wants to implement a feature, fix a bug, or make a change in the odsp-web monorepo. Drives the full pipeline: research → plan → implement → verify → fix loop → review → PR. Triggers on: implement, fix, add, change, build a feature in odsp-web / sp-pages / sp-client; or when the user says agentow."
---

# agentOW pipeline (Copilot CLI)

## Accessibility routing — before Step 0

If the request's primary acceptance criteria concern Accessibility behavior — for example
screen-reader output, NVDA, Narrator, Voice Access, keyboard/focus behavior, accessible
name/role/state/value, ARIA, live regions, headings/landmarks, zoom/reflow, contrast, or a WCAG
failure — invoke the `agentow-a11y` skill with the original request and stop this standard flow.

Do not create a standard agentOW session first. Do not dispatch the standard planner or evaluator.
The A11y skill owns its isolated session, knowledge, Twin evidence bridge, and strict
reproduce-before-fix gate.

Stay in the standard flow when Accessibility is only an incidental quality dimension of a broader
feature request. Route to A11y mode only when assistive-technology or accessibility behavior is the
bug being fixed.

You (the main session) drive this end to end. You are the orchestrator AND the implementer — you keep full context across every step and every fix cycle. You dispatch stateless subagents (`planner`, `evaluator`, `reviewer`) only for bounded "look and report" work.

## Mode

Execution profile and interaction mode are separate:

- `--poc` selects **POC profile**: optimize for a runnable result and fast visual feedback, not
  <!-- agentow-contract:profile:poc -->
  production readiness. It uses bounded main-session planning, skips tests by default, performs an
  advisory safety review, and captures AFTER-only UI evidence for the requested/default scenario.
- Without `--poc`, use the **STANDARD profile** and every normal quality gate in this document.
  <!-- agentow-contract:profile:standard -->
- `--auto` (or "no questions" / "just do it") selects **AUTO interaction** and skips user gates.
  Otherwise interaction is **INTERACTIVE**. `--poc --auto` is valid.

Announce both dimensions in one line, for example `POC + AUTO` or `STANDARD + INTERACTIVE`.

POC is forbidden for authentication/authorization, security/privacy boundaries, destructive data
operations, schema/data migrations, production configuration, or secrets. Switch to STANDARD for
those tasks. POC never means permission to ignore compiler errors, obvious runtime failure, data
loss, or security defects.

If the user says **"promote this POC"**, reuse the same `.aero` run, branch, and draft PR. Record a
`requirement-change --profile standard`, checkpoint the POC revision, switch the profile to STANDARD, and restart at
Understand/Planning. Run FULL planning, tests, full scenario BEFORE/AFTER evaluation, and strict
review. Remove POC labeling only after all STANDARD gates pass. Never create a second run or PR.

## Durable conversation and follow-up protocol

The `.aero` directory is the source of truth for run continuity. Conversation context is not.
Every run owns:

- `run-state.json` — current status, phase, revision, artifact counts, and live timing summary;
- `request-history.ndjson` — initial request plus every interruption/follow-up;
- `lifecycle.ndjson` — append-only initialized/interrupted/resumed/revised/completed events;
- `report-recovery.ndjson` — append-only report supplement used while another writer has an
  incomplete trailing `report.json` record; downstream readers consume the union;
- `artifact-index.json` — a content-hashed inventory of plans, implementation evidence,
  evaluator output, screenshots, review, context, and final artifacts;
- `checkpoints/revision-*/` — copies of mutable canonical artifacts before a requirement revision.

For every inbound user message while a run is active or completed:

1. Persist the exact message to a temporary file with a quoted heredoc before answering.
2. Classify it:
   - same-task clarification or extra evidence → `event --type note`;
   - unrelated question or temporary steering → `event --type interruption`, answer it, then
     `event --type resume` and continue the prior phase;
   - changed acceptance criteria, scope, fix, or behavior — including after completion →
     `event --type requirement-change`. This checkpoints the previous revision, increments the
     revision, reopens the run at Understand, and requires re-planning/re-verification. Because a
     completed run's watcher has exited, relaunch the detached watcher command from Step 0.
3. Never abandon an in-flight planner/evaluator/reviewer because a message arrived. Persist the
   interruption, collect its artifact, reconcile, then apply the user's message.
4. Never create a fresh `.aero` directory for a follow-up to the same task/PR. Reuse the run and
   increment its revision. Start a new run only for a genuinely separate deliverable.
5. Never overwrite immutable iteration evidence. After a requirement change, choose the next
   unused implementation/evaluation iteration number. Mutable `plan.md`, planner report, review,
   and final files are copied into the revision checkpoint before replacement.

Commands:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/run-state.mjs" event "<sessionDir>" \
  --type note|interruption|resume|requirement-change \
  --profile standard|poc \
  --message-file "<messageFile>" --event-id "<unique inbound message id>" \
  --reason "<concise reason>"

node "${CLAUDE_PLUGIN_ROOT}/tools/run-state.mjs" reconcile "<sessionDir>"

node "${CLAUDE_PLUGIN_ROOT}/tools/run-state.mjs" timing "<sessionDir>"

node "${CLAUDE_PLUGIN_ROOT}/tools/run-state.mjs" report "<sessionDir>" \
  --record-file "<one-json-object-file>"
```

Run `reconcile` immediately before every user-visible status/final response. This repairs missing
report/progress records from files already on disk, including evaluator screenshots.
Use `timing` for status and final responses. Report wall-clock and active time plus the slowest
major phases; active time excludes explicit user interruptions.
If a command times out on `.run-state.lock`, inspect its reported owner PID. Use
`run-state.mjs unlock "<sessionDir>"` only when that command confirms the owner is dead; it refuses
to remove a live or freshly ownerless lock.

## Step 0: Orient

Call `ow-status` (MCP) to confirm the git branch, node, and rush state. Note whether you're on `main` (you'll branch later) or already on a feature branch.

**Check the working tree is clean here, in Step 0 — not later, when a checkout fails.** A previous run's abandoned edits (a half-tuned capture spec, a hand-patched `pnpm-lock.yaml`, a modified playwright config) survive in the tree and block the branch switch this run needs. Batch policy forbids auto-stashing them, so the run dies at the starting line having done nothing — observed, 76 seconds in, after the environment had already been prepared. Report the dirty paths in your first message, name them individually, and say plainly that the user must stash or commit them before this run can proceed. Do not discard them and do not stash them yourself; they may be the only copy of a previous run's work.

Create a durable session folder:

```text
/workspaces/odsp-web/.aero/<session>/
├── planning/
├── implementation/
├── evaluation/
├── context/
├── checkpoints/
├── capabilities.json
├── run-state.json
├── request-history.ndjson
├── lifecycle.ndjson
├── report-recovery.ndjson
├── artifact-index.json
├── progress.log
└── report.json
```

Write the exact initial user request to `<sessionDir>/request.txt` with a quoted heredoc. Initialize
durable state and launch its detached reconciliation watcher before any research:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/run-state.mjs" init "<sessionDir>" \
  --request-file "<sessionDir>/request.txt" --run-id "<session>" \
  --profile "<poc when --poc is present; otherwise standard>"

nohup node "${CLAUDE_PLUGIN_ROOT}/tools/progress-watcher.mjs" "<sessionDir>" \
  > "<sessionDir>/.progress-watcher.out" 2>&1 &
```

The watcher is a backstop, not the only writer. It content-hashes artifacts recursively and
idempotently restores missing screenshot/artifact entries in both `report.json` and
`progress.log`. The main session must still call `run-state.mjs event ... --type phase` at every
major transition and `reconcile` after every subagent return.

Append timestamped progress lines before each major state transition. `progress.log` is the user's real-time view when Copilot CLI does not show agent state. Treat it as a first-class UX surface: concise, emoji-prefixed, and complete enough that the user can understand the run by tailing the file. Every planner, implementation, evaluator, reviewer, and final JSON record must be written to a one-object temporary file and submitted through `run-state.mjs report`; never append `report.json` directly. Readers consume and deduplicate the union of `report.json` and `report-recovery.ndjson`.

Use the shared progress event contract from `AGENTS.md`. At minimum, write:

```text
[HH:MM:SS] 🚀 Session started: <session>
[HH:MM:SS] 💬 USER PROMPT: <prompt>
[HH:MM:SS] 🤖 Mode: AUTO|INTERACTIVE
[HH:MM:SS] 🩺 Bootstrap started
[HH:MM:SS] ✅ Bootstrap ready / ⚠️ Bootstrap restart required / ❌ Bootstrap blocked
[HH:MM:SS] 🧭 Planner mode: FAST|FULL — <reason>
[HH:MM:SS] 📋 Planner started (fast|full)
[HH:MM:SS] ✅ Planner completed (fast|full) — <summary>
[HH:MM:SS] 📋 Plan ready — <N> tasks
[HH:MM:SS] ✅ Plan approved (auto|user)
[HH:MM:SS] 🧠 Context linked — <library id|unlinked>
[HH:MM:SS] 🧠 Context plan update — <result>
[HH:MM:SS] 🔨 Implementation started (cycle N)
[HH:MM:SS] ✅ Build passed / ❌ Build failed — <reason>
[HH:MM:SS] 🧪 Tests passed|skipped|failed — <scope>
[HH:MM:SS] 🖥️ Dev server ready — agentow:rush
[HH:MM:SS] 🔍 Evaluator started (cycle N)
[HH:MM:SS] 📸 BEFORE captured — <path>
[HH:MM:SS] 📸 AFTER captured — <path>
[HH:MM:SS] ✅ Evaluation PASS / ❌ Evaluation FAIL — <reason>
[HH:MM:SS] 📝 Reviewer started
[HH:MM:SS] ✅ Review APPROVE / ⚠️ Review REQUEST_CHANGES — <summary>
[HH:MM:SS] 🧠 Context as-built update — <result>
[HH:MM:SS] 🚀 Creating PR...
[HH:MM:SS] ✅ PR created — <url>
[HH:MM:SS] ✅ Workflow complete
```

## Step 1: Understand the request

**Interactive:** if the request is ambiguous or complex, ask the user 1-3 clarifying questions, one at a time, multiple-choice when possible. Stop when you can state clearly what to build and how to verify it. Skip this for trivial unambiguous requests.

**Auto:** skip. Record any assumptions you make in the plan (Step 3) so the user can audit them later.

Compose a refined one-paragraph statement of what to build.

Append the refined request to `progress.log` before dispatching the planner.

## Step 1.25: Bootstrap session capabilities

This step runs before context routing or planning. Read `${CLAUDE_PLUGIN_ROOT}/docs/capability-bootstrap.md`.

1. Reuse the exact request already written to `<sessionDir>/request.txt`.
2. Record durable phase `bootstrap` and append `[HH:MM:SS] 🩺 Bootstrap started`.
3. Run:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/tools/agentow-bootstrap.mjs" \
     --host copilot \
     --session-dir "<sessionDir>" \
     --request-file "<sessionDir>/request.txt"
   ```

4. Read `<sessionDir>/capabilities.json`.
5. Merge current tool-catalog evidence into the artifact only for task-triggered tools such as Figma. FIC Playwright/Heft availability comes from the repo probe, not MCP tool presence. Never store tool arguments, tokens, cookies, identities, or credential contents.
6. If `overall` is `restart-required`, append `⚠️ Bootstrap restart required`, tell the user which plugins/settings were installed and to restart Copilot CLI or the terminal, then stop before planning. The next session re-probes.
7. If `overall` is `blocked`, report the fixed prerequisite and stop. If `setup-required`, stop only when the missing capability is required for this request and has no fallback.
8. Otherwise append `✅ Bootstrap ready` and continue.

The bootstrap marker is per terminal/CLI process, so later agentOW runs in the same session do not repeat baseline installs. A later Figma/ADO/UI task may still install a newly required task-specific capability.

## Step 1.5: Resolve the context library

Read `${CLAUDE_PLUGIN_ROOT}/docs/context-maintenance.md`. Create `<sessionDir>/context/{candidates,apply}` plus empty `evidence.ndjson`.

Resolve the linked context library using the documented discovery order. Write an immutable `<sessionDir>/context/link.json` even when the result is `status: "unlinked"`. Snapshot library identity, source/context revisions, manifest digest, and writability. Write request-based routes and document digests to immutable `context/routing.v1.json`, then read every routed document before selecting planner mode. Initial guards, audits, inventories, tables, and measurements participate in FAST eligibility; they are not deferred until after source routing. Append `[HH:MM:SS] 🧠 Context linked — <library id|unlinked>`.

After source paths are known, route them through the same manifest. FAST must do this before finalizing its report. FULL must route the initial report's paths and run the context-completion loop in Step 2 when new documents appear. Write each next immutable routing revision (normally starting at `context/routing.v2.json`) rather than modifying an earlier revision, read every newly routed document, and pass the latest revision downstream. Feature-specific terms, globs, guards, and update targets come only from the library manifest. Existing ad-hoc `contextDocuments` remain a compatible read-only link.

agentOW is the routing and execution layer; feature-specific rules and execution guards live in those context docs, not in this skill.

**POC profile:** resolve and read directly named context plus repository instructions, but do not run
context-completion passes or write plan/as-built updates to the linked library. Record
`contextMaintenance: "deferred-for-poc"` in run artifacts. Promotion performs the full routing and
maintenance contract.

## Step 2: Select planner mode + research

Automatically select `FAST` or `FULL`; the user does not need to choose.

### POC planner

In POC profile, do not dispatch the planner agent and do not apply FAST eligibility/escalation.
Perform one bounded main-session source pass:

1. Locate the target surface/behavior, its nearest existing pattern, and the smallest runnable edit.
2. Read direct callers/consumers and repository instructions; do not perform exhaustive architecture,
   reuse, context-completion, or scenario discovery.
3. Write `planning/planner-mode.json` with `"mode":"poc"` and the explicit shortcuts.
4. Write a short source-cited `planning/planner-report.md`: target files, chosen pattern, runnable
   acceptance check, requested/default visual scenario, assumptions, and risks deferred to promotion.
5. Submit a planner record with `"mode":"poc"` and append
   `[HH:MM:SS] ✅ Planner completed (poc) — <N> files, <scenario>`.

Do not use uncertain scope as a reason to launch FULL planning in POC profile. Ask one blocking
question only when no plausible runnable interpretation exists. The POC planner must still stop or
switch to STANDARD for the forbidden risk classes in the Mode section.

The FAST/FULL rules below apply only to STANDARD profile.

Record durable phase `planning` before selecting or dispatching a planner. Reconcile immediately
after every planner pass before reading its report.

### Planner mode decision

Write `<sessionDir>/planning/planner-mode.json` before research:

```json
{
  "mode": "fast|full",
  "reason": "<concise evidence-based reason>",
  "checks": {
    "bugWithExplicitRootCause": true,
    "codeAnchorProvided": true,
    "acceptanceCriteriaClear": true,
    "estimatedFilesAtMostTwo": true,
    "singleBehaviorChange": true,
    "crossPackageOrApiChange": false,
    "architectureOrDataMigration": false,
    "mandatoryContextAudit": false,
    "uiOwnershipUnclear": false
  }
}
```

Append `[HH:MM:SS] 🧭 Planner mode: FAST|FULL — <reason>` to `progress.log`. Submit this
record through `run-state.mjs report`:

```json
{"sender":"planner-mode","timestamp":"<ISO>","status":"success","mode":"fast|full","artifactPath":"<sessionDir>/planning/planner-mode.json","reason":"<reason>"}
```

Select `FAST` only when every statement below is proven by the request plus a quick read of the named source:

- It is a bug with an explicit symptom, root cause, code anchor, intended fix, and pass/fail verification.
- The named code exists and the source directly supports the claimed root cause.
- The change is one behavior in at most two product files.
- It does not cross package/API boundaries, alter architecture, require a data migration, or introduce a dependency.
- Routed context does not require a planner-produced audit, inventory, table, or measurement.
- It does not replace a UI root/wrapper, affect repeated-item geometry, or leave surface ownership/open-condition unclear.

Missing evidence is `FULL`, not an assumption. Feature work, broad refactors, exploratory bugs, and requests that only say the root cause is "known" are `FULL`.

### FAST planner

Do not dispatch the planner agent. Append `[HH:MM:SS] 📋 Planner started (fast)`, then perform a bounded source verification in the main session:

1. Read the named code anchor and its direct caller or consumer.
2. Confirm the root cause and intended edit from source.
3. Locate existing tests for the affected module.
4. For visible UI, establish the selector, discriminator, open-condition, and starting route. If any is unclear, escalate to `FULL`.
5. Route the verified source paths through the context manifest, write the next immutable routing revision, and read every newly routed document.
6. Re-evaluate file count, ownership, and context guards. Any scope expansion, contradictory evidence, or required audit/table/measurement escalates to `FULL`.

Only after source-path routing passes, write `planning/planner-report.md` using the planner agent's normal output headings, including citations and an exhaustive `Source paths consulted` section. Mark it `Planner mode: FAST` and record only verified findings. Submit the normal planner record with `"mode":"fast","pass":1,"sourcePaths":[...]` through `run-state.mjs report`, then append `[HH:MM:SS] ✅ Planner completed (fast) — <classification>, <N> files, visual <pattern>`.

### FULL planner

Append `[HH:MM:SS] 📋 Planner started (full)`.

If the request names a feature area with external context docs (for example a dotfiles knowledge-center entry), route and read those docs now. Feature-specific rules and execution guards live in those context docs, not in this skill. Pass every relevant path to all downstream agents.

Dispatch `@agentow-copilot:planner` with:

```yaml
request: <refined request>
repoRoot: /workspaces/odsp-web
sessionDir: /workspaces/odsp-web/.aero/<session>
reportFile: /workspaces/odsp-web/.aero/<session>/report.json
reportWriterCommand: node ${CLAUDE_PLUGIN_ROOT}/tools/run-state.mjs report /workspaces/odsp-web/.aero/<session>
progressLog: /workspaces/odsp-web/.aero/<session>/progress.log
artifactPath: /workspaces/odsp-web/.aero/<session>/planning/planner-report.md
contextDocuments:
  - <every routed feature/domain context document>
contextLinkPath: /workspaces/odsp-web/.aero/<session>/context/link.json
capabilitiesPath: /workspaces/odsp-web/.aero/<session>/capabilities.json
plannerMode: full
plannerPass: 1
```

Wait for its findings report (classification, root cause, files to change, patterns, tests, visual surface trace, context guards, and any required root/wrapper layout ownership audit). If `planning/planner-report.md` or the planner NDJSON line is missing, treat planner as failed.

The planner NDJSON line must include `"mode":"full"`. The planner agent owns the completion progress line; verify it exists, but do not append a duplicate.

Route the planner NDJSON record's exhaustive `sourcePaths` through the context manifest; do not infer routing inputs from `keyFiles` or prose citations. If this adds context documents the planner did not receive, dispatch the FULL planner again with the latest routing revision and all newly routed documents, marking the request as a `context-completion pass` and incrementing `plannerPass`. Treat the revised `planning/planner-report.md` as canonical. Repeat route → context-completion only until routing is stable, with a maximum of three planner passes total. If a third pass still discovers new routed documents, fail planning with `context-routing-unstable`; never hand an incompletely routed report to implementation.

If routed context requires an audit/table/measurement and the planner report does not contain it, treat planner as failed. "Read the context" is not compliance evidence.

Read the findings. If the planner reports it could not locate the root cause or surface, decide: ask the user for a pointer (interactive), or proceed with its best understanding and record the gap (auto).

### FAST → FULL escalation

If FAST source verification finds contradictory evidence, more than two product files, unclear UI reachability/ownership, a mandatory context audit, or any cross-package/API/architecture/data/dependency impact:

1. Rewrite `planning/planner-mode.json` with `"mode":"full"` and an `escalatedFrom:"fast"` field.
2. Submit a second `planner-mode` record through `run-state.mjs report` and append `[HH:MM:SS] 🧭 Planner mode: FULL — escalated from FAST: <reason>`.
3. Dispatch the full planner. Do not preserve unsupported FAST assumptions in the plan.

## Step 3: Plan + approval

Using the planner report (POC, FAST, or FULL), write a short plan:
- Spec (2-3 sentences)
- Acceptance criteria (clear pass/fail)
- Tasks (exact files, what changes)
- Visual surface trace (from the planner, for the evaluator later) — including the surface's **open-condition**: the code that sets its open state and the application state that must hold for it to render. A control name or URL parameter is not an open-condition.
- Scenario matrix (from the planner) — every source-proven, acceptance-relevant user-visible
  option/state touched by the change, capped at five without Cartesian expansion. Each row needs
  source evidence, precondition, setup, trigger, discriminator, and expected result. A visible UI
  plan with no matrix is incomplete.
- Detheme classification for any theme-affecting SharePoint UI: app-chrome-invoked,
  SharePoint-owned full page, customer-content full page, inline pane, or full-overlay drawer.
- For any change that renders or modifies user-facing UI, including components, JSX/HTML,
  layout, styling, typography, colors, spacing, icons, responsive behavior, or theme tokens,
  read both `skills/ow-review/references/sharepoint-design-system-and-ux-components.md` and
  `skills/ow-review/references/sharepoint-theme-and-detheme.md`, plus
  `skills/detheme/SKILL.md`. Include the planner's component-fit analysis in the plan: the
  interaction requirements, strongest supported candidates, requirement-to-capability matrix,
  current Fluent V9 documentation and version-pinned SPDS source consulted, nearby ODSP-Web
  usage, selected component/import route, and rejection rationale for alternatives. For
  sortable/selectable tabular UX, the plan must explicitly compare SPDS `DataGrid` and `Table`.
  For a substantial UX, also include a responsibility-to-module map covering page composition,
  child regions, hooks/workflows, API/data contracts, models/helpers, state ownership, public
  contracts, extraction rationale, nearby architecture/reuse, and an `eager|lazy|unchanged`
  loading decision with evidence for every planned module. Read and apply
  `skills/ow-review/references/ux-architecture-and-bundle-boundaries.md` for this analysis; it is
  independent of SPDS or SharePoint surface treatment. Record the Detheme treatment as well.
  Pure data, service,
  business-logic, configuration, or test-only changes with no rendered UI or styling impact do
  not need these references.
- For changes to runtime imports, dependencies, lazy boundaries, SPFx manifests/assemblies,
  Webpack/Rspack configuration, shared bundles, or workaround-loader mappings, read
  `skills/ow-review/references/size-regression.md`. Record the affected project and packaging
  model; package declarations alone do not prove bundle ownership.
- Context compliance checklist (each routed guard and its required artifact)
- Root/wrapper layout ownership table when any JSX root/wrapper is replaced
- Repeated-item geometry target (selector, axis, metric) when Cards/rows/tiles/items repeat

**POC profile:** keep only Spec, runnable acceptance check, exact edit tasks, requested/default final
scenario, assumptions, and deferred production gates. Component-fit matrices, exhaustive scenario
matrices, architecture tables, context audits, and layout inventories are deferred unless required
to make the POC run at all.

Save it locally to `/workspaces/odsp-web/.aero/<session>/plan.md` (a local working doc, not committed).

Append `[HH:MM:SS] 📋 Plan ready — <N> tasks` after writing the plan.

**Interactive:** show the plan to the user. Get approval or revise. Loop until approved.
**Auto:** proceed.

Append `[HH:MM:SS] ✅ Plan approved (auto|user)` before implementation starts.

## Step 3.5: Maintain context from the plan

If the context link is resolved:

1. Append a `plan` event to `context/evidence.ndjson` with the approved plan digest, cited decisions, assumptions, and open questions. Planned behavior must be labeled as intent.
2. Dispatch `@agentow-copilot:context-maintainer` with `mode: plan-intent`, the immutable link, evidence path, plan path, and an immutable candidate path under `context/candidates/`.
3. Verify the returned patch digest, unchanged context HEAD/manifest/target-document digests, clean worktree outside the generated patch, allowed target, and absence of path/symlink escape.
4. Follow the manifest policy without asking the user:
   - `auto-commit`: apply, commit, and push only as instructed by that context repository.
   - `patch-only`: preserve the candidate/patch without editing the library.
   - `disabled`: preserve evidence only.
5. Stage only candidate target paths. On dirty worktree, read-only/auth failure, or stale base export a patch/conflict; never silently rebase. Context failure never blocks implementation.
6. Write `context/state.json` and `context/apply/<id>.json`, then append `[HH:MM:SS] 🧠 Context plan update — <result>`.

If plan maintenance changed a routed context document, re-read it before implementation. Do not rerun planning unless the context update introduces a new mandatory guard that invalidates the approved plan.

## Step 4: Implement (you write the code)
<!-- agentow-contract:gate:implement-build:profiles=poc,standard -->

Record durable phase `implementation`.
Append `[HH:MM:SS] 🔨 Implementation started (cycle N)` before editing.

1. **Branch.** If on `main`, create `user/<alias>/<feature>` from `origin/main` (use `ow-git`). `<alias>` from `whoami`.
2. **Write the code** yourself, following the planner's "patterns to follow". Surgical changes only — every line traces to the request.
   - Complete every context compliance item before build.
  - When adding, moving, renaming, or changing a live killswitch, read and follow
    `docs/killswitch-guidance.md` before editing. Record the behavior owner, centralized module
    search, dependency boundary, original rollback expression, and expected diff size. Do not add
    public API or host callback plumbing when the behavior-owning package can evaluate its own
    killswitch.
  - When any task graduates a Flight, KS, Feature, experiment, or rollout flag, read and follow
    `skills/ow-review/references/graduation.md`. For graduation-related lines, that reference is
    exclusive: remove only the gate and code made obsolete by selecting its required branch.
    Preserve unrelated predicates, operators, behavior, comments, and formatting. Do not treat
    graduation as permission to polish nearby code. If the same task includes separate feature
    work, apply normal implementation rules only to that separate work.
   - Before editing a Flight/KS graduation, prove direction at every call site. Never infer it from
     names such as `Fix`, `Enabled`, `New`, `Legacy`, `Fallback`, or `Optimized`. Read the wrapper
     implementation and establish the literal for the policy-required permanent state: KS inactive
     and Flight enabled by default, or the explicitly evidenced exception in the PR description.
     Write the full original expression; replace only the target Flight/KS expression with that
     proven literal; simplify mechanically; and use the result as the substitution oracle for the
     final code. For example, if `targetKs()` is inactive
     when `false`, `targetKs() && !independentKs() ? filtered : original` simplifies to `original`.
     The independent gate does not become unconditional and is not a reason to retain `filtered`.
     Apply the same substitution process to a Flight using its proven enabled literal. Repeat the
     proof for every call site. If the wrapper semantics, required permanent state, literal, or any
     result cannot be proven from source and required rollout evidence, stop without editing;
     reversed graduation is worse than leaving the gate in place.
   - For any rendered UI, component, layout, or styling change, read and follow the SPDS and
     Detheme references plus `skills/detheme/SKILL.md` before implementation. For non-UI
     changes, skip these references and record that they are not applicable. For any
     theme-affecting SharePoint UI, confirm the planned surface
     classification, and implement its provider, hook, v8, nested-provider, killswitch, and
     SCSS-token guidance as applicable. Do not guess the killswitch/flight for an existing
     surface.
   - Do not implement rendered UI until the plan contains a grounded component-fit analysis.
     Confirm the selected component still satisfies every mapped requirement using its documented
     API and stable SPDS export. If source inspection changes the choice, update the matrix and
     rationale before coding. Do not recreate selection, sorting, grid keyboard navigation, or
     accessibility behavior with low-level `Table` primitives when `DataGrid` owns the required
     interaction model.
   - Before declaring rendered SP-Client UI complete, mechanically inventory every changed
     component import and overlay provider. Eager SPDS controls under `sp-client/` must use
     `@msinternal/sharepoint-ui-react-stable-bundle`; supported heavy families stay on
     `stable/lib/LazyComponents`. Every added `OverlayDrawer` must follow the Detheme skill's
     `NeutralThemeProvider` contract. For rendered `@fluentui/react` children, verify both the
     package migration flag and matching shims before omitting `NeutralV8ThemeProvider`. Record
     exact import and provider evidence instead of writing only “SPDS components used.”
   - For a substantial UX, do not begin implementation without the responsibility-to-module map.
     Read and follow `skills/ow-review/references/ux-architecture-and-bundle-boundaries.md`.
     Keep the root focused on composition and shared coordination; implement cohesive child
     regions, workflow hooks, API/data modules, domain models, and pure helpers at the planned
     boundaries. If source evidence changes a boundary, revise the map first. Do not collapse the
     plan into one monolithic component, and do not manufacture trivial wrappers or generic
     utility files merely to increase file count.
   - Treat source decomposition and runtime chunking separately. Use the package's established
     loader and SPDS `LazyComponents` conventions only for evidenced action/navigation and heavy
     dependency boundaries. Preserve loading/error/retry/focus/telemetry and rollout behavior,
     avoid tiny chunk waterfalls, and inspect build output for claimed material bundle changes.
   - For every removed/replaced root class/style, preserve or move consumer-owned external layout while leaving replacement-component internal chrome to the component defaults.
   - Do not proceed if any layout declaration in the planner's ownership table has no disposition.
3. **rush update** (via `ow-rush`) if you changed any `package.json`.
4. **Build:** `ow-build` on the affected project. If it fails:
   - Classify: rush infra error (`shrinkwrap-deps.json` missing, `inputsSnapshot not found`) → run `ow-rush install` once, retry. Auth/network error → stop and report. Code error → fix and rebuild (max 3 attempts).
   - If the MCP request times out but a `rush build -t <project>` process is still running, do **not** treat it as build failure. Log `⚠️ Build tool timeout — tracking underlying Rush process`, wait for the real Rush process to exit, then read `common/temp/markdown-summary/build-summary.md` and the raw log. Record this in `agent-metrics.md` as `tool-timeout / self-recovered-by-process-tracking`.
   - Build/typecheck is a hard gate in every profile, including POC. Never ship a POC with compiler
    or type errors.
5. **Production size audit:** after a successful build, run the affected project's local production
   size audit when supported. Fetch the baseline, run `rush size-audit --to <project-name>`, then
   inspect the official diff and policy result using
   `skills/ow-review/references/size-regression.md`.
   - No policy regression: record `sizeAuditStatus: passed-no-regression` and stop. Do not run the
     analyzer or search for speculative size issues.
   - Regression: record scenario, FMP/FCI/All criterion, allowed, actual, margin, and baseline
     warning; analyze only failed scenarios, diagnose the owning import/package/configuration and
     packaging model, make the narrowest grounded fix, rebuild, and rerun the audit.
   - Record the result as `regression-fixed` or `regression-unresolved`. Never increase thresholds,
     move bytes merely to change report ownership, or seek approval before understanding root
     cause. An unresolved regression blocks completion unless an authorized, evidence-backed
     exception already exists.
   - Record `not-supported` when the project has no size-auditor configuration. Record `blocked`
     with the exact cause for baseline/auth/network/infrastructure failures; do not classify those
     failures as product regressions.
   If a size fix changes code, commit it, rebuild, and rerun affected scoped tests. Include the
   size-audit status and evidence in implementation/final artifacts and the PR description.
6. **Test:** in POC profile, do not add or run tests unless the user explicitly requests them; append
   `🧪 Tests skipped — POC profile` and record the skip in implementation/final artifacts and the PR
   description. In STANDARD profile, run `ow-test` scoped to tests that own the changed observable
  behavior (not every changed file and not the full suite). For Flight/KS graduation, do not add,
  update, rewrite, or reorganize tests; only delete cases for the removed branch and test support
  used exclusively by it, then run existing scoped tests and the project coverage command. If
  coverage actually fails its configured threshold, prefer updating the threshold with no new
  tests and recommend a separate follow-up test PR. If the developer chooses to retain the current
  threshold, add only the minimum tests for surviving behavior. In either case, record the failing
  result, threshold, chosen resolution, and final result in the PR description. For new or still-live
  Flight/KS changes, exercise enabled/fallback behavior through the nearest stable consumer, and
  update meaningful unit tests in the same change as production code. Do not add or modify automation tests by default; they
  normally follow after feature completion. Touch automation only when source inspection proves
  the production change would break an existing test. In that exception, record the breakage and
  make the test explicitly set the Flight/KS state for the branch it validates. Do not add or run a dedicated unit
   test for a trivial ID/GUID or rollout-SDK pass-through wrapper unless it has independent logic
   that can regress separately. If no meaningful test target exists, record the evidence-backed
   reason; don't run 600 unrelated tests.
7. **Dev server / debug link:** follow the feature context docs for the surface's verification contract. For UI-visible changes, prefer `ow-start` + `ow-debuglink` before PR validation builds finish; if the context docs require additional guards, execute those guards and record the result.
8. **Commit** (don't push yet).

After commit, append a `code` event to `context/evidence.ndjson` containing the commit SHA, changed files, diff digest, and grounded implementation outcomes. Do not copy unrestricted source into the context artifacts.

Write progress events for branch/build/test/dev-server/debug-link/commit using the exact event contract. If any step fails, log the failure before attempting recovery.

Write `/workspaces/odsp-web/.aero/<session>/implementation/iter<N>.md` after each implementation/fix cycle with:
- summary
- files changed
- build result and evidence
- test result and evidence
- dev server/debug link
- commit SHA
- remaining blockers, if any
- context compliance evidence, including the completed root/wrapper layout ownership table and post-change disposition
- UX architecture evidence for substantial surfaces: implemented component/hook/service/model
  boundaries, state ownership, any deviations from the approved responsibility map, and actual
  eager/lazy behavior plus bundle/build-output evidence for claimed loading changes

Submit the generator/implementation record through `run-state.mjs report`.

## Step 5: Verify (dispatch evaluator)
<!-- agentow-contract:gate:evaluate:profiles=poc,standard -->

Record durable phase `evaluation`.
Append `[HH:MM:SS] 🔍 Evaluator started (cycle N)` before dispatching.

Dispatch `@agentow-copilot:evaluator` with `verificationMode: poc` for POC profile or `full` for
STANDARD, plus the request, acceptance criteria, surface trace, scenario
matrix, changed files, cycle number, debug link, routed `contextDocuments`, `planPath`,
`implementationArtifactPath`, `sessionDir`, `reportFile`, `reportWriterCommand`, `progressLog`, and
`artifactPath=/workspaces/odsp-web/.aero/<session>/evaluation/iter<N>/evaluator-report.md`. Wait for
PASS/FAIL + blockers.

Immediately after the evaluator returns, run `run-state.mjs reconcile` before reading its verdict.
The evaluator may have written screenshots/findings just before a user interruption; reconciliation
must inventory them even when the evaluator omitted its final NDJSON line.

**Never end the turn while a dispatched subagent is still running.** Wait for its verdict. A run that reports "the browser capture is still running, I'm waiting for its result" and then terminates has abandoned the work mid-flight: the subagent's findings are lost, nothing is written to the artifact, and the next run repeats the whole discovery. If the wait is genuinely unbounded, record what was dispatched and why you stopped, then return a `FAIL` naming that — an explicit abandonment is recoverable, a silent one is not.

For UI-visible changes, visual validation is mandatory and the evaluator owns it:
- **POC profile:** capture one full-viewport AFTER screenshot of the requested/default final scenario
  and prove the changed bundle plus final-state discriminator. BEFORE, exhaustive scenario coverage,
  supplemental crops, geometry comparison, and environment fleet exhaustion are deferred. The main
  session must still inspect the AFTER image. If the final state cannot be rendered after the POC
  retry budget, stop without creating a PR.
- The remaining bullets in this section are STANDARD-only.
- Every required scenario matrix row must have its own evaluator-produced full-viewport BEFORE and
  AFTER pair. `scenarioCoverage` must be `complete`, with captured count equal to required count.
  One default screenshot pair never substitutes for additional source-proven options or states.
- BEFORE and AFTER screenshot paths must be present in the evaluator result.
- Primary `beforePath` / `afterPath` must be full browser-page/viewport screenshots that include the surrounding page context, not Drawer/Dialog/component-only crops. Their dimensions must match the evaluator's recorded viewport.
- Optional close-up crops belong only in `beforeCropPath` / `afterCropPath`; they are supplemental evidence.
- When the plan/context marks a repeated or dense UI surface, close-up BEFORE/AFTER crops are mandatory supplemental evidence, not optional. They must contain at least two adjacent items at the same scale.
- For repeated Cards/rows/tiles/items, the evaluator must record BEFORE/AFTER `getBoundingClientRect()` data and computed adjacent gap. A non-zero BEFORE gap becoming zero/negative AFTER is a product FAIL unless explicitly required.
- For Dialog/Drawer/Panel surfaces with grouped footer or toolbar controls, the evaluator must also inspect adjacent control spacing/alignment even when the surface is otherwise styled. If buttons or adjacent actions that were visibly separated in the legacy branch collapse together, lose their gap, or drift into the wrong alignment in AFTER, treat it as **FAIL** with blocker `component-layout-regressed`.
- If screenshots are missing, visual validation failed, or both the reachable personal-profile route and FIC fallback were unavailable, treat the evaluator result as **FAIL** even if code inspection passed.
- Before accepting PASS, independently `view` both primary images and run `file -- "<beforePath>" "<afterPath>"`; do not trust filenames, `captureMethod`, `dimensionEvidence`, or the evaluator's dimension claim without this cross-check.
- If either primary image lacks surrounding page context or its actual PNG dimensions do not match the recorded viewport, classify it as `evaluator-spec` and re-dispatch the evaluator once in the same implementation cycle.
- **Look at the changed component in both images and judge whether it actually rendered.** Right dimensions and page context are not enough — a component whose runtime styles never applied still fills the viewport and still sits in its page. If it has no surface of its own, text overflows or overlaps the page behind it, or the design's background is absent, treat the evidence as invalid: classify `evaluator-spec` with blocker `component-rendered-unstyled` and re-dispatch. An assertion on the component's `data-automation-id` proves only that the element exists.
- If repeated-item crops or geometry evidence are required but missing/malformed, classify it as `evaluator-spec` and re-dispatch the evaluator once in the same implementation cycle.
- Before accepting repeated-item PASS, independently `view` both crops and inspect the numeric geometry evidence; do not accept "looks right".
- Screenshots created manually by the main session do **not** satisfy evaluator validation. If the main session writes a temporary spec to unblock an investigation, move that logic into the evaluator retry prompt and re-dispatch the evaluator.
- Surface the exact failure reason to the user and record it in `progress.log`, `report.json`, and `final.md` if the run stops.
- Do not claim the UI was verified without screenshot evidence.
- If the run is still blocked on the **same screenshot step** after another attempt and you have no materially new evidence, say that explicitly instead of going silent. Append a progress line naming the unchanged blocker and the next single-variable experiment (for example: `still blocked at app shell mount; next retry keeps the same page and adds only a 2s settle before screenshot`). Silence makes the user think the run is abandoned.
- Failing visual validation blocks the *claim*, not the *delivery*. If the implementation is already committed and green, do not end the run empty-handed — see the environment-discovery branch of Step 6 and ship an explicitly unverified draft instead.

Before accepting any evaluator claim about auth, FIC, tenant suitability, test-page availability, or a fixture gap, inspect its `coverageManifest`. A single URL, credential, tenant, or site failure is resource-local evidence only.

- Missing manifest or `coverageManifest.status="incomplete"` → append `[HH:MM:SS] 🔎 Environment discovery retry — evaluator evidence incomplete`, then re-dispatch the evaluator in `environment_discovery` mode in the **same implementation cycle**. Do not edit code, rebuild, retest, increment the generator cycle, or proceed to PR shipment.
- A self-declared complete manifest is still malformed unless predicates are cited, every supported pool has a result, tenants are deduplicated, discovery paths are complete or explicitly blocked with evidence, and every unique discovered candidate has exactly one disposition. For a configuration-gated capability, the discovery paths must include a repository-wide Playwright setup search and its provisioning/cleanup result before broad tenant probing. For a gap, require `candidatesDiscovered == candidatesProbed == candidateResults.length`, all candidate results rejected with evidence, no `unprobed` entries, and a non-empty `exhaustionReason` proving no discovery path remains. Downgrade any malformed manifest to `environment-discovery-incomplete`, retarget its blocker to `evaluator-environment`, and redispatch it through the same-cycle environment gate.
- Complete manifest with an eligible candidate → require the evaluator to capture screenshots on that candidate.
- Complete manifest with no eligible candidate → classify as an external `fixture-gap`; do not route it to the implementer as a code defect.

## Step 6: Fix loop

**POC profile:** fix only compiler/type errors, obvious runtime failure, failure to render the
requested final state, gross request mismatch, or a Critical safety finding. Allow at most two
implementation cycles. Rebuild and rerun only the bounded POC evaluator/reviewer. If any of those failures remain after the second cycle, stop without creating a POC PR: a POC that
does not run or show the requested result is not useful. Record everything else as promotion debt
and continue to Step 7.

The remaining Step 6 rules apply only to STANDARD profile.

**Environment-discovery incomplete (any cycle):** re-dispatch only `@agentow-copilot:evaluator` in the same implementation cycle with the missing coverage requirements. If the retry is still incomplete, do not claim the environment is unsupported and do not claim the UI was verified.

- If nothing has been committed yet, stop and report the blocker.
- If the implementation is already committed and green — `ow-build` passing, `ow-test` passing — then in auto/batch mode **ship it as `success-with-blockers` rather than discarding it**. Continue to review and `ow-pr-create`, and mark the draft PR `unverified`. Do not retry the capture a third time. In interactive mode, show the incomplete manifest and ask.

  The PR description must then carry a verification section stating exactly what was and was not done — build and unit tests passed, visual verification was attempted and could not be completed, BEFORE/AFTER screenshots are still owed, and a human must confirm the rendering before this leaves draft. Record the incomplete manifest and the capture failure verbatim in `report.json` and `final.md`. Never imply the UI was seen.

  The safeguard against hand-waving is the disclosure and the draft state, not the discarding of finished work. A run that verified nothing and says so is useful; a run that silently deletes a green commit is not.

**Evaluator-spec FAIL (any cycle):** re-dispatch only `@agentow-copilot:evaluator` once in the same implementation cycle with the spec blocker. Do not edit code, rebuild, retest, or consume a product fix cycle. If the retry still violates the evaluator contract, stop and report the blocker rather than looping or auto-shipping.

**Complete external fixture gap:** do not change product code. In interactive mode, show the coverage summary and ask whether to ship a draft with the blocker. In auto/batch mode, the run may continue only as `success-with-blockers`, preserving the complete manifest in `report.json` and `final.md`.

**Product/code FAIL and cycle < 5:** YOU fix the blockers (you still have full context — no re-investigation needed). Re-build, re-test, re-dispatch `@agentow-copilot:evaluator`. Increment cycle.

Before starting each fix cycle, append `[HH:MM:SS] 🔁 Fix cycle N+1 — <reason>`.

**Product/code FAIL and cycle ≥ 5:**
- Stop and report the remaining blockers in every mode. Only the separately defined complete external fixture gap may continue as `success-with-blockers`.

**PASS:** continue to Step 7.

## Step 7: Review (dispatch reviewer)
<!-- agentow-contract:gate:review:profiles=poc,standard -->

Record durable phase `review`, dispatch the reviewer, then reconcile immediately after it returns. (dispatch reviewer)

Append `[HH:MM:SS] 📝 Reviewer started` before dispatching.
In POC profile, dispatch the reviewer with `mode: poc-advisory`. It performs a bounded diff review
only for security/privacy exposure, destructive behavior or data loss, obvious runtime failure,
compiler/type errors, and gross mismatch with the requested result. Do not run the full review
contract validator, require exhaustive references/evidence, or loop on Important/Minor findings.
Critical safety findings still block the POC; everything else is recorded as promotion debt.
Pass only the request, branch, changed files, session/report writer paths, and artifact paths. After
it returns, reconcile and require `POC_SAFE_TO_DEMO` before continuing to Step 8. A `POC_BLOCKED`
verdict returns to the bounded POC fix loop; if the second implementation cycle is exhausted, stop
without creating a PR. Do not resolve a review ledger or run the validator.

In STANDARD profile, classify the immutable Git diff before reading any review contract. If every
substantive change retires a Flight, KS, Experiment, Feature, or Rollout gate, set
`reviewPolicy=graduation-only`, read only
`${CLAUDE_PLUGIN_ROOT}/skills/ow-review/references/graduation.md`, and do not read the general
`docs/review-contract.md`, profiles, review-miss documents, or other review references. Otherwise,
including every mixed graduation/feature change, set `reviewPolicy=general` and read
`${CLAUDE_PLUGIN_ROOT}/docs/review-contract.md`. Either selected review policy is a hard evidence
gate in interactive, AUTO, and batch execution.

For `graduation-only`, write every independently classified gate identifier, one per line, to
`<sessionDir>/review-gates.txt` before reviewer dispatch. The reviewer must not create or modify this
inventory. Also generate `<sessionDir>/review-deleted-files.txt` from Git with `--diff-filter=D`.

Also run `tools/build-review-rule-inventory.mjs` with the immutable diff identity and
`--registry ${CLAUDE_PLUGIN_ROOT}/graduation-review-rule-registry.json`, writing
`<sessionDir>/review-rule-inventory.json`. This registry contains only `graduation.md` and preserves
graduation-only isolation while requiring exact accounting for every rule in that reference.

For `reviewPolicy=general`, run `tools/build-review-rule-inventory.mjs` with the current HEAD,
merge base, diff digest, `${CLAUDE_PLUGIN_ROOT}` as `--repo`, and
`--registry ${CLAUDE_PLUGIN_ROOT}/review-rule-registry.json`. The canonical registry includes every
general-review metric; applicability is reported per rule rather than by omitting references. Write
`<sessionDir>/review-rule-inventory.json` and freeze it before dispatch. The reviewer must not create,
edit, or narrow it.

The remaining Step 7 procedure applies only to STANDARD profile.

Only when `reviewPolicy=general`, resolve the branch's review ledger first, so a finding already
dispositioned on this branch is never raised again:

```bash
ledgerSlug=$(printf '%s' "<branch>" | tr '/' '-')
reviewLedgerPath="$HOME/.config/agentow/review-ledger/${ledgerSlug}.json"
```

When the PR already exists, recover the ledger the PR description carries before reviewing, so a re-review from a different machine or session sees the same decisions:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/review-ledger.mjs" parse \
  --description <sessionDir>/pr-description.md --out "$reviewLedgerPath"
```

Dispatch `@agentow-copilot:reviewer` with:

```yaml
branch: <branch>
reviewPolicy: <graduation-only or general>
gateInventoryPath: <sessionDir>/review-gates.txt               # graduation-only
deletedFilesPath: <sessionDir>/review-deleted-files.txt         # graduation-only
ruleInventoryPath: <sessionDir>/review-rule-inventory.json      # both policies
prDescriptionPath: <sessionDir>/pr-description.md               # when available
changedFiles: <changed files>
sessionDir: /workspaces/odsp-web/.aero/<session>
reportFile: /workspaces/odsp-web/.aero/<session>/report.json
reportWriterCommand: node ${CLAUDE_PLUGIN_ROOT}/tools/run-state.mjs report /workspaces/odsp-web/.aero/<session>
progressLog: /workspaces/odsp-web/.aero/<session>/progress.log
artifactPath: /workspaces/odsp-web/.aero/<session>/review.md
artifactJsonPath: /workspaces/odsp-web/.aero/<session>/review.json
reviewLedgerPath: <resolved $reviewLedgerPath>
contextDocuments:
  - <every routed feature/domain context document>
planPath: <actual planPath returned by the planner NDJSON record>
implementationEvidencePaths:
  - /workspaces/odsp-web/.aero/<session>/report.json
  - /workspaces/odsp-web/.aero/<session>/report-recovery.ndjson
evaluationArtifactPaths:
  - <every existing artifact path from the final evaluator NDJSON record, including artifactPath/evalReportPath/ruleFindingsPath/visionFindingsPath when present>
```

For `reviewPolicy=graduation-only`, omit `reviewLedgerPath`, `contextDocuments`, `planPath`,
`implementationEvidencePaths`, and `evaluationArtifactPaths`. Pass only the immutable diff identity,
changed-file/session/report paths, review artifact paths, and `prDescriptionPath` when a PR
description is available. The reviewer uses it as trusted selected-branch intent, not rollout
authorization evidence. Do not require a description or request external state proof. Instruct the reviewer to use only `graduation.md`, produce its minimal report, and
return without entering generic review passes.

Read the final evaluator NDJSON record immediately before dispatch. Pass only artifact paths that the record actually returned and that exist; do not synthesize conventional paths. If the final evaluator record or its required artifacts are missing, classify it as `evaluator-spec` and stop or retry under Step 6 rather than reviewing stale evidence.

In STANDARD profile, after the reviewer returns, independently recompute the merge base, HEAD, diff
digest, and changed-file list. When `reviewPolicy=graduation-only`, validate only with:
<!-- agentow-contract:evidence:review-bound-to-head -->

```bash
mergeBase=$(git merge-base origin/main HEAD)
git diff --no-renames --name-only "$mergeBase"...HEAD > <sessionDir>/review-changed-files.txt
git diff --no-renames --diff-filter=D --name-only "$mergeBase"...HEAD > <sessionDir>/review-deleted-files.txt
node "${CLAUDE_PLUGIN_ROOT}/tools/validate-graduation-review-report.mjs" \
  <sessionDir>/review.json \
  --expected-head "$(git rev-parse HEAD)" \
  --expected-merge-base "$mergeBase" \
  --expected-diff-digest "$(git diff --no-renames "$mergeBase"...HEAD | sha256sum | cut -d' ' -f1)" \
  --rule-inventory <sessionDir>/review-rule-inventory.json \
  --rule-registry "${CLAUDE_PLUGIN_ROOT}/graduation-review-rule-registry.json" \
  --changed-files <sessionDir>/review-changed-files.txt \
  --deleted-files <sessionDir>/review-deleted-files.txt \
  --expected-gates <sessionDir>/review-gates.txt
```

When `reviewPolicy=general`, validate with:

```bash
mergeBase=$(git merge-base origin/main HEAD)
git diff --no-renames --name-only "$mergeBase"...HEAD > <sessionDir>/review-changed-files.txt
git diff --no-renames --numstat "$mergeBase"...HEAD > <sessionDir>/review-numstat.txt
node "${CLAUDE_PLUGIN_ROOT}/tools/validate-review-report.mjs" \
  <sessionDir>/review.json \
  --expected-head "$(git rev-parse HEAD)" \
  --expected-merge-base "$mergeBase" \
  --expected-diff-digest "$(git diff --no-renames "$mergeBase"...HEAD | sha256sum | cut -d' ' -f1)" \
  --rule-inventory <sessionDir>/review-rule-inventory.json \
  --rule-registry "${CLAUDE_PLUGIN_ROOT}/review-rule-registry.json" \
  --changed-files <sessionDir>/review-changed-files.txt \
  --diff-numstat <sessionDir>/review-numstat.txt \
  --ledger "$reviewLedgerPath" \
  --repo "$(git rev-parse --show-toplevel)"
```

The validator re-runs the ledger match itself, so a reviewer that re-raises an accepted finding or invents a `previouslyAccepted` entry fails validation rather than reaching the author.

If `review.md`, `review.json`, or the reviewer NDJSON line is missing, or validation fails, classify it as `reviewer-spec`. Re-dispatch the reviewer once against the unchanged implementation cycle with the validation errors. Do not edit code, rebuild, retest, or consume a product fix cycle. If the retry still fails validation, stop; never ship an unsupported review.

**REQUEST_CHANGES with any Critical or Important finding:**
- Convert every blocking finding into a product blocker with its evidence and suggested fix.
- If `cycle < 5`, go back to Step 6, fix, rebuild, retest, re-evaluate, and run a completely new review against the new HEAD.
- At `cycle >= 5`, stop and report unresolved findings in every mode. Draft status and AUTO mode do not bypass the review quality gate.

**APPROVE / COMMENT (Minor only):** every Minor must be dispositioned before shipping. An undispositioned Minor is what makes the next review of this PR look noisy, so choose one per finding:

- **Fix it** when it is cheap and low-risk. Prefer this. Batch the fixes into the existing branch, then re-run the review against the new HEAD.
- **Accept it** when fixing is out of scope, riskier than the nit, or contradicts the plan. Record the decision so no later review re-raises it:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/review-ledger.mjs" accept \
  --report <sessionDir>/review.json \
  --ledger "$reviewLedgerPath" \
  --repo "$(git rev-parse --show-toplevel)" \
  --branch "<branch>" \
  --accept '<findingId>=<why this stays as-is in this PR>'
```

The reason is shown to the author and to every later reviewer, so it must say why the nit stays rather than restate the nit; the tool rejects a reason that is too short or that merely repeats the finding. Report accepted Minors in the run summary alongside the fixed ones, then continue.

## Step 8: Maintain context from the as-built result

This phase never pauses the product workflow.

**POC profile:** skip this phase and record `deferred-for-poc`. Promotion runs it after STANDARD
evaluation and review.

1. Append `evaluation` and `review` evidence events with artifact digests, outcomes, blockers, and citations.
2. Dispatch `@agentow-copilot:context-maintainer` with `mode: as-built`, the actual commit/diff, approved plan, evaluator artifact, reviewer artifact, and prior candidate.
3. The new immutable candidate must correct or supersede plan intent that the code did not implement.
4. Verify and apply it using the same manifest policy and stale-base/read-only safeguards as Step 3.5.
5. Write the result artifacts and append `[HH:MM:SS] 🧠 Context as-built update — <result>`.

No-update, patch-only, disabled, dirty-worktree, read-only, auth, or conflict outcomes are recorded but never block PR creation.

## Step 9: Ship
<!-- agentow-contract:delivery:draft-pr -->

1. **Push** the branch. For a new run, create the draft PR with `ow-pr-create`. When promoting an
   existing POC, call `ow-pr-update` with its existing `prId`; never call `ow-pr-create`, never create
   a second PR, and keep it draft. Use the title from the plan spec and a Summary + Changes
   description (no generic auto-generated "Testing" section). POC titles start with `[POC]` and the
   first description block must be:

   ```text
   > [!WARNING]
   > POC — NOT PRODUCTION READY. Build/typecheck and final-result validation only.

   ## Skipped quality gates
   - Tests: skipped
   - Planning: bounded POC source pass
   - Visual comparison: AFTER only; exhaustive scenarios deferred
   - Review: advisory; non-critical findings deferred
   - Context maintenance: deferred
   ```

   POC PRs always remain draft and agentOW must never merge them. In STANDARD profile, for SP-Client
   runtime changes, the first line must be `Gate: <Flight/KS identifier> — <enabled/new-path
   direction>; <disabled/fallback direction>`, grounded in the validated
   `preReview.rolloutProtection` artifact. When the ledger has entries, append its rendered block to
   the description so the accepted nits and their reasons travel with the PR:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/review-ledger.mjs" render \
  --ledger "$reviewLedgerPath" >> <sessionDir>/pr-description.md
```

   The block is human-readable and carries a machine-readable comment, so a later reviewer on any machine recovers the same decisions with `review-ledger.mjs parse` instead of re-raising them.
2. **Visual validation for UI changes:** POC uses its validated AFTER-only result. STANDARD prefers a
   dispatcher-provided, reachable compliant personal-account Playwright profile and compares
   target/current with the changed build under identical flights. A Codespace that cannot reach the
   Devbox profile falls back immediately to the evaluator's FIC Playwright/Heft spec: local
   `rush start` first, then `ow-pr-debug-query` / `finalValidationMode=pr-cdn-fic` for a proven
   route-specific local failure. Playwright MCP and `browser_*` tools are not validation routes.
3. **Attach screenshots** for UI changes. In POC, attach `visualValidation.afterPath` and render one
   `Final result` link/image; `poc=true`, `comparison=after-only`, and the final-state discriminator
   are the completeness contract. Do not require `visualValidation.scenarios` or a BEFORE path.
   In STANDARD, attach only evaluator-produced screenshot paths and render a
   compact PR table with one row per required scenario and BEFORE/AFTER links from
   `visualValidation.scenarios`. Component crops may be supplemental links, but never replace the
   primary images. Include `visualValidation.source`.
   Component crops may be attached as clearly labeled supplemental detail links.
   - Pass the table to `ow-pr-attach`; it replaces the prior
     <!-- agentow-contract:safety:no-pr-comments -->
     `<!-- agentow:visual-validation:start -->` block instead of appending duplicates.
   - Azure DevOps limits descriptions to 4000 characters. Keep Summary, Changes, required
     verification disclosures, accepted-review ledger, and scenario evidence. Low-value generated
     diagnostics may be wrapped in
     `<!-- agentow:disposable:start label --> ... <!-- agentow:disposable:end -->`; the attachment
     tool removes those only when needed. Never silently delete human-authored or required content.
   - In STANDARD, missing/incomplete scenario evidence blocks PR creation unless Step 6 proved a complete
     external fixture gap; only that case may ship as `success-with-blockers`.
   - In STANDARD, if visual validation fails because a surface needs seeded data or a tenant capability, write `fixtureGap: true`, the missing fixture, and the complete `coverageManifest` in `final.md` / `report.json`. Batch mode reads this as `success-with-blockers`, not plain success. An incomplete manifest blocks shipment.
4. **Report** the PR URL to the user.

Write `/workspaces/odsp-web/.aero/<session>/final.md` with final build/test/evaluation/review status,
PR URL if any, screenshot paths if captured, any remaining blockers, and the timing summary from
`run-state.mjs timing`.

For POC, set final status `poc-complete`, list every skipped gate and promotion debt, and end with:
`To make this production-ready, say "promote this POC".`

Include the context library ID, plan-stage result, as-built result, latest candidate path, applied context commit/PR if any, and pending patch/conflict path. Append a compact reference entry to `~/.config/agentow/runs.ndjson` keyed by run ID and PR URL so `/ow-context-feedback` can resume the provenance chain later.

After `final.md` is written, run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/run-state.mjs" complete "<sessionDir>"
```

This performs a final reconciliation before marking the run complete. Only then append/report
`✅ Workflow complete` to the user. A later same-task requirement change reopens this same run as a
new revision; it does not erase the completed revision.

## Notes

- One feature/bug per run. For multiple, use `ow-batch`; it runs this pipeline serially in the main session and checkpoints between tasks.
- Specs/plans stay local (`.aero/`), never committed, never referenced from code.
- If the user explicitly says "skip the review", do not dispatch reviewer and do not create a PR or claim AgentOW approval. Requests to avoid a PR or only edit code remain valid.
