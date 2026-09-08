---
name: ow-ref-replace-component
description: "Use for ODSP-Web UI component migrations, v8-to-SPDS replacements, Panel/Drawer conversion, stable-bundle adoption, or ReplaceComponent work."
---

# ReplaceComponent migration reference

Use the highest supported ODSP-Web design-system layer and read the routed project context before
choosing a migration pattern. Do not infer the target component, gate, or expected geometry from a
class name alone.

## Select one migration shape

1. **Existing Flight:** keep legacy and stable imports, select them inside the component at call
   time, and preserve the legacy path exactly when the Flight is disabled.
2. **Live KillSwitch:** use the behavior-owning package's centralized killswitch module. Inactive
   selects the new behavior; activated selects the original fallback.
3. **Panel to OverlayDrawer:** use separate gated render trees when the APIs differ materially.
   Read the source Panel props, established PanelShim behavior, current SPDS export, and nearby
   production migrations before translating the surface.

For Panel/Drawer work, inventory every `onRender*` prop, header/body/footer wrapper, width rule,
scroll owner, dismiss path, focus behavior, portal/provider boundary, and v8 control rendered inside
the new surface. Migrate SPDS-ready inner controls in the same change; do not ship a new outer
Drawer that leaves avoidable v8 controls inside.

## Package and test rules

- Under `sp-client/`, eager SPDS controls use
  `@msinternal/sharepoint-ui-react-stable-bundle`. Supported heavy families such as Drawer and
  Dialog use `@msinternal/sharepoint-ui-react-stable/lib/LazyComponents`; declare
  `@msinternal/sharepoint-ui-react-stable` for that import. Use the documented stable package for
  other package families.
- If the owning `package.json` lacks the dependency matching the selected import route, add it and
  run `rush update` once. Inspect the lockfile and reject unrelated transitive churn.
- Preserve unrelated exports in Flight/KillSwitch mocks with `jest.requireActual(...)` plus spread;
  do not replace the whole module with one gate function.
- For publishable packages, create the required Rush change file before push:

  ```bash
  rush change --bulk --bump-type none --message "<migration summary>" --commit
  ```

- Do not add migration-process vocabulary to source comments. Put pattern rationale in the commit
  or PR description.

## Evidence

Visible migrations require matched representative BEFORE/AFTER evidence under the same route,
fixture, viewport, flags, and interaction state. Verify width, padding, alignment, scroll, focus,
animation, dismiss behavior, and keyboard operation. Record the actual state setter and every outer
gate required to reach the migrated branch.
