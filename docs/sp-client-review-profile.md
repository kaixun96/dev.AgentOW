# SP-Client review profile

Apply this profile when any Git-changed path is under `sp-client/`. For changed shared code outside `sp-client/` that implements a Flight or killswitch consumed by SP-Client, apply the rollout and rollback rules below as well. It supplements `review-contract.md`; it does not replace repository instructions or feature-specific routed context.

## Interpret the checklist with evidence

Runtime behavior and styling changes must be protected by a flight or killswitch. Pure tests, documentation, generated metadata, and mechanical changes that cannot affect runtime may be marked not applicable with evidence. Do not mechanically demand a new gate when an existing upstream gate already protects every changed runtime path; prove that coverage instead.

- A killswitch is a temporary emergency rollback valve for risky behavior, not a feature flag or a development workaround. Activated means old/fallback behavior; not activated means new behavior.
- A flight/Feature controls staged rollout. For a risky staged feature, prefer one killswitch over the flight rather than composite killswitch logic.
- An `_SPExperiment` provides a clean control/treatment split for measuring performance changes. It does not replace a killswitch when emergency rollback is also warranted.
- Pure renames, imports, declarations not reached by old code, tests, and documentation do not automatically need a new runtime gate. Review the behavioral blast radius and repository guidance instead.
- String-only localization updates (`.resx` values/comments/approval tags) with no runtime call-site, execution, or style-path change are non-runtime edits. Missing Flight/KS in that case is not a rollout blocker; at most leave a `Nit:` guidance note.
- Do not recommend activating a killswitch to hide a defect during development. Fix the new path.

## Rollout and rollback

For every review with SP-Client runtime changes, first apply the rollout-isolation rules in
`skills/ow-review/references/common-review-issues.md`. That reference is authoritative for gate
ordering, invocation-boundary protection, legacy equivalence, call-time evaluation, both-state
testing, and graduation cleanup. This profile adds the SP-Client-specific requirements below:

- Read the PR description first. It must identify the flight/KS, state whether it is a Flight, KS, or KS+Flight, explain the enabled/disabled direction, and name the fallback. If reviewing before PR creation, require this information in the plan and ensure the generated PR description puts it on the first line.
- Enumerate every changed runtime path, then follow imported helpers and callees transitively from each reachable entry point to the changed behavior. A gate inside a helper counts when it guards the behavior added by the PR and the fallback state remains equivalent to the pre-change implementation; do not stop at the caller or infer protection from an unrelated nearby check.
- Build a two-state truth table for changed predicates: compare KS activated or Flight disabled with the pre-change predicate across every legacy case, then identify only the cases added when KS is not activated or Flight is enabled. Reaching a changed pure helper in fallback state is valid when its fallback result is identical and it performs no new side effects, throws, or new-path-only dependency reads.
- Identify the rollback strategy and whether KS, flight/Feature, experiment, or an existing gate is appropriate.
- For any KS that gates SP-Client behavior, including an implementation in `odsp-common`, use `_SPKillSwitch` and a lowercase unique GUID; apply the reference's call-time evaluation requirement. An uppercase or mixed-case KS GUID is an `Important` finding because a KS activation lookup will not match the identifier used by product code, so activating the KS does not activate its fallback behavior. Debug Link may surface this as a debug-mode error, but that is only a symptom of the production rollout-control failure. The KS method comment convention (`/* 'MM/DD/YYYY', 'alias - Description' */`), including its date, alias, and description, is documentation only: `08/11/2026` already satisfies `MM/DD/YYYY`. A harmless comment-format deviation is at most a `Minor` finding prefixed `Nit:` and must not block the PR.
- For flights, use the established ID/name and attribution comment convention. For performance comparisons, require an experiment and exposure logging; a flight alone is not valid measurement.
- Flag composite KS logic when one KS over a flight provides a clearer emergency control.
- Check whether an old KS should graduate. A graduation change needs evidence that the KS is inactive in all rings (for example Merlin `Test-GridKillSwitch` output), and must remove obsolete fallback complexity safely.

## Tests and review evidence

- Unit tests cover changed behavior, edge/error paths, and null/undefined inputs. Require KS-activated or Flight-off coverage only when this PR changes fallback/disabled behavior; do not report an absent pre-existing state test as a defect in the current PR.
- Tests assert product behavior rather than mock implementation details.
- For test-only changes, assess test correctness, determinism, isolation, cleanup, and assertion quality. Do not apply production privacy/security, telemetry, rollout, accessibility, localization, or performance checks to test diagnostics such as test labels or tenant URLs, unless the test code affects a production sink or exposes credentials/secrets.
- Complex features add or update durable Markdown documentation when it materially helps future maintenance and AI-assisted follow-ups.

## Delegation to shared references

Use the shared review references as the normative source for cross-cutting quality rules:

- `skills/ow-review/references/common-review-issues.md` for async, lifecycle, typing,
  cleanup, maintainability, telemetry ownership, security/privacy boundaries, and navigation
  validation.
- `skills/ow-review/references/localization-and-formatting.md` for localization and
  post-freeze string policy.
- `skills/ow-review/references/sharepoint-design-system-and-ux-components.md` for design-system
  component choice, semantic structure, accessibility, styling APIs, and typography guidance.
- `skills/ow-review/references/shared-utility-reuse.md` for shared hook/utility reuse checks.

## TypeScript and maintainability

Keep this profile focused on SP-Client-specific rollout, profile checks, and evidence contracts.

## Reliability, telemetry, privacy, and security

Use the delegation section above for cross-cutting telemetry, security/privacy, and
trust-boundary checks.

## Performance and UI quality

- Assess bundle, latency, render, and memory impact. A bundle delta of 2 KB or more is a review trigger requiring measurement and justification or on-demand loading; it is not automatically a defect.
- For large collections, review three separate concerns: server-side filtering, transport pagination/continuation, and bounded viewport rendering (progressive loading, paging, or virtualization). Do not recommend fetching every page without also proving the UI will not render an unbounded item set.
- Performance changes use an experiment for statistically meaningful comparison and preserve an emergency rollback strategy when risk warrants it.
- User-facing strings use resources; post-freeze additions follow localization review/locking policy.
- Typography checks still apply: when semantic text styling is relevant, verify the chosen
  preset path (for example `typographyStyles`) through
  `skills/ow-review/references/sharepoint-design-system-and-ux-components.md`.
- When validating local overrides, trace the established SharePoint theme/Detheme provider flow
  and keep only evidence-backed exceptions.
- Keep one explicit check for reviewer routing: when introducing new UI structure, confirm a
  suitable Fluent V9/SPDS primitive was considered before custom semantic markup.

## Required profile checks

For every `sp-client/` review, record these IDs in `preReview.profileChecks`. Each must be `reviewed` with citations and a conclusion or `not-applicable` with a specific reason:

- `spClientRolloutTrace`
- `spClientUiPrimitivesTokens`
- `spClientThemeDetheme`
- `spClientLargeCollections`
- `spClientAutomatedTests`

`spClientRolloutTrace` is additionally represented by the structured `preReview.rolloutProtection` object. For runtime changes it must contain the exact runtime path set, PR-description/plan evidence, gate identifiers and type, entry-point and gate-check citations, new/fallback path citations, direction, a `fallbackBehaviorChanged` declaration, and one path-specific coverage record per runtime changed file. Require `disabledStateTestEvidence` only when `fallbackBehaviorChanged` is true; a missing pre-existing state test otherwise requires no finding.

## Blocking examples

Request changes when evidenced: runtime changes with no Flight/KS protection, PR description missing the gate and direction, incomplete gate coverage, wrong KS/Flight direction, changed behavior or new-path-only work occurring while Flight is off or KS is activated, module-evaluated SP-Client KS, missing safe fallback, performance work using only a flight, missing behavior/gate tests, unhandled meaningful async failure, PII logging, missing user-action telemetry where required by established conventions, unjustified bundle growth, unbounded collection rendering, bypassing an available Fluent/SPDS primitive without rationale, theme overrides that conflict with the formal Detheme flow, hardcoded user-facing strings/colors, inaccessible controls, or suppressions/deferred work without required rationale.

Do not raise an Important rollout-protection finding for string-only localization metadata changes that do not alter runtime execution or styling paths.

Use `Nit:` only for optional education. A checklist item is not automatically blocking when it is demonstrably inapplicable; document that disposition with evidence.
