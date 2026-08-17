# Common high-value review issues

Use this reference for runtime TypeScript/React changes involving rollout gates, async work,
state transitions, data loading, service readiness, telemetry, caching, navigation, or bundle
boundaries. Apply only the sections triggered by the diff. These are review hypotheses, not
automatic findings: report an issue only when the changed code exposes a concrete failure
mechanism and affected behavior.

## How to apply this reference

1. Identify the changed behavior and its legacy, fallback, error, and cancellation paths.
2. Select the triggered sections below and state a falsifiable failure hypothesis for each
   high-risk path.
3. Trace the implementation through its callers, dependencies, and tests. Do not infer safety
   from a nearby guard, a type assertion, or happy-path coverage.
4. Distinguish blocking defects from workload-dependent design choices. Ask for measurement or
   contract evidence where the correct answer depends on frequency, size, freshness, or policy.
5. Sweep every Critical or Important finding across the changed set as required by the review
   contract.

## Priority checks

When applicable, test these first because they have high regression or rollback value:

1. Evaluate a Flight/KS before any new-path-only helper, dependency read, allocation, side effect,
  or throwing predicate. A pure helper may execute in both states when its fallback result is
  behaviorally equivalent to the pre-change expression. As a narrow exception, a pure Fluent V9
  factory that must be declared at module scope, such as `bundleIcon` or `makeStyles`, may execute
  before the gate when its generated component or hook is first used only behind the Flight/KS. Do
  not require reordering of commutative predicates (`A && B` versus `B && A`) when both sides are
  pure and equivalent; prefer putting Flight/KS first, especially when the other side can throw,
  allocate, or cause side effects.
2. Evaluate rollout state at call time unless initialization order proves a module/global/static
   snapshot is safe.
3. With Flight off or KS active, preserve legacy inputs, mutations, fallback, and error behavior.
4. Gate the actual new behavior at its invocation, consumption, or pure-helper boundary so the
  fallback state cannot observe a changed result or side effect.
5. Define aggregate async failure, fallback, and partial-success behavior explicitly.
6. Own API QoS at the provider/source boundary and measure the interval named by the event.
7. Await or observe every promise; use `void` only for intentionally independent work with an
   error-observation path.
8. Require a real identity-sensitive or expensive-computation boundary before adding React
   memoization.
9. Keep transient UI edits local until the intended commit action; cancellation must preserve
  committed state.
10. Choose lazy/chunk boundaries from real navigation journeys and dependency weight.
11. Hoist repeated dependent fetches out of item/render loops and parallelize independent work.
12. Express required and optional data in types instead of relying on assertions that can crash
   rendering.
13. Consume `ServiceScope`/`PageContext` only after readiness and account for preloaded chunks.
14. Add behavioral regression tests for changed states, errors, and enabled/disabled rollout
  paths at the behavior-owning consumer boundary. Do not add a unit test solely because a
  `Flights.ts`, `KillSwitches.ts`, or similar module gained a trivial constant/pass-through
  wrapper; screenshots protect behavior only when meaningful regressions fail the test.
15. Use one shared, normalized, same-origin, fail-closed navigation resolver.

## Rollout isolation: Flight, ECS, and KillSwitch

**Trigger:** changed runtime behavior is staged, rollback-protected, or reached through an
existing Flight, ECS, experiment, or KS.

- Put the gate before new-path-only evaluation. No helper call, object construction, property
  access, request, mutation, allocation, or possible throw that belongs only to the new behavior
  may happen first.
- Trace imports and calls transitively before deciding that a path is unprotected. The gate may
  live in an imported helper rather than the changed call site.
- Gate behavior, not syntax. A changed pure helper or abstraction may execute in both states when
  the KS-active/Flight-off branch returns exactly the pre-change result for the same inputs and
  performs no new side effects or failure-prone work. Do not require the caller to duplicate the
  old inline expression merely to avoid reaching the helper.
- Do not report module-scope `bundleIcon`, `makeStyles`, or a comparable pure Fluent V9 factory as
  unprotected new-path execution solely because it runs before the gate. Verify that the generated
  component, hook, class, or other result is first consumed only in the Flight-enabled/KS-inactive
  path. If the fallback path consumes that new result, or the factory performs observable work,
  the result is unprotected and remains a rollout defect.
- React hooks are a structural exception. Do not require wrapping `useEffect`, `useMemo`,
  `useCallback`, or other hooks inside a Flight/KS conditional, because conditional hook calls
  violate React rules. Gate checks inside hook callbacks or effect bodies are acceptable when the
  resulting behavior is correct.
- Compare the disabled/activated branch against the previous implementation. Verify inputs,
  state writes, fallback values, telemetry interpretation, and thrown-versus-swallowed errors.
- Avoid module/global/static snapshots of gate state unless the chunk is guaranteed to execute
  after rollout initialization. Preloaded, view-mode, and early page-app code require call-time
  evaluation.
- Treat a given Flight/KS value as stable within one session unless the code explicitly reloads
  rollout configuration. Do not raise speculative page-switch drift findings across multiple call
  sites in the same session.
- Prefer a consumer/invocation gate when only some callers need protection. Put rollout policy
  inside a shared utility only when that policy is part of the utility's explicit contract.
- Prove whether an upstream gate protects every changed path and whether another configuration
  condition is required. Do not demand a redundant gate or accept an incomplete one.
- Verify both states while rollout is active. The PR evidence should name the gate, direction,
  stage, rollback behavior, and cleanup plan. Remove retired branches and tests only after
  graduation is established.
- Test the observable behavior controlled by the Flight/KS, not the rollout SDK or a trivial gate
  wrapper. A direct wrapper test is meaningful only when the wrapper contains independent
  branching, composition, transformation, caching, fallback policy, side effects, or another
  contract that can regress separately from its consumer. Do not require tests that merely mock
  `_SPFlight.isEnabled`/`_SPKillSwitch.isActivated`, assert the hard-coded ID/GUID, or prove that a
  one-line wrapper returns the mock value. When rollout changes behavior, cover enabled and
  fallback states through the nearest stable consumer whose output, rendering, request, mutation,
  or error behavior differs.
- For Flight/KS-graduation-only PRs, prioritize fallback equivalence and cleanup completeness.
  Verify removed-branch strings, styles, helpers/functions, and constants are also removed when
  no longer referenced.
- For KS graduation, require evidence that the KS is inactive in all rings. If the PR description
  does not include Merlin verification output, leave an explicit reminder for the author to attach
  it.
- Treat the choice of Flight versus KS and the lifetime of either as current-policy questions;
  do not infer them from an old gate that happens to exist.

**Failure hypotheses:** Flight off still calls a new throwing helper; KS active changes an input
or routes through a wrapper with different results, side effects, or failures; a preloaded module
snapshots the default before initialization; one sibling entry bypasses the gate; fallback catches
an error that legacy code propagated.

**Behavior-preserving helper example:** suppose the old caller returned `true` for `KindA` and
`KindB`. It is protected to replace that expression with `isSupportedKind(kind)` when the helper
returns the same two cases plus `!isNewKindKSActivated() && kind === NewKind`. Follow the import
into the helper: KS activated produces the exact old result, while KS not activated adds only
`NewKind`. The helper executing in both states is not itself a rollout defect.

## React lifecycle, state, and memoization

**Trigger:** changed hooks, render-time work, transient UI editing state, context/theme
consumption, event-driven updates, or memoization.

- Use `useCallback` only when identity reaches a memoized/expensive child or another
  identity-sensitive API. A local handler does not need stable identity by default.
- Use a module constant for a truly static value. When memoization is necessary, include the
  dependencies that represent the value's real contract.
- Do not create work, mutations, or action telemetry during render; render may repeat without a
  corresponding user action.
- Keep tentative UI edits at the component or flow that owns the interaction. Commit durable or
  shared state only at the intended confirmation point; cancellation and no-op actions must
  preserve committed state and avoid unrelated refreshes or side effects.
- Debounce or throttle high-frequency layout/event updates when frequency is material, and cancel
  pending work when the owner changes or unmounts.
- Verify memoization does not freeze required context, theme, or state updates.

**Failure hypotheses:** a cancelled edit mutates the property bag; a memo omits theme context;
render emits duplicate telemetry; a stale debounced callback updates a replacement owner.

## Async, concurrency, errors, and cancellation

**Trigger:** added or changed promises, concurrent requests, retries, debouncing, parsing, or
failure handling.

- For `Promise.all`, decide whether any failure should fail the feature. Isolate noncritical work
  and define its fallback when partial success is valid; preserve fail-fast behavior when all
  results are required.
- Keep expected absence and unexpected failure distinct. An expected not-found result may map to
  absence with expected-failure telemetry; unexpected errors remain observable and propagate
  when the caller owns the decision.
- Put shared completion work in `finally` rather than duplicating it across success and failure.
- Do not add promise chains around synchronous work. Await/catch asynchronous work, or use `void`
  only when independence is intentional and rejection is still observed.
- Cancel or invalidate stale work on unmount, owner/key change, and superseding requests. Verify
  old work cannot update a new owner or overwrite a newer result.
- Avoid known-doomed requests and define parsing/load fallback before introducing the request.

**Failure hypotheses:** optional metadata rejects the entire `Promise.all`; a caught unexpected
error becomes false success; a floating rejection is lost; an older response wins a race; a
debounced callback runs after unmount.

## Performance, requests, and data shaping

**Trigger:** item loops, render-time transforms, collection loading, repeated metadata access,
or multiple network requests.

- Do not perform a common dependent fetch inside `map`, render, or another per-item path. Fetch
  once and share it; cache only after evaluating volatility and invalidation.
- Parallelize independent requests. Preserve ordering only where one result is an input to the
  next operation.
- Skip requests that the selected branch or cheaply available state proves unnecessary.
- For large collections, evaluate server filtering, transport pagination, and bounded viewport
  rendering separately. Fetching progressively does not help if the UI still renders everything.
- Avoid whole-web-part rerenders and allocation/memoization machinery whose overhead exceeds the
  work it saves. Require hot-path or scale evidence before making a blocking performance claim.
- Reuse canonical runtime IDs, endpoint helpers, headers, and response normalization contracts
  rather than display names or hand-rolled variants.

**Failure hypotheses:** ten items repeat one site metadata request; independent property-pane
loads are serialized; an unselected branch still issues a request; thousands of rows render
eagerly; a display name is not unique at runtime.

## Lazy loading and bundle boundaries

**Trigger:** dynamic imports, new chunks, heavy dependencies, page routing, editors, or
property-pane-only code.

- Load heavy or noncritical functionality at a real action/availability boundary rather than in
  the initial page bundle.
- Do not default to one chunk per source page. Group routes commonly traversed in one user
  journey and weigh request overhead against bytes deferred.
- Keep edit-mode/property-pane-only dependencies out of view-mode bundles when they are not
  needed initially.
- Export only the public pieces consumers need so unrelated runtime values do not pull an entire
  module into their bundles.
- Require size/audit evidence for material new surfaces and clean up dead exports and graduated
  rollout branches.
- Treat runtime enum versus type-only representation as compiler/bundler-dependent, not a blanket
  preference.

**Failure hypotheses:** a heavy editor enters the initial chunk; several tiny pages cause a
request waterfall in one workflow; a type import emits runtime code; a barrel export pulls an
unrelated dependency.

## Telemetry and QoS ownership

**Trigger:** monitors, API QoS, success-rate metrics, latency events, or duplicated consumer
instrumentation.

- Put API operation QoS at the provider/data-source boundary. Add consumer identity as extra data
  when needed instead of creating one monitor per consumer.
- Start a monitor where the interval it names begins. Page-load latency starts at page
  construction/load, not midway through a later handler.
- Trace every monitor start to an end on success, expected absence, early return, and error paths.
- Separate per-operation and aggregate outcomes when an aggregate error would hide the failing
  request.
- Log both success and failure when measuring a rate. Remove signals that duplicate another event
  or encode a permanently expected post-rollout outcome.
- Use stable scenario-qualified names and record decision fields that explain behavior without
  duplicating events or exposing sensitive data.

**Failure hypotheses:** every consumer double-counts one provider call; cold load starts but
never ends a monitor; success is logged only when no work occurred; an aggregate event hides
which request failed.

## Types and data contracts

**Trigger:** optional data, assertions, generic callbacks, duplicated schemas, or changed API
models.

- Encode required versus optional values in the type and API contract. An assertion or non-null
  assertion is not evidence that render-time data exists.
- Remove guards only when the declared and runtime contract excludes empty string, `null`, and
  `undefined`; otherwise handle each meaningful absence deliberately.
- Prefer discriminants or explicit properties over runtime inference when callbacks can receive
  multiple component or payload kinds.
- Keep schema/configuration in one typed source of truth when duplicate maps can drift.
- Place data schema types with the model and action/UI-only types with their owning layer. Do not
  use comments to compensate for an unclear type.

**Failure hypotheses:** an asynchronously loaded module is asserted present during first render;
an empty string bypasses a fallback; a callback casts the wrong component kind; copied maps
disagree on one key.

## SharePoint service and page initialization

**Trigger:** `ServiceScope`, `PageContext`, ambient SharePoint services, preloaded chunks, page
reuse, serialization, or data-version migration.

- Consume ambient context through the established service boundary when appropriate, but only
  after `ServiceScope` readiness is established.
- Treat preloaded chunks and page-app startup as early-execution risks. Do not assume chunk load
  implies `SPPageApp`, Flight configuration, services, or page context are ready.
- Determine whether `PageContext` can change during the lifetime of a provider/component. Recreate
  or update state when required rather than retaining the original context silently.
- Apply the general transient-UI-state rule to property panes: keep tentative edits local and
  commit web-part property data only at the explicit persistence boundary.
- Treat serialization and data-version migration as rollout-sensitive. Verify old serialized
  data, deserialization timing, and rollback behavior.

**Failure hypotheses:** a provider consumes an unfinished scope; a preload reads context before
page initialization; navigation reuses a provider with stale context; migration enables a new
property on old pages before its gate is ready.

## Testing and testability

**Trigger:** any changed behavior, state transition, rollout branch, error fallback, or test-only
production affordance.

- Add regression tests for the failure state introduced by the change: repeated/same input,
  stale state, partial failure, cancellation, fallback, or error propagation as applicable.
- While rollout can exercise both paths, test enabled/new and disabled/legacy behavior. Remove
  fallback tests only when the fallback is retired.
- Assert observable product behavior, not only calls to mocks. Screenshot tests are protective
  only when the required regression changes a failing assertion or enforced image result.
- Cover meaningful multiplicity and branch variants such as multiple instances, changed
  properties, non-featured cases, and non-coauthor paths when those affect the contract.
- Verify test dependency configuration causes affected suites to run when their dependencies
  change.
- Remove unused test IDs, mocks, and production hooks; test affordances require a real test
  contract.

## Security, privacy, and navigation

**Trigger:** navigation candidates, continuation/source URLs, persisted or logged metadata, or
new trust boundaries.

- Resolve navigation candidates against an explicit trusted base, normalize, compare origins,
  and fail closed on parsing or validation failure.
- Use one shared resolver for equivalent navigation/continuation gates so policy cannot drift.
- Presence is not safety. Preserve intended user-selected navigation only after applying the
  relevant scheme, origin, and control-character policy.
- Determine whether new file, user, resource, or tenant metadata is privacy-sensitive before
  storing, logging, or transmitting it.

**Failure hypotheses:** duplicated validators disagree on protocol-relative URLs; malformed input
falls through as allowed; a same-looking Unicode/normalized origin bypasses comparison; file
metadata enters telemetry.

## Caching and storage

**Trigger:** module caches, service caches, cookies, local/session storage, or repeated ambient
value reads.

- Cache stable shared metadata only after defining freshness, TTL, invalidation, ownership, and
  privacy behavior.
- Use the smallest correct cache key; do not key image-specific data by an entire mutable settings
  object or omit tenant/site identity from shared data.
- Prefer authoritative page/service context over a cookie or local cache when that context already
  owns the value.
- Centralize repeated storage/gate reads only when doing so preserves required freshness and
  initialization semantics.

## Cleanup, compatibility, and maintainability

**Trigger:** listeners/subscriptions, defaults, serialization, migration, repeated utilities,
large components, or broad PR scope.

- Scope document-level listeners carefully; do not stop propagation or mutate behavior outside
  the intended surface. Dispose listeners, subscriptions, timers, and debounced work.
- Reset transient shared service/theme state when host unmount can otherwise leak it into the next
  mount.
- Before changing defaults or serialized properties, trace existing-page load/edit behavior and
  preserve compatibility while rollout is partial.
- Search for existing URL, timezone, parsing, and formatting utilities before adding another.
  Reuse only after verifying compatible contracts.
- Name repeated conditions and extract stable concepts when that prevents drift. Do not extract a
  one-use helper or shared component merely to reduce line count.
- Keep PR behavior units reviewable and include rollout, test, and bundle evidence. Larger atomic
  migrations can be justified, but size alone is not proof of coherence.
- Comments should explain non-obvious safety, compatibility, or state constraints; remove comments
  that only restate identifiers.

## Avoid blanket findings

Do not turn this reference into mechanical policy:

- Do not demand a new Flight/KS when a proven parent gate already protects every path or when the
  change has no runtime rollout risk.
- Do not always require or forbid `useMemo`/`useCallback`; require a concrete identity or compute
  boundary.
- Do not prescribe one-file/one-page chunks; use navigation and bundle evidence.
- Do not always extract, cache, or consume from service scope; abstraction stability, freshness,
  privacy, invalidation, and lifetime determine the right design.
- Do not impose file-by-file test quotas; require behavior coverage proportional to regression
  risk.
- Do not make enum/type, naming, or PR-size preferences blocking without current toolchain or
  behavior evidence.
