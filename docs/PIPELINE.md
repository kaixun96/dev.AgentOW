# agentOW Pipeline (dual-evaluator ensemble)

End-to-end flow from `/ow-team` invocation to draft PR. The key architectural moves:

1. **UI verification is split into two parallel evaluator agents** — a rule-based one with full code/plan/probe access, and a tool-isolated vision agent that sees only the AFTER PNG.
2. **`calibration.md` is the single source of truth for "what PASS means"** — written once by planner, never modified mid-session, primary-source-cited for every threshold.
3. **`progress.log` is the user's only real-time view** — orchestrator writes mandatory log events, a background `progress-watcher.mjs` daemon backfills events the orchestrator forgot.
4. **`/home/vscode/.claude/projects/.../memory/MEMORY.md` is loaded into planner context** — accumulated rules from prior sessions enforce structure on calibration.md (probe BEFORE-derived alignment, mandate visualVocabulary, refuse inherited expected values, etc.).

---

## Team composition

`/ow-team` spawns 7 agents:

| Agent | Role | Tool scope |
|---|---|---|
| `ow-orchestrator` | Drives the pipeline; relays user Q&A through team-lead | Read (session files only), Bash (mkdir/echo), SendMessage |
| `ow-planner` | Researches codebase, drafts plan + `calibration.md` | Read-only |
| `ow-generator` | Implements plan, builds, tests, starts dev server, commits | Full access |
| `ow-evaluator` | Plan dry-run (Step 1.5) + code_inspection (Step 3) | Full evaluator toolset |
| `ow-evaluator-rule` | UI verification — rule half (Step 5a) | Full evaluator toolset (Playwright, probes, diffs) |
| `ow-evaluator-vision` | UI verification — vision half (Step 5b) | **ONLY Read + Write** — architectural isolation |
| `ow-review-agent` | Pre-PR code review | Read-only |

---

## Session bootstrap (team-lead, before agents spawn)

```
team-lead (skill: /ow-team)
   │
   ├─ mkdir -p {sessionDir}/plans
   ├─ touch {sessionDir}/report.json
   ├─ touch {sessionDir}/progress.log
   ├─ echo mode (AUTO / INTERACTIVE) to progress.log
   ├─ nohup node tools/progress-watcher.mjs {sessionDir} &
   │     (backstop: tails report.json NDJSON + watches evaluation/iter*/
   │      for new screenshots / findings, appends human-readable lines
   │      to progress.log when orchestrator forgets)
   ├─ brainstorm (interactive only) or skip (--auto)
   └─ spawn 6 idle agents → spawn ow-orchestrator (implicit team; no TeamCreate)
```

---

## End-to-end flow

```
   ┌────────────────────────────────────────────────────────────┐
   │ Step 0: orchestrator confirms session                       │
   │   logs USER PROMPT (heredoc) + mode banner                  │
   │   verifies $(date) expansion (double-quote vs single-quote) │
   └────────────────────────────────────────────────────────────┘
        │
        ▼
   ┌────────────────────────────────────────────────────────────┐
   │ Step 1: ow-planner                                          │
   │                                                             │
   │   Phase 1-7:                                                │
   │     read CLAUDE.md / skill / SPDS source / MEMORY.md        │
   │     research via Bluebird MCP / Grep / Glob                 │
   │     write plan.md (Spec + Tasks + Visual Validation:        │
   │       Surface Trace, probes, screenshotGate, Visual Expect) │
   │     SendMessage plan to orchestrator → wait approval        │
   │                                                             │
   │   Phase 8: write calibration.md (ONCE, session-locked)      │
   │     MANDATORY sections (memory rules enforce):              │
   │       • BEFORE capture REQUIRED                             │
   │       • SPDS-governed properties — NEVER override           │
   │         (cite design-systems/sharepoint/<comp>/src/.styles  │
   │          .ts:line; cite tokens-css-extractor for literals)  │
   │       • DOM probes with `source:` line per design-system    │
   │         expected value (no inherited PR / cycle values)     │
   │       • BEFORE-derived alignment probes (for list-style     │
   │         panels — header↔body left-edge ± 2px, etc.)         │
   │       • Static checks (skill §A)                            │
   │       • Runtime checks (skill §B)                           │
   │       • Screenshot Gate (mustContain/mustNotContain)        │
   │       • Visual Expectations (verbatim from plan)            │
   │       • Documented v8→v9 deltas (aria-diff allowlist)       │
   │       • Hedging blacklist (verdict-lint phrases)            │
   │       • visualVocabulary (consumed by vision; lists v9      │
   │         chrome traits that are EXPECTED when solo)          │
   │                                                             │
   │   Phase 8b: append NDJSON to report.json                    │
   └────────────────────────────────────────────────────────────┘
        │
        ▼
   ┌────────────────────────────────────────────────────────────┐
   │ Step 1a: plan approval                                      │
   │   interactive → ask user via team-lead                      │
   │   --auto     → auto-approve immediately                     │
   └────────────────────────────────────────────────────────────┘
        │
        ▼
   ┌────────────────────────────────────────────────────────────┐
   │ Step 1.5: ow-evaluator (plan_dry_run)                       │
   │   negotiated contract: "can I actually verify this plan?"   │
   │   READY  → continue                                          │
   │   REVISE → bounce to planner with concerns (max 3 rounds)   │
   │                                                             │
   │   Catches: probe-selector-not-pr-scoped,                    │
   │   screenshotGate-mustContain-missing,                       │
   │   screenshotGate-mustNotContain-missing-ootb-look-alikes,   │
   │   acceptance-criterion-unverifiable, discriminator collision│
   │                                                             │
   │   --auto does NOT skip this. Internal contract negotiation. │
   └────────────────────────────────────────────────────────────┘
        │
        ▼
   ┌────────────────────────────────────────────────────────────┐
   │ Step 2: ow-generator                                        │
   │   (cycle > 1: reproduce-before-fix — snapshot broken state  │
   │    from prior cycle's debug URL BEFORE editing — SWE-agent  │
   │    discipline)                                              │
   │                                                             │
   │   implement plan → commit code → emit code_done             │
   │   (build continues in background)                           │
   │                                                             │
   │   sub-rules:                                                │
   │     • bundleIcon(Filled, Regular) for every SPDS Button icon│
   │       (skill §C2.5.1)                                       │
   │     • use *ContentV9 SCSS class for v9-only padding (skill  │
   │       Cheat Sheet 4 — avoid v8 inner-content double-stack)  │
   │     • inline style for single-rule overrides; Griffel only  │
   │       when multi-rule / themed / pseudo-state (skill §C4)   │
   │     • NonNullable<OverlayDrawerProps['onOpenChange']> for   │
   │       handler type (skill §C5.1)                            │
   │     • rush change --bulk --bump-type none --message "..."   │
   │       --commit BEFORE push for publishable packages (§C9)   │
   └────────────────────────────────────────────────────────────┘
        │
        ▼  on code_done
   ┌────────────────────────────────────────────────────────────┐
   │ Step 3: PARALLEL DISPATCH                                   │
   │                                                             │
   │   ┌──────────────────────┐   ┌──────────────────────────┐   │
   │   │ ow-evaluator         │   │ ow-review-agent          │   │
   │   │ (code_inspection)    │   │ (git diff review)        │   │
   │   └──────────────────────┘   └──────────────────────────┘   │
   │                                                             │
   │   meanwhile: ow-generator finishes build → build_done       │
   │                                                             │
   │   collect all THREE responses before continuing             │
   └────────────────────────────────────────────────────────────┘
        │
        ▼
   ┌────────────────────────────────────────────────────────────┐
   │ Step 4: process build result                                │
   │   build failure → fix cycle (back to Step 2, cycle+1)       │
   │   build success → has UI criteria? yes → Step 5, no → 6     │
   └────────────────────────────────────────────────────────────┘
        │
        ▼
   ┌────────────────────────────────────────────────────────────┐
   │ Step 5: UI VERIFICATION — DUAL-EVALUATOR ENSEMBLE           │
   │                                                             │
   │  Step 5a (FIRST — vision depends on its output):            │
   │   ┌────────────────────────────────────────────────────┐    │
   │   │ ow-evaluator-rule                                  │    │
   │   │                                                    │    │
   │   │  R-0: read calibration.md + prior reflection.md    │    │
   │   │       (treat prior as adversarial, not memory)     │    │
   │   │  R-1: parse plan Pattern + probes + screenshotGate │    │
   │   │  R-2: confirm dev server + extract loader URLs     │    │
   │   │  R-3: generate Playwright spec — TWO test bodies   │    │
   │   │       BEFORE (prod CDN, flight OFF, NO debug qs)   │    │
   │   │       AFTER  (localhost PR bundle, flight ON)      │    │
   │   │       BEFORE is non-optional — missing = hard FAIL │    │
   │   │       blocker `before-capture-missing`             │    │
   │   │  R-4 : rushx playwright run                        │    │
   │   │  R-4b: tools/aria-diff.mjs → aria-diff.json        │    │
   │   │  R-4c: tools/composite.mjs → composite-<name>.png  │    │
   │   │        (vision consumes the AFTER + composite)     │    │
   │   │  R-4d: tools/pixel-diff.mjs → pixel-diff.json      │    │
   │   │  R-4e: tools/structural-diff.mjs                   │    │
   │   │        → structural-diff.json (any "regress" =     │    │
   │   │         hard FAIL blocker)                         │    │
   │   │  R-5: parse probes + run hard-gate table           │    │
   │   │       (axe critical/serious, mustContain,          │    │
   │   │        mustNotContain, prove-name-mismatch, etc.)  │    │
   │   │  R-6: write expected-after.md (vision MUST NOT see)│    │
   │   │  R-7: write rule-findings.json (verdict + blockers │    │
   │   │       in three-part format: predicted X / actual Y │    │
   │   │       / suspected root cause file:line)            │    │
   │   │  R-8: tools/verdict-lint.mjs (hedging blacklist +  │    │
   │   │       schema completeness)                         │    │
   │   │  R-9: SendMessage rule complete + append NDJSON    │    │
   │   │  R-10: delete generated spec file                  │    │
   │   └────────────────────────────────────────────────────┘    │
   │                                                             │
   │  Step 5b (after 5a completes):                              │
   │   ┌────────────────────────────────────────────────────┐    │
   │   │ ow-evaluator-vision  [tool-isolated: Read + Write] │    │
   │   │                                                    │    │
   │   │  Input (ONLY):                                     │    │
   │   │   • afterPngPath (cropped AFTER from R-4c output)  │    │
   │   │   • visualVocabularyPath = calibration.md          │    │
   │   │       (reads ONLY the ## visualVocabulary section) │    │
   │   │                                                    │    │
   │   │  Forbidden (disallowedTools blocks physically):    │    │
   │   │   • Grep / Read source code (.tsx/.scss/.ts)       │    │
   │   │   • plan.md, expected-after.md, rule-findings.json │    │
   │   │   • probe JSONs, prior verdicts                    │    │
   │   │   • Bash / git / browser / web / all other MCP     │    │
   │   │                                                    │    │
   │   │  8-item mandatory checklist with coordinates:      │    │
   │   │   1. text truncation / ellipsis                    │    │
   │   │   2. visual overlap / occlusion (incl. placeholder │    │
   │   │      gray slash overlapping text)                  │    │
   │   │   3. alignment consistency (geometric majority)    │    │
   │   │   4. spacing rhythm (std dev)                      │    │
   │   │   5. container overflow / clipping                 │    │
   │   │   6. placeholder / loading / empty state           │    │
   │   │   7. color / contrast                              │    │
   │   │   8. first-glance PM impression                    │    │
   │   │                                                    │    │
   │   │  Writes vision-findings.json                       │    │
   │   │  Verdict rule (mechanical):                        │    │
   │   │   any blocker severity → FAIL; else PASS           │    │
   │   │  Forbidden hedging phrases enforced                │    │
   │   │                                                    │    │
   │   │  visualVocabulary suppresses flag ONLY when the    │    │
   │   │  chrome pattern appears SOLO. Overlap with content │    │
   │   │  still reports.                                    │    │
   │   └────────────────────────────────────────────────────┘    │
   │                                                             │
   │  Step 5c: MERGE VERDICTS                                    │
   │                                                             │
   │    Rule  | Vision | Merged | Notes                          │
   │    ------|--------|--------|---------------------------     │
   │    PASS  | PASS   | PASS   | → Step 6                       │
   │    FAIL  |  *     | FAIL   | blockers from rule-findings    │
   │    PASS  | FAIL   | FAIL   | blockers from vision-findings  │
   │                              (prefixed [vision] for gen)    │
   │                                                             │
   │    Vision FAIL OVERRIDES rule PASS — this is the whole      │
   │    point of the ensemble. No probe can detect occlusion.    │
   │                                                             │
   │  Step 5d: write reflection.md tripwires for next cycle      │
   │    • rule writes reflection.md (existing)                   │
   │    • if vision contributed blockers, append "## Vision      │
   │      tripwires" so next cycle's rule agent can add probes   │
   └────────────────────────────────────────────────────────────┘
        │
        ▼
   ┌────────────────────────────────────────────────────────────┐
   │ Step 6: final assessment                                    │
   │   eval FAIL + cycle < 5 → fix cycle (Step 2, cycle+1)       │
   │     • blockers tagged target:generator → dispatch generator │
   │     • blockers tagged target:evaluator-spec → dispatch      │
   │       evaluator-rule only; generator idle                   │
   │     • vision blockers always target:generator (code defect) │
   │   eval PASS + review REQUEST_CHANGES critical → fix cycle   │
   │   eval PASS + review OK → Step 7                            │
   └────────────────────────────────────────────────────────────┘
        │
        ▼
   ┌────────────────────────────────────────────────────────────┐
   │ Step 7: PR creation (if user requested PR)                  │
   │   7a: optional deep review (superpowers skill)              │
   │   7b: in interactive mode, confirm critical issues          │
   │   7c: ow-pr-create → draft PR                               │
   │   7c.2: ow-pr-attach BEFORE/AFTER screenshots               │
   │         HARD RULE: use appendToDescription, NOT             │
   │         commentMarkdown. Screenshots go in the PR           │
   │         description, never in a comment thread.             │
   │   7d: report completion (BATCH_RESULT if batchMode)         │
   └────────────────────────────────────────────────────────────┘
```

---

## Why dual evaluator

A single evaluator that runs probes **and** is asked to "also do cold-eye" cannot actually do cold-eye:

- LLM attention is biased by what it just measured — if probes already reported `borderRadius=16px`, the model's visual attention zooms to the corner and explains away other anomalies.
- Priors leak in: "placeholder gray slash is a known v9 pattern" silently dismisses a real text-occlusion bug.
- Self-consistency: the same model wrote the probe expectation and is now grading the screenshot — sycophancy + self-preference bias.

Splitting solves this **structurally**, not via prompt discipline:

- **Rule agent** sees everything (code, plan, probes) and judges **only** measurable thresholds. It cannot drift into "looks fine" because `verdict-lint.mjs` rejects hedging phrases.
- **Vision agent** has `disallowedTools` blocking every code/plan/probe access path — it physically cannot leak priors into its judgment because it cannot read the source.

Vision is the only one who can catch "thumbnail placeholder on the left of each list item overlaps with the title text" — there is no probe for that, and any evaluator with code context will explain it away.

### Why calibration.md drives both

Rule reads the entire file as its PASS contract. Vision reads ONLY the `## visualVocabulary` section — that section is the single bridge from "what is v9-native and OK" to the cold-eye reviewer. Without visualVocabulary, vision flags every v9 chrome trait (rounded corners, bundleIcon close button, OverlayDrawer shadow) as a suspected regression → false-positive FAIL → wasted fix cycle.

The 30-cycle BookmarkPanel regression (redo2–redo10) traces to two structural defects fixed in current pipeline:

1. **Inherited expected values**: planner wrote `borderRadius: 0` because kaixun's original PR did. Rule passed against a wrong target. **Fix**: planner Phase 8 hard rule — every design-system probe expected value MUST cite primary source (`design-systems/sharepoint/<comp>/src/.styles.ts:line`).
2. **BEFORE-blind alignment**: header↔list left-edge alignment is a v8 visual invariant not in any SPDS source — both rule (no probe) and vision (geometric majority cross-group blind) missed it. **Fix**: memory rule mandates `headerTitleLeftX == firstListItemContentLeftX ± 2px` probe in calibration for any list-style panel.

---

## progress.log — the user's only real-time view

The user watches `progress.log` in their IDE. They cannot see NDJSON, SendMessage traffic, or sub-agent stdout. Two mechanisms keep it current:

1. **Orchestrator mandatory write protocol** (`agents/ow-orchestrator.md` Step 0): every state transition triggers exactly ONE Bash call to echo a log line BEFORE doing anything else in that step. 21 mandatory log events covering every pipeline phase.
2. **`tools/progress-watcher.mjs` backstop**: launched as `nohup node ... &` by team-lead at session bootstrap. Polls every 2s, tails `report.json` (NDJSON), watches `evaluation/iter*/` for new PNGs / findings / reflection. Appends human-readable lines to `progress.log` for events the orchestrator forgot. Idempotent — safe to restart.

Without #2, long pipelines look frozen because the orchestrator LLM drops low-priority echo calls under message load.

---

## Cross-cycle artifacts (Reflexion verbal memory)

| File | Written by | Read by next cycle |
|---|---|---|
| `evaluation/iter<N>/rule-findings.json` | rule | rule (adversarial input, not memory) |
| `evaluation/iter<N>/vision-findings.json` | vision | rule (vision is stateless cold-eye each cycle) |
| `evaluation/iter<N>/expected-after.md` | rule | rule + orchestrator (vision: forbidden) |
| `evaluation/iter<N>/reflection.md` | rule (merged with vision tripwires) | rule |
| `calibration.md` (session-scoped, fixed) | planner Phase 8 | rule (full) + vision (visualVocabulary only) |
| `repro/iter<N>-pre-fix.png` + `-post-fix.png` | generator (cycle>1) | orchestrator (attaches to PR) |

Vision agent never accumulates memory across cycles — it is re-spawned cold-eye every cycle by design. Rule agent reads prior cycle's artifacts as adversarial input (re-judges from scratch, does not cite prior verdict as evidence).

---

## File outputs per UI verification cycle

```
{sessionDir}/evaluation/iter<N>/
├── before-<name>.png              (rule)
├── after-<name>.png               (rule)
├── before-<name>-cropped.png      (rule)
├── after-<name>-cropped.png       (rule) ← vision input
├── composite-<name>.png           (rule)
├── diff-<name>.png                (rule)
├── before-aria.json               (rule)
├── after-aria.json                (rule)
├── before-probes.json             (rule)
├── after-probes.json              (rule)
├── aria-diff.json                 (rule)
├── pixel-diff.json                (rule)
├── structural-diff.json           (rule)
├── playwright-output.log          (rule)
├── rule-findings.json             (rule) ← final rule verdict
├── expected-after.md              (rule) ← prediction, vision MUST NOT see
├── vision-findings.json           (vision) ← final vision verdict
└── reflection.md                  (rule, merged with vision tripwires)
```

---

## Persistent memory chain (loaded into planner context every session)

`MEMORY.md` index lives under `~/.claude/projects/-workspaces/memory/` and is auto-loaded as CLAUDE.md-style context. Current rules that gate planner Phase 8 / generator behavior:

| Rule | Enforces |
|---|---|
| `feedback_spds_probe_primary_source.md` | Every design-system probe expected value must cite `design-systems/sharepoint/<comp>/src/.styles.ts:line` — no inherited PR / cycle values |
| `feedback_v9_overlaydrawer_inline_borderradius_noop.md` | SPDS sets `position="end"` borderRadius 16px on page-facing corners — consumer code must NOT override |
| `feedback_planner_before_alignment_probe.md` | For list-style panel/drawer migrations, calibration MUST include `headerTitleLeftX == firstListItemContentLeftX ± 2px` + `bodyPaddingInlineLeft == drawerBodyComputedPaddingLeft` |
| `feedback_planner_visual_vocabulary_mandatory.md` | calibration MUST include populated `## visualVocabulary` section listing v9/SPDS chrome traits (rounded corners, bundleIcon, drawer shadow, paddingInline) with primary-source citation + `suppress_only_when_solo: true` |
| `feedback_list_panel_thumbnail_title_gap_probe.md` | List-style panel must probe per-item thumbnail↔title gap (cold-eye PNG misses DocumentCardTitle position:absolute left:auto overlap) |
| `feedback_evaluator_verify_text_against_resx.md` | Visible heading often matches target component's own resx, not a SuiteNav lookalike — grep resx before blaming OOTB occlusion |
| `feedback_evaluator_dom_attr_alone_insufficient.md` | When PNG looks identical due to shared-data-source lookalike, trust the DOM probes (prIdCount, adversarialCount, Griffel hash, v8PanelMainCount flip) |
| `reference_replace_component_notes.md` | Full SPDS v8→v9 migration playbook at `/workspaces/dotfiles/notes/ReplaceComponent/` |

Each rule below the platform layer was extracted from a specific past-session failure (cited in its body). New rules go through: observe failure → write `feedback_*.md` with Why + How to apply → add one-line pointer to `MEMORY.md`.

---

## Auto vs interactive mode

| Step | Interactive | Auto (`--auto`) |
|---|---|---|
| Brainstorm | runs | skipped |
| Plan approval (1a) | asks user | auto-approve |
| Plan dry-run (1.5) | always runs | always runs |
| Fix cycles | always run (max 5) | always run (max 5) |
| Critical review confirmation (7b) | asks user | auto-proceed (PR is draft) |
| PR creation | only if user asked | only if user asked |
| PR screenshots placement | description (not comment) | description (not comment) |

Auto mode is suitable for batch validation runs and reproducible regression sessions; interactive mode for new-feature work where plan needs review.
