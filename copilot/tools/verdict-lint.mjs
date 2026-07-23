#!/usr/bin/env node
// verdict-lint.mjs — anti-rubber-stamp linter for visual-result.json
//
// Two checks:
//   (1) Hedging detector — greps `details` + every visualScrutiny.*.{L3_pixelObservation,rationale,evidence,actualObserved}
//       for known-hedging phrases. Hedging while verdict=PASS → reject.
//   (2) Schema completeness — every visualScrutiny.<category> MUST have all four keys
//       (verdict, L1_pixelDiff, L2_domProbe, L3_pixelObservation, classification) AND the
//       VISUAL_VERDICT prefix line MUST be present + exactly one of the two allowed strings.
//
// Exit 0 = OK. Exit 1 = lint failures (with JSON report on stdout).
//
// Usage:
//   node verdict-lint.mjs path/to/visual-result.json

import fs from 'node:fs';

const HEDGE_PATTERNS = [
  /\bexpected[\s-]*(spds|v9|fluent)[\s-]*(native[\s-]*)?(traits|behaviour|behavior)\b/i,
  /\bslightly\b/i,
  /\bonly via expected\b/i,
  /\bwell within\b/i,
  /\bby inspection\b/i,
  /\bmostly\b/i,
  /\bwith caveat\b/i,
  /\bappears? (fine|correct|ok)\b/i,
  /\blooks (fine|correct|reasonable|ok)\b(?! good\b)/i,
  /\brenders? correctly\b/i,
  /\bno (visible|obvious|apparent) (issue|regression|defect)\b/i,
  /\bnegligible\b/i,
  /\bcosmetic only\b/i,
  /\bnothing concerning\b/i,
  /\bgood enough\b/i,
  /\bacceptable difference\b/i,
];

const REQUIRED_KEYS = ['verdict', 'L1_pixelDiff', 'L2_domProbe', 'L3_pixelObservation', 'classification'];
const ALLOWED_CLASSIFICATIONS = new Set([
  'v8-legacy-behavior-preserved',
  'v9-introduced-regression',
  'v9-introduced-improvement',
  'unchanged',
  'planned-v9-difference',
]);

function lintFile(path) {
  const findings = [];
  let raw;
  try {
    raw = fs.readFileSync(path, 'utf8');
  } catch (e) {
    return { ok: false, findings: [{ code: 'file-unreadable', detail: e.message }] };
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    return { ok: false, findings: [{ code: 'invalid-json', detail: e.message }] };
  }

  const verdict = (data.verdict || '').toLowerCase();
  const details = String(data.details || '');

  // Check (A): VISUAL_VERDICT prefix
  const firstLine = details.split('\n')[0]?.trim() || '';
  if (firstLine !== 'VISUAL_VERDICT: looks good' && firstLine !== 'VISUAL_VERDICT: needs work') {
    findings.push({
      code: 'missing-visual-verdict-prefix',
      detail: `first line of details must be exactly "VISUAL_VERDICT: looks good" or "VISUAL_VERDICT: needs work", got: "${firstLine.slice(0, 80)}"`,
    });
  }

  // Check (B): prefix/verdict consistency
  if (firstLine === 'VISUAL_VERDICT: looks good' && verdict !== 'pass') {
    findings.push({ code: 'prefix-verdict-mismatch', detail: `prefix says "looks good" but verdict=${verdict}` });
  }
  if (firstLine === 'VISUAL_VERDICT: needs work' && verdict === 'pass') {
    findings.push({ code: 'prefix-verdict-mismatch', detail: `prefix says "needs work" but verdict=pass` });
  }

  // Check (C): visualScrutiny schema completeness
  const scrutiny = data.visualScrutiny || data.visualLlm?.visualScrutiny;
  if (!scrutiny || typeof scrutiny !== 'object') {
    findings.push({
      code: 'visualScrutiny-missing',
      detail: 'visual-result.json must contain visualScrutiny: { <category>: { verdict, L1_pixelDiff, L2_domProbe, L3_pixelObservation, classification } }',
    });
  } else {
    const categories = Object.keys(scrutiny);
    if (categories.length < 5) {
      findings.push({
        code: 'visualScrutiny-too-few-categories',
        detail: `expected ≥5 categories (textOverflowCollision, spacingPadding, assetRendering, alignmentVsBefore, planConformance), got ${categories.length}: ${categories.join(',')}`,
      });
    }
    for (const cat of categories) {
      const entry = scrutiny[cat];
      if (!entry || typeof entry !== 'object') {
        findings.push({ code: 'category-not-object', detail: cat });
        continue;
      }
      for (const k of REQUIRED_KEYS) {
        if (!(k in entry) || typeof entry[k] !== 'string' || entry[k].trim().length < 8) {
          findings.push({ code: 'category-field-missing-or-too-short', detail: `${cat}.${k}` });
        }
      }
      if (entry.classification && !ALLOWED_CLASSIFICATIONS.has(entry.classification)) {
        findings.push({
          code: 'classification-invalid',
          detail: `${cat}.classification="${entry.classification}" — must be one of ${[...ALLOWED_CLASSIFICATIONS].join('|')}`,
        });
      }
    }
  }

  // Check (D): hedging detector — only applies when verdict=pass (we don't want to false-positive on FAILs that legitimately use cautious language)
  if (verdict === 'pass') {
    const fields = [details];
    if (scrutiny) {
      for (const cat of Object.keys(scrutiny)) {
        const e = scrutiny[cat] || {};
        for (const k of ['L3_pixelObservation', 'L1_pixelDiff', 'L2_domProbe', 'rationale', 'evidence', 'actualObserved']) {
          if (typeof e[k] === 'string') fields.push(`[${cat}.${k}] ${e[k]}`);
        }
      }
    }
    if (typeof data.visualLlm?.actualObserved === 'string') fields.push(`[visualLlm.actualObserved] ${data.visualLlm.actualObserved}`);

    for (const text of fields) {
      for (const re of HEDGE_PATTERNS) {
        const m = text.match(re);
        if (m) {
          findings.push({
            code: 'hedging-while-pass',
            detail: `matched /${re.source}/${re.flags} → "${text.slice(Math.max(0, m.index - 20), m.index + m[0].length + 20)}"`,
          });
        }
      }
    }
  }

  // Check (E): coordinate evidence — every L3_pixelObservation must cite at least one (x,y) coordinate when verdict=pass
  if (verdict === 'pass' && scrutiny) {
    for (const cat of Object.keys(scrutiny)) {
      const obs = scrutiny[cat]?.L3_pixelObservation;
      if (typeof obs === 'string' && !/\b(x|y)\s*[≈=:]\s*\d+|\(\d+\s*,\s*\d+\)/i.test(obs) && !/no diff/i.test(obs)) {
        findings.push({
          code: 'l3-missing-coordinates',
          detail: `${cat}.L3_pixelObservation must cite at least one coordinate (x≈N, y≈N) or (x,y) — got: "${obs.slice(0, 100)}"`,
        });
      }
    }
  }

  // Check (F): cold-eye + prediction findings must both exist alongside visual-result.json
  // (these are produced by UI-6a / UI-6b before UI-6c merge)
  const dir = path.split('/').slice(0, -1).join('/');
  for (const name of ['cold-eye-findings.json', 'prediction-findings.json']) {
    const p = `${dir}/${name}`;
    if (!fs.existsSync(p)) {
      findings.push({
        code: 'missing-findings-file',
        detail: `${name} not found alongside visual-result.json — UI-6a (cold-eye) or UI-6b (prediction) was skipped`,
      });
      continue;
    }
    try {
      const f = JSON.parse(fs.readFileSync(p, 'utf8'));
      // If verdict=pass, both findings files must report zero issues
      if (verdict === 'pass' && typeof f.totalIssueCount === 'number' && f.totalIssueCount > 0) {
        findings.push({
          code: 'pass-with-unresolved-findings',
          detail: `${name} reports ${f.totalIssueCount} issues but verdict=pass — UI-6c merge rule violated, verdict must be FAIL when either path has issues`,
        });
      }
      // cold-eye specifically: empty issues[] must cite inspection coords (anti-rubber-stamp)
      if (name === 'cold-eye-findings.json' && Array.isArray(f.checklist)) {
        for (const cat of f.checklist) {
          if (Array.isArray(cat.issues) && cat.issues.length === 0) {
            const txt = JSON.stringify(cat);
            if (!/inspect|coord|x\s*[≈=:]\s*\d|\(\d+\s*,\s*\d+\)/i.test(txt)) {
              findings.push({
                code: 'cold-eye-empty-without-inspection-evidence',
                detail: `cold-eye-findings.json category="${cat.category}" has empty issues[] but no inspection coordinates cited — rubber-stamp`,
              });
            }
          }
        }
      }
    } catch (e) {
      findings.push({ code: 'findings-file-unparseable', detail: `${name}: ${e.message}` });
    }
  }

  return { ok: findings.length === 0, findings, verdict, prefix: firstLine };
}

const [, , target] = process.argv;
if (!target) {
  console.error('usage: verdict-lint.mjs path/to/visual-result.json');
  process.exit(2);
}
const result = lintFile(target);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
