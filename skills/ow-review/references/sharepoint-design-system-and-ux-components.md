# SharePoint design-system UX component review reference

Use this reference when a change adds or modifies a user-facing component, interactive UX pattern, layout, styling, or imports from SharePoint design-system or Fluent UI component packages.

## Review checklist

1. Build UI with the highest supported ODSP-Web design-system layer that meets the UX requirement. Do not skip a higher layer merely to obtain a small styling or API preference.
2. Prefer SPDS from `@msinternal/sharepoint-ui-react-stable-bundle`.
3. If SPDS does not provide the required component, behavior, slot, token, or accessibility capability, use `@msinternal/sharepoint-ui-react`.
4. If neither SharePoint design-system surface supports the requirement, use Fluent UI React V9.
5. Build a custom HTML/CSS component only when all three layers cannot meet the requirement.
6. Prefer the provided component and its documented props, slots, appearance options, typography presets, and design tokens over recreating the control or its styles.
7. Avoid overriding SPDS component styles as much as possible. When a change adds many style overrides on top of SPDS, ask why they are needed and whether they are explicitly intended by design.
8. Preserve the intended semantic interaction: use links for navigation, buttons for actions, navigation or list components for navigation or list behavior, and standard message or error components for user feedback.
9. Use supported styling APIs only. Do not target generated or private Fluent implementation selectors such as `.fui-*`.
10. Reuse an existing ODSP-Web shared wrapper, helper, or component when it already provides the required behavior; do not create a parallel implementation.
11. Keep accessibility intact: semantic structure, keyboard behavior, focus handling, high-contrast and theme support, labels, and screen-reader announcements must remain correct.
12. When custom HTML/CSS is necessary, require a documented gap showing why SPDS, `@msinternal/sharepoint-ui-react`, and Fluent V9 cannot meet the UX requirement.
13. For custom HTML/CSS, require semantic HTML and explicit keyboard, focus, accessibility, theme, high-contrast, localization, and responsive behavior.
14. Keep custom components focused and reusable. Do not reproduce a standard design-system control solely for visual customization.
15. Verify the chosen implementation preserves design-system semantics, accessibility, theming, responsiveness, and upgrade resilience.

## Review questions

- Can SPDS meet this requirement?
- If SPDS is used, are there many style overrides, and if so, is there a clear design-backed reason for them?
- If not, why cannot `@msinternal/sharepoint-ui-react` meet it?
- If not, why cannot Fluent V9 meet it?
- Are existing components, tokens, typography, slots, or wrappers being bypassed?
- Does the chosen implementation preserve design-system semantics, accessibility, theming, and upgrade resilience?

## Examples

### Layer selection

Good:

- Use SPDS stable bundle first when it already exposes the required interaction and styling hooks.
- Drop to `@msinternal/sharepoint-ui-react` only for a specific missing capability such as behavior, slotting, token coverage, or accessibility support.
- Drop to Fluent V9 only after ruling out both SharePoint design-system layers with evidence tied to the requirement.

Bad:

- Choosing Fluent V9 or custom markup first because it is more familiar.
- Skipping SPDS to gain a small styling preference that the higher layer can already support through documented props, tokens, slots, or wrappers.
- Recreating a standard button, link, nav item, list, or message bar only to slightly alter visuals.

### Custom HTML/CSS

Accept custom HTML/CSS only when the review evidence shows a real gap across SPDS, `@msinternal/sharepoint-ui-react`, and Fluent V9.

Reject:

- custom controls that reproduce an existing design-system primitive for visual customization alone;
- custom styling that depends on generated selectors such as `.fui-*`;
- custom interactive markup that weakens semantics, keyboard support, focus handling, theme support, or screen-reader behavior.

## Short enforcement

Use SPDS stable bundle first, then SharePoint UI, then Fluent V9. Custom HTML/CSS requires a documented gap in all three layers and must preserve the full semantic, accessibility, theme, localization, and responsiveness contract.
