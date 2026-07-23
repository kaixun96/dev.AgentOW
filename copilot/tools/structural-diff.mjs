#!/usr/bin/env node
// structural-diff.mjs — per-element structural deltas from BEFORE/AFTER aria + bbox probes
//
// Design2Code-style: instead of asking the VLM to compare layouts, compute the comparisons
// deterministically from probe data the spec already emits, then surface them as hard
// signals the evaluator MUST address (e.g. "gap between title and trailing icon shrank
// from 24px to 4px → high-confidence regression").
//
// Input: probe JSON dumps for BEFORE and AFTER (the spec's `probeResults` from each
// variant's `>>> [AgentOW <variant>] probes: {...}` log line). We accept the raw JSON
// or two files.
//
// Output: a structured deltas list per metric key:
//   {
//     "deltas": [
//       { "metric": "header.title.right - close.left", "before": 13, "after": 4, "delta": -9, "severity": "warn" },
//       { "metric": "listItem[2].title.width - listItem[2].icon.left", "before": 4, "after": -8, "delta": -12, "severity": "regress" }
//     ],
//     "summary": { "regress": 1, "warn": 1, "ok": 3 }
//   }
//
// Severity:
//   - regress: positive→negative crossover, OR magnitude >= 8px AND ratio change > 50%
//   - warn:    magnitude >= 4px change
//   - ok:      everything else
//
// Usage:
//   node structural-diff.mjs path/to/before-probes.json path/to/after-probes.json > deltas.json

import fs from 'node:fs';

function loadProbes(path) {
  // Probes might be either the raw JSON dump OR the line from the log; sniff and recover.
  const raw = fs.readFileSync(path, 'utf8').trim();
  try {
    return JSON.parse(raw);
  } catch {
    // Try extracting from "{...}" tail
    const m = raw.match(/(\{[\s\S]*\})\s*$/);
    if (m) return JSON.parse(m[1]);
    throw new Error(`could not parse probes from ${path}`);
  }
}

function flatten(obj, prefix = '', out = new Map()) {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'number') out.set(prefix, obj);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number') out.set(key, v);
    else if (typeof v === 'object' && v !== null) flatten(v, key, out);
  }
  return out;
}

function classify(before, after) {
  const delta = after - before;
  const absDelta = Math.abs(delta);
  // Crossover: positive gap became negative (overlap)
  if (before > 0 && after <= 0) return 'regress';
  // Big shrinkage from a positive gap
  if (before > 0 && after > 0 && delta < -8 && Math.abs(delta / before) > 0.5) return 'regress';
  // Moderate change
  if (absDelta >= 4) return 'warn';
  return 'ok';
}

const [, , beforePath, afterPath] = process.argv;
if (!beforePath || !afterPath) {
  console.error('usage: structural-diff.mjs before-probes.json after-probes.json');
  process.exit(2);
}

const before = flatten(loadProbes(beforePath));
const after = flatten(loadProbes(afterPath));

const deltas = [];
const summary = { regress: 0, warn: 0, ok: 0, missing: 0 };
const keys = new Set([...before.keys(), ...after.keys()]);
for (const k of keys) {
  const b = before.get(k);
  const a = after.get(k);
  if (b === undefined || a === undefined) {
    summary.missing += 1;
    continue;
  }
  const severity = classify(b, a);
  summary[severity] += 1;
  if (severity !== 'ok') deltas.push({ metric: k, before: b, after: a, delta: +(a - b).toFixed(2), severity });
}

deltas.sort((x, y) => {
  const order = { regress: 0, warn: 1, ok: 2 };
  return order[x.severity] - order[y.severity] || Math.abs(y.delta) - Math.abs(x.delta);
});

console.log(JSON.stringify({ deltas, summary }, null, 2));
process.exit(summary.regress > 0 ? 1 : 0);
