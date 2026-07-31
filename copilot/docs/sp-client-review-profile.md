# SP-Client review profile

Apply this profile when any Git-changed path is under `sp-client/`. It supplements `review-contract.md`; it does not replace repository instructions or feature-specific routed context.

## Interpret the checklist with evidence

Runtime behavior and styling changes must be protected by a flight or killswitch. Pure tests, documentation, generated metadata, and mechanical changes that cannot affect runtime may be marked not applicable with evidence. Do not mechanically demand a new gate when an existing upstream gate already protects every changed runtime path; prove that coverage instead.

- A killswitch is a temporary emergency rollback valve for risky behavior, not a feature flag or a development workaround. Activated means old/fallback behavior; not activated means new behavior.
- A flight/Feature controls staged rollout. For a risky staged feature, prefer one killswitch over the flight rather than composite killswitch logic.
- An `_SPExperiment` provides a clean control/treatment split for measuring performance changes. It does not replace a killswitch when emergency rollback is also warranted.
- Pure renames, imports, declarations not reached by old code, tests, and documentation do not automatically need a new runtime gate. Review the behavioral blast radius and repository guidance instead.
- Do not recommend activating a killswitch to hide a defect during development. Fix the new path.

## Rollout and rollback

For every review with SP-Client runtime changes, perform this sequence before the rest of the code review:

- Read the PR description first. It must identify the flight/KS, state whether it is a Flight, KS, or KS+Flight, explain the enabled/disabled direction, and name the fallback. If reviewing before PR creation, require this information in the plan and ensure the generated PR description puts it on the first line.
- Enumerate every changed runtime path, then trace protection from each reachable entry point to the changed page/component. An upstream flight or killswitch counts only when it gates every new execution and style path; do not infer protection from a nearby check.
- Identify the rollback strategy and whether KS, flight/Feature, experiment, or an existing gate is appropriate.
- Verify new behavior runs when the KS is **not** activated and the activated state preserves a safe old/fallback path.
- Verify Flight off enters the original path before any new hook, effect, wrapper, callback, style, or adapter executes. Matching output is not enough.
- Test enabled and disabled/fallback states.
- For SP-Client KS code, use `_SPKillSwitch`, a lowercase unique GUID, function-time evaluation (never module evaluation), and the comment form `/* 'MM/DD/YYYY', 'alias - Description' */`.
- For flights, use the established ID/name and attribution comment convention. For performance comparisons, require an experiment and exposure logging; a flight alone is not valid measurement.
- Flag composite KS logic when one KS over a flight provides a clearer emergency control.
- Check whether an old KS should graduate. A graduation change needs evidence that the KS is inactive in all rings (for example Merlin `Test-GridKillSwitch` output), and must remove obsolete fallback complexity safely.

## Tests and review evidence

- Unit tests cover changed behavior, edge/error paths, null/undefined inputs, and both gate states when gated.
- Tests assert product behavior rather than mock implementation details.
- Complex features add or update durable Markdown documentation when it materially helps future maintenance and AI-assisted follow-ups.

## TypeScript and maintainability

- No unjustified `any`; use `unknown` only with narrowing. Prefer the strictest useful parameter and return types.
- Async work is awaited and error-handled. A deliberately voided promise has a nearby reason and an established error-observation path.
- Clean up event listeners/subscriptions. Avoid mixed promise/`async` styles without a reason.
- No magic values, debug code, `console.log`, new deprecated APIs, or unexplained duplication.
- `eslint-disable`, `@ts-ignore`, and `@ts-expect-error` require a specific nearby justification.
- Deferred work/TODO comments cite an ADO work item.

## Reliability, telemetry, privacy, and security

- Use the established `_QosMonitor` pattern for meaningful async operations where the owning component already reports QoS; do not add empty boilerplate monitoring to trivial promises.
- Use `_EngagementLogger` for meaningful user actions according to local telemetry conventions; do not log every low-level event indiscriminately.
- Use `_TraceLogger` instead of console output for actionable diagnostics such as race investigations, while avoiding noisy logs.
- Never log PII or resource/tenant-location data prohibited by policy: usernames, emails, file names, paths, tenant URLs, or feedback-prefilled user/resource content.
- Error text includes useful non-PII context. API/localized error-message strings are never used as control-flow conditions.
- Inspect trust boundaries, URL/input handling, authorization, data exposure, and dependency changes for security regressions.

## Performance and UI quality

- Assess bundle, latency, render, and memory impact. A bundle delta of 2 KB or more is a review trigger requiring measurement and justification or on-demand loading; it is not automatically a defect.
- For large collections, review three separate concerns: server-side filtering, transport pagination/continuation, and bounded viewport rendering (progressive loading, paging, or virtualization). Do not recommend fetching every page without also proving the UI will not render an unbounded item set.
- Performance changes use an experiment for statistically meaningful comparison and preserve an emergency rollback strategy when risk warrants it.
- User-facing strings use resources; post-freeze additions follow localization review/locking policy.
- Externalizing a string is the easy half. For each added `.resx` entry also check that every
  `{N}` placeholder is locked with `{Locked="{N}"}` in the comment, that anything which can be
  1 has a singular form, and that any English string left in code cannot reach a user.
- Styling uses theme tokens rather than hardcoded colors and is checked in light, dark, and high-contrast modes.
- Prefer semantic typography presets such as `typographyStyles` over manually composing individual font-family/size/weight tokens when a matching preset exists.
- Before hand-rolling navigation, menus, lists, or other interactive structures, search the package and repository for an established Fluent V9/SPDS primitive. Record why the standard component is unsuitable if custom semantic markup remains.
- The same applies beyond components. Before accepting a new hook, utility, or style helper,
  search by capability rather than by the author's chosen name — screen-reader announcements,
  string formatting, URL handling, and spacing or radius values all have established
  implementations here.
- Before adding theme-specific overrides, trace the established SharePoint theme/Detheme provider flow. Local overrides require evidence that the formal flow cannot provide the intended appearance across supported themes.
- Interactive controls are keyboard accessible with correct role, state, and accessible name.

## Required profile checks

For every `sp-client/` review, record these IDs in `preReview.profileChecks`. Each must be `reviewed` with citations and a conclusion or `not-applicable` with a specific reason:

- `spClientRolloutTrace`
- `spClientUiPrimitivesTokens`
- `spClientThemeDetheme`
- `spClientLargeCollections`
- `spClientAutomatedTests`

`spClientRolloutTrace` is additionally represented by the structured `preReview.rolloutProtection` object. For runtime changes it must contain the exact runtime path set, PR-description/plan evidence, gate identifiers and type, entry-point and gate-check citations, new/fallback path citations, direction, disabled-state test evidence, and one path-specific coverage record per runtime changed file. Missing description, unprotected paths, incorrect direction, or absent fallback tests require a finding and cannot be approved.

## Blocking examples

Request changes when evidenced: runtime changes with no Flight/KS protection, PR description missing the gate and direction, incomplete gate coverage, wrong KS/Flight direction, new code executing while Flight is off or KS is activated, module-evaluated SP-Client KS, missing safe fallback, performance work using only a flight, missing behavior/gate tests, unhandled meaningful async failure, PII logging, missing user-action telemetry where required by established conventions, unjustified bundle growth, unbounded collection rendering, bypassing an available Fluent/SPDS primitive without rationale, theme overrides that conflict with the formal Detheme flow, hardcoded user-facing strings/colors, inaccessible controls, or suppressions/deferred work without required rationale.

Use `Nit:` only for optional education. A checklist item is not automatically blocking when it is demonstrably inapplicable; document that disposition with evidence.
