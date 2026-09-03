# Accessibility bug patterns

This checklist summarizes recurring defect shapes observed across a de-identified bug corpus. It is
not normative guidance and does not reproduce private standards, bugs, identifiers, or product
data.

High-yield patterns:

- A control lacks a stable accessible name, role, state, value, or relationship.
- Opening or closing a dialog or menu places, traps, or restores focus incorrectly.
- Keyboard order differs from the meaningful visual or reading sequence.
- A state change is silent, duplicated, stale, or announced at the wrong time.
- Heading, landmark, list, table, group, or form semantics do not match their live context.
- Validation is not identified, associated, announced, focused, or recoverable.
- Zoom, reflow, text spacing, forced colors, or state styling hides content or focus.
- Target size, gesture alternatives, timing, or motion controls are absent.

Test the live transition and every relevant state. Report one independently reproducible behavior
per finding, using public WCAG identifiers only as MAS mapping keys.

Static source, DOM, Accessibility Tree, CSS, or attribute inventories may locate targets, but they
never establish a test result. Every result requires a live rendered surface plus executed steps,
observable behavior, and finding-specific evidence.
