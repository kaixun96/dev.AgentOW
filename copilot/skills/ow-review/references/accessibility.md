# Accessibility review reference

Use this reference when a change adds or modifies interactive UI, custom controls, form fields, dialogs, flyouts, dynamic status text, focus behavior, visibility toggles, or accessibility attributes.

## Review checklist

1. Preserve semantic HTML first. Use native elements such as `button`, `a`, `input`, `select`, `textarea`, `table`, `ul`, and heading tags before adding ARIA roles to generic containers.
2. Require the semantic interaction to match the user action. Use links for navigation, buttons for actions, checkboxes for binary selection, radios for mutually exclusive choices, and tables only for tabular relationships.
3. Do not accept clickable `div` or `span` implementations when a native control would work. Adding `role="button"` and key handlers to generic elements is a fallback, not the preferred solution.
4. Verify keyboard access for every interactive path. A keyboard user must be able to reach, operate, and dismiss the UI without requiring a mouse.
5. Reject positive `tabIndex` values and focus-order hacks unless there is a documented, exceptional reason. Prefer DOM order that already produces the intended tab sequence.
6. Verify visible focus indication remains clear in default, themed, and high-contrast modes. Do not remove outlines without a replacement that is at least as visible.
7. Require an accessible name for every interactive control and meaningful form field. Derive it from visible text, associated labels, `aria-label`, `aria-labelledby`, or other valid naming mechanisms.
8. Require accessible descriptions only when they add necessary context beyond the accessible name. Do not duplicate the same text in both name and description paths.
9. Verify icons, icon-only buttons, avatar buttons, and dismiss affordances expose meaningful accessible names. Decorative icons must be hidden from assistive technology.
10. Treat placeholder text as supplementary only. It does not replace a real label or an accessible name.
11. Verify disabled, readonly, expanded, selected, pressed, invalid, busy, current, and required states are conveyed through the correct native semantics or ARIA state.
12. When content updates without a page reload, verify assistive technologies receive the update through the correct pattern, such as `aria-live`, `role="status"`, `role="alert"`, focus movement, or semantic state changes. Do not announce the same event multiple times through overlapping mechanisms.
13. For dialogs, popovers, flyouts, menus, and disclosure UI, verify trigger semantics, focus entry, focus containment when required, Escape handling, restore-focus behavior, and correct relationships such as `aria-expanded`, `aria-controls`, or dialog labeling.
14. For conditional or lazy-rendered UI, verify hidden content is not accidentally exposed to the accessibility tree, and visible content is not accidentally hidden through `aria-hidden`, CSS clipping patterns, or stale state.
15. Reject ARIA that conflicts with visible behavior or native semantics. No ARIA is better than incorrect ARIA.
16. Verify validation and error flows are accessible. Associate error text to the field, expose invalid state, and ensure summary or inline feedback is reachable and announced when it appears.
17. Verify heading order, list structure, landmarks, and region labels remain meaningful after the change. Do not skip heading levels solely for visual styling.
18. For tables and grids, verify the chosen pattern matches the interaction complexity. Simple data should stay a semantic table with proper header associations; only use grid patterns when the richer keyboard model is truly required.
19. For images and media, require meaningful alternative text only when the asset conveys information not already present in adjacent text. Decorative images should use empty alt text or equivalent hiding.
20. Do not rely on color, position, shape, or hover-only behavior as the sole way to understand content or discover an action. The state and action must remain available through text, semantics, or another non-visual cue.
21. Verify touch and pointer conveniences do not break keyboard and assistive technology behavior. Hover-only affordances must have a focusable or always-visible equivalent.
22. When custom widgets are unavoidable, require the full interaction contract: semantics, keyboard behavior, focus management, state announcements, high-contrast support, and tests. Reject partial reimplementations.
23. Verify tests cover the changed accessibility contract when behavior changes. Prefer assertions on roles, names, states, focus movement, and announcements over brittle implementation details.
24. Verify claimed accessibility fixes in the current PR source. A resolved thread or follow-up promise is not evidence that the current implementation is accessible.

## Review questions

- Can this UI use a native element or an existing accessible component instead of custom ARIA on a generic container?
- Can a keyboard-only user complete the flow, including opening, using, and dismissing transient UI?
- Does every control have the correct accessible name, and is any additional description necessary rather than redundant?
- Are dynamic updates announced once, at the right time, through the correct semantic channel?
- Is focus moved only when necessary, and restored to a logical place afterward?
- Does hidden content stay hidden from assistive technology until it becomes relevant?
- Are validation, error, and busy states exposed programmatically instead of visually only?
- Do tests prove the accessible behavior that changed?

## Examples

### Native controls before ARIA

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

### Labels versus placeholders

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

### Icon-only actions

Bad:

```tsx
<button type="button">
  <DismissIcon />
</button>
```

Good:

```tsx
<button type="button" aria-label={strings.closeDialog}>
  <DismissIcon aria-hidden="true" />
</button>
```

The button needs an accessible name; the decorative icon does not.

### Dynamic status updates

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

### Disclosure state

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

Prefer native semantics and existing accessible components. Require full keyboard access, visible focus, correct accessible names and states, accurate announcements, and accessible transient UI behavior. Reject custom widgets or ARIA usage that only partially reproduces the expected interaction contract.
