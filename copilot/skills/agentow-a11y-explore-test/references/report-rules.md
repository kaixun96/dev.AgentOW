# Deterministic HTML report rules

The renderer is `${CLAUDE_PLUGIN_ROOT}/tools/a11y-explore-report.mjs`. It must produce a
self-contained `report.html` with embedded CSS and no external runtime dependencies.

## Required sections

1. Page/feature title, run date, WCAG 2.2 A/AA label, environment, browser,
   screen-reader status, URL, and a non-sensitive statement that evidence is report-local and
   hash-validated. Never render an absolute local evidence path.
2. Bright summary cards for violations, best practices, scoped passes, and needs review.
3. Per-category counts plus a total row.
4. One WCAG 2.2 A/AA row per supported criterion, exactly once:
   - red `FAIL`;
   - green `PASS`;
   - blue `NEEDS REVIEW`;
   - gray `NOT APPLICABLE` or `NOT TESTED`.
   `NOT_TESTED` is valid only with a concrete reason explaining why the test could not run.
5. Findings ordered by severity/classification from the deterministic aggregate. Violation cards
   show both type and severity badges. Each finding includes prerequisites, stable target, exact
   input method, ordered steps, actual behavior, expected behavior, user impact, reproducibility,
   environment, tested scope, and evidence limitations. Semantic findings state observed
   name/role/state/value/relationships; focus findings state the ordered transition; screen-reader
   findings state the trigger and real announcement sequence. Screenshots alone cannot prove
   semantic, speech, focus-order, interaction, or measurement claims.
6. At least one inline screenshot per reportable finding, using a relative path. Omit incomplete
   completed-category findings and list them in coverage notes. A non-completed infrastructure
   `NEEDS-REVIEW` record may render without a screenshot.
   - `VIOLATION`, `BEST-PRACTICE`, and `NEEDS-REVIEW` screenshots use a red outline and finding-ID
     label.
   - Missing-element/page-level/infrastructure issues use a red banner that does not cover relevant
     pixels.
7. Tab Order Map with failed-row styling for missing/obscured focus indicators.
8. Heading Hierarchy with skipped levels highlighted.
9. Landmark Regions with presence/label information.
10. Task Runtime with one row per executed category and a total.
11. Collapsible NVDA transcript excerpts and Test Coverage Notes.
12. ADO bug links when `ado-bugs.json` contains a matching finding.

## Favicon

Every newly generated HTML report must contain an exaggerated, high-saturation favicon. Generate a
unique inline SVG favicon from stable report inputs (target plus generation time), using a vivid
multi-color gradient and a strong high-contrast symbol. Do not add an external favicon file or
network dependency.

## Safety and completeness

- Escape all model/page content before inserting it into HTML.
- Render non-PASS screenshot thumbnails with a strong red border as a secondary visual cue; this
  does not replace the annotation inside the image.
- Keep report reads and writes inside the real run directory and reject symlink escapes.
- Do not leave template placeholders in the output.
- Do not label the exploratory result as full WCAG conformance.
- Do not publish private standard text, internal mapping identifiers, bug text, work-item IDs, or
  internal query links.
