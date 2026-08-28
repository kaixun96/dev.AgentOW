# Success metrics

Measure agentOW by product-delivery quality, not by internal activity.

## North star

**Merge rate without major human rework:** the share of generated PRs that merge with less than an
agreed percentage of their changed lines rewritten by people before merge.

```text
rework ratio =
  human lines changed after the agentOW commits and before merge
  / total lines changed by agentOW
```

Choose the threshold with the team before reporting it. Do not publish a placeholder as fact.

## Supporting metrics

- first-pass rate: merged with no reviewer must-fix feedback;
- reviewer rework: changed lines and must-fix comments per merged PR;
- time-savings multiple: measured human baseline divided by agentOW time to Draft PR.

The human baseline must come from reproducible cycle-time data, a timed comparison, or an explicitly
labeled estimate.

## Guardrails

- complexity distribution and merge rate by task class;
- revert rate or bugs traced to agentOW PRs during an agreed observation window;
- representative inclusion of trivial, single-component, cross-file, and gated work.

Use revert rate when reliable PR-to-regression linkage does not exist.

## Collection

1. Put a stable machine-detectable marker on every agentOW PR.
2. Record task complexity at intake.
3. Derive merge state, rework, review feedback, and reverts from ADO and Git.
4. Wait for a meaningful sample before reporting percentages.

Cycles, stalls, token cost, and screenshot hit rate are diagnostics. They explain delivery outcomes
but do not prove that the harness creates value.
