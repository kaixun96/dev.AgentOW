# SP-Client review profile

Apply this profile when any Git-changed path is under `sp-client/`. It supplements `review-contract.md`; it does not replace repository instructions or feature-specific routed context.

## Interpret the checklist with evidence

Do not mechanically demand a new killswitch, flight, experiment, log, or document for every diff. First classify the change and inspect nearby established patterns:

- A killswitch is a temporary emergency rollback valve for risky behavior, not a feature flag or a development workaround. Activated means old/fallback behavior; not activated means new behavior.
- A flight/Feature controls staged rollout. For a risky staged feature, prefer one killswitch over the flight rather than composite killswitch logic.
- An `_SPExperiment` provides a clean control/treatment split for measuring performance changes. It does not replace a killswitch when emergency rollback is also warranted.
- Pure renames, imports, declarations not reached by old code, tests, and documentation do not automatically need a new runtime gate. Review the behavioral blast radius and repository guidance instead.
- Do not recommend activating a killswitch to hide a defect during development. Fix the new path.

## Rollout and rollback

For user-facing or operationally risky behavior:

- Identify the rollback strategy and whether KS, flight/Feature, experiment, or an existing gate is appropriate.
- Verify new behavior runs when the KS is **not** activated and the activated state preserves a safe old/fallback path.
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
- Performance changes use an experiment for statistically meaningful comparison and preserve an emergency rollback strategy when risk warrants it.
- User-facing strings use resources; post-freeze additions follow localization review/locking policy.
- Styling uses theme tokens rather than hardcoded colors and is checked in light, dark, and high-contrast modes.
- Interactive controls are keyboard accessible with correct role, state, and accessible name.

## Blocking examples

Classify as Important or Critical when evidenced: wrong KS direction, module-evaluated SP-Client KS, missing safe fallback, performance work using only a flight, missing behavior/gate tests, unhandled meaningful async failure, PII logging, missing user-action telemetry where required by established conventions, unjustified bundle growth, hardcoded user-facing strings/colors, inaccessible controls, or suppressions/deferred work without required rationale.

Use `Nit:` only for optional education. A checklist item is not automatically blocking when it is demonstrably inapplicable; document that disposition with evidence.
