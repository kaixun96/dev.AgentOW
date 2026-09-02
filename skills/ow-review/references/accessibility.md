# Accessibility review reference

Use this reference for every added or changed rendered UI surface that can affect interaction,
semantics, assistive output, or an accessibility-relevant style: color/contrast, forced colors,
focus indication, typography/text spacing, zoom/reflow, overflow/truncation, visibility/display,
content order, hit-target usability, motion, or state differentiation. Also use it for changes to
forms, dialogs, flyouts, dynamic status text, accessibility attributes, or collections with
loading, load-more, sort, filter, search, paging, refresh, retry, empty, or error states. A
style/token-only diff proven to change only decorative spacing, radii, or shadows does not trigger
this reference when it cannot affect reflow, clipping, targets, focus, readability, or semantics.
Missing accessibility code does not make these workflows out of scope.

Every rendered UI change must be reviewed against the applicable WCAG 2.1 Level A and AA success
criteria and for complete keyboard-only and screen-reader operation. Accessibility is a required
review dimension on every PR: record it as reviewed when UI is affected, or not applicable only
when evidence shows the diff cannot affect rendered UI, user interaction, or assistive output. Do
not claim that code inspection alone proves WCAG conformance. When an applicable criterion depends
on runtime behavior, require focused automated or manual evidence for keyboard, focus, zoom/reflow,
contrast, accessibility-tree output, and screen-reader announcements as appropriate; otherwise
record the criterion as not verified.

This repository primarily builds UI with SPDS and Fluent UI React V9. Review accessibility in two separate scenarios:

1. **SPDS or Fluent V9 component usage** — the default case in this repo.
2. **Custom component authoring** — only when no suitable SPDS or Fluent V9 component can meet the requirement.

When a change uses SPDS or Fluent V9, review against the Fluent UI React V9 accessibility guidance, especially the Accessibility docs in `https://storybooks.fluentui.dev/react/`, and the specific component's documented accessibility behavior and props.

SPDS is a style redesign built on Fluent V9, not a separate accessibility implementation. Its
components inherit the underlying Fluent V9 semantics, keyboard/focus behavior, and announcement
contract. Inspect the SPDS wrapper/export to identify the Fluent V9 component and the SPDS API used
to configure it, but apply the same Fluent V9 accessibility behavior. Do not recommend a separate
SPDS announcement mechanism or duplicate live region merely because the import comes from SPDS.
Depart from the Fluent V9 contract only when SPDS explicitly documents a behavioral accessibility
override rather than a styling or composition difference.

Use this Fluent V9 accessibility reference map to choose the corresponding doc based on the component or behavior under review:

| Review this when the change uses or affects | Fluent V9 accessibility doc |
|---|---|
| accessible naming, `aria-label`, `aria-labelledby`, `aria-describedby`, visible labels, or labeling strategy across components | [Component labelling](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-component-labelling--docs) |
| `Button` or button-like action controls | [Button](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-components-button--docs) |
| `Checkbox` or binary selection controls | [Checkbox](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-components-checkbox--docs) |
| `Dropdown`, option selection, placeholder/label behavior, or combobox-style choice entry that uses Fluent dropdown patterns | [Dropdown](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-components-dropdown--docs) |
| `Input`, text entry fields, field labeling, inline validation, or descriptions for single-line text input | [Input](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-components-input--docs) |
| `MenuButton`, menu triggers, popup relationships, or trigger labeling/state | [MenuButton](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-components-menubutton--docs) |
| `RadioGroup` or mutually exclusive choice controls | [RadioGroup](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-components-radiogroup--docs) |
| `SpinButton`, numeric entry, stepper controls, or increment/decrement semantics | [SpinButton](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-components-spinbutton--docs) |
| `SplitButton`, primary action plus menu action, or mixed trigger semantics | [SplitButton](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-components-splitbutton--docs) |
| `Textarea`, multiline text input, field descriptions, or validation messaging | [Textarea](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-components-textarea--docs) |
| `MessageBar`, message intent, actions, or announcement behavior | [MessageBar](https://storybooks.fluentui.dev/react/?path=/docs/components-messagebar--docs) and [AriaLiveAnnouncer](https://storybooks.fluentui.dev/react/?path=/docs/utilities-aria-live-arialiveannouncer--docs) |
| general Fluent component accessibility expectations when no component-specific page above is a better fit | [Components overview](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-components-overview--docs) |
| end-to-end user journeys, interaction patterns, or broader accessibility experience guidance beyond a single component | [Experiences](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-experiences--docs) |
| focus visibility, custom focus styling, or focus indicator regressions | [Focus indicator](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-focus-indicator--docs) |
| focus entry, containment, roving focus, restoration, or imperative focus movement | [Focus management](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-focus-management--docs) and [useRestoreFocusTarget](https://storybooks.fluentui.dev/react/?path=/docs/utilities-focus-management-usestorefocustarget--docs) |
| toast/status/alert messaging, announcements, or notification timing/behavior | [Notification best practices](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-notification-best-practices--docs) |
| text truncation, clipped labels/content, tooltip fallback for truncated text, or loss of meaning from overflow | [Truncation](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-truncation--docs) |

## Cross-cutting rendered UI checks

Apply these checks to SPDS/Fluent usage and custom UI alike:

- **Design tokens and accessible states:** inspect new or changed color, spacing, typography,
  outline, border, icon, and state styling for the owning design-system token or supported styling
  API. Treat token misuse as an accessibility defect when it breaks contrast, focus visibility,
  forced-colors/high-contrast behavior, text reflow, target usability, or state differentiation.
  Do not report an arbitrary raw spacing value as WCAG nonconformance without a user impact.
- **Hand-rolled interaction:** when custom markup recreates a control or interaction already
  provided by native HTML, SPDS, or Fluent, require the existing primitive unless a documented gap
  prevents it. If custom behavior is unavoidable, verify its full name/role/value, keyboard, focus,
  disabled/state, pointer, high-contrast, and screen-reader contract rather than approving isolated
  ARIA attributes or key handlers.
- **Styles tied to element identity:** when an element or component type changes, trace every reused
  class, selector, and style assumption written for the former element. Verify sizing, display,
  overflow, hit target, focus indicator, disabled/selected states, and forced-colors behavior on the
  rendered replacement. Do not assume a class remains accessible merely because its visual result
  looks similar.
- **Presentational-role misuse:** reject `role="presentation"` or `role="none"` when it removes
  required semantics from an interactive, focusable, structural, or relationship-bearing element.
  Verify the rendered accessibility tree and descendants; do not approve the role merely because
  the element looks like a wrapper.
- **Named groups:** related controls need an accessible group name and relationship. Prefer native
  `fieldset`/`legend` where appropriate, or the owning Fluent/SPDS component's documented label,
  `aria-labelledby`, or `aria-describedby` pattern. A nearby visual heading alone is not proof that
  the group is named programmatically.
- **Zoom and reflow:** at 400% zoom (equivalent to a 320 CSS-pixel-wide viewport for typical desktop
  content), text and controls must remain visible and operable without overlap, clipping, or lost
  actions. Ordinary vertically scrolling content must not require two-dimensional scrolling;
  preserve the WCAG exception for content whose meaning requires a two-dimensional layout, such as
  a data table, map, or diagram.
- **Contrast:** require at least $4.5:1$ for normal text and $3:1$ for large text. Meaningful UI
  component boundaries, states, and focus indicators require at least $3:1$ against adjacent
  colors. Verify default, hover, selected, disabled where applicable, themed, and high-contrast
  states rather than checking one screenshot or token name in isolation.
- **Truncation:** when clipping or ellipsis can hide meaningful text, verify the complete value is
  available to keyboard, touch, and screen-reader users through the component's documented
  truncation/Tooltip or accessible-description pattern. A `title` attribute alone is not a reliable
  cross-input fallback. Do not require duplicate accessible text when the full value is already
  exposed by the component.
- **Heading semantics:** text that functions visually as a section or dialog heading must use the
  owning component's semantic heading API or a real, reasonably nested heading. Review the page or
  dialog outline in context; do not enforce a universal single-`h1` rule or a fixed heading level
  based only on visual size. For a heading-level change, require a pre-implementation
  `heading-outline.md` that records the complete live outline, target, nearest parent, relevant
  siblings, selected level, and rationale. Missing or ambiguous fields are `INCONCLUSIVE` and must
  block implementation. Exact-scenario AFTER evidence must recapture and re-check the same outline.
- **Duplicate or conflicting ARIA:** inspect the accessibility output already supplied by
  SPDS/Fluent before adding ARIA at the call site. Report duplicate names/descriptions, conflicting
  roles or states, and wrapper ARIA that overrides the component contract. Do not report the mere
  absence of explicit ARIA when the component already produces the required semantics.

## SPDS and Fluent V9 MessageBar announcement contract

This contract applies to Fluent V9 `MessageBar` and every SPDS component backed by it. `MessageBar`
intents provide built-in announcement presets. For those announcements to work, the application
must render one `AriaLiveAnnouncer` toward the top of the React tree, above every `MessageBar` that
needs to announce. First trace the host/root to determine whether it already provides the
announcer; do not add another one at the feature or MessageBar level.

Do not add `role="alert"`, `role="status"`, or an ad hoc `aria-live` attribute to a `MessageBar`,
its parent, `MessageBarBody`, or a duplicate hidden element. Those wrappers bypass or duplicate
the documented announcement mechanism. Use the documented `intent` preset. Do not customize the
`politeness` prop unless an accessibility owner has confirmed that the preset is wrong for the
specific experience.

Configure the announcer once at the application root:

```tsx
import { AriaLiveAnnouncer, FluentProvider } from '@fluentui/react-components';

export function AppRoot(): JSX.Element {
  return (
    <FluentProvider theme={appTheme}>
      <AriaLiveAnnouncer>
        <App />
      </AriaLiveAnnouncer>
    </FluentProvider>
  );
}
```

Then render the error and retry action without an alert wrapper:

```tsx
<div className={styles.downloadError}>
  <MessageBar intent="error">
    <MessageBarBody>{strings.DownloadError}</MessageBarBody>
  </MessageBar>
  <Button onClick={onDownload}>{strings.RetryButton}</Button>
</div>
```

When the surface uses `MessageBarGroup`, keep each `MessageBar` as a direct child as required by
the component's animation contract. Prefer the component's documented action slots/composition
when the retry action belongs to the message itself.

### Fluent V8 MessageBar announcement contract

Fluent UI React V8 `MessageBar` owns its screen-reader announcement. With its default
`delayedRender` behavior, it renders content into an internal live region after a short delay.
`error`, `blocked`, and `severeWarning` message types also receive the component's alert role;
other types use its documented status behavior. Treat that built-in behavior as satisfying the
corresponding error/warning/status transition. Do not ask the author to add `Announced`,
`ScreenReaderAlert`, another `role="alert"`/`role="status"` wrapper, or a second live region around
the same V8 MessageBar.

If `delayedRender={false}`, a role override, conditional wrapper, shim, portal, or migration layer
changes that contract, inspect the installed V8 implementation and rendered composition. Report a
problem only when the built-in announcement is disabled or broken without the documented V8
replacement pattern. Do not infer a missing announcement merely because no explicit announcement
API appears beside the MessageBar.

For V9, the same no-duplication rule applies once an ancestor `AriaLiveAnnouncer` is proven and the
MessageBar uses its preset intent. The intent owns that message announcement; do not add
`useAnnounce`, `@msinternal/screen-reader-alert`, or an ad hoc live region for the same error or
warning. Report only a missing/broken announcer prerequisite, a bypassed intent contract, or a
different async transition that the MessageBar does not announce.

## Repository accessibility utilities when Fluent or SPDS does not already own the behavior

Main authoring rule: first use the SPDS or Fluent component that models the interaction. Its documented composition, slots, keyboard handling, focus behavior, semantics, and high-contrast support are the default accessibility implementation. Use the repository utilities below only for behavior Fluent or SPDS does not already own. In particular, do not add `@msinternal/screen-reader-alert` to duplicate a Fluent V9 `MessageBar` announcement; configure the application-level `AriaLiveAnnouncer` instead.

### 1. Screen-reader announcements — Fluent V9 or SharePoint shared React API

Fluent V9 provides the equivalent general-purpose utility: `AriaLiveAnnouncer` supplies the live
region and `useAnnounce()` sends dynamic messages from its React subtree. For dynamic status,
save/error results, or other information not naturally announced by focus or a component, either
Fluent V9 `useAnnounce()` or `@msinternal/screen-reader-alert` is acceptable. Prefer the mechanism
already established by the host: use `useAnnounce()` when an ancestor `AriaLiveAnnouncer` is
available; use the SharePoint shared API when that is the surface convention. Do not add a new
announcer/provider solely to replace a working shared API, and never invoke both for the same event.

The SharePoint shared API is:

```ts
import { ReadingMode, useScreenReaderAlert } from '@msinternal/screen-reader-alert';

useScreenReaderAlert(
  strings.SaveSucceeded,
  ReadingMode.ReadAfterOtherContent,
  saveState === 'succeeded'
);
```

It also provides `<ScreenReaderAlert message={message} />` and `ScreenReaderAlert.read(message, mode)`. Prefer `ReadAfterOtherContent` for routine state changes; reserve `ReadImmediately` for urgent errors. When the same message must be announced again, require the implementation to increment the component `indicator`.

There is also an older `ScreenReader.alert(id, message)` API exported by `@msinternal/sp-a11y` and implemented in `odsp-common/utilities/browser/src/accessibility/ScreenReader.ts`. It always creates an assertive alert, so prefer the newer shared React package for new component work unless the host already follows the legacy `sp-a11y` pattern.

## Async collection state and announcement contract

Apply this contract whenever rendered collection UX loads, appends, refreshes, searches, filters,
sorts, groups, pages, retries, or replaces items. The absence of `aria-live`, announcement code, or
accessibility props is itself a reason to load this reference; do not require an existing a11y API
in the diff before checking the workflow.

Build a state-transition matrix from the changed code and inspect every reachable transition:

| Transition | Required review |
|---|---|
| initial → loading | Visible loading affordance; programmatic busy/loading state when supported; no misleading stale result count |
| loading → loaded | Announce completion and a useful localized result count or collection summary when focus does not move |
| loading → empty | Expose and announce the localized empty state, not only a blank collection |
| loading → error | Expose and announce the error once; keep retry keyboard reachable |
| load more → appended | Keep focus on the invoking control unless the component contract says otherwise; announce added or total item count |
| load more → end | Announce or otherwise expose that no more items remain; disable/remove the command without losing logical focus |
| sort/filter/search → replaced or reordered results | Expose the active state and announce the new order/filter/query result and count |
| refresh → updated/no change | Announce the meaningful outcome without repeating an indistinguishable stale message |

For each transition, record three outcomes in review evidence: visible feedback, screen-reader
feedback, and keyboard/focus behavior. Apply the dynamic focus transition contract below whenever
the operation can replace, reorder, disable, or remove the focused node or another focus target.
Do not infer that a spinner, skeleton, reordered DOM, or
updated item count is announced. `aria-busy` communicates processing state but does not replace the
completion/result announcement. Avoid per-item announcements during bulk loading and avoid
overlapping mechanisms that announce the same transition twice. Repeated identical outcomes must
still be announceable through the selected API's supported indicator/id/message-update mechanism.
All announcement, loading, empty, error, count, sort, filter, and end-of-list text must use localized
resources and correct plural/count formatting.

Component-owned announcements count as screen-reader feedback in this matrix. For example, a
correctly configured V8 MessageBar satisfies its own error/warning transition, and a correctly
configured V9 MessageBar under `AriaLiveAnnouncer` satisfies its intent announcement. Do not require
a second announcement. Continue checking distinct transitions such as loading completion, loaded
count, appended items, sorting/filtering results, and end-of-list because an error MessageBar does
not cover them.

### Choose the fix from the owning component stack

Recommend a concrete fix only after identifying the rendered collection and host stack from imports,
wrapper source, and installed package version. Prefer the highest owning layer; do not mix its
announcement mechanism with a second live region.

1. **SPDS or Fluent UI React V9:** use the same Fluent V9 accessibility implementation. For SPDS,
  inspect its wrapper, stable/LazyComponents API, and examples to select the exposed props or slots,
  then follow the underlying Fluent V9 component's loading, sort, focus, and announcement contract.
  For status not announced by the component, use `useAnnounce()` connected to an ancestor
  `AriaLiveAnnouncer`; use `useTypingAnnounce()` only for its documented typing scenario, not as a
  generic result-status substitute. For `MessageBar`, use its intent preset with the application-
  level announcer contract above rather than manually announcing the same message. Do not invent an
  SPDS-specific announcement path, recommend V8 APIs, or duplicate the V9 announcement with
  `@msinternal/screen-reader-alert`.
2. **Fluent UI React V8:** inspect the installed `@fluentui/react` version and the specific V8
  component documentation/source before recommending a fix. Preserve `DetailsList`/`FocusZone`
  keyboard and focus behavior and use the V8-supported announcement/status API already established
  by the owning surface (for example `Announced` only when that installed version and surface use
  it). A default V8 MessageBar already announces its own content; do not add `Announced` for that
  same message. Do not recommend V9 `AriaLiveAnnouncer` to a V8-only subtree.
3. **SharePoint-owned surface without a component-owned mechanism:** Fluent V9 `useAnnounce()` and
  `@msinternal/screen-reader-alert` (`useScreenReaderAlert`/`ScreenReaderAlert`) are both valid.
  Prefer whichever is already established in the host tree; if neither exists, choose the one that
  matches the owning surface's dependency and provider conventions. Do not require migration from
  one valid mechanism to the other, add both, or announce the same transition twice. Reuse legacy
  `ScreenReader.alert` only in a surface already committed to that assertive pattern; do not
  introduce it for routine list completion or sorting updates.
4. **Custom/native component outside those stacks:** first search the owning area for an established
  accessible status primitive. Only when none exists, use a single semantic `role="status"` or
  appropriately polite live region with localized atomic messages. Keep focus stable for in-place
  loading/sorting; move focus only when the interaction contract requires it. Do not add visually
  hidden CSS by copying a private implementation.

For a paged or sortable collection, at minimum inspect initial load, loaded count, empty/error/retry,
load-more append/end, and sort transitions. Missing visible feedback is a UX defect; missing
programmatic busy state or result announcement is an accessibility defect. A generic recommendation
to "add aria-live" is insufficient: the finding must name the owning stack, cited API or existing
surface pattern, localized message semantics, and expected focus behavior.

When a newly added or changed async collection gives a screen-reader user no programmatic way to
perceive loading completion, result replacement, append completion, sort/filter outcome, empty
state, or error, raise an **Important** accessibility finding with the missing transitions and the
stack-specific fix. Use **Minor** only when the transition is already perceivable and the suggestion
would merely improve wording or reduce redundant announcements. Do not downgrade a missing status
contract merely because sighted users can see a spinner or changed rows.

Raise an **Important** accessibility finding when a keyboard-triggered operation can remove or
replace the focused node and leave focus on `body`, a detached node, a non-interactive wrapper, or
an unrelated control without a documented accessible destination. Use **Minor** only when focus
already lands on a logical, visible, enabled destination and the recommendation merely improves a
non-blocking detail. “By design” does not lower severity without interaction-contract and focused
test evidence.

### 2. Focus management and keyboard navigation

#### Dynamic focus transition contract

Do not limit focus review to opening and closing dialogs. For every keyboard-triggered operation or
state update that can conditionally render, replace, reorder, disable, or remove DOM, identify the
focused element before the transition and its destination after the transition. Trace stable keys,
conditional branches, selection-derived toolbars, async rerenders, virtualized rows, toast actions,
and cleanup effects. A successful operation that leaves `document.activeElement` on `body`, a
non-interactive wrapper, a stale detached node, or an unrelated earlier control is a focus-loss
defect unless navigation intentionally moved to a newly established destination.

Use this transition matrix for each reachable operation:

| Transition | Required focus behavior |
|---|---|
| Refresh, retry, paging, sort, filter, or data replacement | Preserve the focused control/row by stable identity when it still exists. If it is replaced, restore focus to its semantic equivalent after commit, not `body`. |
| Focused row/item is removed | Move focus predictably to the next item, previous item, collection container, or initiating control according to the component contract; never rely on browser fallback. |
| Selection change mounts or unmounts toolbar commands | Do not move focus merely because selection changed. If the focused command disappears, move focus to a persistent logical neighbor or back to the selected item/collection. |
| Last item is deselected and selection-only UI disappears | Preserve focus in the collection unless focus was inside the disappearing UI; only then use the documented deterministic fallback. Do not steal focus from a still-mounted row. |
| Toast, inline action, confirmation, Replace/Keep both, or retry action completes and disappears | Restore focus to the initiating control or another persistent next step. If the original trigger no longer exists, choose and test a logical fallback. |
| Loading, save, upload, or background operation completes | Keep focus where the user left it unless the interaction contract requires navigation; announce the result separately rather than moving focus to expose status. |
| Modal, panel, popover, menu, or teaching surface closes | Restore focus through the owning component's documented trigger/restore-focus mechanism, including abrupt unmount and animation completion. |

Do not accept "by design" as sufficient evidence for a surprising focus jump. Require the product
or component interaction contract to identify the intended destination and verify that the
destination is logical, visible, enabled, and operable. A focus move may be intentional without
being accessible. When the changed code can perform one of these transitions, require a focused
interaction test that starts from the affected control, performs the exact operation, and asserts
the post-update active element. A generic tab-order test or assertion that an element exists does
not prove focus retention.

#### Choose the fix from the focus owner

Recommend a focus fix only after identifying the rendered component stack, installed package
version, current focus owner, trigger, node that will unmount, persistent destination, and fallback.
Use this order:

1. **SPDS or Fluent UI React V9 component contract:** for `Dialog`, `Popover`, `Menu`, Drawer,
  composite/roving-focus widgets, and other Fluent-owned surfaces, preserve the component's
  documented Tabster focus entry, containment, navigation, and trigger restoration. Use the
  component's documented props and composition first; use `trapFocus` only on a surface whose V9
  contract supports and requires containment. Do not add imperative `focus()` or `A11yManager`
  around behavior the component already owns.
2. **Fluent V9 restoration utilities:** when a V9 trigger and surface need explicit restoration not
  already supplied by the component, inspect the installed exports and use the documented
  `useRestoreFocusTarget` and `useRestoreFocusSource` pairing. Attach source/target refs according
  to the V9 contract and preserve the trigger long enough for restoration. Do not mix these hooks
  with a second SharePoint restore owner for the same lifecycle.
3. **Local V9 lifecycle replacement:** when a focused V9 toolbar, toast, inline action, row, or
  command is conditionally removed while its containing surface remains, move focus after commit
  to a named persistent target inside that workflow. For a disappearing toast action, prefer a
  persistent toast target while the toast remains; when the whole toast closes, restore to the
  operation's trigger. This local lifecycle does not by itself justify `A11yManager`.
4. **SharePoint page/canvas or cross-view ownership:** use `A11yManager` when focus crosses Fluent
  component boundaries under a SharePoint shell/canvas, must survive async loading or a view
  transition, or the owning area already uses its hierarchical navigation model. Use the area's
  established `saveActiveElementAs`/`restoreFocus` pattern rather than introducing a parallel
  local convention.
5. **Legacy, custom, or unmanaged DOM:** use `@msinternal/sp-a11y` `Focus` utilities when Tabster
  does not own the nodes and the fix needs to locate a first, next, parent, or sibling focusable
  element or perform imperative focus. Prefer native focus and an existing local pattern when the
  destination is already known; do not use DOM search to hide an unspecified focus destination.

`@msinternal/sp-a11y` is SharePoint/SPFx page-level accessibility infrastructure, not a replacement
for Fluent V9 focus management. Two focus owners can race and cause duplicate restoration or move
focus away from the user's intended target. Neither Fluent restore hooks nor
`A11yManager.restoreFocus()` can focus a DOM node that no longer exists. If the original node is
replaced, the fix must identify the semantic replacement or deterministic fallback and focus it
after it mounts.

Every focus finding's suggested fix must name: the owning stack; the exact component prop, Fluent
hook, `A11yManager` pattern, or `Focus` utility supported by that stack; when the active element is
captured; which node receives focus after commit/close; what happens if that node no longer exists;
and the interaction test that asserts `document.activeElement`. Do not suggest only “restore focus,”
“use a ref,” or “use `sp-a11y`.”

`sp-client/libraries/sp-a11y/src/index.ts` exports reusable primitives:

- `Focus` for finding focusable descendants, parents, and siblings; testing focusability; calling `focusInside`, `focusTo`, `focusOutOf`; and checking `hasFocus`, including shadow-DOM-aware variants where needed.
- `FocusTransition` for representing and walking source-to-destination focus movement.
- `Keyboard` for consistent `isEscape`, `isEnter`, `isTab`, `isShiftTab`, and modifier-aware `isKey`, including Ctrl versus Cmd handling on macOS.
- `A11yManager` and `A11yAttribute` for legacy declarative accessibility navigation on already managed surfaces. Supported attributes include `AlertOnFocusIn`, `AlertOnFocusOut`, `NavigateOnKey`, `NavigateByHierarchy`, `SkipKeys`, and `StopKeys`.

For a modal or panel implemented through the Fluent migration layer rather than native V9, prefer
the layer's established `useRestoreFocusOnDismiss`, `ModalShim`, and `FocusTrapZoneShim` support.
Do not recommend those compatibility APIs to a native V9 subtree.

### 3. Rich-text or content accessibility checks — `@msinternal/sp-a11y-checker-util`

For RTE, authored HTML, or page-content scanning, use `@msinternal/sp-a11y-checker-util`, not new local validators. Its public entry points include:

- `checkA11yForRte` and `runH1A11yChecks`
- heading order, H1, and heading-before-H1 validation
- empty-link, table-header, image-alt-text, and text/image/overlay contrast checks

This package is primarily for editor or content validation, not a general replacement for semantic component authoring.

### 4. Keyboard-accessible drag and drop — `@msinternal/sp-dragzone`

When a UI requires drag or reorder behavior, use `@msinternal/sp-dragzone` rather than a mouse-only drag implementation. It exports `IDragZoneA11yStrings`; its keyboard implementation supports Enter or Space to begin, arrow-key movement, Escape to cancel, focus return to the handle, and screen-reader move-state announcements. Require localized strings for `moveStarted`, `moveComplete`, `moveCancelled`, and `moveNotAllowed`.

### 5. Test and audit tools

- In Playwright tests, use `runAccessibilityScanAsync` from `tools/playwright-utilities`. It runs axe, supports scoped scans with `includeSelectors`, attaches detailed results and screenshots, and returns the violation count. Disabled rules need a documented, specific justification.
- For SharePoint authoring-page scenarios, use `verifyAccessibilityWithSPA11yAssistant(page)` to open the product Accessibility Assistant and assert the no-issues state.
- For code and diff review, use the repo's `/a11y-audit` command from `.ai/a11y-tools`. It combines jsx-a11y detection with checks for semantics, ARIA, keyboard, focus, screen-reader compatibility, and design tokens, and can target a component, folder, file, or current diff.
- Follow the repository checklist in `odsp-next/docs/Accessibility.md`: Accessibility Insights FastPass, keyboard and Narrator flow, sensible focus, correct name/role/value, announced status messages, and Windows High Contrast verification.

Do not treat the following as general reusable component APIs: the Pages Accessibility Assistant, canvas or RTE-local helpers, `items-view/web/private` alert components, copied `screenReaderAlert` implementations, and ARIA-named telemetry or parser packages. Reuse them only inside their owning area.

Gap identified: the repo has no central author-facing `VisuallyHidden` or `sr-only` React component. Do not copy private or ad hoc CSS to invent one; prefer native or SPDS semantics or the shared screen-reader alert package. If a screen-reader-only control is genuinely required, first find the owning surface's established pattern and consider a shared utility only when there is a real cross-feature need.

## Review checklist

### Scenario 1: SPDS or Fluent V9 component usage

1. Treat SPDS and Fluent V9 components as the primary accessibility contract in this repository. Review the component against the Fluent UI React V9 accessibility guidance and the specific component documentation before approving the usage.
2. Verify the author is using the correct documented component, slots, subcomponents, and wrapper hierarchy for the interaction instead of recreating or bypassing the accessibility behavior with custom markup.
3. Check whether the component requires or strongly expects accessibility props to be passed through in this usage, such as labeling, description, relationship, state, or announcement props. When the usage needs those semantics, require the props to be present and correctly wired.
4. Verify accessible names are provided through the documented Fluent or SPDS pattern, such as visible text, `Field`, `label`, `aria-label`, `aria-labelledby`, or other component-specific APIs. Icon-only and visually ambiguous controls must not rely on guesswork.
5. Verify accessible descriptions are supplied when the component needs extra context beyond its accessible name, using the documented component pattern rather than ad hoc duplicated text.
6. Verify component state and relationships are exposed through the documented APIs, such as expanded, selected, checked, pressed, invalid, required, busy, dialog labeling, table header relationships, tab relationships, and menu trigger state.
7. Verify the composition preserves the component's expected keyboard, focus, and screen-reader behavior. Do not accept wrappers, slot misuse, or DOM reshaping that breaks the built-in interaction model.
8. When Fluent or SPDS does not already own the needed behavior, verify the implementation reuses the repository's shared accessibility utilities rather than inventing local patterns for announcements, focus management, drag and drop, rich-text validation, or audits.
9. Verify transient UI built from Fluent or SPDS components, such as dialogs, menus, popovers, tooltips, toasts, and disclosures, is wired with the documented trigger, focus, dismissal, and labeling pattern.
10. Verify decorative icons remain hidden from assistive technology and meaningful icons do not become the only accessible name source unless that is the documented pattern.
11. Verify tests cover the changed accessibility contract when behavior changes. Prefer assertions on roles, names, states, focus movement, and announcements rather than implementation details.
12. For Fluent V9 `MessageBar` or an SPDS component backed by it, verify an ancestor application root provides `AriaLiveAnnouncer`, the documented intent supplies announcement behavior, and no parent or duplicate node adds `role="alert"`, `role="status"`, or `aria-live`.
13. For every async collection, complete the transition matrix above. Missing announcement code is
  not evidence that announcement review is inapplicable. Recommend the fix from the owning SPDS,
  Fluent V9, Fluent V8, SharePoint, or custom-component contract.

### Scenario 2: Custom component authoring when no suitable SPDS or Fluent V9 component fits

14. Preserve semantic HTML first. Use native elements such as `button`, `a`, `input`, `select`, `textarea`, `table`, `ul`, and heading tags before adding ARIA roles to generic containers.
15. Require the semantic interaction to match the user action. Use links for navigation, buttons for actions, checkboxes for binary selection, radios for mutually exclusive choices, and tables only for tabular relationships.
16. Do not accept clickable `div` or `span` implementations when a native control would work. Adding `role="button"` and key handlers to generic elements is a fallback, not the preferred solution.
17. Verify keyboard access for every interactive path. A keyboard user must be able to reach, operate, and dismiss the UI without requiring a mouse.
18. Reject positive `tabIndex` values and focus-order hacks unless there is a documented, exceptional reason. Prefer DOM order that already produces the intended tab sequence.
19. Verify visible focus indication remains clear in default, themed, and high-contrast modes. Do not remove outlines without a replacement that is at least as visible.
20. Require an accessible name for every interactive control and meaningful form field. Derive it from visible text, associated labels, `aria-label`, `aria-labelledby`, or other valid naming mechanisms.
21. Require accessible descriptions only when they add necessary context beyond the accessible name. Do not duplicate the same text in both name and description paths.
22. Treat placeholder text as supplementary only. It does not replace a real label or an accessible name.
23. When content updates without a page reload, verify assistive technologies receive the update through the correct pattern, such as `aria-live`, `role="status"`, `role="alert"`, focus movement, or semantic state changes. Do not announce the same event multiple times through overlapping mechanisms.
24. For dialogs, popovers, flyouts, menus, and disclosure UI, verify trigger semantics, focus entry, focus containment when required, Escape handling, restore-focus behavior, and correct relationships such as `aria-expanded`, `aria-controls`, or dialog labeling.
25. Reject ARIA that conflicts with visible behavior or native semantics. No ARIA is better than incorrect ARIA.
26. Verify validation and error flows are accessible. Associate error text to the field, expose invalid state, and ensure summary or inline feedback is reachable and announced when it appears.
27. Verify heading order, list structure, landmarks, and region labels remain meaningful after the change. Do not skip heading levels solely for visual styling.
28. For tables and grids, verify the chosen pattern matches the interaction complexity. Simple data should stay a semantic table with proper header associations; only use grid patterns when the richer keyboard model is truly required.
29. For images and media, require meaningful alternative text only when the asset conveys information not already present in adjacent text. Decorative images should use empty alt text or equivalent hiding.
30. Do not rely on color, position, shape, or hover-only behavior as the sole way to understand content or discover an action. The state and action must remain available through text, semantics, or another non-visual cue.
31. When custom widgets are unavoidable, require the full interaction contract: semantics, keyboard behavior, focus management, state announcements, high-contrast support, and tests. Reject partial reimplementations.
32. Verify claimed accessibility fixes in the current PR source. A resolved thread or follow-up promise is not evidence that the current implementation is accessible.

## Review questions

### For SPDS or Fluent V9 usage

- Does a suitable SPDS or Fluent V9 component already exist for this interaction?
- Did the author follow the Fluent V9 accessibility guidance and the specific component's accessibility docs for this component?
- Are the required or relevant accessibility props passed to the component for this usage?
- Does the component have the correct accessible name and, when needed, description through the documented Fluent or SPDS pattern?
- Does the composition preserve the component's built-in semantics, keyboard behavior, focus behavior, and announcements?
- Are tests proving the accessibility behavior the component usage depends on?

### For custom components

- Can this UI use SPDS or Fluent V9 component?
- Can this UI use a native element or an existing accessible component instead of custom ARIA on a generic container?
- Can a keyboard-only user complete the flow, including opening, using, and dismissing transient UI?
- Does every control have the correct accessible name, and is any additional description necessary rather than redundant?
- Are dynamic updates announced once, at the right time, through the correct semantic channel?
- For load, load-more, sort, filter, search, refresh, empty, error, and end states, what are the
  visible, screen-reader, and focus outcomes?
- Is the proposed fix native to the owning SPDS/Fluent version or established SharePoint surface,
  rather than a second ad hoc live region?
- Is focus moved only when necessary, and restored to a logical place afterward?
- Does hidden content stay hidden from assistive technology until it becomes relevant?
- Are validation, error, and busy states exposed programmatically instead of visually only?
- Do tests prove the accessible behavior that changed?

## Examples

### SPDS or Fluent V9 component usage

Bad:

```tsx
<Button icon={<DismissRegular />} />
```

Good:

```tsx
<Button aria-label={strings.closeDialog} icon={<DismissRegular />} />
```

When the Fluent or SPDS component renders an icon-only action, verify the usage passes the accessible name through the documented component prop pattern.

Bad:

```tsx
<Dialog open={isOpen}>
  <DialogSurface>
    <DialogBody>{content}</DialogBody>
  </DialogSurface>
</Dialog>
```

Good:

```tsx
<Dialog open={isOpen}>
  <DialogSurface>
    <DialogBody>
      <DialogTitle>{strings.renameDialogTitle}</DialogTitle>
      {content}
    </DialogBody>
  </DialogSurface>
</Dialog>
```

When using Fluent or SPDS transient UI, verify the documented labeling structure is present instead of assuming the container is sufficiently accessible by default.

### Custom components

#### Native controls before ARIA

Bad:

```tsx
<div role="button" tabIndex={0} onClick={save} onKeyDown={handleKeyDown}>
  Save
</div>
```

Good:

```tsx
<button type="button" onClick={save}>
  Save
</button>
```

Prefer the native element unless a documented platform constraint makes it impossible.

#### Labels versus placeholders

Bad:

```tsx
<input placeholder="Site name" />
```

Good:

```tsx
<>
  <label htmlFor={siteNameId}>Site name</label>
  <input id={siteNameId} />
</>
```

Keep a real label even when placeholder text is also present.

#### Dynamic status updates

Bad:

```tsx
<>
  {isSaved && <span>Saved</span>}
</>
```

Good:

```tsx
<>
  {isSaved && <div role="status">{strings.saved}</div>}
</>
```

Use a semantic announcement path when the message appears after an action.

#### Disclosure state

Bad:

```tsx
<button type="button" onClick={toggleFilters}>
  Filters
</button>
{isOpen && <section>...</section>}
```

Good:

```tsx
<button
  type="button"
  aria-expanded={isOpen}
  aria-controls={filtersPanelId}
  onClick={toggleFilters}
>
  Filters
</button>
{isOpen && <section id={filtersPanelId}>...</section>}
```

Expose the control relationship and current state to assistive technology.

## Short enforcement

In this repository, default to reviewing accessibility through the SPDS and Fluent UI React V9 component contract first. Check the Fluent accessibility guidance and the specific component docs, and verify required accessibility props are passed for the actual usage. Only fall back to generic custom-widget review rules when no suitable SPDS or Fluent V9 component can meet the requirement.
