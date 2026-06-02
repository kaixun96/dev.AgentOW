// Structured diff for Playwright accessibility snapshots.
// Input: two JSON files dumped by page.accessibility.snapshot().
// Output: { added, removed, changed } node lists keyed by stable path.
//
// Node path = ancestor-role-chain "/" join (e.g. "/dialog[Recently saved items]/button[Close]").
// Two nodes are "same node" if they share the same path.
//   - added:   exists in AFTER, not in BEFORE
//   - removed: exists in BEFORE, not in AFTER
//   - changed: same path, but role/name/value/checked/expanded differs

import fs from 'node:fs';

const [, , beforePath, afterPath] = process.argv;
if (!beforePath || !afterPath) {
  console.error('Usage: node aria-diff.mjs <before-aria.json> <after-aria.json>');
  process.exit(2);
}

const before = JSON.parse(fs.readFileSync(beforePath, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterPath, 'utf8'));

function flatten(node, ancestorPath, sink) {
  if (!node) return;
  const segment = `${node.role || '?'}[${(node.name || '').slice(0, 40)}]`;
  const path = ancestorPath ? `${ancestorPath}/${segment}` : `/${segment}`;
  sink.set(path, {
    role: node.role,
    name: node.name,
    value: node.value,
    checked: node.checked,
    expanded: node.expanded,
    disabled: node.disabled,
    childrenCount: (node.children || []).length
  });
  for (const c of node.children || []) flatten(c, path, sink);
}

const b = new Map();
const a = new Map();
flatten(before, '', b);
flatten(after, '', a);

const added = [];
const removed = [];
const changed = [];

for (const [p, v] of a.entries()) {
  if (!b.has(p)) {
    added.push({ path: p, ...v });
  } else {
    const bv = b.get(p);
    const fieldDiffs = [];
    for (const k of ['role', 'name', 'value', 'checked', 'expanded', 'disabled', 'childrenCount']) {
      if (bv[k] !== v[k]) fieldDiffs.push({ field: k, before: bv[k], after: v[k] });
    }
    if (fieldDiffs.length) changed.push({ path: p, fields: fieldDiffs });
  }
}
for (const [p, v] of b.entries()) {
  if (!a.has(p)) removed.push({ path: p, ...v });
}

console.log(
  JSON.stringify(
    {
      beforeNodeCount: b.size,
      afterNodeCount: a.size,
      addedCount: added.length,
      removedCount: removed.length,
      changedCount: changed.length,
      added,
      removed,
      changed
    },
    null,
    2
  )
);
