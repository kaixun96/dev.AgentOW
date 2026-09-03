# SharePoint design-system UX component review reference

Use this reference when a change adds or modifies a user-facing component, interactive UX pattern, layout, styling, or imports from SharePoint design-system or Fluent UI component packages.

## Component-fit analysis before implementation

Do not select a component from the request's nouns alone. A request for a "list", for example, may require a semantic list, `Table`, `DataGrid`, tree, grouped collection, or another purpose-built control. Before planning imports or JSX:

1. Convert the UX request into interaction and data requirements: data shape, selection mode, sorting/filtering/grouping, keyboard model, editing, virtualization/paging, drag and drop, responsive behavior, and accessibility semantics.
2. Identify the plausible SPDS components and compare at least the strongest two candidates when more than one can represent the data. Do not stop at the first exported component.
3. Read each candidate's current Fluent UI React V9 documentation in `https://storybooks.fluentui.dev/react/` and inspect the version-pinned component API/source used by ODSP-Web. Search by component name rather than relying on remembered APIs.
4. Verify the component is exported from the path-appropriate SPDS stable entry and inspect nearby ODSP-Web production usage for controlled-state, localization, responsive, and accessibility conventions.
5. Write a requirement-to-capability matrix. Record the selected component, why it owns the required interaction model, why each serious alternative is less suitable, the SPDS import route, documentation/source consulted, and nearby prior art. Missing evidence is a planning gap, not an implementation assumption.

Treat a rendered UI change that lacks this analysis, contradicts its own evidence, or manually rebuilds behavior owned by a better-supported component as an Important finding. The fix is to complete the comparison and use the best-fit supported component, not merely to document the existing choice after implementation.

### `Table` versus `DataGrid`

- Prefer SPDS `DataGrid` for a conventional interactive tabular experience with sortable columns, row selection, stable row identity, and standard grid keyboard/focus semantics. Use its documented column definitions, controlled sort/selection state, and selection cells instead of rebuilding those behaviors with header buttons, standalone checkboxes, `role="grid"`, or custom arrow-key navigation.
- Prefer SPDS `Table` for primarily presentational tabular data or when the UX requires substantial nonstandard row structure, keyboard behavior, selection semantics, or composition that `DataGrid` cannot support. Document that capability gap before accepting the additional implementation and ARIA responsibility.
- Server-side sorting, paging controls, upload commands, drag-and-drop zones, status UI, and dialogs do not by themselves require a low-level `Table`; keep sibling workflows outside the grid and drive API requests from controlled `DataGrid` state when that is the better fit.
- For either choice, verify high-zoom/narrow-width behavior from the component guidance. A minimum grid width inside a horizontally scrollable container is often preferable to collapsing columns or breaking header/cell relationships.

## Review checklist

1. Build UI with the highest supported ODSP-Web design-system layer that meets the UX requirement. Do not skip a higher layer merely to obtain a small styling or API preference.
2. Prefer SPDS from the path-appropriate stable package: use `@msinternal/sharepoint-ui-react-stable-bundle` under `sp-client/`, and use `@msinternal/sharepoint-ui-react-stable` under `odsp-common/`.
3. In `sp-client/`, route components to `@msinternal/sharepoint-ui-react-stable-bundle` when they are exported there. Route portal/heavy families such as `Dialog` and `Checkbox` and their documented subcomponents through `@msinternal/sharepoint-ui-react-stable/lib/LazyComponents` when that is the supported stable entry. In `odsp-common/`, use the corresponding non-bundle stable packages and verify the exact export path.
4. Do not import a component from `@fluentui/react-components` when the required SPDS stable or `LazyComponents` entry provides it. This is an Important design-system finding: the PR bypasses the required production component package. The finding may be waived only with a cited capability gap in both SPDS entries.
5. If SPDS does not provide the required component, behavior, slot, token, or accessibility capability, the author may use either `@msinternal/sharepoint-ui-react` or Fluent UI React V9, but must record the specific gap and why the chosen fallback is compatible.
6. Choose between `@msinternal/sharepoint-ui-react` and Fluent UI React V9 based on which supported component best meets the UX, semantic, accessibility, and theming requirement.
7. Build a custom HTML/CSS component only when all three layers cannot meet the requirement.
8. Prefer the provided component and its documented props, slots, appearance options, typography presets, and design tokens over recreating the control or its styles.
9. Avoid overriding SPDS component styles as much as possible. When a change adds many style overrides on top of SPDS, ask why they are needed and whether they are explicitly intended by design.
10. Preserve the intended semantic interaction: use links for navigation, buttons for actions, navigation or list components for navigation or list behavior, and standard message or error components for user feedback.
11. Use supported styling APIs only. Do not target generated or private Fluent implementation selectors such as `.fui-*`.
12. Reuse an existing ODSP-Web shared wrapper, helper, or component when it already provides the required behavior; do not create a parallel implementation.
13. Treat SPDS and Fluent components as semantic, compound APIs, not as styled DOM containers. Use only their documented child components, slots, and wrapper hierarchy. Every child must belong to that component's domain and semantic structure. If content is an adjacent action, status indicator, or page-level control rather than a valid component child, place it outside the compound component and lay it out with a sibling wrapper. Do not insert raw structural HTML such as `li`, `tr`, or `option` inside a Fluent or SPDS component merely because the current implementation happens to render a compatible parent element. For genuine component items, require the corresponding SPDS or Fluent item component instead.
14. Keep accessibility intact: semantic structure, keyboard behavior, focus handling, high-contrast and theme support, labels, and screen-reader announcements must remain correct.
15. When custom HTML/CSS is necessary, require a documented gap showing why SPDS, `@msinternal/sharepoint-ui-react`, and Fluent V9 cannot meet the UX requirement.
16. For custom HTML/CSS, require semantic HTML and explicit keyboard, focus, accessibility, theme, high-contrast, localization, and responsive behavior.
17. Keep custom components focused and reusable. Do not reproduce a standard design-system control solely for visual customization.
18. Verify the chosen implementation preserves design-system semantics, accessibility, theming, responsiveness, and upgrade resilience.

## Fluent V9 Input border contract

For the default outline appearance, preserve the native Fluent V9 token pair:
`borderColor: tokens.colorNeutralStroke1` on the full perimeter and
`borderBottomColor: tokens.colorNeutralStrokeAccessible` on the bottom edge. When the native
component or migration shim already provides this hierarchy, do not repeat it as a consumer
override; remove the override and let the component own its default and interaction-state styles.
Do not apply `tokens.colorNeutralStrokeAccessible` through a `border` or `borderColor` shorthand,
because that darkens all four edges and no longer matches the standard Input.

This also applies when a Fluent V8 `TextField` is rendered through the V9 migration shim. The shim
preserves the V8 `fieldGroup` styling API, but that compatibility API is not a reason to restate
native V9 Input styles. Read the version-pinned native Input and shim styles first. If they already
provide the required hierarchy, require no consumer `fieldGroup` override. Only when a documented
product requirement genuinely needs a different base style may the consumer express the two layers
separately with `borderColor: tokens.colorNeutralStroke1` and
`borderBottomColor: tokens.colorNeutralStrokeAccessible`. Preserve the component's native hover,
focus, error, disabled, forced-colors, and non-default appearance rules.

## Review questions

- Can SPDS meet this requirement?
- If SPDS is used, are there many style overrides, and if so, is there a clear design-backed reason for them?
- If SPDS cannot meet it, does `@msinternal/sharepoint-ui-react` or Fluent V9 provide a supported component that does?
- Is the code treating a compound component as a semantic API with valid child components and slots, rather than injecting unrelated content into its internal structure?
- If custom HTML/CSS is proposed, why can neither `@msinternal/sharepoint-ui-react` nor Fluent V9 meet it?
- Are existing components, tokens, typography, slots, or wrappers being bypassed?
- Does a default Input preserve the normal four-edge stroke plus the darker accessible bottom edge,
  including when a V8 `TextField` uses the V9 shim?
- If the native component or shim already provides that border hierarchy, has a redundant consumer
  override been removed rather than restating the component's own tokens?
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

Use the path-appropriate SPDS stable package first: `@msinternal/sharepoint-ui-react-stable-bundle` in `sp-client/` and `@msinternal/sharepoint-ui-react-stable` in `odsp-common/`. If it lacks the required component, either SharePoint UI or Fluent V9 is acceptable when it is the best supported fit. Treat SPDS and Fluent controls as semantic compound APIs: use only their documented items, slots, and wrapper structure, and keep unrelated controls outside. When a finding involves compound-component composition, verify the remediation against the official story, source, or component docs so action-vs-navigation semantics stay correct. Custom HTML/CSS requires a documented gap in all three layers and must preserve the full semantic, accessibility, theme, localization, and responsiveness contract.
