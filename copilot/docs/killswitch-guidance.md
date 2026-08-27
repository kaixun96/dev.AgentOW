# Killswitch implementation and review

Apply this reference whenever a live killswitch is added, moved, renamed, or used by changed runtime
behavior. It supplements the rollout-isolation rules in
`skills/ow-review/references/common-review-issues.md`.

## Semantics

- A killswitch is an emergency rollback valve. Activated means legacy behavior; not activated means
  new behavior.
- Evaluate the killswitch at call time. Do not cache it at module scope, in static state, or during
  early chunk initialization.
- Use the canonical lowercase GUID and the owning package's rollout abstraction.
- Name the wrapper for the fix or behavior being rolled back, not as though activating the
  killswitch enables the new behavior. The comment must say that activation rolls back the change.

## Ownership decision tree

Decide ownership before editing:

1. Identify the component or package that owns the changed decision.
2. Search that package for `KillSwitches.ts`, `killSwitches.ts`, or
   `protection/KillSwitches.ts`.
3. If the behavior-owning package already has a centralized killswitch module and rollout
   dependency, define and consume the wrapper there. Do not move the wrapper to a host merely
   because the host can also access a killswitch API.
4. Use host injection only when the behavior-owning shared package intentionally cannot depend on
   the rollout SDK and has no established local killswitch infrastructure. Inject the smallest
   internal boolean or callback at a non-public boundary.
5. Never add a public component prop, exported interface member, generated API report entry, or
   cross-package dependency solely to transport a killswitch when the owning package can evaluate
   it itself.
6. Never put a raw GUID or one-off wrapper in the business component.

An optional injected callback is allowed only when multiple legitimate hosts exist and some cannot
provide rollout state. Its absent behavior must be an existing product contract, not a synthetic
third state created by the implementation. Otherwise make the dependency direct and test only the
two real killswitch states.

## Minimal code shape

Start from the pre-change expression and preserve it literally in the activated branch.

- Trivial value change:

  ```ts
  const value = !isFixExampleKSActivated() ? newValue : originalValue;
  ```

- Non-trivial change:

  ```ts
  if (!isFixExampleKSActivated()) {
    // New behavior only.
  } else {
    // Original implementation, unchanged.
  }
  ```

Put the killswitch check first. Do not evaluate new-path-only helpers or state before the gate.

Do not introduce a helper merely to carry the killswitch through several parameters when a local
ternary or explicit branch is clearer. Do not duplicate constructors, state objects, render trees,
or handlers when only one value differs. If a one-field behavior change modifies tens of production
lines or creates a public API change, stop and simplify.

## Implementation preflight

Before editing, record:

- behavior-owning package and decision site;
- every centralized killswitch module found in that package and host;
- whether the owning package already imports a rollout SDK;
- why host injection is necessary, if proposed;
- original expression or block that must survive when activated;
- expected production file and line-count impact.

Before commit, verify:

```bash
git grep -n "<guid>"
git diff --stat
git diff --check
git diff -- <central-killswitch-module> <decision-site>
```

The GUID should normally have one production definition. Any new exported prop, interface member,
API report delta, callback-absent branch, or helper with rollout plumbing parameters requires an
explicit architectural justification.

## Tests

- Test observable behavior at the nearest stable decision owner.
- Cover killswitch not activated and activated.
- Add a callback-absent test only when callback absence is a real pre-existing host contract.
- Do not test a pass-through GUID wrapper unless it owns additional behavior.
- Assert that the activated path matches the pre-change result, not merely a newly derived
  approximation.

## Blocking review findings

Request changes when any of these are evidenced:

- the wrapper lives outside the behavior-owning package despite an existing centralized module and
  rollout dependency there;
- a public API or generated API surface exists only to transport killswitch state;
- activation enables the new behavior or the wrapper name/comment obscures rollback direction;
- the legacy path is reconstructed instead of preserved;
- the value is cached before reliable rollout initialization;
- a synthetic callback-absent state, unnecessary helper, duplicated state/tree/handler, or broad
  churn replaces a local two-state gate;
- the raw GUID is duplicated, non-lowercase, or attributed with a tool name instead of an owner
  alias;
- meaningful new/rollback behavior lacks consumer-level tests.

These are maintainability and rollback-safety defects, not optional style preferences.
