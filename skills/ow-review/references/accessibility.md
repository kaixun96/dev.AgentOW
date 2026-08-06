# Accessibility review reference

Use this reference when a change adds or modifies interactive UI, form fields, dialogs, flyouts, dynamic status text, focus behavior, visibility toggles, or accessibility attributes.

This repository primarily builds UI with SPDS and Fluent UI React V9. Review accessibility in two separate scenarios:

1. **SPDS or Fluent V9 component usage** — the default case in this repo.
2. **Custom component authoring** — only when no suitable SPDS or Fluent V9 component can meet the requirement.

When a change uses SPDS or Fluent V9, review against the Fluent UI React V9 accessibility guidance, especially the Accessibility docs in `https://storybooks.fluentui.dev/react/`, and the specific component's documented accessibility behavior and props.

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
| general Fluent component accessibility expectations when no component-specific page above is a better fit | [Components overview](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-components-overview--docs) |
| end-to-end user journeys, interaction patterns, or broader accessibility experience guidance beyond a single component | [Experiences](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-experiences--docs) |
| focus visibility, custom focus styling, or focus indicator regressions | [Focus indicator](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-focus-indicator--docs) |
| toast/status/alert messaging, announcements, or notification timing/behavior | [Notification best practices](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-notification-best-practices--docs) |
| text truncation, clipped labels/content, tooltip fallback for truncated text, or loss of meaning from overflow | [Truncation](https://storybooks.fluentui.dev/react/?path=/docs/concepts-developer-accessibility-truncation--docs) |

## Repository accessibility utilities when Fluent or SPDS does not already own the behavior

Main authoring rule: first use the SPDS or Fluent component that models the interaction. Its documented composition, slots, keyboard handling, focus behavior, semantics, and high-contrast support are the default accessibility implementation. Use the repository utilities below only for behavior Fluent or SPDS does not already own.

### 1. Screen-reader announcements — preferred shared React API

Use `@msinternal/screen-reader-alert` for dynamic status, save/error results, or other information that is not naturally announced by moving focus.

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

### 2. Focus management and keyboard navigation — `@msinternal/sp-a11y`

`sp-client/libraries/sp-a11y/src/index.ts` exports reusable primitives:

- `Focus` for finding focusable descendants, parents, and siblings; testing focusability; calling `focusInside`, `focusTo`, `focusOutOf`; and checking `hasFocus`, including shadow-DOM-aware variants where needed.
- `FocusTransition` for representing and walking source-to-destination focus movement.
- `Keyboard` for consistent `isEscape`, `isEnter`, `isTab`, `isShiftTab`, and modifier-aware `isKey`, including Ctrl versus Cmd handling on macOS.
- `A11yManager` and `A11yAttribute` for legacy declarative accessibility navigation on already managed surfaces. Supported attributes include `AlertOnFocusIn`, `AlertOnFocusOut`, `NavigateOnKey`, `NavigateByHierarchy`, `SkipKeys`, and `StopKeys`.

Use `A11yManager` only when extending a surface that already depends on it; do not introduce it instead of native or SPDS interactions.

For a modal or panel implemented through the Fluent migration layer, prefer `useRestoreFocusOnDismiss`, `ModalShim`, and `FocusTrapZoneShim` support rather than hand-writing focus restoration. Those utilities capture the trigger before focus enters the modal, restore after dismissal animation, and cover abrupt unmounts.

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

### Scenario 2: Custom component authoring when no suitable SPDS or Fluent V9 component fits

12. Preserve semantic HTML first. Use native elements such as `button`, `a`, `input`, `select`, `textarea`, `table`, `ul`, and heading tags before adding ARIA roles to generic containers.
13. Require the semantic interaction to match the user action. Use links for navigation, buttons for actions, checkboxes for binary selection, radios for mutually exclusive choices, and tables only for tabular relationships.
14. Do not accept clickable `div` or `span` implementations when a native control would work. Adding `role="button"` and key handlers to generic elements is a fallback, not the preferred solution.
15. Verify keyboard access for every interactive path. A keyboard user must be able to reach, operate, and dismiss the UI without requiring a mouse.
16. Reject positive `tabIndex` values and focus-order hacks unless there is a documented, exceptional reason. Prefer DOM order that already produces the intended tab sequence.
17. Verify visible focus indication remains clear in default, themed, and high-contrast modes. Do not remove outlines without a replacement that is at least as visible.
18. Require an accessible name for every interactive control and meaningful form field. Derive it from visible text, associated labels, `aria-label`, `aria-labelledby`, or other valid naming mechanisms.
19. Require accessible descriptions only when they add necessary context beyond the accessible name. Do not duplicate the same text in both name and description paths.
20. Treat placeholder text as supplementary only. It does not replace a real label or an accessible name.
21. When content updates without a page reload, verify assistive technologies receive the update through the correct pattern, such as `aria-live`, `role="status"`, `role="alert"`, focus movement, or semantic state changes. Do not announce the same event multiple times through overlapping mechanisms.
22. For dialogs, popovers, flyouts, menus, and disclosure UI, verify trigger semantics, focus entry, focus containment when required, Escape handling, restore-focus behavior, and correct relationships such as `aria-expanded`, `aria-controls`, or dialog labeling.
23. Reject ARIA that conflicts with visible behavior or native semantics. No ARIA is better than incorrect ARIA.
24. Verify validation and error flows are accessible. Associate error text to the field, expose invalid state, and ensure summary or inline feedback is reachable and announced when it appears.
25. Verify heading order, list structure, landmarks, and region labels remain meaningful after the change. Do not skip heading levels solely for visual styling.
26. For tables and grids, verify the chosen pattern matches the interaction complexity. Simple data should stay a semantic table with proper header associations; only use grid patterns when the richer keyboard model is truly required.
27. For images and media, require meaningful alternative text only when the asset conveys information not already present in adjacent text. Decorative images should use empty alt text or equivalent hiding.
28. Do not rely on color, position, shape, or hover-only behavior as the sole way to understand content or discover an action. The state and action must remain available through text, semantics, or another non-visual cue.
29. When custom widgets are unavoidable, require the full interaction contract: semantics, keyboard behavior, focus management, state announcements, high-contrast support, and tests. Reject partial reimplementations.
30. Verify claimed accessibility fixes in the current PR source. A resolved thread or follow-up promise is not evidence that the current implementation is accessible.

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
