# Category execution contract

## Categories

Use only:

- `keyboard-focus`
- `screen-reader`
- `structure-semantics`
- `orientation-input-purpose`
- `visual-color`
- `timing-motion`
- `dynamic-content`
- `touch-pointer`
- `authentication-forms`

## Execution isolation

Parallel browser execution requires one exclusive profile/context, fixture, output directory, and
trace per category. A shared authenticated profile, stateful fixture, clipboard, OS focus, audio,
UIA, or AT dependency forces serial execution.

Real AT is always serial. Never run NVDA and Narrator simultaneously. Only the main Windows
host/Twin may operate AT, Console transfer, real OS input, ETW, and audio routing.

## Browser rules

- Prefer the approved personal evaluator profile on its Windows host.
- Use repository Playwright/FIC in Codespaces.
- Never copy normal browser cookies or read credentials.
- Exclude browser chrome and OS UI from page findings.
- Do not exclude product-owned navigation merely because it resembles SuiteNav.
- Restore viewport, zoom, scroll, styles, dialogs, and modified page state.
- Save screenshots and traces beneath the category directory.

## Evidence rules

Evidence contains type, absolute real path, SHA-256, and producer. Every artifact, including
external evidence, must be materialized under its category directory. A finding cites its evidence
paths.

Every reportable finding requires a screenshot. `VIOLATION`, `BEST-PRACTICE`, and `NEEDS-REVIEW`
screenshots also require:

```json
{
  "annotation": {
    "kind": "element|page|infrastructure",
    "label": "<finding ID and short issue>"
  }
}
```

Use a red element outline plus an external label. For missing-element, page-level, or infrastructure
findings, use a red banner that does not obscure the evidence. Remove browser annotations after
capture.

`accessibility-tree` JSON has a category-specific stable summary in addition to any raw AX payload:

- `structure-semantics`: `{ "inventory": { "headings": [{ "level": 1, "text": "..." }],
  "landmarks": [{ "tag": "MAIN", "role": "main", "name": "..." }] } }`
- `orientation-input-purpose`: `{ "inputs": [{ "tag": "INPUT", "type": "email",
  "name": "Email", "autocomplete": "email" }], "axTree": { ... } }`

Focus-sequence entries are either a compact string or an object with `tag`, `text`, `id`,
`outlineStyle`, `outlineWidth`, `boxShadow`, and optional `obscured`/`focusObscured` boolean.

Accessibility-tree, DOM, ARIA, and axe evidence are prohibited in the `screen-reader` category.
Use them only in their applicable browser structure/semantics categories. They cannot test or prove
spoken output, OS focus behavior, Voice Access, or screen-reader interaction.

Infrastructure failures are `blocked`, `inconclusive`, `skipped-environment`, or `failed`; never
turn them into product violations or passes.
