# SharePoint theme and Detheme review reference

Use this reference when a change affects a rendered SharePoint surface's theme provider,
background, color tokens, primary actions, tabs, links, or other styling that depends on
whether the experience is SharePoint-owned, customer-content-focused, inline, or overlaid.

Read `skills/detheme/SKILL.md` from this Claude plugin with this reference. That skill is the
normative implementation and remediation guide; this reference defines how to review the result
and what evidence to require.

## Classify the surface before reviewing colors

Theme rules depend on surface type and ownership. Do not validate a color in isolation or
assume that every surface inside SharePoint should inherit the customer site theme.

| Surface | Required theme treatment | Examples |
|---|---|---|
| Surface invoked from app chrome | Use the SharePoint theme. Keep the surface predominantly neutral; SharePoint teal is reserved for the primary button and active tab, and links are bold and underlined. | App bar or suite header settings and flyouts |
| SharePoint-owned full page | Use the SharePoint theme with the same neutral treatment, teal primary button and active tab, and bold underlined links. | SharePoint settings pages |
| Customer-content full page | Use customer theming when the experience is focused on a specific site or customer content. | Site- or content-focused experiences |
| Inline pane | Always use the neutral theme. Primary buttons and active tabs remain neutral rather than SharePoint teal or customer-themed. | Property pane |
| Full-overlay drawer | Always use SharePoint teal for the primary button and active tab. | Settings, analytics, Site permissions, Change the look |

## Required review method

1. Identify the rendered surface as app-chrome-invoked, a SharePoint-owned full page, a
   customer-content full page, an inline pane, or a full-overlay drawer.
2. Trace the rendered ancestor chain across module boundaries, including callers, page or pane
   roots, openers, and hosts. Verify the established SharePoint theme/Detheme provider and token
   flow into the changed component; do not limit review to the diff or changed module.
3. Inspect screenshots of the changed experience. Code or token names alone are not enough
   to prove the final theme treatment.
4. In the screenshots, verify the background and general chrome, primary button, active tab,
   and links against the table above. Also check relevant default, selected, hover, focus,
   disabled, and high-contrast states when the change can affect them.
5. Confirm that a customer theme is used only for a customer-content full page, not for
   SharePoint-owned chrome, panes, drawers, or settings pages.
6. Record the surface classification, provider/token evidence, and screenshot evidence in the
   required `preReview.profileChecks` entry whose ID is `spClientThemeDetheme`. If screenshots
   needed to validate changed visible theme behavior are unavailable, report the evidence gap
   rather than assuming the result is correct.
7. Check the implementation mechanics from the Detheme skill: correctly scoped
   `NeutralThemeProvider` hooks, no redundant child wrapper when an ancestor provider already
   supplies the required treatment and hooks, no redundant property-pane wrapper, v8 shim detection and
   `NeutralV8ThemeProvider` where required, removal of a site-themed nested `FluentProvider`,
   killswitch protection for existing surfaces, and correctly imported/layered v9 SCSS tokens.

## Review questions

- What kind of surface is this, and who owns the experience?
- Does the provider and token path match that surface classification?
- Does an ancestor outside the changed module already provide equivalent neutral treatment and
   all hooks required by the changed child?
- Is the surface neutral except for the explicitly allowed SharePoint teal accents?
- For an inline pane, are primary buttons and active tabs neutral?
- For a drawer, app-chrome surface, or SharePoint-owned page, are primary buttons and active
  tabs SharePoint teal?
- For a customer-content full page, does it intentionally follow the customer site theme?
- Are links bold and underlined where the SharePoint theme treatment requires them?
- Do screenshots demonstrate the final rendered result rather than only the intended tokens?
- For existing surfaces, does the killswitch preserve the original provider, wrapper classes,
  and `$ms-color-*` behavior?
- Were v8 imports checked against both `enabledForFluentMigration` and the matching shim?

## Blocking examples

Request changes when evidence shows customer theming leaking into SharePoint-owned chrome,
settings, panes, or drawers; SharePoint teal accents appearing in an inline pane; missing
SharePoint teal accents in a drawer or SharePoint-owned surface; links that violate the
SharePoint treatment; a local override bypassing the established Detheme flow; or a visible
theme change that cannot be validated because required screenshots are missing. Also request
changes when the changed UX adds a redundant nested provider or lacks provider/hook coverage it
needs. If ancestor inspection reveals a pre-existing Detheme gap that does not affect the changed
UX, report it only as a Nit for the author rather than blocking the change.

## Required fix guidance

Every Detheme finding must tell the author to apply `skills/detheme/SKILL.md` from this Claude
plugin and name the exact applicable remediation:
surface reclassification; `NeutralThemeProvider` plus only the required
`enabledCustomStyleHooks`; reuse of an ancestor provider whose hooks already cover the child;
updating the owning ancestor when shared hook coverage is missing; no additional wrapper for a correctly implemented property pane;
`NeutralV8ThemeProvider` for an unshimmed v8 component; removal of a nested site-themed
`FluentProvider`; killswitch protection for an existing surface; or layered v9 SCSS tokens with
the required token import. Do not report only that the colors are wrong.