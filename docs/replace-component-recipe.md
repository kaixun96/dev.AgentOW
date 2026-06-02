ReplaceComponent — agentOW skill
Replace one SPDS-component-using file in sp-client/apps/<app> with the version-pinned stable variant. Each replacement is gated so it can be rolled back without redeploying.

Reference PRs (read these before applying the recipe)
Pattern A (preferred for batch migrations) — PR 2164312 "NGSP Visual Refresh Upgrade" by Poorvi Tusam. 28 files in one PR, all gated by the shared flight isVisualRefreshStableBundleEnabled(). Components: Button, SplitButton, Menu/MenuItem/etc., Image, Badge, Tooltip, Card/CardHeader/CardPreview, Link, DialogBody/DialogContent/DialogActions/Dialog/DialogSurface, Avatar. This is the canonical convention for stable-bundle migration in ngsp-app.
Pattern B (per-file KS, only when explicitly required) — PR 2211667 by Kai Xun. Single file (AmplifyAnalyticsDetailedReportTable_SPDS.tsx), drawer family, dedicated isAmplifyAnalyticsDrawerReactDrawerKSActivated.
Pattern C+ (v8 <Panel> → v9 <OverlayDrawer> per-file translation) — PR 2218188 "shared-react-flow-panel" by Kai Xun. doclib ConfigureFlowsPanel + FlowCreationPanel. Demonstrates: PanelShim source study, prop-by-prop translation table, selective CSS/lifecycle patch inlining, mandatory Playwright pixel-comparison gate, and the rush-change-before-push hook for publishable packages. Replaces the deprecated "blind Pattern C" rewrite approach (which caused header-padding regressions).
The recipe below is generic — substitute {Component} for the target family (e.g. Drawer, Tooltip, Card). Concrete worked examples for all three patterns appear inline.

Inputs the agent needs from the issue/work item
Target file path (e.g. src/components/Publish/StatusPill/StatusPill.tsx).
Component family / sub-components (e.g. Badge, Tooltip, or Drawer/OverlayDrawer/DrawerBody).
What does the file currently import — v8 (@fluentui/react/lib/Panel) or v9 (@fluentui/react-components / @msinternal/sharepoint-ui-react*)? This single fact picks Pattern C+ vs Pattern A/B.
Which flight (Pattern A / C+) or KS (Pattern B) gates the swap. See "Choosing a pattern" below.
Choosing a pattern
Check this first: what does the file import? @fluentui/react/lib/Panel is v8 — different API surface, NOT alias-swappable. @fluentui/react-components or @msinternal/sharepoint-ui-react* is v9 — alias-swap territory.

Situation	Use	Rationale
File imports v8 <Panel> from @fluentui/react/lib/Panel (NOT v9 Drawer/OverlayDrawer) and needs to render the v9 stable-bundle drawer family	Pattern C+ — per-file AI-driven v8 <Panel> → v9 <OverlayDrawer> translation (see §C1-C9)	v8 Panel and v9 OverlayDrawer have non-1:1 APIs — can't alias-swap. PanelShim works but renders from legacy v9 bundle, doesn't satisfy stable-bundle flight goal. Blind rewrite (deprecated "Pattern C") regresses spacing — must borrow PanelShim's CSS/lifecycle patches selectively.
File belongs to the Visual Refresh rollout (most ngsp-app component swaps fall here)	Pattern A — isVisualRefreshStableBundleEnabled()	Established convention; flight already has an embedded KS; no new KS pollution.
File is part of an Analytics-stable-bundle migration	Pattern A — isAnalyticsStableBundleEnabled()	Same idea, different feature area.
File belongs to a different rollout area that already has a flight	Pattern A — that flight	Reuse the existing rollback control.
Single-surface migration that should NOT participate in the broader rollout (e.g. an experimental pilot, a surface that needs an independent rollback timeline)	Pattern B — per-file KS	Independent control; one KS per file.
File already has BOTH legacy and stable imports gated by some flight	SKIP	Already migrated. Don't add a second KS or duplicate the swap.
Component is in a different package (NavDrawer from react-nav, *Picker* from sp-sitepicker-control, etc.)	SKIP	Out of scope.
File only mentions the component name in killswitch strings, comments, or feature-flag descriptions without rendering one	SKIP	No code change needed.
Pattern C (blind v8 → v9 rewrite without PanelShim study) is deprecated — it regresses spacing/header padding because v9 default tokens differ from v8 Panel's tighter chrome. Pattern C+ replaces it; the "+" denotes mandatory PanelShim source study + per-prop translation table (§C2) + mandatory Playwright pixel-comparison gate (§C6). Any new v8 Panel migration uses C+, not bare C.

Hard rules (apply to both patterns)
Import path — pick by component
Component family	Import from
Avatar, Dialog, Drawer, Search*, Toolbar (lazy-bundle variant)	@msinternal/sharepoint-ui-react-stable/lib/LazyComponents
Button, Menu, Tooltip, Card*, Table, Tabs, Image, Link, Carousel, Badge, Input, Tag, Textarea	@msinternal/sharepoint-ui-react-stable-bundle
* Includes the family's sub-components — e.g. Drawer covers OverlayDrawer/InlineDrawer/DrawerHeader/DrawerBody/DrawerFooter. Dialog covers DialogTrigger/DialogBody/DialogSurface/DialogContent/DialogActions. Card covers CardHeader/CardPreview/CardFooter. If unsure, grep odsp-common/sharepoint-ui-react-stable/src/LazyComponents.ts and .../src/index.ts.

Forbidden
Never import from @msinternal/sharepoint-ui-react*/experimental — eslint mixin no-spds-experimental blocks the pattern. CI policy treats the warning as a failure.
Never add the underlying component package (e.g. @msinternal/sharepoint-ui-react-drawer, @msinternal/sharepoint-ui-react-dialog) to package.json. The stable umbrella already pins them via aliases like @msinternal/sharepoint-ui-react-drawer-stable: npm:@msinternal/sharepoint-ui-react-drawer@<pinned>.
Never call the gating function (KS or flight) at module top-level — _SPKillSwitch / _SPFlight are not initialized yet. Always call inside the component body.
Dependency declaration — required if missing
The new import path must resolve. Before editing the target file, check the owning package's package.json:

grep '"@msinternal/sharepoint-ui-react-stable"\|"@msinternal/sharepoint-ui-react-stable-bundle"' <package-path>/package.json
Result	Action
Umbrella you need is already declared	Proceed — no package.json edit needed.
Umbrella you need is missing	Add it to dependencies (use the same version range as siblings — grep another package that already has it, e.g. odsp-shared-react or custom-gpt-base for the lazy umbrella). Then run rush update BEFORE the next rush build / rush start — without this, the build fails with TS2307 because the module is not yet installed in common/temp/node_modules. This is the only package.json change permitted by this skill.
Sequencing — critical: after any package.json dep add, you MUST run rush update before invoking rush build or rush start. rush update installs the new dep into the symlinked node_modules; without it, rush build cannot resolve the import and emits TS2307. Order: edit package.json → rush update → rush build → rush test.

Picking the right umbrella by import path (matches §"Import path — pick by component"):

Component family / import path	Add to dependencies
@msinternal/sharepoint-ui-react-stable/lib/LazyComponents (Avatar, Dialog, Drawer, Search*, Toolbar)	@msinternal/sharepoint-ui-react-stable
@msinternal/sharepoint-ui-react-stable-bundle (Button, Menu, Tooltip, Card*, Table, Tabs, Image, Link, Carousel, Badge, Input, Tag, Textarea)	@msinternal/sharepoint-ui-react-stable-bundle
Why this rule exists: PR 2164312 (the canonical Pattern A reference) didn't have to add the umbrella because ngsp-app already declared it. Most other apps/libraries in odsp-web don't — adding the umbrella is the prerequisite for rush build to find lib/LazyComponents. Without the declaration, you get TS2307: Cannot find module '@msinternal/sharepoint-ui-react-stable/lib/LazyComponents' at the new import line.

File scope
No package.json changes other than the umbrella dep above. No unrelated dep adds, removes, or version bumps.
No rush update after the initial dep add. If you only added the umbrella, run rush update exactly once. If pnpm-lock.yaml shows churn unrelated to that dep, revert the lockfile (git checkout main -- common/config/rush/pnpm-lock.yaml) and retry rush update — the pre-push hook rejects spurious transitive bumps.
No formatter-only or unrelated-cleanup churn.
Step 0 — Triage
Run before touching the file:

First: grep the file's imports.
Sees from '@fluentui/react/lib/Panel' (v8 Panel) → Pattern C+ (§307+). Skip steps 2-3 — A/B don't apply.
Sees v9 Drawer/OverlayDrawer/etc. from @fluentui/react-components or @msinternal/sharepoint-ui-react* → continue to step 2.
Then: check the SKIP rows in the "Choosing a pattern" table — if any match, record the file as skipped and stop.
Otherwise: pick Pattern A (preferred) or Pattern B per the table.
When skipping, record the file in ReplaceComponent.candidates.md (or the per-batch todo) with the reason. Do not edit the code.

Pattern A — recipe (preferred)
A1. Pick / confirm the flight
Most likely isVisualRefreshStableBundleEnabled() from sp-client/apps/<app>/src/protection/Flights.ts. If it doesn't exist, you may need to add it (PR 2164312 added it for ngsp-app). The flight should already wrap a KS internally:

export function isVisualRefreshStableBundleEnabled(): boolean {
  return (
    !_SPKillSwitch.isActivated(
      'f74e95fd-2e36-4830-8dc0-bc6e0ca2cfeb' /* '03/24/2026', 'poorvitusam - Use sharepoint-ui-react-stable-bundle for Visual Refresh components' */
    ) && _SPFlight.isEnabled(63016 /* Visual Refresh */)
  );
}
Adding a new flight is rare — almost always reuse one that exists.

A2. Update imports — shadow-rename pattern
Suffix both the legacy and stable imports (Legacy / Stable). The local const declared in A3 reuses the original bare name, so JSX needs zero changes.

// Generic
import {
  // ...unrelated helpers (mergeClasses/makeStyles/tokens/types/icons) stay
  {Component} as {Component}Legacy,
  {SubComponent} as {SubComponent}Legacy
} from '@msinternal/sharepoint-ui-react'; // (or '@fluentui/react-components')
import {
  {Component} as {Component}Stable,
  {SubComponent} as {SubComponent}Stable
} from '<import-path-from-table>';
import { isVisualRefreshStableBundleEnabled } from '<rel>/<flights-file>';
Flight import path: prefer the package's existing flight file (e.g. <rel>/common/Flights.ts, <rel>/Core/Flights.ts, <rel>/common/Features.ts). Create <rel>/common/Flights.ts only if none exists. Do not add <rel>/protection/Flights.ts — protection/ is not a repo convention.

// Pattern A worked example — SetupSitePanel.tsx (PR-D2, 5-component drawer family)
import {
  DrawerBody as DrawerBodyLegacy,
  DrawerFooter as DrawerFooterLegacy,
  DrawerHeader as DrawerHeaderLegacy,
  DrawerHeaderTitle as DrawerHeaderTitleLegacy,
  OverlayDrawer as OverlayDrawerLegacy
} from '@fluentui/react-components';
import {
  DrawerBody as DrawerBodyStable,
  DrawerFooter as DrawerFooterStable,
  DrawerHeader as DrawerHeaderStable,
  DrawerHeaderTitle as DrawerHeaderTitleStable,
  OverlayDrawer as OverlayDrawerStable
} from '@msinternal/sharepoint-ui-react-stable/lib/LazyComponents';
import { isSPStableBundleEnabled } from './common/Flights';
Computing <rel>: count .. from the target file to the flight file. e.g. src/components/Publish/StatusPill/StatusPill.tsx → ../../../common/Flights.

A3. Cache the flight, then shadow-rename — JSX stays untouched
// Generic — declare locals using the BARE original name so JSX needs no changes
const useStable: boolean = isVisualRefreshStableBundleEnabled();
const {Component}: typeof {Component}Legacy | typeof {Component}Stable =
  useStable ? {Component}Stable : {Component}Legacy;
const {SubComponent}: typeof {SubComponent}Legacy | typeof {SubComponent}Stable =
  useStable ? {SubComponent}Stable : {SubComponent}Legacy;
Two rules: 1. Cache the flight value once as const useStable: boolean = isXxxEnabled(). Reuse in every ternary. Never call the flight wrapper inline (isXxxEnabled() ? ... : ...) once per component — Jun Li flagged this as drift-prone noise. 2. Use the original bare name for the local const (Drawer, not ResolvedDrawer). The shadow is safe because the module-level import was renamed to XxxLegacy. JSX (<Drawer>...</Drawer>) is identical to pre-migration → diff is purely additive → reviewers only inspect the imports + cache block.

Note the direction: flight ON → new component. (Different from a killswitch — flights default off and roll out forward.)

// Worked example — SetupSitePanel.tsx (PR-D2)
const useStable: boolean = isSPStableBundleEnabled();
const OverlayDrawer: typeof OverlayDrawerLegacy | typeof OverlayDrawerStable = useStable
  ? OverlayDrawerStable
  : OverlayDrawerLegacy;
const DrawerHeader: typeof DrawerHeaderLegacy | typeof DrawerHeaderStable = useStable
  ? DrawerHeaderStable
  : DrawerHeaderLegacy;
// ... etc.

// JSX is unchanged from pre-migration:
return (
  <OverlayDrawer ...>
    <DrawerHeader>
      <DrawerHeaderTitle>...</DrawerHeaderTitle>
    </DrawerHeader>
    <DrawerBody>...</DrawerBody>
  </OverlayDrawer>
);
For class components, declare the locals inside render() (or hoist to instance fields if you want — the flight value is immutable for the component lifetime).

Anti-patterns (do not use): - const ResolvedDrawer = ... — forces every JSX site to change. Avoid; the shadow-rename pattern keeps JSX clean. - const Drawer = isSPStableBundleEnabled() ? ... : ... (inline flight call) — drops the cache. Use useStable instead. - import { Drawer } from '...stable...' without as DrawerStable — collides with the bare local name. Always suffix.

A4. Update tests (only if *.test.tsx exists)
Two rules, both load-bearing:

Always wrap the mock with jest.requireActual and spread the real exports. Replacing the whole module breaks every other function it exports — the test passes on the unit but the component (or its transitive imports) crashes at render time with … is not a function.

Default the flight to false, not true. While flight 1535 ramps the production default is OFF (legacy path). If the mock defaults to true, the existing tests stop covering what's actually shipping — i.e. you've moved coverage onto a branch that real users won't hit. Add a focused describe block at the bottom of the suite that flips it to true for one or two render-and-click tests.

// ✅ DO — preserves other exports, defaults to prod-legacy, covers both branches
jest.mock('<rel>/<flights-file>', () => {
  const actual: Record<string, unknown> = jest.requireActual('<rel>/<flights-file>');
  return {
    ...actual,
    isVisualRefreshStableBundleEnabled: jest.fn(() => false)
  };
});

import { isVisualRefreshStableBundleEnabled } from '<rel>/<flights-file>';
// ... existing tests run with flight OFF (legacy v9 path) — matches prod default ...

describe('when SP Stable Bundle flight is enabled', () => {
  beforeEach(() => {
    (isVisualRefreshStableBundleEnabled as jest.Mock).mockReturnValue(true);
  });
  afterEach(() => {
    (isVisualRefreshStableBundleEnabled as jest.Mock).mockReturnValue(false);
  });

  it('renders via the stable bundle drawer family', () => {
    render(<MyComponent {...props} />);
    expect(screen.getByText(strings.title)).toBeDefined();
  });
});

// ❌ DON'T — replaces the whole module; any other flight in <flights-file> becomes undefined
jest.mock('<rel>/<flights-file>', () => ({
  isVisualRefreshStableBundleEnabled: () => true
}));
When the existing test file already has a Flights mock, don't replace it — extend it the same way (...actual spread + default false + new describe block).

No KillSwitches mock required for Pattern A. PR 2164312 added one-line additions (no requireActual) because its flight file only exported isVisualRefreshStableBundleEnabled at the time — the Drawer batch caught the bug when migrating packages where the flight file had many other exports.

A5. Build & test
# from sp-client/apps/<app>
rush --quiet build -t .
rush --quiet test -o <app> --include-phase-deps
Build must end with SUCCESS (no WARNINGS). Zero (no-restricted-imports) lint warnings.

Pattern B — recipe (per-file KS)
Use only when "Choosing a pattern" justifies it.

B1. Generate KS
Invoke odsp-add-killswitch-sp-client MCP tool. Append to src/protection/KillSwitches.ts:

// Generic
export function is{Surface}{Component}MigrationKSActivated(): boolean {
  return _SPKillSwitch.isActivated(
    '<lowercase-guid>' /* '<MM/DD/YYYY>', '<alias> - Replace {Surface} {Component} with the SPDS variant via <import-path>' */
  );
}

// Pattern B worked example — PR 2211667
export function isAmplifyAnalyticsDrawerReactDrawerKSActivated(): boolean {
  return _SPKillSwitch.isActivated(
    '5e288c1e-5515-46bf-b4bc-5c480a9b7fc8' /* '5/6/2026', 'kaixun - Replace OverlayDrawer/DrawerBody in Amplify Analytics filter panel with the SPDS react-drawer via sharepoint-ui-react-stable/lib/LazyComponents' */
  );
}
KS naming: is{Surface}{Component}MigrationKSActivated() is the cleanest form. PR1 used the older is{Surface}{Component}React{Component}KSActivated shape — also acceptable but verbose.

B2-B3. Imports + JSX
Identical to Pattern A2-A3 (shadow-rename: suffix both imports Legacy/Stable, declare local with bare name, JSX unchanged), but: - Import is{Surface}{Component}MigrationKSActivated from <rel>/protection/KillSwitches instead of the flight. - Direction flips: !isXxxMigrationKSActivated() → new component (KS direction is "activated = old emergency fallback").

const useStable: boolean = !is{Surface}{Component}MigrationKSActivated();
const {Component}: typeof {Component}Legacy | typeof {Component}Stable =
  useStable ? {Component}Stable : {Component}Legacy;
B4. Update tests
jest.mock('<import-path-from-table>', () => ({
  {Component}: {Component}Stub,
  {SubComponent}: {SubComponent}Stub
}));

let isXxxMigrationKSActivatedMock: boolean = false;
jest.mock('<rel>/protection/KillSwitches', () => {
  const actual: object = jest.requireActual('<rel>/protection/KillSwitches');
  return {
    ...actual,
    is{Surface}{Component}MigrationKSActivated: () => isXxxMigrationKSActivatedMock
  };
});

afterEach(() => { isXxxMigrationKSActivatedMock = false; });

// Add at least one test where isXxxMigrationKSActivatedMock = true to exercise the legacy branch.
If no test file exists, skip this step (PR1 had no test for the migrated file).

B5. Build & test
Same commands as Pattern A.

Pattern C+ — per-file AI-driven v8 <Panel> → v9 <OverlayDrawer> translation
Use when: the file renders v8 <Panel> from @fluentui/react/lib/Panel (NOT v9 Drawer/OverlayDrawer). Pattern A/B don't apply — v8 Panel and v9 OverlayDrawer have non-1:1 APIs, so we can't alias-swap.

Why not just inline <PanelShim> from @msinternal/fluentui-migration: PanelShim is a tested compatibility shim that already maps v8 IPanelProps → v9 OverlayDrawer rendering with ~30 CSS overrides, sizing math, prop translation, and visibility lifecycle. BUT — PanelShim internally renders from @fluentui/react-components (legacy v9 bundle), not @msinternal/sharepoint-ui-react-stable/lib/LazyComponents (stable v9). For flights that target stable-bundle migration (e.g. flight 1535), using PanelShim doesn't fulfill the flight's goal. We still need a per-file v9 rewrite, but informed by what PanelShim does so we don't re-invent every patch.

Why not blind Pattern C rewrite: Fluent v9 has different default tokens than v8 Panel — padding, backdrop color, button geometry, etc. all differ. A blind <Panel> → <OverlayDrawer> substitution without considering each delta can: - ship visible changes that surprise users and skip the design team's review, OR - carry over v9 defaults that are objectively broken for a specific surface (e.g. v9 <Button> min-width on an icon-only close button).

PanelShim closes these gaps wholesale to preserve v8 visual fidelity. Pattern C+ is more selective: per §C0 Rules 1-3, default to accepting v9 / SPDS defaults, only carry a PanelShim patch forward when a per-rule audit confirms the v9 default is unusable for the surface (Layer-4 override). Most files will end up with a near-empty overrides hook.

C0. Default to SPDS-native — minimal overrides, no hardcoded values, per-rule justification
The migration's goal is adoption of the SPDS design language, not v8 visual fidelity. v8 was the old design system; flight 1535-style migrations exist to move surfaces onto SPDS spec, not to preserve v8 chrome inside SPDS components. Three operating rules:

Authoritative anchor for "default to SPDS-native": this is not just engineering opinion. CAP (Cloud Apps Platform) design — sign-off by Matt Blank (CAP visual refresh lead) and CAP design systems team, communicated to Wave 6 engineering on 2026-05-14 via Farhan Mian (UXE) — explicitly directed: "In the interim, it's perfectly fine to implement overlay drawers as they are right now … please proceed as planned, no need for engineering to customize anything here." The specific case was OverlayDrawer inset/offset, which differs between current SPDS Storybook default and the future-target spec — design's call: ship with current default, SPDS Storybook will integrate the new spec in Jul/Aug 2026 and all migrated surfaces will inherit it via package upgrade. When in doubt about whether to add chrome overrides (positioning, padding, sizing) to mimic a future spec, don't — accept current SPDS default. See [[project_cap_overlay_drawer_inset]] memory + Drawer.experiment-log.md Gap 10 for the conversation transcript.

Rule 1 — Minimize the override surface, but only after audit; uncertainty defaults to KEEP
Every style override is technical debt that drifts as SPDS evolves. The target end state is a near-empty makeStyles hook (~1-2 classes), not a 7-rule patch replica of PanelShim. But the path to that target is per-rule audit, not bulk-delete.

Three drop-states for any PanelShim-derived override, in decreasing certainty:

Confirmed-drop ✅ — reviewer / design-team has explicitly said this v8 behavior is wrong / outdated for SPDS, OR you've personally verified v9 default matches the SPDS spec via spec doc or design Figma. Drop with confidence.
Likely-drop 🟡 — pure v8 aesthetic preservation (a color, padding, font-size choice that was v8's design language), no reason to think SPDS deviates. Drop only after screenshot verification (§C6) that v9 default doesn't break the surface. No screenshot = no drop.
Uncertain or Layer-4 ❌ — you don't know what v9 default does in this slot, OR you know v9 default is broken for the surface (icon-only Button rendering wide, etc.). Keep the override, mark with a // FIXME(C+): v9 default not verified for this slot, preserving v8 behavior comment so the next reviewer knows it's pending.
Critical: "I'm not sure if v9 default is OK here" → KEEP the override, do not drop. Dropping without verification is how PRs ship visual regressions. The §C6 visual gate exists precisely to convert 🟡 candidates into ✅ drops; do not skip §C6 to "make the diff cleaner".

Anti-pattern observed (Wave 6 P3, 2026-05-15): implementer read the SPDS-native principle as "drop everything PanelShim has" and deleted all 7 overrides in one commit without screenshots. Reviewer hadn't asked for that — they'd flagged exactly one override (backdrop). Dropping the others without verification turned a focused fix into 7 unverified behavior changes. Avoid this: drops happen one-at-a-time with evidence, not in bulk.

Rule 2 — No hardcoded values; use Fluent v9 tokens
Hardcoded rgba(...), hex colors, named colors, font sizes, spacing px values, etc. are not acceptable. Even if PanelShim hardcodes them, your file MUST NOT.

Where to look for the right token:

Domain	Token namespace	Examples
Colors / backgrounds / overlays	tokens.colorXxx	tokens.colorBackgroundOverlay, tokens.colorNeutralBackground1, tokens.colorBrandBackground
Spacing (padding / margin / gap)	tokens.spacingHorizontalXxx / tokens.spacingVerticalXxx	tokens.spacingHorizontalL (16px-ish), tokens.spacingVerticalXXL (24px-ish)
Typography (size / weight / line-height)	typographyStyles.xxx or tokens.fontXxx	typographyStyles.body1, tokens.fontSizeBase300
Borders / radius / strokes	tokens.borderRadiusXxx / tokens.strokeWidthXxx	tokens.borderRadiusMedium, tokens.strokeWidthThin
Shadows / elevation	tokens.shadowXxx	tokens.shadow16, tokens.shadow64
Import: import { tokens, typographyStyles } from '@fluentui/react-components'. Inside makeStyles:

const useStyles = makeStyles({
  myClass: {
    backgroundColor: tokens.colorNeutralBackground1,   // NOT 'rgba(255, 255, 255, 0.95)'
    paddingTop: tokens.spacingVerticalL,                // NOT '16px'
    ...typographyStyles.body1,                          // NOT { fontSize: '14px', lineHeight: '20px' }
  },
});
If you genuinely cannot find a token that matches the value you need: that's a strong signal you shouldn't be overriding at all (Rule 1) — accept v9 default. Hardcoded escape hatches are reserved for non-design values: drawer custom widths driven by content ('1298px' for an analytics chart), close-button geometry workarounds (Layer 4 below), etc.

Rule 3 — Per-override audit: understand what it does, then decide
For each PanelShim patch you're tempted to copy (or tempted to drop from an existing C+ port), fill in this template. The last row's decision lookup table:

Audit answer	Decision
v9 default == SPDS spec (verified via spec doc or design review)	✅ Drop
v9 default ≠ v8, no SPDS spec read, screenshot shows v9 looks fine	✅ Drop with screenshot evidence in PR
v9 default ≠ v8, no SPDS spec read, no screenshot taken	❌ Keep with // FIXME(C+): pending visual verification
v9 default is broken for this surface (Layer-4 — wide icon Button, clipped content, etc.)	❌ Keep, no philosophy reason can override
v9 default unknown	❌ Keep, must verify before dropping
Question	Example: .backdrop { background-color: ... }
What does this rule semantically control?	The overlay/scrim that dims the rest of the page when the drawer opens
What does v9 default do for this aspect?	Dark modal-style overlay (tokens.colorBackgroundOverlay)
What does v8 do?	Light frosted overlay (palette.whiteTranslucent40)
Was v8's value author-overridden, or v8 framework default?	v8 <Overlay> framework default (palette.whiteTranslucent40). The migrated file did not explicitly set backdrop color.
What does SPDS spec say?	Matches v9 default — drawers are modal, dark scrim
Decision	DROP override. Author didn't choose 24px-equivalent backdrop; just inherited v8 default. Now inherit v9 default.
A different patch may go the other way:

Question	Example: closeButton { width: 32px; minWidth: 'auto' }
What does this rule semantically control?	The clickable area / visual footprint of the drawer close button
What does v9 default do?	<Button> with min-width ~96px renders as a wide rectangle for icon-only content
What does v8 do?	32px square icon button
Was v8's value author-overridden, or v8 framework default?	v8 framework default for <Panel> close button. v8 already shipped sensible icon-only geometry.
What does SPDS spec say?	Icon-only buttons should be square (~32px) — v9 default min-width is a bug-by-omission for icon-only
Decision	KEEP override. v9 default is broken for the use case (Layer-4); has nothing to do with author intent.
The most important question in the audit: framework default vs author override
Was the v8 value something the migrated file's author explicitly chose (via styles={{...}}, custom className, hardcoded inline style), or did it just inherit from the v8 component's own framework defaults?

This single question resolves most ambiguity. Most "v8 vs v9 look different" deltas fall into one of two clean cases:

Case A — Both are framework defaults, author didn't touch them. The v8 value came from @fluentui/react/lib/components/X/X.styles.js (or its sharedXxxStyles helpers). The v9 value comes from @fluentui/react-components's default Griffel hook. Two design-system defaults, both legitimate. Accept v9 / SPDS — that's the new design system's spacing/color choices; v8's value isn't a product intent worth preserving.

Example: AnalyticsPanel's header padding-left. - v8: 24px (from sharedPaddingStyles inside Panel.styles.js — v8 framework default) - v9: 32px (from var(--spacingHorizontalXXL) inside useDrawerHeaderStyles.styles.js — v9 framework default) - AnalyticsPanel.tsx: no styles={{...}} override on padding - → Both framework defaults. Drop the PanelShim copy. Accept v9 32px.

Case B — Author explicitly set the v8 value via prop / styles / className. The author had a product reason (matches a specific design spec, fits content that wouldn't otherwise, intentional visual tightness). This is product intent. Preserve it via a tokens-based override in v9 — even at the cost of diverging from SPDS default.

Example: AnalyticsPanel's customWidth: '1298px' for AFA Phase 1. - v8: 1298px (explicit customWidth prop value — author chose it for chart fit) - v9: would default to size enum breakpoints (large = 940px) which clips the chart - → Author intent. Preserve via --fui-Drawer--size CSS variable.

Where to look to answer this question (for any v8 prop):

Read the migrated file. Grep for styles=, the prop name (e.g., customWidth), inline style={, className references. If you find it, case B — preserve.
Read the v8 component's .styles.ts / .styles.js in node_modules/.../@fluentui/react/lib/components/<Component>/. Find the slot's default value. If the migrated file's behavior just reflects this default (and no author override exists), case A — drop.
The PanelShim source is the third lookup: PanelShim copies framework defaults verbatim to preserve v8 visual fidelity. If a PanelShim patch maps directly to a framework default (case A), it's not load-bearing for any specific consumer — drop. If a PanelShim patch is a Layer-4 fix (v9 default is broken for the surface — like the icon-only Button width), it's load-bearing regardless of philosophy — keep.
Anti-pattern: deciding "v8 looks tighter / v9 looks more spacious therefore the author wanted tight" — this is wrong. The author may have wanted nothing specific and just used the v8 framework default. The visible difference is design-system evolution, not lost intent.

Layer-4 overrides (override exists because v9 default is objectively unusable for the surface — clipping, broken affordances, etc.) are kept independent of philosophy. Framework-default-vs-default deltas are dropped under SPDS-native.

When to NOT default to SPDS-native
The above is the default for any flight named "Stable Bundle Migration" / "SPDS Adoption" / "Design Refresh". Three rare cases where Fidelity (full PanelShim replication) is correct:

Flight is explicitly labeled "bundle swap only, no design changes" by the flight owner.
Surface is mid-feature-development; the design team hasn't approved SPDS adoption yet, and shipping a visual change is out-of-scope for the migration PR.
Migration is part of a hotfix path where any visual delta is too risky.
In those cases, document the philosophy explicitly in the PR description so reviewers know not to push back on PanelShim copies.

Common bias trap: AI agents and most engineers reach for PanelShim because copy-paste feels safe. Reviewer pushback like "no need to override, follow SPDS spec" almost always means the implementer defaulted to Fidelity when SPDS-native was the right answer. Re-read this section if you find yourself disagreeing with that pushback.

C1. Read the three sources before writing any code
Per file, before drafting the v9 JSX:

The v8 source file itself: which IPanelProps does it pass? What PanelType.<X> does it use? Does it provide headerText / onRenderHeader / onRenderNavigation / onRenderNavigationContent / onRenderBody / onRenderFooterContent / closeButtonAriaLabel / customWidth / isLightDismiss / hasCloseButton / layerProps.hostId / etc.? Make an exhaustive list — these are the only contract points we need to preserve.

PanelShim as the translation dictionary:

odsp-common/shared-react/fluentui-migration/src/components/Panel/PanelShim.tsx — how it maps each v8 prop to v9 render structure.
Panel.styles.ts (usePanelShimStyles) — what CSS classnames it applies to fix v9 defaults. For each prop in your list, find the corresponding shim className and copy the relevant rule into your file's makeStyles.
PanelShim.module.scss — how PanelType.<X> maps to --fui-Drawer--size values + responsive breakpoints. Copy only the size variant your file uses.
shimPanelProps.ts — the v8→v9 prop name translation (e.g. isBlocking: false → modalType: 'non-modal').
usePanelVisibility.ts — how it bridges v8 controlled/uncontrolled isOpen + lifecycle callbacks (onOpen / onOpened / onDismiss / onDismissed). Inline only the bridge logic your file needs (e.g. if your file only uses controlled isOpen + onDismiss, you don't need the full hook).
v9 stable bundle target — two entry points, pick the right one per component:

@msinternal/sharepoint-ui-react-stable has two public import paths, and they're not interchangeable:

Import path	What's exported	Webpack intent	Use for
@msinternal/sharepoint-ui-react-stable (root)	Button, Input, Tag, Card, Tooltip, Menu, Link, Badge, Image, Tabs, Table, Carousel, Textarea, Toolbar (~14 light/eager primitives)	Bundled into the main chunk — eager-loaded	Any small primitive used widely (close buttons, action buttons, body text wrappers, links, tags, etc.)
@msinternal/sharepoint-ui-react-stable/lib/LazyComponents (subpath)	OverlayDrawer, DrawerHeader/Title/Body/Footer, Avatar, Dialog, Toolbar, Search (5 heavy families with portals / layers / overlays)	Code-split into a separate async chunk — lazy-loaded	The drawer / dialog / portal-heavy component you're migrating into
For a Drawer migration this means: OverlayDrawer family from /lib/LazyComponents, but Button (e.g. the close button inside the DrawerHeaderTitle action slot) from the root. Importing Button from /lib/LazyComponents will fail because it isn't exported there.

Either way: do NOT import the migrated components from @fluentui/react-components. That's the whole point of the stable-bundle flight gate. If a component you need isn't yet in either stable entry (e.g. Body1 / Text family at time of writing), it's fine to leave that single import on @fluentui/react-components and note it as a follow-up — don't block the migration on it.

C1.5. v9 Drawer wrapper defaults + v8 onRender* family asymmetry
The §C2 translation table assumes you know two things that don't fall out of "just read PanelShim": (a) v8 Panel has a pair of onRender<X> vs onRender<X>Content props per slot whose runtime behavior is OPPOSITE, and (b) each v9 Drawer family wrapper has non-trivial defaults that may conflict with what the v8 caller's content assumed. Skipping this audit shipped the BoostPanel PR-P4 footer regression (commit 9bfe2a3f76ec): Save/Cancel buttons offset by 32px, full-width feedback bar shrunk to mid-panel.

Cheat sheet 1 — v8 onRender<X> vs onRender<X>Content are NOT symmetric
Source: v8 Panel.base.js _onRenderFooter (and the parallel header/body/navigation methods).

v8 prop name	What v8 actually renders	Implies for v9 mapping
onRender<X>={fn} (no "Content" suffix)	Replaces the entire <X> slot — no .ms-Panel-<X> wrapper, no .ms-Panel-<X>Inner wrapper, no Panel-supplied padding. Caller content renders raw.	Wrapping in <Drawer<X>> ADDS a wrapper that did not exist in v8. Audit its defaults (Cheat Sheet 2) against the caller's content before keeping or overriding.
onRender<X>Content={fn}	Only replaces the innermost content; outer .ms-Panel-<X> + .ms-Panel-<X>Inner wrappers + 24px horizontal sharedPadding + (footer/content) 16px vertical padding all preserved.	The caller already assumed a padded wrapper. <Drawer<X>> with v9 defaults is approximately equivalent; PanelShim's padding: 0 + footerInner pattern only matters if your v9 padding must match v8's 24px exactly.
The two props differ by one suffix; in older codebases the prop is sometimes wired to a method named _onRenderFooterContent (or similar) — that's just the method name, not the prop name. Always check the prop name on <Panel>, not the helper method.

Cheat sheet 2 — v9 Drawer family wrapper defaults
Source: @fluentui/react-drawer@9.x/lib-commonjs/components/Drawer<X>/useDrawer<X>Styles.styles.raw.js (Griffel makeResetStyles output). Grep when uncertain:

find common/temp/node_modules/.pnpm -path '*react-drawer*' -name 'useDrawer*Styles.styles.raw.js'
v9 component	Layout-affecting defaults	Notable surface-breaking case
OverlayDrawer (surface root)	position: fixed; top: 0; bottom: 0; right: 0 (for position='end'); width via --fui-Drawer--size CSS var	v8 file's positioning className (e.g. top: $suiteNavHeight) was dead code in v8; activates here for the first time (§C10 anti-pattern)
DrawerHeader	padding: spacingHorizontalXXL spacingHorizontalXXL spacingHorizontalS ≈ 16px 32px 8px; display: flex; flex-direction: column	When v8 used onRenderHeader={fn} (no wrapper) — caller's header gets v9 padding stacked on its own
DrawerHeaderTitle	padding-left/right: spacingHorizontalXXL ≈ 32px each; default typography	Usually OK. action slot is a flex item — v9 <Button> default min-width ~96px breaks icon-only close buttons (Layer-4 override per §C3 example)
DrawerBody	padding: 0 spacingHorizontalXXL ≈ 0 32px; scrollable container	When v8 used onRenderBody={fn} (no wrapper) — caller's full-bleed content gets clipped to 32px-inset
DrawerFooter	padding: 16px 32px 24px (= spacingVerticalL spacingHorizontalXXL spacingVerticalXXL); display: flex; justify-content: flex-start; align-items: center; columnGap: spacingHorizontalS (~8px)	When v8 used onRenderFooter={fn} AND caller's content has its own padding / background-color expecting full-width / vertical block stacking — BoostPanel PR-P4.
The audit — cross-reference, NOT a blanket "always override"
§C0 Rule 3 framework applies here too: audit per slot, don't override by reflex. The bug class isn't "v9 wrapper has non-trivial defaults" (that's normal). It's "v9 wrapper's defaults conflict with what the v8 caller's content assumed about its wrapper". Many onRender<X> cases have NO conflict and want v9 defaults; some have conflict and need overrides.

For each v8 onRender<X> (wrapper-bypass family, no "Content" suffix) in the source, open the fn it points to and audit every child element. Three questions; any YES → the corresponding v9 wrapper needs a neutralizing override:

Does the child have its own padding? v9 wrapper padding stacks additively — 12px (caller) + 32px (v9 default) = 44px gap (BoostPanel Issue 2: Save/Cancel buttons drifted right).
Does the child use background-color / a colored bar without explicit width: 100%? v9 display: flex + justify-content: flex-start makes that child a flex item sized to its natural content width, NOT the container width — full-bleed bars shrink to mid-panel (BoostPanel Issue 3: feedback bar only covered the middle).
Does the child structure assume block stacking (two children stacked vertically inside one outer <div>)? v9 wrapper's display: flex may rearrange them into a row.
Common neutralizations when any YES applies: - padding: 0 — eliminates additive padding - display: block — restores block stacking AND lets children stretch to container width - Both together — full v8-wrapper-equivalent behavior (BoostPanel PR-P4 fix)

ALL NO → use v9 default. SPDS-native per §C0 Rule 1.

For the onRender<X>Content (wrapper-preserve) variant the audit is different — v8 already gave the content a padded wrapper, so the v9 wrapper's padding is roughly equivalent. Choose: (a) <Drawer<X>> with v9 default padding (≈ matches v8's 24px), or (b) PanelShim's Drawer<X> { padding: 0 } + inner div { padding: 16px 24px } pattern when exact v8 parity matters.

Worked example — BoostPanel PR-P4 (commit 9bfe2a3f76ec)
v8 source: <Panel onRenderFooter={this._onRenderFooterContent}>. Prop name = onRenderFooter (wrapper-bypass per Cheat Sheet 1) — method name _onRenderFooterContent is just a naming choice in the file. The audit is on the prop.

The fn returns <BoostPanelFooter> which renders:

<div>
  <div className=footerBoostButtonStack>  // padding-left: 12px
    <Stack horizontal>{SaveButton}{CancelButton}</Stack>
  </div>
  <div className=boostPanelFooterFeedback>  // height: 52px; background-color: themeLighterAlt; NO explicit width
    text + 2 icon buttons
  </div>
</div>
Audit: - footerBoostButtonStack has padding-left: 12px → Q1 YES (additive) - boostPanelFooterFeedback has background-color and no width → Q2 YES (won't stretch as flex item) - Outer <div> stacks two block children vertically → Q3 YES (flex would row them)

3-for-3 → DrawerFooter override required: padding: 0; display: block. Carried as a Layer-4 entry in the file's makeStyles hook.

Contrast — a hypothetical file with <Panel onRenderFooter={() => <Stack horizontal><Primary/><Default/></Stack>}>: no caller padding, no background-color, no block stacking. Audit 3-for-NO → use v9 default. display: flex; columnGap: 8px is exactly what that footer wants.

C2. Build a prop-by-prop translation table for the file
Prerequisite: for any onRender<X> prop (NO "Content" suffix) in the v8 source, run the §C1.5 audit. The table rows below for those props are placeholders — the actual override depends on the audit result.

Write down (as a comment block at the top of your edit, or in the planner's plan.md) what each v8 prop becomes in v9:

v8 prop	v9 mapping	CSS override required
headerText='Run flow'	<DrawerHeaderTitle>Run flow</DrawerHeaderTitle>	reduce DrawerHeader top padding to v8 default (~12px) via className
type={PanelType.smallFixedFar}	style={{ '--fui-Drawer--size': '340px' }} + responsive media queries	borrow .smallFixedPanel rules from PanelShim.module.scss
hasCloseButton (default true)	<DrawerHeaderTitle action={<Button icon={<Dismiss24Regular/>} onClick={dismiss}/>}>	match v8 close button width 32px, margin-right 14px
onRenderFooterContent={fn}	<DrawerFooter><div className={styles.footerInner}>{fn()}</div></DrawerFooter>	DrawerFooter padding 0; inner div padding 16px 24px
onRenderFooter={fn} (NO "Content" — wrapper-bypass per §C1.5)	<DrawerFooter className={fn-audit-result}>{fn()}</DrawerFooter>	Run §C1.5 audit on fn's content. 3-for-NO → use v9 default. Any YES → typically DrawerFooter { padding: 0; display: block }. BoostPanel PR-P4 worked example.
onRenderHeader={fn} (NO "Content" — wrapper-bypass per §C1.5)	<DrawerHeader className={fn-audit-result}>{fn()}</DrawerHeader> (rare — most files use headerText)	Run §C1.5 audit. Likely DrawerHeader { padding: 0 } if caller content has its own padding/layout.
onRenderBody={fn} (NO "Content" — wrapper-bypass per §C1.5)	<DrawerBody className={fn-audit-result}>{fn()}</DrawerBody> (rare — most files put body content as children)	Run §C1.5 audit. Likely DrawerBody { padding: 0 } if caller content is full-bleed.
isLightDismiss	onOpenChange={(ev, data) => data.type === 'backdropClick' && onDismiss()}	none
isBlocking={false}	modalType='non-modal'	none
customWidth={X}	style={{ '--fui-Drawer--size': X }}	none
onDismiss / onDismissed	wrap in onOpenChange + setTimeout(onDismissed, ANIMATION_DURATION)	none — copy MODAL_DISMISS_DELAY constant
onRenderNavigationContent	render output inside DrawerHeader directly (NOT in DrawerHeaderTitle action slot)	navigation row uses paddingTop: 18px; padding: 0 per PanelShim.commands
componentRef (IPanel) — .open()/.close()/.dismiss()	inline useImperativeHandle exposing the same methods	none
layerProps.hostId (inline panel)	manual mountNode div creation — only if the file actually uses inline panel	+ workaround surfaceMotion={null} per fluent issue #33583
If your file's v8 source does NOT use a particular prop (e.g. no onRenderNavigationContent, no customWidth), leave it out of your translation. The whole point of Pattern C+ over PanelShim is to only carry the patches the caller actually needs.

Also drop translations for props that ARE in the v8 source but no caller ever overrides from the default. Example: AnalyticsPanel declares isLightDismiss: true in its defaultAnalyticsPanelProps and no caller overrides it, so a v9 handler like if (data.type === 'backdropClick' && props.isLightDismiss === false) return; is unreachable defensive code. Before writing a defensive prop check in the v9 translation, grep all call sites of the migrated component — if no caller passes a value different from the default, the check is dead. Delete it; v9 default semantics apply.

C2.5. Full-branch v8 → v9 SPDS sweep — don't leave a half-state inside the migrated Drawer
Pattern C+ replaces the v8 outer container (<Panel>) with a v9 SPDS-stable container (<OverlayDrawer> + family). The v9 branch is a complete v9-stable render tree — it MUST NOT render v8 components inside.

If the v8 source renders v8 controls (<PrimaryButton>, <DefaultButton>, <IconButton>, <TextField>, <Link>, <Spinner>, <ContextualMenu>, …) inside the <Panel>, the migration is incomplete if those same v8 controls still appear inside the v9 branch's <OverlayDrawer>. Audit every v8 import in the file that meets BOTH conditions:

SPDS-ready — present in SPDS.inventory.md §2 (root eager) or §3 (lazy entry). If listed in §5A (umbrella wire-up pending), that's a separate prerequisite PR — flag and continue. If listed in §5C (not in SPDS at all), v8 stays inside the v9 branch — out of scope.
Currently rendered inside the migrated Drawer — anywhere under the JSX subtree being moved from <Panel> to <OverlayDrawer>. Imports referenced ONLY outside this subtree (e.g. a <Dialog> rendered as a sibling of the panel) don't count.
Both YES → swap to the v9 SPDS-stable equivalent inside the v9 branch of THIS PR. The v8 branch (flight-OFF) keeps using the v8 controls — no change to legacy render.

Why this rule exists — observed on PR 2219447 (ContentApprovalPanel, Wave 6 PR-P5), pushed back by reviewer 2026-05-19: the v9 branch rendered <OverlayDrawer> outer but still had <PrimaryButton>/<DefaultButton>/<TextField>/<Link> inside — a visually mixed v9+v8 surface that contradicts flight 1535's "SharePoint Stable Bundle Migration" intent.

The previous wrong framing: treating outer Drawer migration (Pattern C+) and inner-content v8 → v9 swap as separate PR waves on the analogy of Amplify Wave-3 (outer) → Wave-4 (inner). That analogy only fits fan-out cases (Wave-3 touched 15 files, Wave-4 touched 10 of those 15 — splitting let the inner wave start before the outer wave finished verification across all 15). For single-file Pattern C+ migrations, the inner v8 controls and the outer Panel are the same nature of work (v8 → v9 SPDS rewrite, same flight gate, single visual verification trip). Doing them in one PR is strictly cheaper for everyone.

When to genuinely defer (rare): - A specific v8 control's v9 SPDS equivalent has a known visual regression that needs design-team sign-off — leave it in the v9 branch with // FIXME(Pattern C+ v8 swap deferred): <reason + work-item link> and call it out in the PR description - The umbrella wire-up for that family is pending (per SPDS.inventory.md §5A) — leave it, flag the dependency

v8 → v9 SPDS-stable swap cheat sheet (use during translation table build in §C2):

v8 source (@ms/office-ui-fabric-react-bundle / @fluentui/react/lib/...)	v9 SPDS-stable	API translation
<Link target href>	Link from @msinternal/sharepoint-ui-react-stable (§2 eager)	Near-direct — href/target/children compatible
<PrimaryButton text={t} label={l} onClick={f}>	<Button appearance='primary' aria-label={l} onClick={f}>{t}</Button> from -stable (§2 eager)	text → children; label → aria-label; disabled/onClick unchanged
<DefaultButton ...>	<Button ...> (default appearance)	Same translation as PrimaryButton
<IconButton iconProps={{iconName:'Cross'}}>	<Button appearance='subtle' icon={<DismissIcon/>}> where DismissIcon = bundleIcon(Dismiss24Filled, Dismiss24Regular)	iconProps → icon slot, AND the icon must be a bundleIcon (see §C2.5.1 below) sourced from @msinternal/sharepoint-ui-react-icons (SPDS.inventory.md §5B) — NOT a single Dismiss24Regular from @fluentui/react-icons
<TextField onChange={(e,v) => f(v)}> (single-line)	<Input onChange={(e, data) => f(data.value)}> from -stable (§2 narrow — only Input + InputOnChangeData)	onChange signature changes
<TextField multiline rows={N} label={l} onChange>	<><Label htmlFor='x'>{l}</Label><Textarea id='x' rows={N} onChange={(e, data) => f(data.value)}/></> from -stable (§2 narrow — only Textarea + TextareaOnChangeData) + Label (when wired)	label prop disappears (use separate <Label htmlFor>); multiline disappears (use Textarea component); onChange signature changes
<Spinner size={SpinnerSize.large} label='...'>	<Spinner size='large' label='...'> from -stable (when wired — SPDS.inventory.md §5A doesn't yet list Spinner; treat as deferred until umbrella adds it)	SpinnerSize enum → string union; otherwise compatible
type IButtonProps (in React.ReactElement<IButtonProps>[] etc.)	v9 ButtonProps from @fluentui/react-components	If used in array typing of helper return values, the v9 branch should NOT reuse the v8-typed helper — render v9 buttons inline OR add a parallel v9-typed helper
If a v8 control is NOT in SPDS.inventory.md §2/§3/§5A, leave it in BOTH branches (out of scope for this PR) and note "v8 <Foo> retained in v9 branch — not yet SPDS" in the PR description.

This rule applies regardless of whether you're doing Pattern A or Pattern C+ on the outer container — but Pattern C+ is where the half-state is most visually obvious. Pattern A's outer container is already v9; if it has v8 inner controls, those would have been caught at the Wave-3 review stage when the outer was migrated.

C2.5.1. Icons used inside SPDS Buttons MUST use bundleIcon(Filled, Regular)
The SPDS storybook button-icon-guidance says "MUST: Always use bundled icons with buttons. Use bundleIcon() to combine filled and regular icon variants." (sharedcontrols.odsp.microsoft.net/sharepoint-storybook/.../buttons-button--docs#icon-guidance). This is not just an import-path convention — bundleIcon(Filled, Regular) is a v9 utility that returns a single React component which renders the Filled variant when v9 Button's internal context indicates hover / focus / pressed, and the Regular variant otherwise. Single XxxRegular icons inside a Button miss this state-driven swap.

Recipe (works in Pattern C+ v9 branch and Pattern A inner-content swaps alike):

// Import bundleIcon + the Filled/Regular pair from the SPDS umbrella (NOT @fluentui/react-icons):
import { bundleIcon, Dismiss24Filled, Dismiss24Regular } from '@msinternal/sharepoint-ui-react-icons';

// Declare the bundled icon at module level (per render is wasteful; bundleIcon returns a stable component):
const DismissIcon: ReturnType<typeof bundleIcon> = bundleIcon(Dismiss24Filled, Dismiss24Regular);

// Use in JSX exactly like any v9 icon:
<Button appearance='subtle' icon={<DismissIcon />} onClick={...} aria-label={...} />
Why @msinternal/sharepoint-ui-react-icons and not @fluentui/react-icons directly: @msinternal/sharepoint-ui-react-icons/src/system-icons.ts does export * from '@fluentui/react-icons' and additionally exports SP-specific custom icons + the bundleIcon utility. Importing from the SPDS umbrella gets you the entire icon catalog + bundleIcon in one source, matches the SPDS pattern already established by react-tag's TagDismissIcon and react-header's ChevronLeftIcon (grep -rn 'bundleIcon' design-systems/sharepoint/ for the canonical examples), and keeps icon imports consistent with the SPDS-stable v9 component imports elsewhere in the file. There's no functional downside (the underlying icon class instances are identical) and the SPDS team owns the version pin.

package.json change required: if the owning app doesn't yet declare @msinternal/sharepoint-ui-react-icons, add "@msinternal/sharepoint-ui-react-icons": "workspace:*" to dependencies and run rush update once. Same sequencing rule as the umbrella deps in §"Dependency declaration — required if missing": edit package.json → rush update → rush build. This applied to PR 2218733 (sp-pages didn't have it; one-line add + lockfile bump scoped to that single dep).

Per-icon decision: every icon rendered inside an SPDS <Button> (appearance='subtle', 'primary', default — any) needs bundleIcon. Icons rendered as standalone (in a <div>, <span>, etc., outside a Button) don't need it — they have no Button context to consume the filled/regular signal.

Worked example: PR 2218733 (AnalyticsPanel PR-P3) — close-button <Dismiss24Regular> → bundleIcon(Dismiss24Filled, Dismiss24Regular), commit ff1bf6f0d947. Reviewer pushback that triggered this section: Yidan Sun, thread 21309932 (2026-05-21).

C3. Local override hook — Griffel makeStyles, NOT .module.scss, token-only values
Create a makeStyles hook at the top of the migrated .tsx file (or in a sibling .styles.ts) that contains only the overrides that passed the §C0 Rule-3 audit. Per §C0 Rule 1, the default state of this hook should be near-empty.

Use Griffel makeStyles from @fluentui/react-components, not .module.scss. Griffel keeps styles co-located with the component, gives strongly-typed class lookups (classes.commands is a real symbol, not a stringly-typed import), matches how PanelShim itself is structured, and avoids the indirection of "scss file in src/, tsx in src-unsafe/, magic webpack alias linking them" (a real gotcha that bit P3 in Wave 6). .module.scss is the wrong tool for Pattern C+ overrides; reviewer pushback on the choice is consistent.

Token-only values. Per §C0 Rule 2, no hardcoded '14px' / 'rgba(...)' / '#fff' literals. Use tokens.* / typographyStyles.* from @fluentui/react-components:

import { tokens, typographyStyles, makeStyles } from '@fluentui/react-components';

// Minimal example — only overrides that pass the §C0 Rule-3 audit:
// 1. closeButton width: kept because v9 Button default min-width breaks icon-only buttons
//    (Layer-4 override — v9 default is unusable for the surface, independent of philosophy)
type DrawerStyleKey = 'closeButton';

const useDrawerStyles: () => Record<DrawerStyleKey, string> = makeStyles({
  closeButton: {
    minWidth: 'auto',                          // 'auto' is a CSS keyword, not a hardcoded value — OK
    width: '32px',                              // no `tokens` for icon-button-width; documented exception
    marginRight: tokens.spacingHorizontalSNudge // token equivalent of v8 14px (NOT hardcoded '14px')
  }
});
Notice what's absent vs the old style: no drawerHeader padding override (v9 default accepted), no backdrop color override (v9 dark modal accepted), no footerInner padding override (v9 default accepted), no content background override (v9 default accepted). The only kept rule is the close-button geometry workaround for a v9 default that's broken for icon-only buttons.

When you can't find a token: that's usually a signal to drop the override (Rule 1). The rare exception is non-design values driven by content (e.g. '1298px' drawer width for an analytics chart that won't fit otherwise) — those go inline on the component as escape hatches, not in the styles hook.

Don't copy patches you don't use. Don't copy patches you can use but shouldn't (§C0 Rule 3). Don't hardcode values (§C0 Rule 2).

Anti-pattern: copying PanelShim patches without running the §C0 Rule-3 audit — a PanelShim patch that fixes v9 default ≠ patch the new file must carry. The Wave 6 P3 .backdrop case (white scrim) and commands paddingTop case (18px) were both copied this way and both got reviewer pushback.

C4. Sizing — use CSS custom property, scoped via Griffel makeStyles, never via .module.scss
v9 <OverlayDrawer size='small'> doesn't accept the 7 v8 PanelType values. The width is set via the --fui-Drawer--size CSS variable.

Hard rule — --fui-* (and any v9-only token) NEVER lives in .module.scss under Pattern C+. The Pattern C+ migration keeps the file's existing scss classes (e.g. .boostPanel, .planCreationPanel) referenced from BOTH the v8 <Panel> branch (via defaultProps.className or direct className={styles.X}) AND the v9 <OverlayDrawer> branch. Adding --fui-Drawer--size: 340px to that shared class leaks the CSS variable into the v8 path's DOM scope — no flight gate protects it, and the var cascades into any nested v9 surface that happens to render under the Panel (lazy v9 controls, portals, future migrations). It looks "fine" in the v9 branch and "fine" in the v8 branch today — the breakage is silent and remote.

Use a Griffel makeStyles hook + a small FC wrapper around OverlayDrawer, so the class — and therefore the CSS variable — only lands on the v9 element:

import { makeStyles, mergeClasses, type OverlayDrawerProps } from '@fluentui/react-components';

type DrawerStyleKey = 'drawerSize';

const useXxxDrawerStyles: () => Record<DrawerStyleKey, string> = makeStyles({
  drawerSize: { '--fui-Drawer--size': '340px' }
});

// Function component: call the hook directly in render.
// Class component: extract a small FC wrapper because hooks can't run on `this`.
const XxxOverlayDrawer: React.FC<OverlayDrawerProps> = ({ className, ...rest }) => {
  const drawerStyles: Record<DrawerStyleKey, string> = useXxxDrawerStyles();
  return <OverlayDrawer {...rest} className={mergeClasses(className, drawerStyles.drawerSize)} />;
};

// v9 render branch — use the wrapper, not <OverlayDrawer> directly:
// <XxxOverlayDrawer open={...} onOpenChange={...} position='end'>...</XxxOverlayDrawer>
customWidth={X} from v8 → translate to a drawerSize rule in this hook ('--fui-Drawer--size': X), NOT to inline style={{ '--fui-Drawer--size': X }} on the JSX and NOT to a scss class. Inline style works but spreads the convention thin across files; the hook + wrapper is the canonical shape.

For medium / large / extraLarge and their responsive breakpoints, encode the media queries as additional rules inside the same makeStyles hook (e.g. '@media (min-width: 1024px)': { '--fui-Drawer--size': '644px' }). Do not port them as scss media blocks — same leak hazard.

The SIZE_MAP table below is the source of truth for v8 PanelType → v9 width values; it's a lookup, not a code snippet to inline anywhere:

v8 PanelType	--fui-Drawer--size
smallFluid	100vw
smallFixedNear	272px
smallFixedFar	340px
medium	592px (644px above 1024px viewport)
large	auto (requires responsive left-margin media query)
largeFixed	940px
extraLarge	auto
C5. Flight gate — same shadow-rename idea as Pattern A
const useStable: boolean = isXxxStableBundleEnabled();
if (!useStable) {
  return <Panel {...v8Props}>{children}</Panel>;
}
// useStable === true: render v9 OverlayDrawer with the per-file translation
return (
  <OverlayDrawer open={isOpen} onOpenChange={onOpenChange} position='end' style={drawerStyle}>
    <DrawerHeader className={styles.drawerHeader}>
      <DrawerHeaderTitle action={closeButton} className={styles.drawerHeaderTitle}>
        {headerText}
      </DrawerHeaderTitle>
    </DrawerHeader>
    <DrawerBody>{children}</DrawerBody>
    {onRenderFooterContent && (
      <DrawerFooter className={styles.drawerFooter}>
        <div className={styles.footerInner}>{onRenderFooterContent()}</div>
      </DrawerFooter>
    )}
  </OverlayDrawer>
);
Two render trees inside the same component, gated by the flight. JSX duplication is acceptable in Pattern C+ — readability > shared-tree-DRY for a temporary migration period.

C5.1. Type the onOpenChange handler via OverlayDrawerProps, not the v9 inner event/data types
When you write the v9 onOpenChange handler (class arrow method or React.useCallback), use NonNullable<OverlayDrawerProps['onOpenChange']> as its type. Pull OverlayDrawerProps from the same SPDS-stable umbrella as OverlayDrawer:

import {
  OverlayDrawer,
  DrawerHeader,
  DrawerHeaderTitle,
  DrawerBody,
  DrawerFooter,
  type OverlayDrawerProps                       // ← also from -stable/lib/LazyComponents
} from '@msinternal/sharepoint-ui-react-stable/lib/LazyComponents';

// Class arrow method (sp-pages drawers — ContentApprovalPanel / BoostPanel / ManagePagePanel pattern):
private _onOpenChange: NonNullable<OverlayDrawerProps['onOpenChange']> = (event, data) => {
  if (!data.open) {
    this.props.onDismissPanel();
  }
};

// Function component variant (Amplify inner-content batch pattern):
const onOpenChange: NonNullable<OverlayDrawerProps['onOpenChange']> = React.useCallback(
  (event, data) => {
    if (!data.open) {
      props.onDismiss();
    }
  },
  [props]
);
Why not explicit (event: DialogOpenChangeEvent, data: DialogOpenChangeData) => void:

OverlayDrawerProps['onOpenChange'] is typed ((event: DialogOpenChangeEvent, data: DialogOpenChangeData) => void) | undefined (onOpenChange? is an optional prop on OverlayDrawer). NonNullable<...> strips the undefined so the handler is the bare function type and assignable.
The v9 event/data type names (DialogOpenChangeEvent, DialogOpenChangeData) come from @fluentui/react-dialog and are also re-exported through @msinternal/sharepoint-ui-react-stable/lib/LazyComponents (via dialog-stable). Both work, but referencing them by name pins the handler to those specific type names; using OverlayDrawerProps['onOpenChange'] follows whatever v9 picks in the future automatically.
Avoids a @fluentui/react-components type-only import just to name two interfaces — every v9 surface symbol comes from the SPDS-stable umbrella.
Common in the repo: ~20 src usages of NonNullable<XxxProps['onOpenChange'|'onSave'|'onRenderItem'|...]> across viva-home / sp-pages / ngsp-app / sp-canvas-edit / sp-site-content-agent / ngsp-site-creation / sp-pages-content-panel. NonNullable<PopoverProps['onOpenChange']> precedes the OverlayDrawer pattern (NavigationOrgTree.tsx). Reviewers recognize the shape; no need to fall back to explicit (event: ..., data: ...) => void signatures.

Anti-pattern (do not use): import type { DialogOpenChangeEvent, DialogOpenChangeData } from '@fluentui/react-components'; followed by an explicit (event: DialogOpenChangeEvent, data: DialogOpenChangeData) => void signature. Pinned to specific type names; crosses package boundaries unnecessarily; verbose. Reviewer pushback observed on PR 2219419 (BoostPanel) and PR 2219447 (ContentApprovalPanel) — both reverted to the NonNullable<OverlayDrawerProps['onOpenChange']> form post-feedback (commits 9c5544954342 and 46bb80714227).

C6. Visual verification is MANDATORY
Unlike Pattern A (where alias swap guarantees pixel parity by construction), Pattern C+ is hand-tuned and CAN regress. Reviewer/evaluator must:

Take a browser_screenshot() with flight OFF (v8 path).
Take a browser_screenshot() with flight ON (v9 path, this PR's output).
Compare side-by-side — top padding, footer padding, close button position, drawer width, header spacing, body scroll behavior.
If any pixel-level mismatch, return to C3 and refine the CSS overrides.
This is a hard gate. Don't merge Pattern C+ work without before/after pixel comparison evidence in the PR description.

C7. Tests
Same rules as Pattern A §A4 (jest.requireActual to preserve other flight exports; default mock to false; focused describe block for flight-on path). The v9 render tree may need additional snapshot/DOM assertions because the v9 JSX is meaningfully different from v8 (different elements, different aria attrs).

C8. Build & test
Same commands as Pattern A §A5.

C9. Rush change BEFORE pushing — required for publishable packages
Pattern C+ frequently edits files inside publishable packages (e.g. odsp-common/odsp-shared-react, odsp-common/shared-react/*). The repo's pre-push hook will REJECT a push that modifies a publishable package without an accompanying common/changes/<package>/<file>.json entry.

After committing your code edits and BEFORE pushing:

rush change --bulk --bump-type none \
  --message "<short description of the surface migrated>" \
  --commit
--bulk is required when combining --bump-type and --message (rush will error without it).
--bump-type none is correct for migration-flight gating — we are not introducing a SemVer-breaking change.
--commit makes rush stage AND commit the generated change files automatically; otherwise they sit unstaged.
The generated change files live under common/changes/<package>/. One file is generated per affected publishable package; --bulk creates them all in one go. Confirm via:

git log --oneline -1   # should be "Rush change"
ls common/changes/<your-package>/
If you forget this step, the pre-push hook prints:

❌ To resolve this error, run "rush change". This will generate change description files that must be committed to source control. Validation failed with 1 error(s). Push aborted.

Recover by running rush change --bulk --bump-type none --message "..." --commit then re-push.

ow-team agents: the generator (per ow-generator.md) is forbidden from pushing. The orchestrator (per ow-orchestrator.md) has Bash but no ow-git. If the generator commits without running rush change, the push will fail and the orchestrator may stall (it has no clear recovery path documented). Generator MUST include rush change as the last sub-step of its Step 5 (commit) when any modified file belongs to a publishable package.

How to tell if a package is publishable: read its package.json and check "private": false (or absence of "private"). All odsp-common/* shared-react libraries are publishable. Most sp-client/apps/* (NGSP, SP Start, etc.) are NOT publishable ("private": true) — those don't need a change file.

C10. Inline comments must read for a reader who has never seen this skill
Don't leak migration vocabulary into the production code. Future readers (other engineers, future-you a year later, designers looking at the file) have not read this playbook. To them, "Pattern C+", "PanelShim-derived overrides", "SPDS-native", "§C0 Rule 1", "Layer-4" are noise.

Anti-pattern (observed in Wave 6 P3, removed in commit 359c18c6a52f):

// Per ReplaceComponent skill §C0: SPDS-native by default. No PanelShim-derived
// style overrides — accept v9 / SPDS defaults for header padding, footer padding,
// backdrop color, close-button geometry. Only kept: drawer width (content-driven,
// analytics chart needs 1298px in AFA Phase1) and socialBarPanel className.
// The `top: $suiteNavHeight` rule below was originally written for v8 <Panel>
// to push the analytics drawer below the SharePoint suite-nav bar. In v8 it
// was effectively dead code: v8 Panel passes `className` to a non-positioned
// inner wrapper, so `top` never applied and the drawer always rendered from
// `top: 0`. The Pattern C+ migration to v9 <OverlayDrawer> applies `className`
// directly to the positioned drawer root, which activates this rule for the
// first time. ...
Both of these explain the migration decision process, not what the code does. The migration decision belongs in:

PR description — visible to reviewers, gets indexed by PR-search tooling, lives forever.
Commit message — preserved in git log, accessible via git blame follow.
Skill file / experiment log — the playbook itself.
In the code, default to NO comment. Only add a comment when the WHY is non-obvious AND can be expressed without referring to internal vocabulary. Two tests before writing a comment:

Outsider test: If you handed this file to a SharePoint engineer who had never heard of "Pattern C+", "PanelShim", or this migration playbook, would the comment still make sense?
Redundancy test: Does the comment add information the code doesn't already convey? (Self-documenting code = no comment.)
Concrete from Wave 6 P3 cleanup:

// BAD (9 lines, internal-vocab):
// The `top: $suiteNavHeight` rule was originally written for v8 <Panel>...
// In v8 it was effectively dead code: v8 Panel passes `className` to a
// non-positioned inner wrapper... The Pattern C+ migration to v9 <OverlayDrawer>...
.socialBarPanel { top: $suiteNavHeight; ... }

// STILL BAD (1 line, but redundant — variable name already says it):
// Offset the analytics drawer below the SharePoint suite-nav bar.
.socialBarPanel { top: $suiteNavHeight; ... }

// CORRECT (no comment — `$suiteNavHeight` is self-documenting):
.socialBarPanel { top: $suiteNavHeight; ... }
Shortening a bad comment isn't the same as fixing it. If the underlying CSS / TSX is self-documenting through variable names, default-prop names, or import paths, the comment is just noise regardless of length. Delete entirely.

Generalize: comments that say "I did X because of process Y" are almost always misplaced. The right place for "process Y" is the PR description or commit log. The code should describe what it is, not how it got here. And if the code already describes what it is via well-chosen names, the comment shouldn't exist at all.

PR-creation flow (when the agent also opens the PR)
Branch naming: ADO repo policy = user/<alias>/<topic>. Singular user, alias matches git config user.name. Plural users/... is rejected with VS403660. PR1 hit this — rename with git branch -m and re-push.
rush change: run after commit, non-interactive: rush change --bump-type none --message "<short>" --commit. Most apps under sp-client/apps/ aren't publishable — expect "No changes were detected to relevant packages".
Pre-push hook rejects incidental lockfile diffs. If a stray rush update slipped in, revert lockfile and amend: git checkout main -- common/config/rush/pnpm-lock.yaml && git commit --amend --no-edit.
PR organization for batch (Pattern A) PRs — PR 2164312 organized 28 files by Pillar / Section / file: Pillar: Publish Section: Templates FullPageTemplatesGallery.tsx — Button, SplitButton, Menu, … Section: Campaigns CreateCampaignButton.tsx — Button CampaignEmptyState.tsx — Image … Pillar: Discover … Adopt the same shape — it makes review and rollback scoping much easier.
Draft PR via ADO MCP (mcp__plugin_odsp-web-mcp-servers-opt-in_ado__repo_pull_request_write action create, isDraft: true). PR description max 4000 chars — keep it tight. Always include the controlling flight or KS GUID in the recovery section.
Required PR description sections (every migration PR)
A reviewer reading the diff cannot tell which UI surface is affected by a component swap. The PR description MUST include the following four sections so the reviewer can find the surface in product, take before/after screenshots, and verify behavior:

(a) Summary — what the PR does in 1-2 sentences. Target file(s). Pattern (A flight or B KS) and which flight/KS GUID gates the swap.

(b) Where to find this surface (UI location) — REQUIRED. Three sub-fields: - Product surface: human-readable name of the drawer/dialog/panel (e.g. "Viva Amplify news-distribution drawer", "Lists Columns Editor", "Site Settings panel"). - Trigger: exact user action that opens the surface — button label, command bar item, gear icon, auto-open-on-first-load, etc. - Repro steps: 1-3 lines a reviewer can follow on a real SP tenant. Include a representative example URL pattern (e.g. https://<tenant>.sharepoint.com/sites/<site>/SitePages/<page>.aspx).

If the component is a shim used by many call sites (PanelShim, ContextualMenuShim, etc.), list the top 3-5 consumer surfaces by visibility with their triggers, and say which one(s) the screenshots cover.

Trigger verification protocol — converge from independent sources, do not trust the class name

The class name is a clue, not a source of truth. PR 2218659 (Wave 6 PR-P1) shipped a wrong trigger description because the AI read "Manage page" out of ManagePagePanel — the actual surface is the post-publish "Promote your page" panel (internally aliased PostPublishPanel). Before writing Product surface / Trigger / Repro steps, the five evidence sources below must agree. If any two disagree, investigate; do not pick a winner by guess.

State-setter grep. Find every site that flips the component's open-state to true — setState({shouldShow*: true}), setIsOpen(true), setCommandBarState({…: true}), parent-state callbacks, etc. Those calls are the only authoritative triggers. If the only setters are inside a postPublish / onSave / onDelete / auto-open-URL handler, the trigger is that flow — there is no menu item to click.

File header docstring + sibling files. Read the @file comment block at the top of the migrated file and any sibling files in the same directory (e.g. a PromotePage.tsx sibling that documents itself as "page promotion actions"). Comments routinely describe what the file does in plain English; class names are aspirational or vestigial. When they disagree, believe the comment.

data-automation-id greps in Playwright / Selenium tests. Search integration-tests/ (Playwright) and *tab-tasklib*/ (legacy tasklib) for the component's automation IDs. The setup steps in any test that asserts visibility on those IDs are the canonical user flow as encoded by test automation.

Internal alias names. The same surface often goes by a different name in helpers, CSS classes, test selectors — Get{Surface}, [data-automation-id='{Surface}-placeholder'], is{Surface}Visible. If that alias disagrees with the React class name, the alias is the name users / engineers actually use. The disagreement is itself the signal.

Sibling render branches in the parent. In the rendering parent (CommandBar.tsx, App shell, page chrome, …), find every JSX branch keyed on the same open-state. If shouldShow{X} keys into multiple <DeferredFoo> branches gated by additional conditions (enablePublishPagesOnMySite(), isXFlightEnabled(), license checks, etc.), the component you're migrating may be only one branch — users on a different gate hit a sibling component, not this one.

Red flags that demand investigation, not assumption: - The class name implies a menu item / command label, but you can't find it by clicking through the product on a real tenant. - The file's docstring (or a same-directory sibling's docstring) describes a different surface than the class name suggests. - The same data-automation-id appears under multiple component aliases in the codebase. - The migrated component is one of multiple <DeferredFoo> branches in the parent, each gated by a feature switch. - The component is named *Panel but the only state-setters are inside a publish/save/delete completion handler — then it's almost certainly a post-action panel, not a menu-opened one.

(b1) Prereq gates — REQUIRED whenever the migrated component is one of multiple sibling render branches gated by an outer feature switch. List every condition that must hold for THIS PR's branch to render: the migration flight, the outer feature predicate, page-state preconditions, license checks, killswitches in the path. Without this section, reviewers cannot reproduce the flight-ON path on their tenant. Example (PR 2218659, six conditions including !Utilities.enablePublishPagesOnMySite(), isPageOnFirstPublishedVersion(), PromotedState === NotPromoted, !isScheduled).

(c) Visual verification — REQUIRED for any component that renders user-facing UI (Drawer, Dialog, Tooltip, Popover, Menu, Card, Avatar, Image, Badge, etc.). Attach: - Before screenshot — flight OFF (default). - After screenshot — flight ON (use a debug-link flight override like &flights=enable:<flight-number>). - One line confirming nothing else changed: width, padding, header/footer alignment, focus management, animation, dismiss behavior, keyboard nav (Tab + Esc).

Skip §(c) only for purely internal/non-rendering types or utility components — say so explicitly when you skip.

(d) Test plan — both flight states must be checked:

- [ ] **Flight OFF** (legacy path): default flights, surface renders identically to origin/main.
- [ ] **Flight ON** (stable path): override flight via debug link, surface renders via stable component; click/keyboard interactions work.
- [ ] Build: `rush --quiet build -t .` from the package — SUCCESS, zero warnings.
- [ ] Test: `rush --quiet test -o <package-name> --include-phase-deps` green.
Pitfalls (validated by PR1 + PR 2164312)
#	Symptom	Cause	Fix
1	(no-restricted-imports) '@msinternal/sharepoint-ui-react*/experimental' import is restricted	Direct import from @msinternal/sharepoint-ui-react-{name}/experimental	Use stable path (table above).
2	TS2307: Cannot find module '@msinternal/sharepoint-ui-react-stable/lib/LazyComponents' at the new import line	Umbrella package not declared in the owning package.json	Add @msinternal/sharepoint-ui-react-stable (or -stable-bundle) to dependencies, run rush update once. See §"Dependency declaration — required if missing".
2b	rush update adds churn to many transitive deps, not just the umbrella	Stale lockfile / other dep drift surfaced by the update	Revert lockfile (git checkout main -- common/config/rush/pnpm-lock.yaml), re-run rush update — should now only touch the umbrella.
3	Pre-push: "lockfile was modified, but no files that should require a lockfile update were changed"	Stray transitive bump from a rush update without a corresponding package.json change	Revert lockfile and amend.
4	(Pattern B only) Test fails: isXxxMigrationKSActivated is not a function	jest.mock('…/KillSwitches', …) shadowed every export	Use jest.requireActual(…) and spread ...actual.
5	ADO push rejected: VS403660: You do not have permission to create ref	Branch users/<alias>/... (plural) instead of user/<alias>/...	git branch -m and re-push.
6	Component swap "took no effect" in dev	Local const {Component} was declared but JSX still references a different name (e.g. {Component}Legacy or stale Resolved{Component} from an older pattern)	With the shadow-rename pattern, JSX keeps the bare original name — verify the local const {Component} = useStable ? {Component}Stable : {Component}Legacy; is in scope at the JSX site (e.g. inside the same function body).
7	Pattern A: tests still fail in legacy branch despite mocking flight to true	Test file has stale Flights mock that doesn't include the new flight	Add isVisualRefreshStableBundleEnabled: () => true to the existing jest.mock('.../Flights', …).
8	Pattern A: CI test fails with (0 , _flights.isXxxOtherFlight) is not a function after the migration lands	jest.mock('…/flights', () => ({ isXxxStableBundleEnabled: () => true })) replaced the whole module — every other flight in the file is now undefined, and the component-under-test (or its transitive imports) calls one of them at render time	Use jest.requireActual(…) + spread ...actual (see §A4). Encountered in PR 2218149 (AmplifyDrawerFooter — isSPNewsEngageCrossPostFlightEnabled blew up in AmplifyButton).
9	Pattern C+: footer/header content visually drifts (extra indent, colored bars shrink to mid-panel, vertical-stacked children become a row)	v8 source used onRender<X>={fn} (no "Content" suffix) — wrapper-bypass — and the v9 mapping just wrapped fn() in <Drawer<X>> without auditing v9 wrapper defaults against the caller's content. v9 padding stacks on top of caller padding; v9 display: flex makes a single-child wrapper sized to content not container.	Run the §C1.5 audit before writing v9 JSX. When any of the 3 questions returns YES, override the v9 wrapper (typically padding: 0; display: block). Encountered in PR 2219419 (BoostPanel — Save/Cancel offset by 32px, feedback bar shrunk to mid-panel).
10	Pattern C+: v9 branch ships as a half-state with v9 OverlayDrawer outer + v8 controls inside (<PrimaryButton> / <TextField> / <Link> from @ms/office-ui-fabric-react-bundle still rendering inside the new <OverlayDrawer>)	Treated outer Drawer migration and inner v8-control migration as two separate PR waves (on analogy to Amplify Wave-3 / Wave-4). That analogy only fits fan-out cases where the outer wave touches more files than the inner wave; for single-file Pattern C+ migrations, both are the same nature of work and belong in the same PR.	Per §C2.5, audit every v8 import in the file against SPDS.inventory.md §2/§3; for any v8 control rendered inside the migrated Drawer that has a SPDS-stable equivalent, swap inside the v9 branch in THIS PR. Encountered in PR 2219447 (ContentApprovalPanel — flagged by reviewer 2026-05-19).
11	Pattern C+: --fui-Drawer--size (or any other --fui-* CSS variable) ends up on the v8 Panel's DOM scope, leaking v9 design tokens into a path that has no flight gate protection	Added the variable to an existing .module.scss class (.boostPanel, .planCreationPanel, etc.) that is referenced by BOTH the v8 defaultProps.className AND the v9 <OverlayDrawer className={...}>. Mental model "scss is where styles live" overrode §C3's "Griffel, not scss" rule. The leak is silent — v9 looks right, v8 looks right today, but the var cascades to any nested v9 surface (lazy controls, portals) and to whatever future migration lands on that subtree.	Per §C4, v9 tokens live in a Griffel makeStyles hook attached via a small FC wrapper around OverlayDrawer — never in .module.scss. For class components, extract the FC wrapper so the hook has a valid call site. Encountered in PR 2219419 (BoostPanel), PR 2219447 (ContentApprovalPanel), PR 2225561 (PlanCreationPanel) — all three caught and rewritten 2026-05-22.
Validation checklist before marking done
[ ] Decision documented: Pattern A (flight) / Pattern B (KS) / Pattern C+ (v8 Panel → v9 OverlayDrawer), with reason.
[ ] (Pattern A) Existing flight reused — no new KS in KillSwitches.ts.
[ ] (Pattern B) New KS function added with real GUID/date/alias from blueprint.
[ ] (Pattern C+) Per §C1 the three sources were read (v8 file, PanelShim family, SPDS v9 stable). Per §C1.5 the audit was run for every onRender<X> (no "Content" suffix) prop in the v8 source — for each, the v9 wrapper override decision is documented. Per §C2 a prop-by-prop translation table exists for THIS file. Per §C2.5 every v8 control rendered inside the migrated Drawer was audited against SPDS.inventory.md — SPDS-ready ones (§2/§3) are swapped inside the v9 branch in THIS PR; out-of-scope ones (§5A umbrella-pending / §5C not-in-SPDS) are flagged in the PR description. Per §C3 only the patches THIS caller's props trigger were inlined (not the full 30-item PanelShim set). Per §C4 --fui-Drawer--size (and any other --fui-* CSS variable) lives in a Griffel makeStyles hook scoped to an OverlayDrawer FC wrapper — confirm with git diff <branch>~1 -- '*.module.scss' | grep -E '^\+.*--fui-' returning empty. Per §C6 before+after Playwright pixel-comparison evidence is in the PR description.
[ ] Owning package's package.json declares the stable umbrella matching the new import path (added if it was missing — see §"Dependency declaration — required if missing").
[ ] If the umbrella was added: rush update ran exactly once; pnpm-lock.yaml diff is scoped to the added dep only (no unrelated transitive churn).
[ ] Target file: legacy + new imports both present; JSX uses Resolved{Component} aliases (A/B) or two flight-gated render trees (C+).
[ ] Direction correct: Pattern A → flight ? new : legacy. Pattern B → !ks() ? new : legacy. Pattern C+ → flight ? <OverlayDrawer-tree> : <Panel-tree>.
[ ] Gating function called inside the component body (never at module top-level).
[ ] (If test file exists) Flights/KillSwitches mocks updated; tests cover both branches where it makes sense.
[ ] (Pattern C+ only) rush change --bulk --bump-type none --message "..." --commit ran for every publishable package modified (see §C9). Pre-push hook will reject otherwise.
[ ] rush --quiet build -t . finishes with SUCCESS (no WARNINGS, especially no no-restricted-imports).
[ ] rush --quiet test -o <app> --include-phase-deps is green.
[ ] No package.json change. No lockfile change. No unrelated formatter/cleanup diffs.
[ ] PR description contains all four required sections — Summary, Where to find this surface (with Product surface / Trigger / Repro steps), Visual verification (before+after screenshots, or explicit skip rationale), Test plan.
[ ] Trigger verification protocol (§"(b) Where to find this surface") ran: state-setter grep + file docstring + Playwright automation-id search + internal-alias check + sibling-render-branch check all agree on the surface. If sibling render branches exist, a "Prereq gates" (§b1) section enumerates every condition for THIS PR's branch.
Out-of-scope (always skip)
Files where the component is already gated by a flight with both legacy + stable imports present — already migrated. Don't double-gate.
Different package (NavDrawer* from @msinternal/sharepoint-ui-react-nav, *Picker* from sp-sitepicker-control, etc.).
External wrappers (Deferred* from amplify campaign components).
Comment / killswitch-string / feature-flag mentions without an actual render.
Non-component imports from @msinternal/sharepoint-ui-react — makeStyles, mergeClasses, tokens, useId, useRestoreFocusSource, type-only imports, all icons. Leave them on the umbrella package.