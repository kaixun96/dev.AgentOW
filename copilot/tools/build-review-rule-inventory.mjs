#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HASH_40 = /^[0-9a-f]{40}$/;
const HASH_64 = /^[0-9a-f]{64}$/;

const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const normalize = (value) => value
  .replace(/<!--.*?-->/g, " ")
  .replace(/[`*_#[\]()>|]/g, " ")
  .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, "")
  .replace(/\s+/g, " ")
  .trim();

function parseArgs(args) {
  const options = new Map();
  const references = [];
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`invalid option: ${key ?? ""}`);
    if (key === "--reference") references.push(value);
    else options.set(key, value);
    index += 1;
  }
  return { options, references };
}

export function extractRules(markdown, referenceId, referencePath) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const rules = [];
  let heading = "Document rules";
  let inFence = false;
  let paragraph = [];
  let paragraphLine = 0;
  let explicitId = null;
  const generatedIdCounts = new Map();

  const add = (text, line) => {
    const normalized = normalize(text);
    if (!normalized || /^:?-{3,}:?$/.test(normalized)) return;
    const baseId = `rr.${referenceId}.${digest(normalized).slice(0, 12)}`;
    const occurrence = (generatedIdCounts.get(baseId) ?? 0) + 1;
    generatedIdCounts.set(baseId, occurrence);
    const id = explicitId ?? (occurrence === 1 ? baseId : `${baseId}.${occurrence}`);
    rules.push({
      id,
      referenceId,
      path: referencePath,
      line,
      heading,
      textDigest: digest(normalized),
    });
    explicitId = null;
  };
  const flush = () => {
    if (paragraph.length > 0) add(paragraph.join(" "), paragraphLine);
    paragraph = [];
    paragraphLine = 0;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;
    if (/^\s*```/.test(line)) {
      flush();
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const marker = /<!--\s*review-rule:\s*([A-Za-z0-9_.-]+)\s*-->/.exec(line);
    if (marker) {
      flush();
      explicitId = marker[1];
      continue;
    }
    const headingMatch = /^\s*#{1,6}\s+(.+?)\s*$/.exec(line);
    if (headingMatch) {
      flush();
      heading = normalize(headingMatch[1]);
      continue;
    }
    if (line.trim() === "") {
      flush();
      continue;
    }
    if (/^\s*(?:[-+*]|\d+[.)])\s+/.test(line) || /^\s*\|.+\|\s*$/.test(line)) {
      flush();
      add(line, lineNumber);
      continue;
    }
    if (paragraph.length === 0) paragraphLine = lineNumber;
    paragraph.push(line.trim());
  }
  flush();
  return rules;
}

export function buildInventory({ repoRoot, references, reviewedHead, mergeBase, diffDigest }) {
  if (!HASH_40.test(reviewedHead) || !HASH_40.test(mergeBase) || !HASH_64.test(diffDigest)) {
    throw new Error("reviewedHead, mergeBase, and diffDigest must be immutable Git/diff hashes");
  }
  if (references.length === 0 || new Set(references).size !== references.length) {
    throw new Error("at least one unique --reference is required");
  }
  const inventoryReferences = [];
  const rules = [];
  const ids = new Set();
  for (const referencePath of references.sort()) {
    const normalizedPath = referencePath.replaceAll("\\", "/");
    const absolutePath = path.resolve(repoRoot, normalizedPath);
    const relativePath = path.relative(repoRoot, absolutePath).replaceAll("\\", "/");
    if (relativePath.startsWith("../") || path.isAbsolute(relativePath) || !fs.existsSync(absolutePath)) {
      throw new Error(`reference must be a readable repo-relative path: ${referencePath}`);
    }
    const content = fs.readFileSync(absolutePath, "utf8");
    const referenceId = path.basename(normalizedPath, path.extname(normalizedPath));
    const extracted = extractRules(content, referenceId, normalizedPath);
    inventoryReferences.push({ id: referenceId, path: normalizedPath, sourceDigest: digest(content) });
    for (const rule of extracted) {
      if (ids.has(rule.id)) throw new Error(`duplicate review rule id: ${rule.id}`);
      ids.add(rule.id);
      rules.push(rule);
    }
  }
  return {
    schemaVersion: 1,
    reviewedHead,
    mergeBase,
    diffDigest,
    references: inventoryReferences,
    rules: rules.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

function main() {
  const { options, references } = parseArgs(process.argv.slice(2));
  const outputPath = options.get("--out");
  if (!outputPath) throw new Error("--out is required");
  const repoRoot = path.resolve(options.get("--repo") ?? process.cwd());
  const registryPath = options.get("--registry");
  if (!registryPath || references.length > 0) {
    throw new Error("--registry is required and cannot be combined with --reference");
  }
  const registryContent = fs.readFileSync(path.resolve(registryPath), "utf8");
  const registry = JSON.parse(registryContent);
  if (
    registry.schemaVersion !== 1 ||
    !Array.isArray(registry.references) ||
    registry.references.length === 0 ||
    !registry.references.every((entry) => typeof entry === "string" && entry.trim().length > 0)
  ) {
    throw new Error("--registry must contain a non-empty schemaVersion 1 references array");
  }
  const inventory = buildInventory({
    repoRoot,
    references: registry.references,
    reviewedHead: options.get("--expected-head"),
    mergeBase: options.get("--expected-merge-base"),
    diffDigest: options.get("--expected-diff-digest"),
  });
  inventory.registryDigest = digest(registryContent);
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`);
  process.stdout.write(`${inventory.rules.length} review rules inventoried\n`);
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`build-review-rule-inventory: ${error.message}\n`);
    process.exitCode = 1;
  }
}