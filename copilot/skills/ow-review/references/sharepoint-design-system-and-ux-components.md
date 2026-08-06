# SharePoint design-system UX component review reference

Use this reference when a change adds or modifies a user-facing component, interactive UX pattern, layout, styling, or imports from SharePoint design-system or Fluent UI component packages.

## Review checklist

1. Build UI with the highest supported ODSP-Web design-system layer that meets the UX requirement. Do not skip a higher layer merely to obtain a small styling or API preference.
2. Prefer SPDS from `@msinternal/sharepoint-ui-react-stable`.
3. If SPDS does not provide the required component, behavior, slot, token, or accessibility capability, the author may use either `@msinternal/sharepoint-ui-react` or Fluent UI React V9.
4. Choose between `@msinternal/sharepoint-ui-react` and Fluent UI React V9 based on which supported component best meets the UX, semantic, accessibility, and theming requirement.
5. Build a custom HTML/CSS component only when all three layers cannot meet the requirement.
6. Prefer the provided component and its documented props, slots, appearance options, typography presets, and design tokens over recreating the control or its styles.
7. Avoid overriding SPDS component styles as much as possible. When a change adds many style overrides on top of SPDS, ask why they are needed and whether they are explicitly intended by design.
8. Preserve the intended semantic interaction: use links for navigation, buttons for actions, navigation or list components for navigation or list behavior, and standard message or error components for user feedback.
9. Use supported styling APIs only. Do not target generated or private Fluent implementation selectors such as `.fui-*`.
10. Reuse an existing ODSP-Web shared wrapper, helper, or component when it already provides the required behavior; do not create a parallel implementation.
11. Treat SPDS and Fluent components as semantic, compound APIs, not as styled DOM containers. Use only their documented child components, slots, and wrapper hierarchy. Every child must belong to that component's domain and semantic structure. If content is an adjacent action, status indicator, or page-level control rather than a valid component child, place it outside the compound component and lay it out with a sibling wrapper. Do not insert raw structural HTML such as `li`, `tr`, or `option` inside a Fluent or SPDS component merely because the current implementation happens to render a compatible parent element. For genuine component items, require the corresponding SPDS or Fluent item component instead.
12. Keep accessibility intact: semantic structure, keyboard behavior, focus handling, high-contrast and theme support, labels, and screen-reader announcements must remain correct.
13. When custom HTML/CSS is necessary, require a documented gap showing why SPDS, `@msinternal/sharepoint-ui-react`, and Fluent V9 cannot meet the UX requirement.
14. For custom HTML/CSS, require semantic HTML and explicit keyboard, focus, accessibility, theme, high-contrast, localization, and responsive behavior.
15. Keep custom components focused and reusable. Do not reproduce a standard design-system control solely for visual customization.
16. Verify the chosen implementation preserves design-system semantics, accessibility, theming, responsiveness, and upgrade resilience.

## Review questions

- Can SPDS meet this requirement?
- If SPDS is used, are there many style overrides, and if so, is there a clear design-backed reason for them?
- If SPDS cannot meet it, does `@msinternal/sharepoint-ui-react` or Fluent V9 provide a supported component that does?
- Is the code treating a compound component as a semantic API with valid child components and slots, rather than injecting unrelated content into its internal structure?
- If custom HTML/CSS is proposed, why can neither `@msinternal/sharepoint-ui-react` nor Fluent V9 meet it?
- Are existing components, tokens, typography, slots, or wrappers being bypassed?
- Does the chosen implementation preserve design-system semantics, accessibility, theming, and upgrade resilience?

## Examples

### Layer selection

Good:

- Use SPDS stable bundle first when it already exposes the required interaction and styling hooks.
- If the stable bundle lacks the required component or capability, choose either `@msinternal/sharepoint-ui-react` or Fluent V9 based on the best supported fit for the requirement.
- Use custom HTML/CSS only after ruling out SPDS stable bundle, `@msinternal/sharepoint-ui-react`, and Fluent V9 with evidence tied to the requirement.

Bad:

- Choosing custom markup first because it is more familiar.
- Skipping SPDS to gain a small styling preference that the higher layer can already support through documented props, tokens, slots, or wrappers.
- Recreating a standard button, link, nav item, list, or message bar only to slightly alter visuals.

### Custom HTML/CSS

Accept custom HTML/CSS only when the review evidence shows a real gap across SPDS, `@msinternal/sharepoint-ui-react`, and Fluent V9.

Reject:

- custom controls that reproduce an existing design-system primitive for visual customization alone;
- custom styling that depends on generated selectors such as `.fui-*`;
- custom interactive markup that weakens semantics, keyboard support, focus handling, theme support, or screen-reader behavior.

### Component and styling choices

Good:

- Use SPDS first, and when the stable bundle lacks a component, choose a supported component from either `@msinternal/sharepoint-ui-react` or Fluent v9, such as `Nav`, `BreadcrumbItem`, `MessageBar`, and Fluent icons.
- Prefer the `Typography` component when it matches the design, like `<Subtitle2 />`, `<Body1 />`, or `<Text weight="semibold" />`. Use `typographyStyles.*` or tokens only when semantic HTML requires it.
- Use Fluent icons so theme, sizing, high contrast, and accessibility stay correct.
- Use supported slots, props, tokens, `className`, `style`, and stable wrapper APIs.
- Treat compound components such as `Breadcrumb`, `Menu`, `TabList`, `Table`, `Dropdown`, and similar controls as semantic APIs with specific child components and wrapper structure.
- When you find a compound-component boundary defect, verify the suggested fix against the official story, source, or component docs before recommending a replacement component. Do not infer a substitute merely because it is clickable or renders compatible DOM.
- If a private Fluent selector is truly unavoidable, document why supported APIs failed, scope the override narrowly, pin the version, and require upgrade re-validation.
- Share proven cross-page shells, styles, formatters, URLs, and responsive constants intentionally; keep page-local styles local until shared behavior is validated.

Bad:

- Recreate supported controls with raw HTML/CSS instead of using an available supported component from SPDS, `@msinternal/sharepoint-ui-react`, or Fluent v9.
- Insert unrelated content or raw structural HTML inside a compound component simply because its current DOM output makes that possible.
- Hand-write `fontSize`, `fontWeight`, `lineHeight`, or `fontFamily` to imitate a preset, or partially reproduce a preset.
- Use Unicode glyphs like `✕`, `☰`, or `👥` as UI icons.
- Depend on generated/private `.fui-*` selectors as if they were stable contracts.
- Use private selectors broadly based only on designer sign-off, without technical exception documentation or regression planning.
- Copy foundational UI across migration pages, or change shared layout/style values without validating regression risk.

### Compound component boundaries

#### Adjacent controls do not belong inside compound component internals

Bad:

```tsx
<Breadcrumb>
  {/* BreadcrumbItem navigation nodes */}
  <li className={styles.infoItem}>
    <Tooltip {...tooltipProps}>
      <InfoButton {...infoButtonProps} />
    </Tooltip>
  </li>
</Breadcrumb>
```

Although Fluent `Breadcrumb` currently renders an internal list, the manually authored `li` bypasses the component contract. The info button is not a breadcrumb navigation item and should not be injected into `Breadcrumb` just to obtain inline layout.

Good:

```tsx
<Overflow>
  <Breadcrumb>
    {/* BreadcrumbItem navigation nodes */}
  </Breadcrumb>
</Overflow>

<div className={styles.infoItem}>
  <Tooltip {...tooltipProps}>
    <InfoButton {...infoButtonProps} />
  </Tooltip>
</div>
```

Keep adjacent informational or page-level controls outside the compound component and arrange them with a sibling wrapper.

#### Breadcrumb overflow action versus navigation

Bad:

```tsx
<Menu>
  <MenuTrigger disableButtonEnhancement>
    <BreadcrumbItem>
      <BreadcrumbButton icon={<MoreHorizontalRegular />} aria-label={overflowLabel} />
    </BreadcrumbItem>
  </MenuTrigger>
</Menu>
```

This hits two problems at once: `MenuTrigger` wraps the wrong level, and the suggested replacement must preserve semantics. `BreadcrumbButton` represents a real breadcrumb navigation or current item; the overflow opener is an action that opens a menu, not a breadcrumb destination.

Good:

```tsx
<BreadcrumbItem>
  <Menu>
    <MenuTrigger disableButtonEnhancement>
      <Button icon={<MoreHorizontalRegular />} aria-label={overflowLabel} />
    </MenuTrigger>
  </Menu>
</BreadcrumbItem>
```

Use `BreadcrumbButton` only for genuine breadcrumb navigation nodes. For breadcrumb overflow, keep the list-item structure with `BreadcrumbItem`, but model the overflow opener as an action with `Button` — preferably the available SPDS button wrapper when one fits. The official structure is `BreadcrumbItem > Menu > MenuTrigger > Button`. Navigation nodes stay navigation components, and action triggers stay action components.

### Semantics and accessibility

Good:

- Preserve semantic HTML, heading order, list structure, keyboard/focus behavior, live-region/alert behavior, and accessible hidden-control patterns.

Bad:

- Treat visual output as sufficient while missing semantics, screen-reader announcements, valid heading/list structure, or operable hidden controls.

## Short enforcement

Use SPDS stable bundle first. If it lacks the required component, either SharePoint UI or Fluent V9 is acceptable when it is the best supported fit. Treat SPDS and Fluent controls as semantic compound APIs: use only their documented items, slots, and wrapper structure, and keep unrelated controls outside. When a finding involves compound-component composition, verify the remediation against the official story, source, or component docs so action-vs-navigation semantics stay correct. Custom HTML/CSS requires a documented gap in all three layers and must preserve the full semantic, accessibility, theme, localization, and responsiveness contract.
