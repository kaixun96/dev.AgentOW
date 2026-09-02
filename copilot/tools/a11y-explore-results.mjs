#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CATEGORIES = [
  "keyboard-focus",
  "screen-reader",
  "structure-semantics",
  "orientation-input-purpose",
  "visual-color",
  "timing-motion",
  "dynamic-content",
  "touch-pointer",
  "authentication-forms",
];

const STATUSES = new Set(["completed", "blocked", "inconclusive", "skipped-environment", "failed"]);
const PRODUCERS = new Set(["copilot-browser", "windows-host", "twin", "external"]);
const CLASSIFICATIONS = new Set(["VIOLATION", "BEST-PRACTICE", "PASS", "NEEDS-REVIEW"]);
const SEVERITIES = new Set(["Critical", "High", "Medium", "Low"]);
const SHA256 = /^[a-f0-9]{64}$/;
const CATEGORY_SC = {
  "keyboard-focus": ["2.1.1", "2.1.2", "2.1.4", "2.4.3", "2.4.7", "2.4.11"],
  "screen-reader": [
    "1.1.1",
    "1.2.1",
    "1.2.2",
    "1.2.3",
    "1.2.4",
    "1.2.5",
    "1.3.1",
    "1.3.2",
    "2.4.2",
    "2.4.4",
    "3.3.2",
    "4.1.2",
    "4.1.3",
  ],
  "structure-semantics": [
    "1.3.1",
    "1.3.2",
    "1.3.3",
    "1.3.5",
    "2.4.1",
    "2.4.5",
    "2.4.6",
    "3.1.1",
    "3.1.2",
  ],
  "orientation-input-purpose": ["1.3.4", "1.3.5"],
  "visual-color": [
    "1.4.1",
    "1.4.2",
    "1.4.3",
    "1.4.4",
    "1.4.5",
    "1.4.10",
    "1.4.11",
    "1.4.12",
    "1.4.13",
  ],
  "timing-motion": ["2.2.1", "2.2.2", "2.3.1"],
  "dynamic-content": ["1.3.2", "2.4.3", "3.2.1", "3.2.2", "3.2.3", "3.2.4", "3.2.6", "4.1.3"],
  "touch-pointer": ["2.5.1", "2.5.2", "2.5.3", "2.5.4", "2.5.7", "2.5.8"],
  "authentication-forms": ["3.3.1", "3.3.2", "3.3.3", "3.3.4", "3.3.7", "3.3.8"],
};
const A_AA_SC = new Set([
  "1.1.1",
  "1.2.1",
  "1.2.2",
  "1.2.3",
  "1.2.4",
  "1.2.5",
  "1.3.1",
  "1.3.2",
  "1.3.3",
  "1.3.4",
  "1.3.5",
  "1.4.1",
  "1.4.2",
  "1.4.3",
  "1.4.4",
  "1.4.5",
  "1.4.10",
  "1.4.11",
  "1.4.12",
  "1.4.13",
  "2.1.1",
  "2.1.2",
  "2.1.4",
  "2.2.1",
  "2.2.2",
  "2.3.1",
  "2.4.1",
  "2.4.2",
  "2.4.3",
  "2.4.4",
  "2.4.5",
  "2.4.6",
  "2.4.7",
  "2.4.11",
  "2.5.1",
  "2.5.2",
  "2.5.3",
  "2.5.4",
  "2.5.7",
  "2.5.8",
  "3.1.1",
  "3.1.2",
  "3.2.1",
  "3.2.2",
  "3.2.3",
  "3.2.4",
  "3.2.6",
  "3.3.1",
  "3.3.2",
  "3.3.3",
  "3.3.4",
  "3.3.7",
  "3.3.8",
  "4.1.2",
  "4.1.3",
]);
const CLAIM_RULES = {
  "browser-keyboard-tested": {
    producers: ["copilot-browser"],
    evidence: ["screenshot", "focus-sequence"],
  },
  "browser-semantics-tested": {
    producers: ["copilot-browser"],
    evidence: ["screenshot", "accessibility-tree"],
  },
  "browser-visual-tested": {
    producers: ["copilot-browser"],
    evidence: ["screenshot", "measurement"],
  },
  "browser-dynamic-tested": {
    producers: ["copilot-browser"],
    evidence: ["screenshot", "interaction-log"],
  },
  "browser-touch-pointer-tested": {
    producers: ["copilot-browser"],
    evidence: ["screenshot", "measurement", "interaction-log"],
  },
  "browser-forms-tested": {
    producers: ["copilot-browser"],
    evidence: ["screenshot", "accessibility-tree"],
  },
  "nvda-tested": {
    producers: ["windows-host", "twin", "external"],
    evidence: ["nvda-transcript", "screenshot", "uia-state"],
  },
  "narrator-tested": {
    producers: ["windows-host", "twin", "external"],
    evidence: ["narrator-etl", "screenshot", "uia-state"],
  },
  "voice-access-tested": {
    producers: ["windows-host", "twin", "external"],
    evidence: [
      "voice-access-result",
      "voice-access-audio",
      "capture-state",
      "overlay-map",
      "screenshot",
    ],
  },
  "real-os-input-tested": {
    producers: ["windows-host", "twin", "external"],
    evidence: ["os-input-log", "screenshot"],
  },
  "uia-focus-tested": {
    producers: ["windows-host", "twin", "external"],
    evidence: ["uia-state", "screenshot"],
  },
};
const CATEGORY_CLAIMS = {
  "keyboard-focus": ["browser-keyboard-tested", "real-os-input-tested", "uia-focus-tested"],
  "screen-reader": ["nvda-tested", "narrator-tested"],
  "structure-semantics": ["browser-semantics-tested"],
  "orientation-input-purpose": ["browser-semantics-tested"],
  "visual-color": ["browser-visual-tested"],
  "timing-motion": ["browser-dynamic-tested"],
  "dynamic-content": ["browser-dynamic-tested"],
  "touch-pointer": ["browser-touch-pointer-tested", "voice-access-tested"],
  "authentication-forms": ["browser-forms-tested"],
};

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--") || !argv[index + 1]) {
      throw new Error(`Invalid argument: ${key}`);
    }
    args[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeWriteFile(runDir, output, content) {
  const resolvedRun = fs.realpathSync(runDir);
  const resolvedOutput = path.resolve(output);
  if (!isPathInside(path.resolve(runDir), resolvedOutput)) {
    throw new Error("Output path must remain inside the run directory");
  }
  const parent = path.dirname(resolvedOutput);
  fs.mkdirSync(parent, { recursive: true });
  const realParent = fs.realpathSync(parent);
  if (!isPathInside(resolvedRun, realParent)) {
    throw new Error("Output parent resolves outside the run directory");
  }
  if (fs.existsSync(resolvedOutput) && fs.lstatSync(resolvedOutput).isSymbolicLink()) {
    throw new Error("Output path must not be a symbolic link");
  }
  const temporary = path.join(realParent, `.${path.basename(resolvedOutput)}.${process.pid}.tmp`);
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, resolvedOutput);
}

function validateEvidence(evidence, categoryDir, category, resultProducer, index) {
  assertObject(evidence, `${category}.evidence[${index}]`);
  for (const field of ["type", "uri", "sha256", "producer"]) {
    if (typeof evidence[field] !== "string" || !evidence[field]) {
      throw new Error(`${category}.evidence[${index}].${field} is required`);
    }
  }
  if (!SHA256.test(evidence.sha256)) {
    throw new Error(`${category}.evidence[${index}].sha256 must be lowercase SHA-256`);
  }
  if (!PRODUCERS.has(evidence.producer)) {
    throw new Error(`${category}.evidence[${index}].producer is invalid`);
  }
  if (evidence.producer !== resultProducer) {
    throw new Error(`${category}.evidence[${index}].producer does not match result producer`);
  }
  if (/^https?:\/\//i.test(evidence.uri) || !path.isAbsolute(evidence.uri)) {
    throw new Error(`${category}.evidence[${index}].uri must be a materialized absolute local path`);
  }
  const resolvedCategoryDir = path.resolve(categoryDir);
  const resolvedEvidence = path.resolve(evidence.uri);
  if (!isPathInside(resolvedCategoryDir, resolvedEvidence)) {
    throw new Error(`${category}.evidence[${index}].uri escapes the category directory`);
  }
  if (!fs.existsSync(evidence.uri)) {
    throw new Error(`${category}.evidence[${index}].uri does not exist: ${evidence.uri}`);
  }
  const realCategoryDir = fs.realpathSync(categoryDir);
  const realEvidence = fs.realpathSync(evidence.uri);
  if (!isPathInside(realCategoryDir, realEvidence)) {
    throw new Error(`${category}.evidence[${index}].uri escapes the category directory`);
  }
  const actualHash = crypto.createHash("sha256").update(fs.readFileSync(realEvidence)).digest("hex");
  if (actualHash !== evidence.sha256) {
    throw new Error(`${category}.evidence[${index}] hash mismatch`);
  }
}

function validateFinding(finding, category, evidenceUris, status, index) {
  assertObject(finding, `${category}.findings[${index}]`);
  if (typeof finding.id !== "string" || !/^[A-Z-]+-\d+$/.test(finding.id)) {
    throw new Error(`${category}.findings[${index}].id is invalid`);
  }
  if (!CLASSIFICATIONS.has(finding.classification)) {
    throw new Error(`${category}.findings[${index}].classification is invalid`);
  }
  if (status !== "completed" && finding.classification !== "NEEDS-REVIEW") {
    throw new Error(`${category}.findings[${index}] cannot report ${finding.classification} from ${status}`);
  }
  if (finding.classification === "VIOLATION") {
    if (!SEVERITIES.has(finding.severity)) {
      throw new Error(`${category}.findings[${index}].severity is required for a violation`);
    }
  } else if (finding.severity !== undefined) {
    throw new Error(`${category}.findings[${index}] must not assign severity to ${finding.classification}`);
  }
  for (const field of ["wcagSc", "title", "selector", "expected", "actual"]) {
    if (typeof finding[field] !== "string") {
      throw new Error(`${category}.findings[${index}].${field} must be a string`);
    }
    if (finding.wcagSc && !A_AA_SC.has(finding.wcagSc)) {
      throw new Error(`${category}.findings[${index}].wcagSc is not WCAG 2.2 A/AA`);
    }
    if (["VIOLATION", "PASS"].includes(finding.classification)) {
      if (
        !finding.wcagSc ||
        !finding.title.trim() ||
        finding.steps.length === 0 ||
        !finding.expected.trim() ||
        !finding.actual.trim()
      ) {
        throw new Error(`${category}.findings[${index}] lacks reproducible observed behavior`);
      }
    }
  }
  if (!Array.isArray(finding.steps) || !finding.steps.every((step) => typeof step === "string")) {
    throw new Error(`${category}.findings[${index}].steps must be strings`);
  }
  if (!Array.isArray(finding.evidenceUris)) {
    throw new Error(`${category}.findings[${index}].evidenceUris must be an array`);
  }
  const infrastructureException =
    status !== "completed" &&
    finding.classification === "NEEDS-REVIEW" &&
    finding.evidenceUris.length === 0;
  if (!infrastructureException && finding.evidenceUris.length === 0) {
    throw new Error(`${category}.findings[${index}] has no evidence`);
  }
  for (const uri of finding.evidenceUris) {
    if (!evidenceUris.has(uri)) {
      throw new Error(`${category}.findings[${index}] references unknown evidence: ${uri}`);
    }
  }
}

export function validateCategoryResult(result, runDir, expectedCategory) {
  assertObject(result, expectedCategory);
  if (result.schemaVersion !== 1) throw new Error(`${expectedCategory}.schemaVersion must be 1`);
  if (result.category !== expectedCategory || !CATEGORIES.includes(result.category)) {
    throw new Error(`${expectedCategory}.category is invalid`);
  }
  if (!STATUSES.has(result.status)) throw new Error(`${expectedCategory}.status is invalid`);
  if (!PRODUCERS.has(result.producer)) throw new Error(`${expectedCategory}.producer is invalid`);
  if (!["codespace", "windows-host", "unsupported-host"].includes(result.environment)) {
    throw new Error(`${expectedCategory}.environment is invalid`);
  }
  if (
    typeof result.profileIsolationId !== "string" ||
    !result.profileIsolationId.trim() ||
    !Number.isFinite(result.durationSeconds) ||
    result.durationSeconds < 0 ||
    !Array.isArray(result.capabilitiesUsed) ||
    !Array.isArray(result.blockers)
  ) {
    throw new Error(`${expectedCategory} execution metadata is invalid`);
  }
  for (const field of ["startedAt", "endedAt"]) {
    if (typeof result[field] !== "string" || Number.isNaN(Date.parse(result[field]))) {
      throw new Error(`${expectedCategory}.${field} must be ISO-8601`);
    }
  }
  if (!Array.isArray(result.claims) || !result.claims.every((claim) => typeof claim === "string")) {
    throw new Error(`${expectedCategory}.claims must be strings`);
  }
  if (!Array.isArray(result.evidence) || !Array.isArray(result.findings)) {
    throw new Error(`${expectedCategory}.evidence and findings must be arrays`);
  }
  const categoryDir = path.join(runDir, "categories", expectedCategory);
  result.evidence.forEach((entry, index) =>
    validateEvidence(entry, categoryDir, expectedCategory, result.producer, index),
  );
  const evidenceTypes = new Set(result.evidence.map((entry) => entry.type));
  for (const claim of result.claims) {
    const rule = CLAIM_RULES[claim];
    if (!rule) {
      throw new Error(`${expectedCategory} uses unknown claim: ${claim}`);
    }
    if (!rule.producers.includes(result.producer)) {
      throw new Error(`${expectedCategory} claim ${claim} is invalid for ${result.producer}`);
    }
    if (!CATEGORY_CLAIMS[expectedCategory].includes(claim)) {
      throw new Error(`${expectedCategory} cannot use claim ${claim}`);
    }
    for (const required of rule.evidence) {
      if (!evidenceTypes.has(required)) {
        throw new Error(`${expectedCategory} claim ${claim} is missing ${required} evidence`);
      }
    }
  }
  const evidenceUris = new Set(result.evidence.map((entry) => entry.uri));
  const findingIds = new Set();
  for (const finding of result.findings) {
    if (findingIds.has(finding.id)) {
      throw new Error(`${expectedCategory} contains duplicate finding ID: ${finding.id}`);
    }
    findingIds.add(finding.id);
  }
  result.findings.forEach((finding, index) =>
    validateFinding(finding, expectedCategory, evidenceUris, result.status, index),
  );
  return result;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findingKey(finding) {
  return [
    finding.classification,
    finding.wcagSc,
    normalize(finding.title),
    normalize(finding.selector),
    normalize(finding.actual),
  ].join("|");
}

const severityOrder = new Map([
  ["Critical", 0],
  ["High", 1],
  ["Medium", 2],
  ["Low", 3],
]);

function compareFindings(left, right) {
  const classificationOrder = { VIOLATION: 0, "BEST-PRACTICE": 1, "NEEDS-REVIEW": 2, PASS: 3 };
  return (
    classificationOrder[left.classification] - classificationOrder[right.classification] ||
    (severityOrder.get(left.severity) ?? 99) - (severityOrder.get(right.severity) ?? 99) ||
    CATEGORIES.indexOf(left.category) - CATEGORIES.indexOf(right.category) ||
    left.id.localeCompare(right.id)
  );
}

export function validatePlan(plan) {
  assertObject(plan, "plan.json");
  if (
    plan.schemaVersion !== 1 ||
    typeof plan.target !== "string" ||
    !plan.target.trim() ||
    typeof plan.url !== "string" ||
    !plan.url.trim() ||
    !["codespace", "windows-host", "unsupported-host"].includes(plan.executionEnvironment) ||
    !Array.isArray(plan.focusAreas) ||
    !plan.focusAreas.every((entry) => typeof entry === "string") ||
    !Array.isArray(plan.scCoverage) ||
    plan.scCoverage.length === 0 ||
    !plan.scCoverage.every((entry) => A_AA_SC.has(entry)) ||
    !Array.isArray(plan.requestedCategories) ||
    !plan.requestedCategories.every((entry) => CATEGORIES.includes(entry)) ||
    !Array.isArray(plan.categories) ||
    plan.categories.length === 0
  ) {
    throw new Error("plan.json does not satisfy the A/AA explore plan schema");
  }
  const seen = new Set();
  const categoryCoverage = new Set();
  for (const [index, entry] of plan.categories.entries()) {
    assertObject(entry, `plan.json.categories[${index}]`);
    if (!CATEGORIES.includes(entry.category) || seen.has(entry.category)) {
      throw new Error("plan.json contains invalid or duplicate categories");
    }
    seen.add(entry.category);
    if (
      !["parallel-browser", "serial-browser", "serial-real-at"].includes(entry.executionClass) ||
      !Array.isArray(entry.wcagSc) ||
      entry.wcagSc.length === 0 ||
      !entry.wcagSc.every(
        (criterion) => A_AA_SC.has(criterion) && CATEGORY_SC[entry.category]?.includes(criterion),
      ) ||
      !Array.isArray(entry.focusAreas) ||
      !entry.focusAreas.every((value) => typeof value === "string") ||
      !Array.isArray(entry.requiredCapabilities) ||
      !entry.requiredCapabilities.every((value) => typeof value === "string") ||
      !Array.isArray(entry.requiredEvidenceTypes) ||
      entry.requiredEvidenceTypes.length === 0 ||
      !entry.requiredEvidenceTypes.every((value) => typeof value === "string") ||
      !CLAIM_RULES[entry.maximumClaim]
    ) {
      throw new Error(`plan.json category contract is invalid: ${entry.category ?? index}`);
    }
    const claimRule = CLAIM_RULES[entry.maximumClaim];
    if (!CATEGORY_CLAIMS[entry.category].includes(entry.maximumClaim)) {
      throw new Error(`plan.json category cannot use claim: ${entry.category}/${entry.maximumClaim}`);
    }
    if (claimRule.evidence.some((type) => !entry.requiredEvidenceTypes.includes(type))) {
      throw new Error(`plan.json category omits evidence required by ${entry.maximumClaim}`);
    }
    if (
      entry.executionClass === "serial-real-at"
        ? claimRule.producers.includes("copilot-browser")
        : !claimRule.producers.includes("copilot-browser")
    ) {
      throw new Error(`plan.json execution class conflicts with ${entry.maximumClaim}`);
    }
    entry.wcagSc.forEach((criterion) => categoryCoverage.add(criterion));
  }
  if (plan.requestedCategories.some((category) => !seen.has(category))) {
    throw new Error("plan.json omits an explicitly requested category");
  }
  const declaredCoverage = [...new Set(plan.scCoverage)].sort();
  const actualCoverage = [...categoryCoverage].sort();
  if (JSON.stringify(declaredCoverage) !== JSON.stringify(actualCoverage)) {
    throw new Error("plan.json scCoverage must equal category coverage");
  }
  return plan;
}

export function aggregateResults(runDir) {
  const realRunDir = fs.realpathSync(runDir);
  const planPath = path.join(runDir, "plan.json");
  if (!fs.existsSync(planPath)) throw new Error("plan.json is required");
  const realPlanPath = fs.realpathSync(planPath);
  if (!isPathInside(realRunDir, realPlanPath)) {
    throw new Error("plan.json resolves outside the run directory");
  }
  const plan = JSON.parse(fs.readFileSync(realPlanPath, "utf8"));
  validatePlan(plan);
  const plannedCategories = plan.categories.map((entry) => entry.category);
  const categoriesRoot = path.join(runDir, "categories");
  const records = [];
  const parallelIsolationIds = new Set();
  for (const category of plannedCategories) {
    const categoryDir = path.join(categoriesRoot, category);
    const resultPath = path.join(categoryDir, "result.json");
    if (!fs.existsSync(resultPath)) {
      throw new Error(`Missing planned category result: ${category}`);
    }
    const realCategoryDir = fs.realpathSync(categoryDir);
    const realResultPath = fs.realpathSync(resultPath);
    if (
      !isPathInside(realRunDir, realCategoryDir) ||
      !isPathInside(realCategoryDir, realResultPath)
    ) {
      throw new Error(`${category} result path escapes the run directory`);
    }
    const result = validateCategoryResult(
      JSON.parse(fs.readFileSync(realResultPath, "utf8")),
      runDir,
      category,
    );
    if (result.environment !== plan.executionEnvironment) {
      throw new Error(`${category}.environment does not match plan.json`);
    }
    const planned = plan.categories.find((entry) => entry.category === category);
    if (result.status === "completed") {
      if (!result.claims.includes(planned.maximumClaim)) {
        throw new Error(`${category} did not satisfy its planned maximum claim`);
      }
      const usedCapabilities = new Set(result.capabilitiesUsed);
      for (const capability of planned.requiredCapabilities) {
        if (!usedCapabilities.has(capability)) {
          throw new Error(`${category} did not use planned capability: ${capability}`);
        }
      }
      const evidenceTypes = new Set(result.evidence.map((entry) => entry.type));
      const evidenceByUri = new Map(result.evidence.map((entry) => [entry.uri, entry]));
      for (const evidenceType of planned.requiredEvidenceTypes) {
        if (!evidenceTypes.has(evidenceType)) {
          throw new Error(`${category} is missing planned evidence: ${evidenceType}`);
        }
      }
      if (
        planned.executionClass === "parallel-browser" &&
        ["shared", "none"].includes(result.profileIsolationId.trim().toLowerCase())
      ) {
        throw new Error(`${category} parallel execution lacks an isolated profile`);
      }
      if (planned.executionClass === "parallel-browser") {
        const isolationId = result.profileIsolationId.trim().toLowerCase();
        if (parallelIsolationIds.has(isolationId)) {
          throw new Error(`${category} reuses parallel profile isolation ID: ${result.profileIsolationId}`);
        }
        parallelIsolationIds.add(isolationId);
      }
      if (
        planned.executionClass === "serial-real-at" &&
        result.producer === "copilot-browser"
      ) {
        throw new Error(`${category} planned real AT cannot use a browser producer`);
      }
      for (const finding of result.findings) {
        if (finding.wcagSc && !planned.wcagSc.includes(finding.wcagSc)) {
          throw new Error(`${category} finding ${finding.id} is outside planned WCAG coverage`);
        }
        if (["VIOLATION", "PASS"].includes(finding.classification)) {
          const linkedTypes = new Set(
            finding.evidenceUris.map((uri) => evidenceByUri.get(uri)?.type).filter(Boolean),
          );
          for (const claim of result.claims) {
            for (const evidenceType of CLAIM_RULES[claim].evidence) {
              if (!linkedTypes.has(evidenceType)) {
                throw new Error(
                  `${category} finding ${finding.id} lacks ${evidenceType} evidence for ${claim}`,
                );
              }
            }
          }
        }
      }
    }
    records.push({ ...result, resultPath });
  }

  const deduplicated = new Map();
  for (const record of records) {
    for (const finding of record.findings) {
      const namespaced = {
        ...finding,
        id: `${record.category}:${finding.id}`,
        category: record.category,
        sourceResult: record.resultPath,
        sourceResults: [record.resultPath],
      };
      const key = findingKey(namespaced);
      const existing = deduplicated.get(key);
      if (!existing) {
        deduplicated.set(key, namespaced);
      } else {
        existing.evidenceUris = [...new Set([...existing.evidenceUris, ...namespaced.evidenceUris])].sort();
        existing.sourceResults = [...new Set([...existing.sourceResults, record.resultPath])].sort();
        if (
          existing.classification === "VIOLATION" &&
          (severityOrder.get(namespaced.severity) ?? 99) < (severityOrder.get(existing.severity) ?? 99)
        ) {
          existing.severity = namespaced.severity;
        }
      }
    }
  }
  const findings = [...deduplicated.values()].sort(compareFindings);
  const byClassification = {};
  const bySeverity = {};
  for (const finding of findings) {
    byClassification[finding.classification] = (byClassification[finding.classification] ?? 0) + 1;
    if (finding.severity) bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    categories: records.map((record) => ({
      category: record.category,
      status: record.status,
      environment: record.environment,
      producer: record.producer,
      durationSeconds: record.durationSeconds,
      claims: record.claims,
      blockers: record.blockers,
      resultPath: record.resultPath,
    })),
    counts: { total: findings.length, byClassification, bySeverity },
    evidence: records
      .flatMap((record) =>
        record.evidence.map((entry) => ({ ...entry, category: record.category })),
      )
      .sort((left, right) => left.uri.localeCompare(right.uri)),
    findings,
  };
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== "aggregate") {
    throw new Error("Usage: a11y-explore-results.mjs aggregate --run-dir <dir> --out <file>");
  }
  const args = parseArgs(rest);
  if (!args["run-dir"] || !args.out) throw new Error("--run-dir and --out are required");
  const runDir = path.resolve(args["run-dir"]);
  const output = path.resolve(args.out);
  safeWriteFile(runDir, output, `${JSON.stringify(aggregateResults(runDir), null, 2)}\n`);
  process.stdout.write(`${output}\n`);
}

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntry) {
  try {
    main();
  } catch (error) {
    console.error(`[a11y-explore-results] ${error.message}`);
    process.exitCode = 1;
  }
}
