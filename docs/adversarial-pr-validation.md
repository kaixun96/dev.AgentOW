# Adversarial PR Validation — Design Doc

> Status: DRAFT v1
> Owner: kaixun
> Last updated: 2026-05-25
> Related: [replace-component-recipe.md](./replace-component-recipe.md) (rule source), [architecture.md](./architecture.md) (existing pipeline)

## TL;DR

Extend `/ow-screenshot` from a single BEFORE/AFTER capture into a **multi-round generator ↔ evaluator loop**, GAN-style. Evaluator is calibrated against [replace-component-recipe.md](./replace-component-recipe.md) (Pattern A / B / C+ rules). Hard signals auto-fix; soft signals become PR comments.

## Motivation

Current `/ow-screenshot` produces one pair of screenshots and stops. It catches "did the PR build load + did the surface render", but not:

- recipe-rule violations (e.g. hardcoded `'14px'` instead of `tokens.spacingHorizontalSNudge`, missing `bundleIcon`, leaked `--fui-Drawer--size` in `.module.scss`)
- pixel-level regressions vs the legacy branch (Pattern C+ visual fidelity gate)
- DOM/a11y deltas (lost `aria-label`, dropped `data-automation-id`)
- prop-translation gaps (`onRenderFooter` audited per §C1.5? `bundleIcon` per §C2.5.1?)

These are exactly the issues that get caught in PR review and bounce the PR back. Doing them up front in an adversarial loop should shorten the human-review cycle.

## Design — GAN-style loop

```
┌─────────────────────────────────────────────────────────────┐
│  ow-pr-adversarial  (skill — entry point)                   │
│                                                             │
│  ┌────────────┐    cycle N    ┌─────────────────────────┐   │
│  │ Generator  │ ───────────▶ │ Adversarial Evaluator   │   │
│  │ (auto-fix) │              │ (calibrated, skeptical) │   │
│  └────────────┘ ◀─────────── └─────────────────────────┘   │
│         │      findings.md          │                       │
│         │                           │                       │
│         ▼                           ▼                       │
│   patch + rebuild              evaluation/iter<N>.md        │
│                                                             │
│  Convergence: 0 hard-fails AND 0 new-findings AND ≤ N=5     │
└─────────────────────────────────────────────────────────────┘
```

## Signals — three tiers

Anthropic's harness doc: *"hard thresholds remove subjective discretion"*. We use three tiers; only Tier 1 blocks convergence.

### Tier 1 — Hard signals (block convergence, auto-fix candidates)

| Signal | Source | Threshold | Auto-fix? |
|---|---|---|---|
| `prBuildCount > 0` | console probe on AFTER | must be true | no — abort cycle if false |
| Discriminator present in DOM | selector check from Surface Trace | must be true (both BEFORE & AFTER) | no — re-trace |
| Hardcoded values in `makeStyles` | grep `/'\d+px'\|rgba\(\|#[0-9a-f]{3,6}/` in changed `.tsx` | 0 violations (recipe §C0 Rule 2) | yes — token swap |
| Forbidden `experimental` import | grep `@msinternal/sharepoint-ui-react.*/experimental` | 0 (recipe §Forbidden) | yes — rewrite import |
| `bundleIcon` missing inside `<Button>` | AST scan: icon prop = single `XxxRegular` | 0 (recipe §C2.5.1) | yes — wrap in bundleIcon |
| `--fui-*` in `.module.scss` | grep `.scss` files in diff | 0 (recipe §C4) | yes — move to Griffel hook |
| Test mock missing `jest.requireActual` | grep test diff | 0 (recipe §A4) | yes — extend pattern |

### Tier 2 — Numeric thresholds (warn, no auto-fix)

| Signal | Threshold |
|---|---|
| Pixel diff BEFORE vs AFTER (Pattern A/B shadow-rename) | ≤ 2% expected; > 5% warning |
| Pixel diff (Pattern C+ full rewrite) | warn-only, design review handles it |
| DOM tree depth delta | ±2 nodes OK; beyond → warn |
| Bundle size delta on changed package | > 5KB warn |

### Tier 3 — LLM visual judgment (advisory only)

Calibrated few-shot eval: "Compare BEFORE vs AFTER for: spacing, alignment, contrast, affordance loss." Outputs `craft_score: 0-5` + free-text findings. **Never blocks**, always posted as PR comment for human decision. Anthropic doc on why: generators "confidently praise own work" — letting LLM visual judgment block + auto-fix creates an echo chamber.

## Auto-fix policy

| Finding class | Action |
|---|---|
| Tier 1 deterministic violation | Generator auto-patches, rebuilds, evaluator re-runs |
| Tier 2 numeric drift | Comment on PR, do not patch |
| Tier 3 visual finding | Comment on PR with side-by-side, do not patch |

**Cap**: 3 auto-fix cycles. If Tier 1 violations persist after cycle 3, escalate to human (post `## ⚠️ Adversarial validation needs human attention` comment with remaining findings).

## Convergence

A PR is marked `adversarial-validated` when **all three** hold:
1. All Tier 1 signals pass
2. Evaluator finds 0 new findings vs previous cycle (`findings.md` diff is empty)
3. Cycle count ≤ 5 (Anthropic: plateau 5-15; for swap PRs 5 is plenty)

If (2) fails at cycle 5 → mark `partial-validation` and post all accumulated findings.

## Anti-drift mechanisms

Per Anthropic harness doc:

1. **Fresh evaluator context per cycle** — each cycle dispatches a new evaluator agent that only reads `evaluation/iter<N-1>.md` + the latest diff. No carry-over chat history.
2. **Structured artifacts** — every cycle writes:
   - `evaluation/iter<N>.md` — findings (markdown)
   - `evaluation/iter<N>/before.png`, `after.png`, `diff.png`
   - `evaluation/iter<N>/probe.json` — Tier 1 signal values
3. **Recipe as anchor** — evaluator prompt references [replace-component-recipe.md](./replace-component-recipe.md) explicitly. New rules go into the recipe, not the agent prompt. Single source of truth.
4. **Pattern detection upfront** — first cycle classifies the PR as Pattern A / B / C+ / skip (recipe §"Choosing a pattern"). Subsequent cycles only run the rules for that pattern.

## Integration with existing AgentOW

### New files
- `agents/ow-adversarial-evaluator.md` — skeptical evaluator, recipe-aware
- `skills/ow-pr-adversarial/SKILL.md` — entry point `/ow-pr-adversarial <prId>`

### Reuse
- `ow-screenshot-agent` — Surface Trace + BEFORE/AFTER capture (cycle 1 only)
- `ow-pr-attach` — post findings + screenshots as PR comments
- `ow-generator` — auto-fix Tier 1 violations (with `--fix-only` mode flag, doesn't write new code)
- Existing `ow-pr-create` not touched (PR already exists)

### New MCP tools (TBD — propose, don't build yet)
- `ow-pixel-diff` — run pixelmatch on two PNGs, return % diff + diff.png
- `ow-recipe-lint` — run deterministic recipe checks on a diff, return Tier 1 findings JSON
- `ow-pr-comment-thread` — fetch existing adversarial comments to avoid duplicate posts across cycles

## Open questions

- [ ] Pattern C+ pixel-diff threshold: full rewrite means high % diff is expected by design. Do we skip Tier 2 pixel-diff for C+, or set a much higher threshold (e.g. 30%)?
- [ ] Cycle budget: time-cap or token-cap? Generator auto-fix + rebuild can take 5+ min per cycle.
- [ ] Who pays for cycles after PR is human-approved? Skip loop if PR has ≥ 1 reviewer sign-off?
- [ ] Synthetic tenant licensing (Viva Amplify, Project, etc.) — Tier 1 discriminator check will fail on unreachable surfaces. Fall back to Pattern: skip per existing screenshot-agent §Step 2.

## Open work — Phase 0 (this PR)

1. Land this design doc + [replace-component-recipe.md](./replace-component-recipe.md)
2. Get user review

## Open work — Phase 1 (skill + agent)

1. Implement `ow-recipe-lint` MCP tool (deterministic — no LLM)
2. Write `ow-adversarial-evaluator` agent
3. Write `/ow-pr-adversarial` skill — orchestrate the loop
4. Smoke-test on PR 2225561 (Amplify Drawer inner-content swap — known Pattern A territory)

## Open work — Phase 2 (visual signals)

1. `ow-pixel-diff` MCP tool (pixelmatch wrapper)
2. Few-shot calibration set for Tier 3 LLM eval (5-10 reviewed PRs with known craft issues)
3. Wire Tier 2 + Tier 3 into the loop

---

## References

- [Anthropic, Harness design for long-running apps](https://www.anthropic.com/engineering/harness-design-long-running-apps)
- [replace-component-recipe.md](./replace-component-recipe.md) — the rule source
- [architecture.md](./architecture.md) — existing AgentOW pipeline
- `agents/ow-evaluator.md` — current evaluator (feature-dev path, not PR-validation path)
- `agents/ow-screenshot-agent.md` — current single-shot PR screenshot agent
