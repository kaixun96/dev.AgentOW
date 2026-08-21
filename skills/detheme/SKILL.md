---
name: detheme
description: Use when implementing or fixing theming for a SharePoint surface such as app-chrome settings, a flyout, full page, dialog, callout, panel, drawer, or property pane. Classifies the surface, applies NeutralThemeProvider and only the required custom style hooks, handles v8 components and redundant FluentProvider wrappers, and migrates legacy SCSS colors to Fluent UI v9 tokens.
---

# Detheme

Classify the surface before editing. The classification determines whether the experience uses
the SharePoint theme, customer theming, or a fully neutral treatment.

## Surface classification

| Surface | Required treatment | Examples |
|---|---|---|
| Invoked from app chrome | SharePoint-owned: predominantly neutral, with SharePoint teal only for the primary button and active tab. Links are neutral, bold, and underlined. | App bar or suite-header settings and flyouts |
| SharePoint-owned full page | SharePoint-owned: predominantly neutral, with SharePoint teal only for the primary button and active tab. Links are neutral, bold, and underlined. | SharePoint settings pages |
| Customer-content full page | Use customer theming because the experience is centered on a specific site or customer content. | Site- or content-focused experiences |
| Inline pane | Fully neutral, including primary buttons and active tabs. | Property pane |
| Full-overlay drawer | Neutral surface with SharePoint teal primary buttons and active tabs. | Settings, analytics, Site permissions, Change the look |

If ownership or presentation mode is unclear, trace the opener, host, and rendered container
before coding. Do not infer the classification from the component name alone.

## Trace existing provider coverage

Before adding a theme provider, trace the rendered parent chain across module boundaries. Search
the component's callers, page or pane root, opener, and host for an existing
`NeutralThemeProvider`; do not stop at the changed file or diff. If an ancestor provider already
has the required treatment and its `enabledCustomStyleHooks` cover the child's element types, do
not wrap the child again. When a required hook is missing, update the owning ancestor when that is
the appropriate shared scope; add a nested provider only when the child intentionally needs a
different theme boundary or narrower treatment.

## SharePoint-owned surfaces

For SharePoint-owned settings dialogs, callouts, panels, app-chrome surfaces, pages, and
full-overlay drawers, wrap the surface with `<NeutralThemeProvider>` from
`@msinternal/fluentui-neutral-components` (add it to `package.json` if missing). Use
`enabledCustomStyleHooks` to restore only the allowed SharePoint treatment:

- primary buttons and active tabs use SharePoint teal;
- links are neutral rather than teal, bold, and underlined;
- everything else stays neutral.

Inspect the rendered children and enable hooks only for element types actually present:

```tsx
import { NeutralThemeProvider } from '@msinternal/fluentui-neutral-components';

// Surface has Button only:
<NeutralThemeProvider enabledCustomStyleHooks={{ button: true }}>

// Surface has Button, Tab, and Link:
<NeutralThemeProvider enabledCustomStyleHooks={{ button: true, link: true, tab: true }}>
```

## Inline and property panes

Everything is neutral, including primary buttons and active tabs. The property pane is already
wrapped in `NeutralThemeProvider` and already overrides links at the top of the pane. When it
uses Fluent UI v9 components correctly, do not wrap or override it again.

## Customer-content full pages

Preserve customer theming for experiences focused on a specific site or customer content. Do
not apply SharePoint-owned Detheme treatment merely because the page runs inside SharePoint.

## New versus existing code

**New surfaces and components** are dethemed by default: use Fluent UI v9 tokens, do not add
`$ms-color-*` tokens or local theme overrides, and do not add a killswitch solely for Detheme.

**Existing surfaces** need a killswitch to protect the behavior change. Ask which flight to gate
under; never invent or assume one. Then inspect the cases that `NeutralThemeProvider` does not
fix by itself.

### Unshimmed v8 components

A `@fluentui/react` import is already v9 only when both conditions hold:

1. the project has `"enabledForFluentMigration": true` in
   `config/spfx-internal-bundling-options.json`; and
2. a matching `<ComponentName>Shim.ts` exists in the repository.

If either is missing, the component remains v8 at runtime. Wrap it in
`<NeutralV8ThemeProvider>` from `@msinternal/fluentui-neutral-components`.

### Redundant FluentProvider

Remove a nested `<FluentProvider>` whose theme comes from `getTheme()`, including
`createV9Theme(getTheme())`. It reapplies the customer site theme beneath the neutral provider.
Keep its children.

### Legacy SCSS colors

If the affected SCSS contains `$ms-color-*`, add a killswitch-gated
`deTheme<ComponentName>` class to the wrapper for this migration only. Keep the original token
and layer the Fluent UI v9 value beneath that class so the old path is unchanged while the
killswitch is active:

```scss
@import 'pkg:@fluentui/react-theme-sass/sass/tokens';

.ms-Example-text {
  color: $ms-color-neutralSecondary;

  .deThemeExample & {
    color: $colorNeutralForeground1;
  }
}
```

Every `.scss` file that uses v9 tokens must import
`pkg:@fluentui/react-theme-sass/sass/tokens`, unless a shared `variables.scss` already imports
it. Missing imports can silently produce no value without failing the build.

Use the canonical Fluent v8-to-v9 mapping when choosing replacements:
https://github.com/microsoft/fluentui/blob/2d6aca289ee6cc4571e4e3dcdf810deb78ac18fa/apps/public-docsite-v9/src/shims/ThemeShim/v9ThemeShim.ts.
Ask when a mapping is not obvious.

## Verification

Capture the rendered surface and verify its background/chrome, primary button, active tab, and
links against the classification table. Include relevant selected, hover, focus, disabled, and
high-contrast states when affected. Confirm the killswitch preserves the old behavior for an
existing surface.