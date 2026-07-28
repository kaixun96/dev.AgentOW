#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DIMENSIONS = [
  "behavior",
  "callersConsumers",
  "tests",
  "typesContracts",
  "errorsEdgeCases",
  "securityPrivacy",
  "performance",
  "accessibilityUi",
  "localization",
  "compatibilityKillswitch",
  "repoInstructionsContext",
  "dependenciesTooling",
];
const SEVERITIES = new Set(["Critical", "Important", "Minor"]);
const VERDICTS = new Set(["APPROVE", "COMMENT", "REQUEST_CHANGES"]);
const HASH_40 = /^[0-9a-f]{40}$/;
const HASH_64 = /^[0-9a-f]{64}$/;
const DIMENSION_TERMS = {
  behavior: /\b(?:behavior|logic|flow|output|state)\b/i,
  callersConsumers: /\b(?:caller|consumer|usage|call site)\b/i,
  tests: /\b(?:test|coverage|assertion)\b/i,
  typesContracts: /\b(?:type|contract|interface|schema|api)\b/i,
  errorsEdgeCases: /\b(?:error|edge|failure|invalid|fallback)\b/i,
  securityPrivacy: /\b(?:security|privacy|auth|permission|trust|secret|injection)\b/i,
  performance: /\b(?:performance|allocation|latency|complexity|render|cache)\b/i,
  accessibilityUi: /\b(?:accessibility|a11y|aria|keyboard|focus|screen reader|ui)\b/i,
  localization: /\b(?:localization|locale|translation|resource|string)\b/i,
  compatibilityKillswitch: /\b(?:compatibility|backward|killswitch|rollback|migration|version)\b/i,
  repoInstructionsContext: /\b(?:instructions?|context|guidelines?|conventions?|documentation)\b/i,
  dependenciesTooling: /\b(?:dependency|tooling|package|build|lockfile|config)\b/i,
};

function parseArgs(argv) {
  const options = new Map();
  for (let index = 3; index < argv.length; index += 2) {
    options.set(argv[index], argv[index + 1]);
  }
  return { reportPath: argv[2], options };
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function specific(value) {
  return nonEmpty(value) && value.trim().length >= 24 && !/^(?:n\/a|none|not applicable|no consumers|no tests)\.?$/i.test(value.trim());
}

function evidenceReference(value) {
  return nonEmpty(value) && /^(?:[^:\n]+:\d+|command:.+|artifact:.+)$/.test(value.trim());
}

function fileEvidencePath(value) {
  const match = /^([^:\n]+):\d+$/.exec(value.trim());
  return match?.[1];
}

function boundedNoMatchSearch(value, subject) {
  if (!nonEmpty(value) || !value.trim().startsWith("command:")) return false;
  const command = value.trim().slice("command:".length);
  if (/[`;$|&<()\n]/.test(command)) return false;
  const match =
    /^rg (?:--glob [A-Za-z0-9_./*?{},[\]-]+ )?([A-Za-z0-9_.*?/-]+) ([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*) => (?:no matches|0 matches)$/i.exec(
      command,
    );
  if (!match) return false;
  const [, query, searchPath] = match;
  const normalizedPath = path.posix.normalize(searchPath);
  const boundedPath =
    !path.posix.isAbsolute(searchPath) &&
    !searchPath.startsWith("-") &&
    normalizedPath !== "." &&
    normalizedPath !== ".." &&
    !normalizedPath.startsWith("../");
  return boundedPath && subject.test(query);
}

function consumerEvidenceReference(value, changedPath) {
  if (!evidenceReference(value)) return false;
  const evidencePath = fileEvidencePath(value);
  return evidencePath !== undefined
    ? path.posix.normalize(evidencePath) !== path.posix.normalize(changedPath)
    : boundedNoMatchSearch(value, /\b(?:caller|consumer|usage|reference)\b/i);
}

function testEvidenceReference(value) {
  if (!evidenceReference(value)) return false;
  const evidencePath = fileEvidencePath(value);
  return evidencePath !== undefined
    ? /(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|$)|(?:\.test|\.spec)\.[^/]+$/i.test(evidencePath)
    : boundedNoMatchSearch(value, /\b(?:test|spec)\b/i);
}

function readLines(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validate(report, options) {
  const errors = [];
  if (!isObject(report) || report.schemaVersion !== 1) {
    errors.push("schemaVersion must be 1");
    return errors;
  }
  if (!HASH_40.test(report.reviewedHead ?? "")) errors.push("reviewedHead must be a 40-character lowercase commit SHA");
  if (!HASH_40.test(report.mergeBase ?? "")) errors.push("mergeBase must be a 40-character lowercase commit SHA");
  if (!HASH_64.test(report.diffDigest ?? "")) errors.push("diffDigest must be a 64-character lowercase SHA-256");
  if (!VERDICTS.has(report.verdict)) errors.push("verdict is invalid");
  if (!nonEmpty(report.summary)) errors.push("summary is required");

  const expectedHead = options.get("--expected-head");
  if (expectedHead && report.reviewedHead !== expectedHead) errors.push("reviewedHead does not match current HEAD");
  const expectedDigest = options.get("--expected-diff-digest");
  if (expectedDigest && report.diffDigest !== expectedDigest) errors.push("diffDigest does not match the current diff");

  if (!Array.isArray(report.riskMap) || report.riskMap.length === 0) {
    errors.push("riskMap must contain every changed file");
  }
  const riskPaths = new Set();
  for (const entry of report.riskMap ?? []) {
    if (!isObject(entry) || !nonEmpty(entry.path) || !["low", "medium", "high"].includes(entry.risk) || !specific(entry.rationale)) {
      errors.push("every riskMap entry requires path, low|medium|high risk, and rationale");
      continue;
    }
    if (riskPaths.has(entry.path)) errors.push(`duplicate riskMap path: ${entry.path}`);
    riskPaths.add(entry.path);
  }

  const changedFileCoverage = report.coverage?.changedFiles;
  if (!Array.isArray(changedFileCoverage) || changedFileCoverage.length === 0) {
    errors.push("coverage.changedFiles is required");
  }
  const coveredPaths = new Set();
  for (const entry of changedFileCoverage ?? []) {
    if (
      !isObject(entry) ||
      !nonEmpty(entry.path) ||
      entry.reviewedWholeFile !== true ||
      !Array.isArray(entry.evidence) ||
      entry.evidence.length === 0 ||
      !entry.evidence.every(evidenceReference) ||
      !Array.isArray(entry.directConsumersChecked) ||
      entry.directConsumersChecked.length === 0 ||
      !entry.directConsumersChecked.every((reference) => consumerEvidenceReference(reference, entry.path)) ||
      !specific(entry.consumerDisposition) ||
      !Array.isArray(entry.testsChecked) ||
      entry.testsChecked.length === 0 ||
      !entry.testsChecked.every(testEvidenceReference) ||
      !specific(entry.testDisposition) ||
      !specific(entry.disposition)
    ) {
      errors.push("every changed file requires whole-file review, evidence, consumer/test analysis, and disposition");
      continue;
    }
    if (coveredPaths.has(entry.path)) errors.push(`duplicate changed-file coverage path: ${entry.path}`);
    coveredPaths.add(entry.path);
  }

  const changedFilesPath = options.get("--changed-files");
  if (!changedFilesPath || !fs.existsSync(changedFilesPath)) {
    errors.push("--changed-files must reference a readable Git-generated file list");
  } else {
    const expectedFiles = readLines(changedFilesPath);
    if (expectedFiles.length === 0) errors.push("Git changed-file list must not be empty");
    const riskFiles = [...riskPaths].sort();
    const coverageFiles = [...coveredPaths].sort();
    if (!sameStrings(expectedFiles, riskFiles)) errors.push("riskMap paths do not exactly match Git changed files");
    if (!sameStrings(expectedFiles, coverageFiles)) errors.push("coverage.changedFiles paths do not exactly match Git changed files");
  }

  const dimensions = report.coverage?.dimensions;
  if (!isObject(dimensions)) {
    errors.push("coverage.dimensions is required");
  } else {
    const reviewedConclusions = new Set();
    for (const dimension of DIMENSIONS) {
      const entry = dimensions[dimension];
      const validReviewed =
        isObject(entry) &&
        entry.status === "reviewed" &&
        Array.isArray(entry.evidence) &&
        entry.evidence.length > 0 &&
        entry.evidence.every(evidenceReference) &&
        specific(entry.conclusion) &&
        DIMENSION_TERMS[dimension].test(entry.conclusion);
      const validNotApplicable =
        isObject(entry) &&
        entry.status === "not-applicable" &&
        Array.isArray(entry.evidence) &&
        entry.evidence.every(evidenceReference) &&
        specific(entry.reason) &&
        specific(entry.conclusion);
      if (!validReviewed && !validNotApplicable) {
        errors.push(`coverage dimension ${dimension} requires status, evidence, and conclusion`);
      } else if (entry.status === "reviewed") {
        const conclusion = entry.conclusion.trim().toLowerCase().replace(/\s+/g, " ");
        if (reviewedConclusions.has(conclusion)) {
          errors.push(`coverage dimension ${dimension} repeats a padded conclusion`);
        }
        reviewedConclusions.add(conclusion);
      }
    }
  }

  if (
    report.secondPass?.completed !== true ||
    !Array.isArray(report.secondPass?.checks) ||
    report.secondPass.checks.length === 0
  ) {
    errors.push("secondPass must be completed with at least one adversarial check");
  } else {
    for (const check of report.secondPass.checks) {
      if (
        !isObject(check) ||
        !nonEmpty(check.hypothesis) ||
        !Array.isArray(check.evidence) ||
        check.evidence.length === 0 ||
        !check.evidence.every(evidenceReference) ||
        !specific(check.result)
      ) {
        errors.push("every second-pass check requires hypothesis, evidence, and result");
      }
    }
  }

  if (!Array.isArray(report.findings)) errors.push("findings must be an array");
  const actualCounts = { critical: 0, important: 0, minor: 0 };
  for (const finding of report.findings ?? []) {
    if (
      !isObject(finding) ||
      !nonEmpty(finding.id) ||
      !SEVERITIES.has(finding.severity) ||
      !nonEmpty(finding.category) ||
      !nonEmpty(finding.path) ||
      !Number.isInteger(finding.line) ||
      finding.line < 1 ||
      !nonEmpty(finding.description) ||
      !nonEmpty(finding.impact) ||
      !nonEmpty(finding.suggestedFix) ||
      !Array.isArray(finding.evidence) ||
      finding.evidence.length === 0 ||
      !finding.evidence.every(evidenceReference)
    ) {
      errors.push("every finding requires severity, citation, impact, fix, and evidence");
      continue;
    }
    actualCounts[finding.severity.toLowerCase()]++;
  }

  const counts = report.counts;
  if (
    !isObject(counts) ||
    counts.critical !== actualCounts.critical ||
    counts.important !== actualCounts.important ||
    counts.minor !== actualCounts.minor
  ) {
    errors.push("counts do not match findings");
  }

  const expectedVerdict =
    actualCounts.critical > 0 || actualCounts.important > 0
      ? "REQUEST_CHANGES"
      : actualCounts.minor > 0
        ? "COMMENT"
        : "APPROVE";
  if (report.verdict !== expectedVerdict) errors.push(`verdict must be ${expectedVerdict} for the reported findings`);
  return errors;
}

const { reportPath, options } = parseArgs(process.argv);
if (!reportPath) {
  console.error("usage: validate-review-report.mjs <review.json> [--expected-head SHA] [--expected-diff-digest SHA256] [--changed-files PATH]");
  process.exit(2);
}

let report;
try {
  report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
} catch (error) {
  console.log(JSON.stringify({ ok: false, errors: [`cannot parse review report: ${error.message}`] }));
  process.exit(1);
}
const errors = validate(report, options);
console.log(JSON.stringify({ ok: errors.length === 0, errors }));
process.exit(errors.length === 0 ? 0 : 1);
