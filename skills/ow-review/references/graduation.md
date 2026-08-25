# Flight and killswitch graduation review

Review retirement of rollout controls as a distinct lifecycle operation. Graduation should preserve
the already-deployed final behavior while removing the gate, fallback, and obsolete scaffolding.
For a graduation-only task, this is the only code-review policy reference to apply. Keep the normal
review artifact and evidence contract, but do not load other optional review references, apply
unrelated code-quality rules, or request cleanup beyond what graduation directly makes obsolete.

## Scope boundary

Apply this reference only when the diff does one or more of the following:

- removes a Flight, Feature, experiment, killswitch, or rollout check;
- permanently selects one branch of rollout-controlled behavior;
- removes a fallback or control branch because rollout is complete;
- changes a gate helper or consumer to a fixed value as part of retirement.

Do not apply graduation rules merely because a changed file mentions a gate. A new or still-live
Flight/KS must retain safe fallback behavior, correct direction, call-time evaluation, gate
coverage, and both-state tests under the normal rollout rules. Do not ask a new gate to remove its
fallback, prove graduation, or simplify to one state.

If one PR both adds or changes a live gate and graduates another, classify and review each gate
independently. Apply this reference only to the retired gate, and apply normal review routing only
to the separate non-graduation changes.

A task is graduation-only when every substantive changed line removes a gate, selects its final
branch, updates directly affected tests or metadata, or removes code made obsolete by that
selection. Do not turn a graduation-only review into an opportunity to polish nearby logic,
formatting, naming, abstractions, tests, telemetry, UI, or other pre-existing code.

## 1. Establish that graduation is authorized

Identify every retired gate by type, identifier, owner, and all registration and consumption sites.
Use the PR description, linked work item, rollout evidence, and source history; do not infer
readiness from the code change alone.

- **Killswitch:** by default, require evidence that it is inactive in every ring before accepting
  removal. For SP-Client, Merlin `Test-GridKillSwitch` output is suitable evidence. The exception
  is a KS activated globally because the inactive/new path caused a regression: the PR description
  must explicitly explain that decision and that graduation preserves the active/fallback path.
  Require evidence of the claimed global state. If an existing PR omits the applicable evidence or
  explanation, leave an explicit reminder for the author to attach it; do not claim verification.
- **Flight/Feature:** by default, require evidence that rollout has reached the enabled state. The
  exception is a Flight that was never rolled out anywhere: the PR description must explicitly
  state that fact and that the gated code should be removed. Do not reuse KS inactive evidence as
  Flight graduation evidence.
- **Experiment:** require an explicit decision selecting treatment or control and confirmation that
  exposure/measurement is no longer required.
- **Composite gates:** establish the final state of each Flight, KS, experiment, or configuration
  term independently before simplifying the combined predicate.

## 2. Prove the surviving behavior

Read the merge-base implementation and construct the gate truth table before judging the diff.
Account for negation, wrapper names, aliases, early returns, nested ternaries, and compound
predicates.

- A graduated killswitch must preserve the KS-inactive/new path unless the PR description explains
  that the KS is activated globally because the inactive/new path is a regression and graduation
  must instead preserve the KS-active/fallback path.
- A graduated Flight must preserve the enabled/treatment path unless the PR description states
  that the Flight was never rolled out anywhere and its gated code must be removed; only then
  preserve the disabled/control path.
- Compare inputs, outputs, state writes, requests, telemetry, QoS lifecycle, errors, and side
  effects between the prior permanent state and the ungated code.
- Preserve every non-gate operand, predicate, operator, fallback value, call, and evaluation order.
  Removing `gate && condition` may produce `condition`; it does not permit changing `condition`.
  In particular, do not change `some` to `every`, `&&` to `||`, comparison operators, error
  criteria, defaults, or data transformations while graduating a gate.
- Trace every caller and runtime entry point. Removing one check is incomplete when another wrapper
  or consumer still carries the retired policy.
- Treat any behavior change beyond selecting the established permanent branch as ordinary product
  behavior that needs its own rationale, rollout protection when applicable, and tests. Do not hide
  it inside a graduation PR.

## 3. Require complete cleanup and constant folding

Graduation removes the control-flow shape, not only the SDK call. Reject replacing a gate with a
local or exported `true`/`false` constant while preserving obsolete conditionals.
A gate-derived boolean renamed or reassigned to its permanent value is still an ungraduated gate
alias when any consumer continues to branch on it. Before approving, find every reference to the
gate and every variable, helper, property, or parameter derived from it, then simplify each
consumer until no control flow depends on the permanent value.

This propagation crosses function boundaries. When a gate-derived value is passed as an option or
parameter, inspect the function definition and every call site. If every reachable call supplies
the same permanent value and the parameter exists only for that gate, remove the parameter from the
type/signature and all calls, then keep only the corresponding behavior in the function body. Do
not replace the argument with `true`/`false`, add a default with that value, or move the fixed value
inside the function. If any call supplies another value, the parameter has independent non-gate
meaning, or external callers cannot be ruled out, preserve the parameter and simplify only the
graduated call path.

Also trace values that are not gate booleans but exist only to share the same expression across
gate branches. If selecting the permanent branch leaves such a local temporary with exactly one
reference, inline it at that reference and delete the declaration. This includes JSX elements,
object literals, and other expressions extracted only because both rollout branches consumed them.
Inline only when doing so preserves evaluation count, order, timing, side effects, and object
identity; otherwise keep the temporary and record why it still has independent semantic value.

Generic example:

```ts
// Before graduation
const isEnabled: boolean = !isKillSwitchActivated;
const operation: Operation | undefined = isEnabled ? createOperation() : undefined;
if (isEnabled && isReady) {
  runOperation();
}

// Incorrect: the gate call is gone, but its obsolete control-flow shape remains
const isEnabled: boolean = true;
const operation: Operation | undefined = isEnabled ? createOperation() : undefined;
if (isEnabled && isReady) {
  runOperation();
}

// Correct: inline the surviving value and simplify every consumer
const operation: Operation = createOperation();
if (isReady) {
  runOperation();
}
```

Gate-derived function parameters require the same cleanup:

```ts
// Before graduation
useInteraction({ isEnabled: isFeatureEnabled, item });

function useInteraction(options: { isEnabled: boolean; item: Item }): void {
  if (options.isEnabled) {
    enableInteraction(options.item);
  }
}

// Incorrect: the permanent value is still represented as configurable input
useInteraction({ isEnabled: true, item });

// Correct when every call site passed the enabled state
useInteraction({ item });

function useInteraction(options: { item: Item }): void {
  enableInteraction(options.item);
}
```

Branch-sharing temporaries must not survive as single-use indirection:

```tsx
// Before graduation
const content: JSX.Element = <Content item={item} />;
return isFeatureEnabled ? <Provider>{content}</Provider> : content;

// Incomplete: the branch is gone, but its sharing temporary remains
const content: JSX.Element = <Content item={item} />;
return <Provider>{content}</Provider>;

// Correct when the temporary existed only to serve both branches
return (
  <Provider>
    <Content item={item} />
  </Provider>
);
```

Unrelated logic must remain unchanged:

```ts
// Before graduation
const hasFailure: boolean = results.some((result) => result.failed) && isEnabled;

// Incorrect: removing the gate does not authorize changing the existing predicate
const hasFailure: boolean = results.every((result) => result.failed);

// Correct
const hasFailure: boolean = results.some((result) => result.failed);
```

For every value made constant by graduation:

1. Find all references to the gate-derived value, including aliases passed to helpers or stored in
   properties, before deleting it.
2. For each function parameter or options property carrying that value, inspect every call site.
   Remove it from calls, types, and implementations only when all reachable callers prove the same
   permanent value and it has no independent meaning.
3. Find local values introduced only for reuse across the retired branches. When branch selection
   leaves exactly one reference, inline and delete them if evaluation and identity remain unchanged.
4. Inline the surviving ternary expression or branch body.
5. Remove only the retired term from compound conditions. Preserve all remaining operands and
  operators exactly unless syntax requires a semantics-preserving parenthesis change.
6. Delete unreachable `if`, `else`, switch, fallback, and early-return paths.
7. Remove variables, wrappers, imports, exports, IDs/GUIDs, registrations, mocks, fixtures, and test
  setup made unused by the simplification.
8. Remove branch-only strings, resources, styles, telemetry, helpers, models, and dependencies when
   no remaining path uses them.
9. Search by gate identifier, GUID, helper name, attribution comment, and deleted-branch symbols to
   prove no stale references remain.

Preserve comments by default, including comments that mention the Flight/KS but still explain
surviving behavior. Remove or update a comment only when it is physically part of the deleted gate
declaration, describes a deleted branch, or would become factually false because of graduation.
Do not delete, rewrite, shorten, or otherwise polish comments merely because the gate is removed.

Preserve unrelated public contracts and adjacent code. Cleanup should be transitive only where the
graduation made code obsolete; do not refactor or polish surviving code unless simplification is
required to remove the retired condition.

## 4. Review tests and evidence

A graduation-only change should be behaviorally equivalent to the previously permanent state.
Graduation test work is deletion-only unless deleting the obsolete branch causes an actual failure
against the project's configured unit-test coverage threshold:

- remove only test cases for the deleted fallback/control branch and mocks, fixtures, or setup used
  exclusively by that branch;
- preserve tests for the surviving branch unchanged;
- do not add, expand, rewrite, rename, reorganize, or otherwise polish tests;
- do not create any unit, integration, automation, or manual test task for graduation;
- do not require new coverage, including a test for the removed gate constant or identifier;
- running an existing scoped test is validation, not a test implementation task.

When the existing coverage command actually fails after graduation cleanup:

1. **Preferred:** update the unit-test coverage threshold to reflect the reduced reachable code and
  add no tests in the graduation PR. Recommend a separate follow-up PR if the team wants to add
  tests and raise the threshold later.
2. **Allowed alternative:** the developer may instead add the minimum meaningful tests needed to
  meet the current threshold. Cover only surviving behavior; do not recreate the removed branch
  or use the exception for unrelated test improvements.

Do not predict a coverage failure or create a test task before running the existing coverage
command. The PR description must state that graduation caused the threshold failure, include the
failing result and configured threshold, and document the chosen resolution. For a threshold
update, record the new threshold and follow-up-test recommendation. For added tests, record their
scope and the passing result at the unchanged threshold.

If the same PR contains separate non-graduation behavior, its tests follow the normal workflow and
must remain separate from graduation test cleanup.

## 5. Findings

Request changes when the diff preserves the wrong branch, lacks required authorization evidence,
leaves reachable retired behavior, keeps a fixed gate behind old conditional structure, misses a
runtime entry point, changes coverage threshold or tests without an actual coverage failure and
required PR-description evidence, or mixes unrelated behavior into the graduation edit.

Do not raise findings for unrelated pre-existing issues or optional improvements. If the diff
contains an unrelated change, classify that change outside graduation-only scope and route only
that separate change through the applicable normal review rules.

Make every finding name the retired gate, prior permanent state, affected path, concrete failure,
and cleanup or correction needed. Keep missing author-supplied rollout evidence distinct from a
proven code defect. Do not raise graduation findings against gates that remain live or are newly
introduced.
