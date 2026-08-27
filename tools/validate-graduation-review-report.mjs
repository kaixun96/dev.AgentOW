#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const HASH_40 = /^[0-9a-f]{40}$/;
const HASH_64 = /^[0-9a-f]{64}$/;
const VERDICTS = new Set(["APPROVE", "REQUEST_CHANGES", "COMMENT"]);
const SEVERITIES = new Set(["Critical", "Important", "Minor"]);
const GATE_TYPES = new Set(["Flight", "KS", "Experiment", "Feature", "Rollout"]);
const RESIDUAL_KINDS = new Set(["fixed-return-helper", "retained-export", "fixed-parameter", "fixed-conditional"]);
const REQUIRED_RULE_CHECKS = [
  "permanent-branch",
  "fixed-carriers",
  "fixed-inputs",
  "obsolete-control-flow",
  "discarded-evaluations",
  "transitive-gates",
  "stale-artifacts",
  "runtime-entry-points",
  "coverage-and-tests",
  "scope-purity",
  "minor-cleanup",
];
const RULE_CHECK_STATUSES = new Set(["clear", "finding", "suggestion", "not-applicable"]);

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const specific = (value) => nonEmpty(value) && value.trim().length >= 24;
const digest = (value) => crypto.createHash("sha256").update(value).digest("hex");
const nonEmptyStrings = (value) => Array.isArray(value) && value.length > 0 && value.every(nonEmpty);
const readLines = (filePath) =>
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).sort();
const readJsonLines = (filePath) =>
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
const sameStrings = (left, right) =>
  left.length === right.length && left.every((value, index) => value === right[index]);
const boundedNoMatchSearch = (value) => {
  if (!nonEmpty(value) || !value.trim().startsWith("command:")) return false;
  const command = value.trim().slice("command:".length);
  if (/[`;$|&<()\n]/.test(command)) return false;
  const match = /^rg (?:--glob [A-Za-z0-9_./*?{},[\]-]+ )?([A-Za-z0-9_.*?/-]+) ([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*) => (?:no matches|0 matches)$/i.exec(command);
  if (!match) return false;
  const query = match[1];
  const searchPath = match[2];
  const normalizedPath = path.posix.normalize(searchPath);
  return !query.startsWith("-") &&
    !path.posix.isAbsolute(searchPath) &&
    !searchPath.startsWith("-") &&
    normalizedPath !== "." &&
    normalizedPath !== ".." &&
    !normalizedPath.startsWith("../");
};
const boundedClassSweepSearch = (value) => {
  if (!nonEmpty(value) || !value.trim().startsWith("command:")) return false;
  const command = value.trim().slice("command:".length);
  if (/[`$|&<()\n]/.test(command)) return false;
  const match = /^rg (?:--glob [A-Za-z0-9_./*?{},[\]-]+ )?([A-Za-z0-9_.*?/-]+) ([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*) => (?:(?:no|0) matches|\d+ matches; all accounted)$/i.exec(command);
  if (!match || match[1].startsWith("-")) return false;
  const searchPath = match[2];
  const normalizedPath = path.posix.normalize(searchPath);
  return !path.posix.isAbsolute(searchPath) &&
    !searchPath.startsWith("-") &&
    normalizedPath !== "." &&
    normalizedPath !== ".." &&
    !normalizedPath.startsWith("../");
};
const evidenceReference = (value) => {
  if (!nonEmpty(value)) return false;
  const evidence = value.trim();
  if (/^[^:\n]+:\d+(?::\d+)?$/.test(evidence) || /^artifact:.+/.test(evidence)) return true;
  if (!evidence.startsWith("command:")) return false;
  return /=> (?:no matches|0 matches)$/i.test(evidence)
    ? boundedNoMatchSearch(evidence)
    : /^command:[^`;$|&<()\n]+ => .+$/.test(evidence);
};
const evidenceReferences = (value) => nonEmptyStrings(value) && value.every(evidenceReference);

function validateRuleInventory(report, options, errors) {
  const inventoryPath = options.get("--rule-inventory");
  const registryPath = options.get("--rule-registry");
  let expectedRuleIds = [];
  if (!inventoryPath || !fs.existsSync(inventoryPath) || !registryPath || !fs.existsSync(registryPath)) {
    errors.push("--rule-inventory and --rule-registry must reference caller-owned graduation inputs");
  } else {
    try {
      const inventory = JSON.parse(fs.readFileSync(inventoryPath, "utf8"));
      const registryContent = fs.readFileSync(registryPath, "utf8");
      const registry = JSON.parse(registryContent);
      const rules = Array.isArray(inventory.rules) ? inventory.rules : [];
      const references = Array.isArray(inventory.references) ? inventory.references : [];
      expectedRuleIds = rules.map((rule) => rule?.id);
      const registryReferences = Array.isArray(registry.references) ? registry.references : [];
      const referencePaths = references.map((reference) => reference?.path);
      const referenceIds = references.map((reference) => reference?.id);
      const registryRoot = path.dirname(path.resolve(registryPath));
      const sourcesMatch = references.every((reference) => {
        if (!isObject(reference) || !nonEmpty(reference.path) || !HASH_64.test(reference.sourceDigest ?? "")) return false;
        const sourcePath = path.resolve(registryRoot, reference.path);
        const relativePath = path.relative(registryRoot, sourcePath);
        return !relativePath.startsWith("..") && fs.existsSync(sourcePath) && digest(fs.readFileSync(sourcePath, "utf8")) === reference.sourceDigest;
      });
      if (
        inventory.schemaVersion !== 1 || registry.schemaVersion !== 1 ||
        inventory.registryDigest !== digest(registryContent) ||
        inventory.reviewedHead !== report.reviewedHead || inventory.mergeBase !== report.mergeBase ||
        inventory.diffDigest !== report.diffDigest || references.length === 0 || rules.length === 0 ||
        !sameStrings([...referencePaths].sort(), [...registryReferences].sort()) ||
        new Set(referencePaths).size !== referencePaths.length || new Set(referenceIds).size !== referenceIds.length ||
        !sourcesMatch || !expectedRuleIds.every(nonEmpty) || new Set(expectedRuleIds).size !== expectedRuleIds.length ||
        rules.some((rule) => !referenceIds.includes(rule?.referenceId) || !referencePaths.includes(rule?.path))
      ) {
        errors.push("graduation rule inventory must exactly match its registry, source, and reviewed diff identity");
      }
    } catch {
      errors.push("graduation rule inventory and registry must contain valid readable inputs");
    }
  }

  const reportedRuleIds = [];
  const linkedFindingIds = new Set();
  if (!Array.isArray(report.ruleResults)) {
    errors.push("ruleResults must account for every graduation reference rule");
  } else {
    for (const result of report.ruleResults) {
      if (
        !isObject(result) || !nonEmpty(result.ruleId) ||
        !["satisfied", "not-applicable", "finding"].includes(result.disposition) ||
        !evidenceReferences(result.evidence) || !specific(result.conclusion) ||
        (result.disposition === "finding" && !nonEmptyStrings(result.findingIds)) ||
        (result.disposition !== "finding" && result.findingIds !== undefined)
      ) {
        errors.push("every graduation rule result requires an expected rule, disposition, evidence, conclusion, and applicable linkage");
        continue;
      }
      reportedRuleIds.push(result.ruleId);
      if (result.disposition === "finding") result.findingIds.forEach((id) => linkedFindingIds.add(id));
    }
    if (!sameStrings([...reportedRuleIds].sort(), [...expectedRuleIds].sort())) {
      errors.push("ruleResults must exactly match every caller-owned graduation rule id");
    }
  }
  return linkedFindingIds;
}

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
  if (!evidenceReferences(report.authorizationEvidence)) errors.push("authorizationEvidence must contain valid evidence references");

  const expectedHead = options.get("--expected-head");
  if (!expectedHead || report.reviewedHead !== expectedHead) errors.push("reviewedHead does not match current HEAD");
  const expectedMergeBase = options.get("--expected-merge-base");
  if (!expectedMergeBase || report.mergeBase !== expectedMergeBase) errors.push("mergeBase does not match the expected merge base");
  const expectedDigest = options.get("--expected-diff-digest");
  if (!expectedDigest || report.diffDigest !== expectedDigest) errors.push("diffDigest does not match current diff");
  const linkedRuleFindingIds = validateRuleInventory(report, options, errors);

  const expectedGatesPath = options.get("--expected-gates");
  let expectedGates = [];
  if (!expectedGatesPath || !fs.existsSync(expectedGatesPath)) {
    errors.push("--expected-gates must reference the independent gate inventory");
  } else {
    expectedGates = readLines(expectedGatesPath);
    if (expectedGates.length === 0) errors.push("gate inventory must not be empty");
  }

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
        !evidenceReferences(gate.directionEvidence) ||
        !evidenceReferences(gate.callSitesChecked) ||
        !evidenceReferences(gate.cleanupEvidence) ||
        !["complete", "finding"].includes(gate.disposition)
      ) {
        errors.push("every gate requires type, permanent state, direction, call-site, cleanup evidence, and disposition");
        continue;
      }
      if (gate.disposition === "complete" && !gate.cleanupEvidence.some(boundedNoMatchSearch)) {
        errors.push(`complete gate ${gate.name} requires a bounded no-match cleanup search`);
      }
      if (!Array.isArray(gate.ruleChecks)) {
        errors.push(`gate ${gate.name} requires explicit ruleChecks`);
      } else {
        const checkedRules = [];
        for (const check of gate.ruleChecks) {
          if (
            !isObject(check) ||
            !REQUIRED_RULE_CHECKS.includes(check.rule) ||
            !RULE_CHECK_STATUSES.has(check.status) ||
            !evidenceReferences(check.evidence) ||
            (["finding", "suggestion"].includes(check.status) &&
              (!nonEmptyStrings(check.findingIds) || new Set(check.findingIds).size !== check.findingIds.length)) ||
            (["clear", "not-applicable"].includes(check.status) && check.findingIds !== undefined)
          ) {
            errors.push(`gate ${gate.name} has an invalid rule check`);
            continue;
          }
          checkedRules.push(check.rule);
        }
        if (!sameStrings([...checkedRules].sort(), [...REQUIRED_RULE_CHECKS].sort())) {
          errors.push(`gate ${gate.name} ruleChecks must exactly cover every required rule class`);
        }
      }
      if (gateNames.has(gate.name)) errors.push(`duplicate gate: ${gate.name}`);
      gateNames.add(gate.name);
    }
    if (expectedGates.length > 0 && !sameStrings([...gateNames].sort(), expectedGates)) {
      errors.push("reported gates must exactly match the independent gate inventory");
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

  const deletedFilesPath = options.get("--deleted-files");
  let deletedFiles = [];
  if (!deletedFilesPath || !fs.existsSync(deletedFilesPath)) {
    errors.push("--deleted-files must reference a Git-generated deleted-file list");
  } else {
    deletedFiles = readLines(deletedFilesPath);
    if (new Set(deletedFiles).size !== deletedFiles.length) errors.push("deleted-file list contains duplicate paths");
    if (expectedFiles.length > 0 && deletedFiles.some((file) => !expectedFiles.includes(file))) {
      errors.push("deleted files must be a subset of Git changed files");
    }
  }
  const deletedFileSet = new Set(deletedFiles);

  const residualCandidatesPath = options.get("--residual-candidates");
  let expectedResidualCandidates = [];
  if (!residualCandidatesPath || !fs.existsSync(residualCandidatesPath)) {
    errors.push("--residual-candidates must reference the independent residual inventory");
  } else {
    try {
      expectedResidualCandidates = readJsonLines(residualCandidatesPath);
      const expectedResidualIds = new Set();
      for (const candidate of expectedResidualCandidates) {
        if (
          !isObject(candidate) ||
          !nonEmpty(candidate.id) ||
          !expectedGates.includes(candidate.gateName) ||
          !RESIDUAL_KINDS.has(candidate.kind) ||
          !nonEmpty(candidate.symbol) ||
          !expectedFiles.includes(candidate.path) ||
          !Number.isInteger(candidate.line) ||
          candidate.line < 1
        ) {
          errors.push("independent residual inventory contains an invalid candidate");
          continue;
        }
        if (expectedResidualIds.has(candidate.id)) errors.push(`duplicate residual candidate: ${candidate.id}`);
        expectedResidualIds.add(candidate.id);
      }
    } catch {
      errors.push("--residual-candidates must contain valid NDJSON");
    }
  }

  if (!Array.isArray(report.changedFiles) || report.changedFiles.length === 0) {
    errors.push("changedFiles is required");
  } else {
    const paths = [];
    for (const entry of report.changedFiles) {
      const expectedVersion = deletedFileSet.has(entry?.path) ? "merge-base" : "head";
      if (!isObject(entry) || !nonEmpty(entry.path) || entry.reviewedWholeFile !== true || entry.reviewedVersion !== expectedVersion || !nonEmpty(entry.graduationDisposition)) {
        errors.push("every changed file requires whole-file review, correct reviewedVersion, and graduationDisposition");
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
      !expectedGates.includes(finding.gateName) ||
      !SEVERITIES.has(finding.severity) ||
      !expectedFiles.includes(finding.path) ||
      !Number.isInteger(finding.line) ||
      finding.line < 1 ||
      !nonEmpty(finding.description) ||
      !nonEmpty(finding.suggestedFix) ||
      !evidenceReferences(finding.evidence)
    ) {
      errors.push("every finding requires a valid gate, severity, changed path, line, description, fix, and evidence");
      continue;
    }
    if (finding.severity === "Minor" && !finding.description.startsWith("Nit:")) {
      errors.push("Minor finding descriptions must start with Nit:");
    }
    if (["Critical", "Important"].includes(finding.severity) &&
      (!nonEmptyStrings(finding.classSweepEvidence) || !finding.classSweepEvidence.every(boundedClassSweepSearch))) {
      errors.push(`blocking finding ${finding.id} requires bounded rg classSweepEvidence with explicit accounting`);
    }
    if (findingIds.has(finding.id)) errors.push(`duplicate finding id: ${finding.id}`);
    findingIds.add(finding.id);
  }
  if ([...findingIds].some((id) => !linkedRuleFindingIds.has(id)) || [...linkedRuleFindingIds].some((id) => !findingIds.has(id))) {
    errors.push("graduation ruleResults must account for every finding exactly by id");
  }

  const ruleCheckFindingIds = [];
  for (const gate of Array.isArray(report.gates) ? report.gates : []) {
    for (const check of Array.isArray(gate?.ruleChecks) ? gate.ruleChecks : []) {
      if (!["finding", "suggestion"].includes(check?.status) || !Array.isArray(check.findingIds)) continue;
      ruleCheckFindingIds.push(...check.findingIds);
      const expectedSeverities = check.status === "finding" ? ["Critical", "Important"] : ["Minor"];
      if (check.findingIds.some((id) => {
        const finding = findings.find((entry) => entry?.id === id);
        return !finding || finding.gateName !== gate.name || !expectedSeverities.includes(finding.severity);
      })) {
        errors.push(`gate ${gate.name} ${check.rule} rule check must reference matching ${check.status} findings`);
      }
    }
  }
  if (!sameStrings(ruleCheckFindingIds.filter(nonEmpty).sort(), [...findingIds].sort())) {
    errors.push("ruleChecks must account for every finding exactly by id");
  }

  const expectedResidualById = new Map(expectedResidualCandidates.map((candidate) => [candidate?.id, candidate]));
  if (!Array.isArray(report.residualCandidates)) {
    errors.push("residualCandidates must account for the independent residual inventory");
  } else {
    const reportedResidualIds = new Set();
    for (const candidate of report.residualCandidates) {
      const expected = expectedResidualById.get(candidate?.id);
      if (
        !isObject(candidate) ||
        !expected ||
        candidate.gateName !== expected.gateName ||
        candidate.kind !== expected.kind ||
        candidate.symbol !== expected.symbol ||
        candidate.path !== expected.path ||
        candidate.line !== expected.line ||
        !["finding", "independent-contract"].includes(candidate.disposition)
      ) {
        errors.push("every residual candidate must exactly match the independent inventory and have a disposition");
        continue;
      }
      if (candidate.disposition === "finding") {
        const finding = findings.find((entry) => entry?.id === candidate.findingId);
        if (!finding || finding.gateName !== candidate.gateName || !["Critical", "Important"].includes(finding.severity)) {
          errors.push(`residual candidate ${candidate.id} must reference a blocking finding for the same gate`);
        }
      } else if (!evidenceReferences(candidate.independentSemanticEvidence) || !evidenceReferences(candidate.externalCallerEvidence)) {
        errors.push(`residual candidate ${candidate.id} requires independent semantic and external caller evidence`);
      }
      if (reportedResidualIds.has(candidate.id)) errors.push(`duplicate reported residual candidate: ${candidate.id}`);
      reportedResidualIds.add(candidate.id);
    }
    if (!sameStrings([...reportedResidualIds].sort(), [...expectedResidualById.keys()].filter(nonEmpty).sort())) {
      errors.push("residualCandidates must exactly match the independent residual inventory");
    }
  }

  const counts = {
    critical: findings.filter((finding) => finding?.severity === "Critical").length,
    important: findings.filter((finding) => finding?.severity === "Important").length,
    minor: findings.filter((finding) => finding?.severity === "Minor").length,
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
  const dispositionFindingGates = (report.gates ?? [])
    .filter((gate) => gate?.disposition === "finding")
    .map((gate) => gate?.name)
    .sort();
  const findingGates = [...new Set(findings.map((finding) => finding?.gateName).filter(nonEmpty))].sort();
  if (!sameStrings(dispositionFindingGates, findingGates)) {
    errors.push("gate finding dispositions must exactly match gates referenced by findings");
  }

  return errors;
}

function main() {
  const [reportPath, ...args] = process.argv.slice(2);
  if (!reportPath) {
    console.error("usage: validate-graduation-review-report.mjs <review.json> --changed-files PATH --deleted-files PATH --expected-gates PATH --residual-candidates PATH --expected-merge-base SHA --expected-head SHA --expected-diff-digest SHA256 --rule-inventory PATH --rule-registry PATH");
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
