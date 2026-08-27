#!/usr/bin/env node

// Review ledger.
//
// A review of the same branch runs many times: once per fix cycle, and again
// whenever someone re-reviews the shipped PR. Without a memory, each run is a
// blank slate, so an issue that was already reported and consciously accepted
// gets reported again. The observed effect is a PR that was reviewed to
// completion still collecting the same nits every time the reviewer is run.
//
// The ledger is that memory. It records, per branch, the findings that were
// accepted rather than fixed, so a later review can carry them forward instead
// of re-raising them.
//
// A finding's identity cannot be its line number, its category, or its wording:
// all three drift between reviews of the same defect. One real run reported the
// same magic constant three times as `maintainability` at line 146, then
// `designMaintainability` at 152, then `designMaintainability` at 146 again.
// What did not change was the source line being complained about, so identity
// is anchored to that text. When the code is edited the anchor no longer
// matches, the fingerprint changes, and the finding is correctly treated as new.
//
// Usage:
//   node tools/review-ledger.mjs fingerprint --report <review.json> [--repo <dir>]
//   node tools/review-ledger.mjs match --report <review.json> --ledger <path> [--repo <dir>]
//   node tools/review-ledger.mjs accept --report <review.json> --ledger <path>
//                                       --accept <id>=<reason> [--accept ...]
//                                       [--head <sha>] [--run <id>] [--repo <dir>]
//   node tools/review-ledger.mjs render --ledger <path>
//   node tools/review-ledger.mjs parse --description <file> [--out <path>]

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = 1;
const BLOCK_OPEN = "<!-- agentow-review-ledger";
const BLOCK_CLOSE = "-->";
const VISIBLE_HEADING = "### Accepted review nits";
// A one-line anchor such as `}` or `});` identifies nothing, so the anchor
// walks upward until it carries enough signal to distinguish two findings.
const MIN_ANCHOR_SIGNAL = 24;
const MAX_ANCHOR_LINES = 4;
const MIN_REASON_LENGTH = 40;

function fail(message) {
  process.stderr.write(`review-ledger: ${message}\n`);
  process.exit(2);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`cannot read ${file}: ${error.message}`);
  }
}

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

function significantLength(text) {
  return text.replace(/[^A-Za-z0-9]/g, "").length;
}

// Reads the cited file from the working tree, falling back to Git so a review
// of a deleted or since-changed path still resolves.
export function readSource(repoRoot, filePath, ref) {
  const absolute = `${repoRoot}/${filePath}`;
  if (!ref && fs.existsSync(absolute)) {
    try {
      return fs.readFileSync(absolute, "utf8");
    } catch {
      return null;
    }
  }
  try {
    return execFileSync("git", ["show", `${ref ?? "HEAD"}:${filePath}`], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

export function anchorAt(source, line) {
  if (source === null || source === undefined) return null;
  const lines = source.split(/\r?\n/);
  if (line < 1 || line > lines.length) return null;

  const collected = [lines[line - 1] ?? ""];
  let cursor = line - 2;
  while (
    significantLength(collected.join(" ")) < MIN_ANCHOR_SIGNAL &&
    collected.length < MAX_ANCHOR_LINES &&
    cursor >= 0
  ) {
    const previous = lines[cursor] ?? "";
    if (normalize(previous).length > 0) collected.unshift(previous);
    cursor -= 1;
  }

  const anchor = normalize(collected.join(" "));
  return anchor.length > 0 ? anchor : null;
}

export function fingerprintOf(filePath, anchor) {
  if (!filePath || !anchor) return null;
  return crypto
    .createHash("sha256")
    .update(`${filePath}\u0000${anchor}`)
    .digest("hex")
    .slice(0, 32);
}

export function annotateFindings(report, repoRoot, ref) {
  const sources = new Map();
  return (report.findings ?? []).map((finding) => {
    const filePath = finding.path;
    if (!sources.has(filePath)) sources.set(filePath, readSource(repoRoot, filePath, ref));
    const anchor = anchorAt(sources.get(filePath), finding.line);
    return {
      id: finding.id,
      severity: finding.severity,
      path: filePath,
      line: finding.line,
      anchor,
      fingerprint: fingerprintOf(filePath, anchor),
      description: finding.description,
    };
  });
}

export function loadLedger(file) {
  if (!file || !fs.existsSync(file)) {
    return { schemaVersion: SCHEMA_VERSION, entries: [] };
  }
  const ledger = readJson(file);
  if (!Array.isArray(ledger.entries)) fail(`${file} has no entries array`);
  if (ledger.entries.some((entry) => entry?.disposition === "accepted" && entry?.severity !== "Minor")) {
    fail(`${file} contains an accepted entry that is not a Minor finding`);
  }
  return ledger;
}

export function acceptedFingerprints(ledger) {
  const accepted = new Map();
  for (const entry of ledger.entries ?? []) {
    if (entry.disposition === "accepted" && typeof entry.fingerprint === "string") {
      accepted.set(entry.fingerprint, entry);
    }
  }
  return accepted;
}

export function matchReport(report, ledger, repoRoot, ref) {
  const annotated = annotateFindings(report, repoRoot, ref);
  const accepted = acceptedFingerprints(ledger);
  const carried = [];
  const fresh = [];
  const unanchored = [];

  for (const finding of annotated) {
    if (finding.fingerprint === null) {
      unanchored.push(finding);
      continue;
    }
    const match = accepted.get(finding.fingerprint);
    if (match) carried.push({ ...finding, reason: match.reason, acceptedAt: match.decidedAt });
    else fresh.push(finding);
  }

  return { carried, fresh, unanchored, ledgerEntryCount: accepted.size };
}

function parseAcceptPairs(values) {
  const pairs = new Map();
  for (const value of values) {
    const separator = value.indexOf("=");
    if (separator < 1) fail(`--accept expects <findingId>=<reason>, got "${value}"`);
    pairs.set(value.slice(0, separator).trim(), value.slice(separator + 1).trim());
  }
  return pairs;
}

function acceptCommand(options) {
  const report = readJson(options.get("--report"));
  const ledgerPath = options.get("--ledger");
  if (!ledgerPath) fail("accept requires --ledger");
  const repoRoot = options.get("--repo") ?? process.cwd();
  const ledger = loadLedger(ledgerPath);
  const pairs = parseAcceptPairs(options.getAll("--accept"));
  const annotated = annotateFindings(report, repoRoot, options.get("--ref"));
  const byId = new Map(annotated.map((finding) => [finding.id, finding]));

  const errors = [];
  const added = [];
  for (const [id, reason] of pairs) {
    const finding = byId.get(id);
    if (!finding) {
      errors.push(`no finding with id ${id}`);
      continue;
    }
    if (finding.severity !== "Minor") {
      errors.push(`${id} is ${finding.severity ?? "missing severity"}; only Minor findings may be accepted`);
      continue;
    }
    if (finding.fingerprint === null) {
      errors.push(`${id} cites ${finding.path}:${finding.line}, which does not resolve to source`);
      continue;
    }
    if (reason.length < MIN_REASON_LENGTH) {
      errors.push(`${id} needs a reason of at least ${MIN_REASON_LENGTH} characters`);
      continue;
    }
    if (normalize(reason) === normalize(finding.description ?? "")) {
      errors.push(`${id} restates the finding instead of giving a reason to accept it`);
      continue;
    }
    added.push({
      fingerprint: finding.fingerprint,
      path: finding.path,
      anchor: finding.anchor,
      severity: finding.severity,
      description: finding.description,
      disposition: "accepted",
      reason,
      firstSeenHead: options.get("--head") ?? report.reviewedHead ?? null,
      decidedAt: new Date().toISOString(),
      decidedBy: options.get("--run") ?? null,
    });
  }

  if (errors.length > 0) {
    process.stdout.write(JSON.stringify({ ok: false, errors }, null, 2) + "\n");
    process.exit(1);
  }

  const merged = new Map((ledger.entries ?? []).map((entry) => [entry.fingerprint, entry]));
  for (const entry of added) merged.set(entry.fingerprint, entry);
  const next = {
    schemaVersion: SCHEMA_VERSION,
    branch: options.get("--branch") ?? ledger.branch ?? null,
    entries: [...merged.values()],
  };
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.writeFileSync(ledgerPath, JSON.stringify(next, null, 2) + "\n");
  process.stdout.write(
    JSON.stringify({ ok: true, added: added.length, entries: next.entries.length }, null, 2) + "\n",
  );
}

export function renderBlock(ledger) {
  const accepted = [...acceptedFingerprints(ledger).values()];
  if (accepted.length === 0) return "";

  const bullets = accepted
    .map((entry) => `- \`${entry.path}\` — ${entry.description ?? entry.anchor}\n  - Accepted: ${entry.reason}`)
    .join("\n");
  const machine = JSON.stringify({
    schemaVersion: SCHEMA_VERSION,
    entries: accepted.map((entry) => ({
      fingerprint: entry.fingerprint,
      path: entry.path,
      anchor: entry.anchor,
      severity: entry.severity,
      disposition: "accepted",
      reason: entry.reason,
    })),
  });

  return `${VISIBLE_HEADING}\n\nThese were raised by review and consciously accepted, so a re-review carries them forward instead of raising them again.\n\n${bullets}\n\n${BLOCK_OPEN}\n${machine}\n${BLOCK_CLOSE}\n`;
}

export function parseBlock(text) {
  const start = text.indexOf(BLOCK_OPEN);
  if (start === -1) return { schemaVersion: SCHEMA_VERSION, entries: [] };
  const end = text.indexOf(BLOCK_CLOSE, start);
  if (end === -1) return { schemaVersion: SCHEMA_VERSION, entries: [] };
  const body = text.slice(start + BLOCK_OPEN.length, end).trim();
  try {
    const parsed = JSON.parse(body);
    if (!Array.isArray(parsed.entries)) return { schemaVersion: SCHEMA_VERSION, entries: [] };
    return parsed;
  } catch {
    return { schemaVersion: SCHEMA_VERSION, entries: [] };
  }
}

function parseArgs(argv) {
  const map = new Map();
  const multi = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const value = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[index + 1] : "true";
    map.set(token, value);
    if (!multi.has(token)) multi.set(token, []);
    multi.get(token).push(value);
    if (value !== "true") index += 1;
  }
  return {
    get: (key) => (map.get(key) === "true" ? true : map.get(key)),
    getAll: (key) => multi.get(key) ?? [],
  };
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const options = parseArgs(rest);
  const repoRoot = options.get("--repo") ?? process.cwd();

  if (command === "fingerprint") {
    const report = readJson(options.get("--report"));
    const annotated = annotateFindings(report, repoRoot, options.get("--ref"));
    process.stdout.write(JSON.stringify({ findings: annotated }, null, 2) + "\n");
    return;
  }

  if (command === "match") {
    const report = readJson(options.get("--report"));
    const ledger = loadLedger(options.get("--ledger"));
    const result = matchReport(report, ledger, repoRoot, options.get("--ref"));
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    return;
  }

  if (command === "accept") {
    acceptCommand(options);
    return;
  }

  if (command === "render") {
    process.stdout.write(renderBlock(loadLedger(options.get("--ledger"))));
    return;
  }

  if (command === "parse") {
    const description = options.get("--description");
    if (!description) fail("parse requires --description");
    const ledger = parseBlock(fs.readFileSync(description, "utf8"));
    const out = options.get("--out");
    if (out && out !== true) {
      fs.mkdirSync(path.dirname(String(out)), { recursive: true });
      fs.writeFileSync(String(out), JSON.stringify(ledger, null, 2) + "\n");
    }
    process.stdout.write(JSON.stringify(ledger, null, 2) + "\n");
    return;
  }

  fail("expected one of: fingerprint, match, accept, render, parse");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
