#!/usr/bin/env node

import fs from "node:fs";

const HASH_40 = /^[0-9a-f]{40}$/;
const HASH_64 = /^[0-9a-f]{64}$/;
const VERDICTS = new Set(["APPROVE", "REQUEST_CHANGES", "COMMENT"]);
const SEVERITIES = new Set(["Critical", "Important", "Minor"]);
const GATE_TYPES = new Set(["Flight", "KS", "Experiment", "Feature", "Rollout"]);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const nonEmptyStrings = (value) => Array.isArray(value) && value.length > 0 && value.every(nonEmpty);
const readLines = (filePath) =>
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).sort();
const sameStrings = (left, right) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

function parseOptions(args) {
  const options = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error(`invalid option: ${key ?? ""}`);
    options.set(key, value);
  }
  return options;
}

export function validateGraduationReview(report, options = new Map()) {
  const errors = [];
  if (!isObject(report) || report.schemaVersion !== 1 || report.reviewMode !== "graduation-only") {
    return ["graduation review requires schemaVersion 1 and reviewMode graduation-only"];
  }

  if (!HASH_40.test(report.reviewedHead ?? "")) errors.push("reviewedHead must be a lowercase 40-character SHA");
  if (!HASH_40.test(report.mergeBase ?? "")) errors.push("mergeBase must be a lowercase 40-character SHA");
  if (!HASH_64.test(report.diffDigest ?? "")) errors.push("diffDigest must be a lowercase 64-character SHA-256");
  if (!nonEmpty(report.summary)) errors.push("summary is required");
  if (!nonEmptyStrings(report.authorizationEvidence)) errors.push("authorizationEvidence is required");

  const expectedHead = options.get("--expected-head");
  if (expectedHead && report.reviewedHead !== expectedHead) errors.push("reviewedHead does not match current HEAD");
  const expectedDigest = options.get("--expected-diff-digest");
  if (expectedDigest && report.diffDigest !== expectedDigest) errors.push("diffDigest does not match current diff");

  if (!Array.isArray(report.gates) || report.gates.length === 0) {
    errors.push("gates must contain every retired gate");
  } else {
    const gateNames = new Set();
    for (const gate of report.gates) {
      if (
        !isObject(gate) ||
        !nonEmpty(gate.name) ||
        !GATE_TYPES.has(gate.type) ||
        !nonEmpty(gate.permanentState) ||
        !nonEmptyStrings(gate.directionEvidence) ||
        !nonEmptyStrings(gate.callSitesChecked) ||
        !nonEmptyStrings(gate.cleanupEvidence) ||
        !["complete", "finding"].includes(gate.disposition)
      ) {
        errors.push("every gate requires type, permanent state, direction, call-site, cleanup evidence, and disposition");
        continue;
      }
      if (gateNames.has(gate.name)) errors.push(`duplicate gate: ${gate.name}`);
      gateNames.add(gate.name);
    }
  }

  const changedFilesPath = options.get("--changed-files");
  let expectedFiles = [];
  if (!changedFilesPath || !fs.existsSync(changedFilesPath)) {
    errors.push("--changed-files must reference a readable Git-generated file list");
  } else {
    expectedFiles = readLines(changedFilesPath);
    if (expectedFiles.length === 0) errors.push("Git changed-file list must not be empty");
  }

  if (!Array.isArray(report.changedFiles) || report.changedFiles.length === 0) {
    errors.push("changedFiles is required");
  } else {
    const paths = [];
    for (const entry of report.changedFiles) {
      if (!isObject(entry) || !nonEmpty(entry.path) || entry.reviewedWholeFile !== true || !nonEmpty(entry.graduationDisposition)) {
        errors.push("every changed file requires whole-file review and graduationDisposition");
        continue;
      }
      paths.push(entry.path);
    }
    if (new Set(paths).size !== paths.length) errors.push("changedFiles contains duplicate paths");
    if (expectedFiles.length > 0 && !sameStrings([...paths].sort(), expectedFiles)) {
      errors.push("changedFiles must exactly match Git changed files");
    }
  }

  if (!isObject(report.validation) || !Array.isArray(report.validation.commandsRun) || !Array.isArray(report.validation.notRun)) {
    errors.push("validation requires commandsRun and notRun arrays");
  } else if (![...report.validation.commandsRun, ...report.validation.notRun].every(nonEmpty)) {
    errors.push("validation entries must be non-empty strings");
  }

  const findings = Array.isArray(report.findings) ? report.findings : [];
  if (!Array.isArray(report.findings)) errors.push("findings must be an array");
  const findingIds = new Set();
  for (const finding of findings) {
    if (
      !isObject(finding) ||
      !nonEmpty(finding.id) ||
      !SEVERITIES.has(finding.severity) ||
      !expectedFiles.includes(finding.path) ||
      !Number.isInteger(finding.line) ||
      finding.line < 1 ||
      !nonEmpty(finding.description) ||
      !nonEmpty(finding.suggestedFix) ||
      !nonEmptyStrings(finding.evidence)
    ) {
      errors.push("every finding requires valid severity, changed path, line, description, fix, and evidence");
      continue;
    }
    if (finding.severity === "Minor" && !finding.description.startsWith("Nit:")) {
      errors.push("Minor finding descriptions must start with Nit:");
    }
    if (findingIds.has(finding.id)) errors.push(`duplicate finding id: ${finding.id}`);
    findingIds.add(finding.id);
  }

  const counts = {
    critical: findings.filter((finding) => finding.severity === "Critical").length,
    important: findings.filter((finding) => finding.severity === "Important").length,
    minor: findings.filter((finding) => finding.severity === "Minor").length,
  };
  if (!isObject(report.counts) || Object.keys(counts).some((key) => report.counts[key] !== counts[key])) {
    errors.push("counts must match findings");
  }

  const expectedVerdict = counts.critical > 0 || counts.important > 0
    ? "REQUEST_CHANGES"
    : counts.minor > 0
      ? "COMMENT"
      : "APPROVE";
  if (!VERDICTS.has(report.verdict) || report.verdict !== expectedVerdict) {
    errors.push("verdict must match finding severities");
  }
  if (report.gates?.some((gate) => gate.disposition === "finding") && findings.length === 0) {
    errors.push("gate disposition finding requires a finding");
  }

  return errors;
}

function main() {
  const [reportPath, ...args] = process.argv.slice(2);
  if (!reportPath) {
    console.error("usage: validate-graduation-review-report.mjs <review.json> --changed-files PATH [--expected-head SHA] [--expected-diff-digest SHA256]");
    process.exit(2);
  }

  try {
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    const errors = validateGraduationReview(report, parseOptions(args));
    if (errors.length > 0) {
      for (const error of errors) console.error(error);
      process.exit(1);
    }
    console.log("graduation review report validated");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1") === process.argv[1].replaceAll("\\", "/")) {
  main();
}
