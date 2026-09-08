#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HASH_40 = /^[0-9a-f]{40}$/;
const HASH_64 = /^[0-9a-f]{64}$/;
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");

function parseArgs(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 2) {
    if (!args[index]?.startsWith("--") || args[index + 1] === undefined) throw new Error(`invalid option: ${args[index] ?? ""}`);
    options.set(args[index], args[index + 1]);
  }
  return options;
}

const normalizePath = (value) => value.replaceAll("\\", "/").replace(/^\.\//, "");
const globPattern = (glob) => new RegExp(`^${glob.split(/([*?])/).map((part) => {
  if (part === "*") return "[^/]*";
  if (part === "?") return "[^/]";
  return part.replace(/[\\^$+.()|[\]{}]/g, "\\$&");
}).join("").replaceAll("[^/]*[^/]*", ".*")}$`, "i");

function readRepoFile(repoRoot, repoPath) {
  const normalized = normalizePath(repoPath);
  const absolute = path.resolve(repoRoot, normalized);
  const relative = normalizePath(path.relative(repoRoot, absolute));
  if (relative.startsWith("../") || path.isAbsolute(relative) || !fs.statSync(absolute, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`specialized review path must be a readable repo-relative file: ${repoPath}`);
  }
  return { path: normalized, content: fs.readFileSync(absolute, "utf8") };
}

function matchTriggers(triggers, changedFiles, searchableDiff) {
  const evidence = [];
  for (const glob of triggers?.paths ?? []) {
    const matches = changedFiles.filter((file) => globPattern(glob).test(file));
    if (matches.length > 0) evidence.push(`path:${glob}=>${matches.slice(0, 5).join(",")}`);
  }
  for (const term of triggers?.terms ?? []) {
    if (typeof term === "string" && term.trim() && searchableDiff.toLowerCase().includes(term.toLowerCase())) {
      evidence.push(`term:${term}`);
    }
  }
  return evidence;
}

export function buildRouting({ repoRoot, manifestPath, reviewedHead, mergeBase, diffDigest, changedFiles, diff }) {
  if (!HASH_40.test(reviewedHead) || !HASH_40.test(mergeBase) || !HASH_64.test(diffDigest)) {
    throw new Error("reviewedHead, mergeBase, and diffDigest must be immutable Git/diff hashes");
  }
  const result = { schemaVersion: 1, reviewedHead, mergeBase, diffDigest, discovery: {}, skills: [] };
  const absoluteManifest = path.resolve(repoRoot, manifestPath);
  if (!fs.existsSync(absoluteManifest)) {
    result.discovery = { status: "unconfigured", manifestPath: normalizePath(manifestPath), reason: "repository manifest not found" };
    return result;
  }
  const manifestFile = readRepoFile(repoRoot, manifestPath);
  const manifest = JSON.parse(manifestFile.content);
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.skills)) throw new Error("review skill manifest must contain schemaVersion 1 and a skills array");
  result.discovery = { status: "configured", manifestPath: manifestFile.path, manifestDigest: digest(manifestFile.content) };
  const searchableDiff = `${changedFiles.join("\n")}\n${diff}`;
  const ids = new Set();
  for (const skill of manifest.skills) {
    if (!skill || typeof skill.id !== "string" || !skill.id || ids.has(skill.id) || typeof skill.path !== "string") {
      throw new Error("every specialized review skill requires a unique id and path");
    }
    ids.add(skill.id);
    const skillFile = readRepoFile(repoRoot, skill.path);
    const evidence = matchTriggers(skill.triggers, changedFiles, searchableDiff);
    const selected = evidence.length > 0;
    const entry = {
      id: skill.id,
      path: skillFile.path,
      sourceDigest: digest(skillFile.content),
      disposition: selected ? "selected" : "ignored",
      evidence: selected ? evidence : ["no declared trigger matched the immutable changed-file list or diff"],
      packs: [],
    };
    for (const pack of skill.packs ?? []) {
      if (!pack || typeof pack.id !== "string" || typeof pack.path !== "string") throw new Error(`skill ${skill.id} has an invalid pack`);
      const packFile = readRepoFile(repoRoot, pack.path);
      const packEvidence = selected ? matchTriggers(pack.triggers, changedFiles, searchableDiff) : [];
      entry.packs.push({
        id: pack.id,
        path: packFile.path,
        sourceDigest: digest(packFile.content),
        disposition: packEvidence.length > 0 ? "selected" : "ignored",
        evidence: packEvidence.length > 0 ? packEvidence : [selected ? "no declared pack trigger matched" : "parent skill was not selected"],
      });
    }
    result.skills.push(entry);
  }
  return result;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = options.get("--out");
  const changedFilesPath = options.get("--changed-files");
  const diffPath = options.get("--diff");
  if (!outputPath || !changedFilesPath || !diffPath) throw new Error("--out, --changed-files, and --diff are required");
  const repoRoot = path.resolve(options.get("--repo") ?? process.cwd());
  const routing = buildRouting({
    repoRoot,
    manifestPath: options.get("--manifest") ?? ".agentow/review-skills.json",
    reviewedHead: options.get("--expected-head"),
    mergeBase: options.get("--expected-merge-base"),
    diffDigest: options.get("--expected-diff-digest"),
    changedFiles: fs.readFileSync(changedFilesPath, "utf8").split(/\r?\n/).map(normalizePath).filter(Boolean),
    diff: fs.readFileSync(diffPath, "utf8"),
  });
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(routing, null, 2)}\n`);
  process.stdout.write(`${routing.skills.filter((skill) => skill.disposition === "selected").length} specialized review skills selected\n`);
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  try { main(); } catch (error) {
    process.stderr.write(`build-review-skill-routing: ${error.message}\n`);
    process.exitCode = 1;
  }
}
