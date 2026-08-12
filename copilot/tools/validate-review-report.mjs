#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  acceptedFingerprints,
  annotateFindings,
  loadLedger,
  readSource,
} from "./review-ledger.mjs";

const DIMENSIONS = [
  "behavior",
  "designMaintainability",
  "callersConsumers",
  "tests",
  "typesContracts",
  "errorsEdgeCases",
  "securityPrivacy",
  "performance",
  "accessibilityUi",
  "localization",
  "compatibilityKillswitch",
  "telemetry",
  "repoInstructionsContext",
  "dependenciesTooling",
];
const SEVERITIES = new Set(["Critical", "Important", "Minor"]);
const VERDICTS = new Set(["APPROVE", "COMMENT", "REQUEST_CHANGES"]);
const HASH_40 = /^[0-9a-f]{40}$/;
const HASH_64 = /^[0-9a-f]{64}$/;
const SP_CLIENT_PROFILE_CHECKS = [
  "spClientRolloutTrace",
  "spClientUiPrimitivesTokens",
  "spClientThemeDetheme",
  "spClientLargeCollections",
  "spClientAutomatedTests",
];
const SP_CLIENT_PROFILE_TERMS = {
  spClientRolloutTrace: /\b(?:rollout|flight|killswitch|fallback|entry point|gate)\b/i,
  spClientUiPrimitivesTokens: /\b(?:fluent|spds|primitive|typography|token|component)\b/i,
  spClientThemeDetheme: /\b(?:theme|detheme|provider|override)\b/i,
  spClientLargeCollections: /\b(?:collection|pagination|continuation|progressive|virtualization|render)\b/i,
  spClientAutomatedTests: /\b(?:test|coverage|assertion|regression)\b/i,
};
const ROLLOUT_STATES = {
  killswitch: ["ks-not-activated", "ks-activated"],
  flight: ["flight-enabled", "flight-disabled"],
  "killswitch+flight": [
    "ks-not-activated-and-flight-enabled",
    "ks-activated-or-flight-disabled",
  ],
};
const HARD_CHURN_LIMIT = 5000;
const LARGE_CHURN_LIMIT = 2000;
const DIMENSION_TERMS = {
  behavior: /\b(?:behavior|logic|flow|output|state)\b/i,
  designMaintainability: /\b(?:design|maintainability|deprecated|hardcod|duplicate|naming|todo|comment)\b/i,
  callersConsumers: /\b(?:caller|consumer|usage|call site)\b/i,
  tests: /\b(?:test|coverage|assertion)\b/i,
  typesContracts: /\b(?:type|contract|interface|schema|api)\b/i,
  errorsEdgeCases: /\b(?:error|edge|failure|invalid|fallback)\b/i,
  securityPrivacy: /\b(?:security|privacy|auth|permission|trust|secret|injection)\b/i,
  performance: /\b(?:performance|allocation|latency|complexity|render|cache)\b/i,
  accessibilityUi: /\b(?:accessibility|a11y|aria|keyboard|focus|screen reader|ui)\b/i,
  localization: /\b(?:localization|locale|translation|resource|string)\b/i,
  compatibilityKillswitch: /\b(?:compatibility|backward|killswitch|rollback|migration|version)\b/i,
  telemetry: /\b(?:telemetry|monitor|logging|event|metric|trace)\b/i,
  repoInstructionsContext: /\b(?:instructions?|context|guidelines?|conventions?|documentation)\b/i,
  dependenciesTooling: /\b(?:dependency|tooling|package|build|lockfile|config)\b/i,
};

function validateReviewLedger(report, options, errors) {
  const ledger = report.preReview?.reviewLedger;
  if (!isObject(ledger)) {
    errors.push("preReview.reviewLedger is required");
    return;
  }
  if (ledger.status !== "applied" && ledger.status !== "absent") {
    errors.push("reviewLedger.status must be applied or absent");
    return;
  }
  if (!Number.isInteger(ledger.entryCount) || ledger.entryCount < 0) {
    errors.push("reviewLedger.entryCount must be a non-negative integer");
  }
  if (!Number.isInteger(ledger.carriedCount) || ledger.carriedCount < 0) {
    errors.push("reviewLedger.carriedCount must be a non-negative integer");
  }
  if (ledger.status === "absent" && (ledger.entryCount > 0 || ledger.carriedCount > 0)) {
    errors.push("reviewLedger.status absent requires zero entries and zero carried findings");
  }
  if (!Array.isArray(report.previouslyAccepted)) {
    errors.push("previouslyAccepted must be an array");
    return;
  }
  if (report.previouslyAccepted.length !== (ledger.carriedCount ?? -1)) {
    errors.push("reviewLedger.carriedCount must equal the previouslyAccepted entries");
  }
  for (const entry of report.previouslyAccepted) {
    if (!isObject(entry) || !nonEmpty(entry.fingerprint) || !nonEmpty(entry.path) || !nonEmpty(entry.reason)) {
      errors.push("every previouslyAccepted entry requires fingerprint, path, and reason");
      break;
    }
  }
}

// A finding is a class, not a line. The reviewer declares the query that
// describes its defect class; this runs that query over the changed set and
// rejects the report when a hit is left unaccounted for, so "I checked the
// other sites" cannot be asserted without having actually checked them.
function crossCheckClassSweep(report, options, errors, changedFiles) {
  const findings = (report.findings ?? []).filter(
    (finding) =>
      isObject(finding) &&
      (finding.severity === "Critical" || finding.severity === "Important") &&
      // A reviewability finding is about the shape of the change itself, not
      // about a code pattern that could recur elsewhere in it.
      finding.category !== "reviewability",
  );
  if (findings.length === 0) return;

  const repoRoot = options.get("--repo") ?? process.cwd();
  const ref = options.get("--ledger-ref");
  const reported = new Set();
  for (const finding of report.findings ?? []) {
    if (isObject(finding) && nonEmpty(finding.path) && Number.isInteger(finding.line)) {
      reported.add(`${finding.path}:${finding.line}`);
    }
  }

  const sourceCache = new Map();
  const linesOf = (filePath) => {
    if (!sourceCache.has(filePath)) {
      const source = readSource(repoRoot, filePath, ref);
      sourceCache.set(filePath, source === null ? null : source.split(/\r?\n/));
    }
    return sourceCache.get(filePath);
  };

  for (const finding of findings) {
    const sweep = finding.classSweep;
    if (!isObject(sweep) || !nonEmpty(sweep.query) || !Array.isArray(sweep.scope) || sweep.scope.length === 0) {
      errors.push(`finding ${finding.id} requires classSweep with a query and a non-empty scope`);
      continue;
    }
    if (!Array.isArray(sweep.accountedFor)) {
      errors.push(`finding ${finding.id} requires classSweep.accountedFor as an array`);
      continue;
    }

    let pattern;
    try {
      pattern = new RegExp(sweep.query);
    } catch (error) {
      errors.push(`finding ${finding.id} classSweep.query is not a valid regular expression: ${error.message}`);
      continue;
    }

    // The query has to describe the defect the finding reports, or the sweep
    // is measuring something else. Without resolvable source there is nothing
    // to recompute, so the schema check above stands on its own.
    const ownLines = linesOf(finding.path);
    if (ownLines === null) continue;
    const ownLine = ownLines[finding.line - 1];
    if (ownLine === undefined || !pattern.test(ownLine)) {
      errors.push(
        `finding ${finding.id} classSweep.query does not match its own cited line ${finding.path}:${finding.line}, so it does not describe the reported defect`,
      );
      continue;
    }

    // Sweeping only the file the defect was spotted in is how the second
    // instance gets missed, so every changed sibling of the same type is required.
    if (changedFiles.length > 0) {
      const extension = finding.path.slice(finding.path.lastIndexOf("."));
      const siblings = changedFiles.filter((file) => file.endsWith(extension));
      const missing = siblings.filter((file) => !sweep.scope.includes(file));
      if (missing.length > 0) {
        errors.push(
          `finding ${finding.id} classSweep.scope omits changed ${extension} files it must sweep: ${missing.slice(0, 5).join(", ")}`,
        );
        continue;
      }
    }

    const accounted = new Set([...reported, ...sweep.accountedFor.filter((entry) => typeof entry === "string")]);
    const unaccounted = [];
    for (const filePath of sweep.scope) {
      const lines = linesOf(filePath);
      if (lines === null) continue;
      for (let index = 0; index < lines.length; index++) {
        if (!pattern.test(lines[index])) continue;
        const location = `${filePath}:${index + 1}`;
        if (!accounted.has(location)) unaccounted.push(location);
      }
    }
    if (unaccounted.length > 0) {
      errors.push(
        `finding ${finding.id} classSweep leaves ${unaccounted.length} instance(s) of its own class unaccounted for: ${unaccounted.slice(0, 5).join(", ")}`,
      );
    }
  }
}

// A self-declared "I honored the ledger" is worth nothing, so the match is
// recomputed here from the ledger file and the repository itself.
function crossCheckReviewLedger(report, options, errors) {
  const ledgerPath = options.get("--ledger");
  if (!ledgerPath) return;

  let ledger;
  try {
    ledger = loadLedger(ledgerPath);
  } catch (error) {
    errors.push(`cannot read review ledger: ${error.message}`);
    return;
  }

  const accepted = acceptedFingerprints(ledger);
  const declared = report.preReview?.reviewLedger;
  if (isObject(declared) && Number.isInteger(declared.entryCount) && declared.entryCount !== accepted.size) {
    errors.push(`reviewLedger.entryCount claims ${declared.entryCount} but the ledger holds ${accepted.size}`);
  }
  if (isObject(declared) && declared.status === "absent" && accepted.size > 0) {
    errors.push("reviewLedger.status claims absent but the ledger holds accepted entries");
  }
  if (accepted.size === 0) return;

  const repoRoot = options.get("--repo") ?? process.cwd();
  const ref = options.get("--ledger-ref");
  const annotated = annotateFindings(report, repoRoot, ref);
  for (const finding of annotated) {
    if (finding.fingerprint === null) continue;
    if (accepted.has(finding.fingerprint)) {
      errors.push(
        `finding ${finding.id} at ${finding.path}:${finding.line} was already accepted in the ledger and must be carried in previouslyAccepted, not reported again`,
      );
    }
  }

  const reportedFingerprints = new Set(
    (report.previouslyAccepted ?? []).map((entry) => entry.fingerprint),
  );
  for (const fingerprint of reportedFingerprints) {
    if (!accepted.has(fingerprint)) {
      errors.push(`previouslyAccepted cites ${fingerprint}, which is not accepted in the ledger`);
    }
  }
}

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

function isSpClientRuntimePath(filePath) {
  return (
    filePath.startsWith("sp-client/") &&
    /\.(?:ts|tsx|js|jsx|css|scss|less|resx)$/i.test(filePath) &&
    !/(?:^|\/)(?:__tests__|tests?|specs?)(?:\/|$)|(?:\.test|\.spec)\.[^/]+$|\.snap$/i.test(
      filePath,
    )
  );
}

function hasBlockingRolloutFinding(report) {
  return report.findings?.some(
    (finding) =>
      finding.category === "rolloutProtection" &&
      (finding.severity === "Critical" || finding.severity === "Important"),
  );
}

function validateRolloutPathCoverage(pathCoverage, runtimePaths) {
  if (!Array.isArray(pathCoverage)) return false;
  const coveragePaths = pathCoverage.map((entry) => entry?.path).sort();
  if (!sameStrings(coveragePaths, runtimePaths)) return false;
  return pathCoverage.every(
    (entry) =>
      isObject(entry) &&
      Array.isArray(entry.changedEvidence) &&
      entry.changedEvidence.length > 0 &&
      entry.changedEvidence.every(
        (reference) =>
          evidenceReference(reference) &&
          path.posix.normalize(fileEvidencePath(reference) ?? "") ===
            path.posix.normalize(entry.path),
      ) &&
      Array.isArray(entry.gateEvidence) &&
      entry.gateEvidence.length > 0 &&
      entry.gateEvidence.every(evidenceReference) &&
      Array.isArray(entry.fallbackEvidence) &&
      entry.fallbackEvidence.length > 0 &&
      entry.fallbackEvidence.every(evidenceReference) &&
      specific(entry.conclusion),
  );
}

function validateRolloutProtection(report, expectedFiles, errors) {
  const rollout = report.preReview?.rolloutProtection;
  const runtimePaths = expectedFiles.filter(isSpClientRuntimePath).sort();
  if (!isObject(rollout) || !Array.isArray(rollout.runtimePaths)) {
    errors.push("sp-client reviews require structured rolloutProtection evidence");
    return;
  }
  if (!sameStrings([...rollout.runtimePaths].sort(), runtimePaths)) {
    errors.push("rolloutProtection runtime paths must exactly match Git runtime changes");
  }
  if (runtimePaths.length === 0) {
    if (
      rollout.protectionStatus !== "not-applicable" ||
      rollout.gateType !== "not-applicable" ||
      !specific(rollout.notApplicableReason) ||
      !specific(rollout.conclusion)
    ) {
      errors.push("non-runtime sp-client changes require a specific rollout not-applicable disposition");
    }
    return;
  }

  if (!["existing-pr", "pre-pr"].includes(rollout.reviewContext)) {
    errors.push("rolloutProtection reviewContext must identify existing-pr or pre-pr");
  }
  const validDescriptionStatus =
    rollout.reviewContext === "existing-pr"
      ? ["documented", "missing"].includes(rollout.descriptionStatus)
      : ["planned", "missing"].includes(rollout.descriptionStatus);
  if (!validDescriptionStatus) {
    errors.push("rolloutProtection description status does not match the review context");
  }
  if (
    rollout.descriptionStatus !== "missing" &&
    (!Array.isArray(rollout.descriptionEvidence) ||
      rollout.descriptionEvidence.length === 0 ||
      !rollout.descriptionEvidence.every(evidenceReference))
  ) {
    errors.push("documented or planned rollout metadata requires description evidence");
  }

  if (rollout.protectionStatus === "unprotected") {
    if (
      rollout.gateType !== "unprotected" ||
      !hasBlockingRolloutFinding(report) ||
      !specific(rollout.conclusion)
    ) {
      errors.push("unprotected runtime changes require a blocking rolloutProtection finding");
    }
    return;
  }
  if (!Object.hasOwn(ROLLOUT_STATES, rollout.gateType)) {
    errors.push("runtime changes require a killswitch, flight, or killswitch+flight");
    return;
  }
  if (rollout.protectionStatus === "incomplete") {
    if (
      !hasBlockingRolloutFinding(report) ||
      !Array.isArray(rollout.gateIdentifiers) ||
      rollout.gateIdentifiers.length === 0 ||
      !rollout.gateIdentifiers.every(nonEmpty) ||
      !specific(rollout.conclusion)
    ) {
      errors.push("incomplete rollout protection requires identified gates and a blocking finding");
    }
    return;
  }
  if (rollout.protectionStatus !== "protected") {
    errors.push("runtime rollout protection status is invalid");
    return;
  }

  const evidenceArrays = [
    rollout.entryPointEvidence,
    rollout.gateCheckEvidence,
    rollout.newPathEvidence,
    rollout.fallbackEvidence,
    rollout.legacyBehaviorEvidence,
  ];
  const protectedEvidenceValid =
    Array.isArray(rollout.gateIdentifiers) &&
    rollout.gateIdentifiers.length > 0 &&
    rollout.gateIdentifiers.every(nonEmpty) &&
    typeof rollout.existingUpstreamGate === "boolean" &&
    evidenceArrays.every(
      (evidence) =>
        Array.isArray(evidence) &&
        evidence.length > 0 &&
        evidence.every(evidenceReference),
    ) &&
    typeof rollout.fallbackBehaviorChanged === "boolean" &&
    (rollout.fallbackBehaviorChanged === false ||
      (Array.isArray(rollout.disabledStateTestEvidence) &&
        rollout.disabledStateTestEvidence.length > 0 &&
        rollout.disabledStateTestEvidence.every(testEvidenceReference))) &&
    validateRolloutPathCoverage(rollout.pathCoverage, runtimePaths) &&
    specific(rollout.legacyEquivalenceConclusion) &&
    specific(rollout.conclusion);
  const [expectedNewState, expectedFallbackState] = ROLLOUT_STATES[rollout.gateType];
  if (
    !protectedEvidenceValid ||
    rollout.newPathState !== expectedNewState ||
    rollout.fallbackState !== expectedFallbackState
  ) {
    errors.push("rolloutProtection requires complete gate coverage, correct direction, legacy-equivalent fallback, and disabled-state tests when the PR changes fallback behavior");
  }
  if (rollout.descriptionStatus === "missing" && !hasBlockingRolloutFinding(report)) {
    errors.push("missing rollout metadata in the PR description requires a blocking finding");
  }
}

// Both blocking defects this reviewer has missed lived in a dependency's
// source, not in the changed file. Consumer analysis looks downstream; this
// forces at least one look upstream, at what the changed code relies on.
// Shared code is where capability gets reinvented. A reviewer that only asks
// whether new code is correct will approve a hand-rolled copy of something the
// platform already ships, so every symbol exported from a shared-code path has
// to be answered against what already exists. The symbol list is derived from
// the changed sources here rather than taken from the report, so an entry
// cannot be omitted by simply not mentioning it.
const SHARED_CODE_SEGMENTS = ["common", "shared", "utilities", "utils", "helpers", "hooks", "components"];
const EXPORTED_SYMBOL = /^\s*export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/;

function isSharedCodePath(filePath) {
  return filePath
    .split("/")
    .some((segment) => SHARED_CODE_SEGMENTS.includes(segment.toLowerCase()));
}

function validatePriorArt(report, options, expectedFiles, errors) {
  const entries = report.preReview?.priorArt;
  if (!Array.isArray(entries)) {
    errors.push("preReview.priorArt is required");
    return;
  }

  for (const entry of entries) {
    if (!isObject(entry) || !nonEmpty(entry.symbol) || !nonEmpty(entry.path) || !nonEmpty(entry.searched)) {
      errors.push("every priorArt entry requires symbol, path, and searched");
      return;
    }
    if (!["none", "reused", "justified"].includes(entry.result)) {
      errors.push(`priorArt entry ${entry.symbol} requires result of none, reused, or justified`);
      continue;
    }
    // Claiming something already exists is only useful if you say what it is,
    // and keeping your own copy anyway needs a reason.
    if (entry.result !== "none" && !nonEmpty(entry.existing)) {
      errors.push(`priorArt entry ${entry.symbol} reports result ${entry.result} and must cite the existing implementation`);
    }
    if (entry.result === "justified" && !nonEmpty(entry.justification)) {
      errors.push(`priorArt entry ${entry.symbol} keeps a new implementation and requires justification`);
    }
  }

  const sharedFiles = expectedFiles.filter(isSharedCodePath);
  if (sharedFiles.length === 0) return;

  const repoRoot = options.get("--repo") ?? process.cwd();
  const ref = options.get("--ledger-ref");
  const covered = new Set(
    entries
      .filter((entry) => isObject(entry) && nonEmpty(entry.symbol))
      .map((entry) => String(entry.symbol)),
  );

  const missing = [];
  for (const filePath of sharedFiles) {
    const source = readSource(repoRoot, filePath, ref);
    if (source === null) continue;
    for (const line of source.split(/\r?\n/)) {
      const match = EXPORTED_SYMBOL.exec(line);
      if (match && !covered.has(match[1])) missing.push(`${match[1]} (${filePath})`);
    }
  }
  if (missing.length > 0) {
    errors.push(
      `preReview.priorArt omits shared-code exports that must be answered against existing implementations: ${missing.slice(0, 5).join(", ")}`,
    );
  }
}

function validateExternalContracts(report, expectedFiles, errors) {
  const contracts = report.preReview?.externalContracts;
  if (!Array.isArray(contracts)) {
    errors.push("preReview.externalContracts is required");
    return;
  }
  const changed = new Set(expectedFiles);
  if (contracts.length === 0) {
    if (!nonEmpty(report.preReview?.externalContractsNotApplicableReason)) {
      errors.push(
        "preReview.externalContracts is empty and requires externalContractsNotApplicableReason explaining why the change relies on no external contract",
      );
    }
    return;
  }
  for (const contract of contracts) {
    if (
      !isObject(contract) ||
      !nonEmpty(contract.symbol) ||
      !nonEmpty(contract.module) ||
      !nonEmpty(contract.verifiedBehavior) ||
      !nonEmpty(contract.evidence)
    ) {
      errors.push("every externalContracts entry requires symbol, module, verifiedBehavior, and evidence");
      return;
    }
    const cited = String(contract.evidence).split(":")[0];
    if (changed.has(cited)) {
      errors.push(
        `externalContracts entry ${contract.symbol} cites ${cited}, which this PR changed; the contract must be evidenced from the dependency's own source`,
      );
    }
  }
}

function readLines(filePath) {
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .sort();
}

function readNumstat(filePath) {
  const entries = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [added, deleted, ...pathParts] = line.split("\t");
      return {
        additions: added === "-" ? 0 : Number.parseInt(added, 10),
        deletions: deleted === "-" ? 0 : Number.parseInt(deleted, 10),
        path: pathParts.join("\t"),
      };
    });
  if (
    entries.some(
      (entry) =>
        !Number.isInteger(entry.additions) ||
        entry.additions < 0 ||
        !Number.isInteger(entry.deletions) ||
        entry.deletions < 0 ||
        !nonEmpty(entry.path),
    )
  ) {
    throw new Error("invalid Git numstat");
  }
  return entries;
}

function sameStrings(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateProfileChecks(profileChecks, expectedIds, conclusionTerms) {
  if (!Array.isArray(profileChecks)) return false;
  const ids = profileChecks.map((entry) => entry?.id);
  if (!sameStrings([...ids].sort(), [...expectedIds].sort())) return false;
  return profileChecks.every((entry) => {
    if (
      !isObject(entry) ||
      !nonEmpty(entry.id) ||
      !specific(entry.conclusion) ||
      !conclusionTerms[entry.id]?.test(entry.conclusion)
    ) {
      return false;
    }
    if (entry.status === "reviewed") {
      return (
        Array.isArray(entry.evidence) &&
        entry.evidence.length > 0 &&
        entry.evidence.every(evidenceReference)
      );
    }
    return entry.status === "not-applicable" && specific(entry.reason);
  });
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
  if (
    !isObject(report.preReview) ||
    !specific(report.preReview.intent) ||
    !Array.isArray(report.preReview.evidence) ||
    report.preReview.evidence.length === 0 ||
    !report.preReview.evidence.every(evidenceReference) ||
    !specific(report.preReview.necessityAndScope) ||
    !specific(report.preReview.intentMatch) ||
    !Array.isArray(report.preReview.profiles) ||
    !report.preReview.profiles.includes("global")
  ) {
    errors.push("preReview requires grounded intent, evidence, necessity/scope, and intent-match analysis");
  }

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
  let expectedFiles = [];
  if (!changedFilesPath || !fs.existsSync(changedFilesPath)) {
    errors.push("--changed-files must reference a readable Git-generated file list");
  } else {
    expectedFiles = readLines(changedFilesPath);
    if (expectedFiles.length === 0) errors.push("Git changed-file list must not be empty");
    const riskFiles = [...riskPaths].sort();
    const coverageFiles = [...coveredPaths].sort();
    if (!sameStrings(expectedFiles, riskFiles)) errors.push("riskMap paths do not exactly match Git changed files");
    if (!sameStrings(expectedFiles, coverageFiles)) errors.push("coverage.changedFiles paths do not exactly match Git changed files");
    if (
      expectedFiles.some((file) => file.startsWith("sp-client/")) &&
      !report.preReview?.profiles?.includes("sp-client")
    ) {
      errors.push("sp-client changes require the sp-client review profile");
    }
    if (
      expectedFiles.some((file) => file.startsWith("sp-client/")) &&
      !validateProfileChecks(
        report.preReview?.profileChecks,
        SP_CLIENT_PROFILE_CHECKS,
        SP_CLIENT_PROFILE_TERMS,
      )
    ) {
      errors.push("sp-client changes require complete scoped profile checks");
    }
    if (expectedFiles.some((file) => file.startsWith("sp-client/"))) {
      validateRolloutProtection(report, expectedFiles, errors);
    }
    validateExternalContracts(report, expectedFiles, errors);
    validatePriorArt(report, options, expectedFiles, errors);
  }

  const diffNumstatPath = options.get("--diff-numstat");
  let additions = 0;
  let deletions = 0;
  let numstatEntries = [];
  if (!diffNumstatPath || !fs.existsSync(diffNumstatPath)) {
    errors.push("--diff-numstat must reference a readable Git-generated numstat");
  } else {
    try {
      numstatEntries = readNumstat(diffNumstatPath);
      const numstatFiles = numstatEntries.map((entry) => entry.path).sort();
      if (!sameStrings(expectedFiles, numstatFiles)) errors.push("Git numstat paths do not match changed files");
      additions = numstatEntries.reduce((total, entry) => total + entry.additions, 0);
      deletions = numstatEntries.reduce((total, entry) => total + entry.deletions, 0);
    } catch {
      errors.push("--diff-numstat must contain valid Git numstat output");
    }
  }

  const reviewability = report.preReview?.reviewability;
  const validUnits =
    Array.isArray(reviewability?.independentBehaviorUnits) &&
    reviewability.independentBehaviorUnits.length > 0 &&
    reviewability.independentBehaviorUnits.every(
      (unit) =>
        isObject(unit) &&
        nonEmpty(unit.name) &&
        Array.isArray(unit.paths) &&
        unit.paths.length > 0 &&
        unit.paths.every((unitPath) => nonEmpty(unitPath) && expectedFiles.includes(unitPath)),
    );
  const behaviorUnitPaths = new Set(
    (reviewability?.independentBehaviorUnits ?? []).flatMap((unit) =>
      Array.isArray(unit?.paths) ? unit.paths : [],
    ),
  );
  const validDomains =
    Array.isArray(reviewability?.highRiskDomains) &&
    reviewability.highRiskDomains.every(nonEmpty);
  const generatedOrMechanicalLines = reviewability?.generatedOrMechanicalLines;
  const mechanicalBreakdown = reviewability?.mechanicalBreakdown;
  const churnByPath = new Map(
    numstatEntries.map((entry) => [entry.path, entry.additions + entry.deletions]),
  );
  const mechanicalLinesByPath = new Map();
  for (const entry of mechanicalBreakdown ?? []) {
    if (isObject(entry) && nonEmpty(entry.path) && Number.isInteger(entry.lines)) {
      mechanicalLinesByPath.set(entry.path, (mechanicalLinesByPath.get(entry.path) ?? 0) + entry.lines);
    }
  }
  const validMechanicalEvidence =
    Number.isInteger(generatedOrMechanicalLines) &&
    generatedOrMechanicalLines >= 0 &&
    generatedOrMechanicalLines <= additions + deletions &&
    Array.isArray(mechanicalBreakdown) &&
    mechanicalBreakdown.every(
      (entry) =>
        isObject(entry) &&
        expectedFiles.includes(entry.path) &&
        Number.isInteger(entry.lines) &&
        entry.lines > 0 &&
        specific(entry.rationale) &&
        Array.isArray(entry.evidence) &&
        entry.evidence.length > 0 &&
        entry.evidence.every(evidenceReference),
    ) &&
    mechanicalBreakdown.reduce((total, entry) => total + entry.lines, 0) === generatedOrMechanicalLines &&
    [...mechanicalLinesByPath].every(
      ([entryPath, lines]) => churnByPath.has(entryPath) && lines <= churnByPath.get(entryPath),
    ) &&
    (generatedOrMechanicalLines > 0 || mechanicalBreakdown.length === 0);
  const metricsMatch =
    reviewability?.changedFileCount === expectedFiles.length &&
    reviewability?.additions === additions &&
    reviewability?.deletions === deletions;
  if (
    !isObject(reviewability) ||
    !["reviewable", "must-split"].includes(reviewability.status) ||
    !metricsMatch ||
    !validUnits ||
    !validDomains ||
    !validMechanicalEvidence ||
    !specific(reviewability.rationale) ||
    !["exhaustive", "preliminary-non-exhaustive"].includes(reviewability.completenessClaim)
  ) {
    errors.push("preReview.reviewability requires exact Git metrics, behavior units, risk domains, evidence, rationale, and completeness");
  } else {
    const totalChurn = additions + deletions;
    const substantiveChurn = totalChurn - generatedOrMechanicalLines;
    const structurallyLargeChange =
      expectedFiles.length >= 40 ||
      reviewability.independentBehaviorUnits.length >= 3 ||
      reviewability.highRiskDomains.length >= 4;
    const exception = reviewability.largeChangeException;
    const validException =
      isObject(exception) &&
      exception.singleCoherentChange === true &&
      reviewability.independentBehaviorUnits.length === 1 &&
      reviewability.highRiskDomains.length <= 2 &&
      generatedOrMechanicalLines > 0 &&
      sameStrings([...mechanicalLinesByPath.keys()].sort(), expectedFiles) &&
      specific(exception.rationale) &&
      Array.isArray(exception.evidence) &&
      exception.evidence.length > 0 &&
      exception.evidence.every(evidenceReference);
    if (!sameStrings([...behaviorUnitPaths].sort(), expectedFiles)) {
      errors.push("behavior units must cover every Git changed file");
    }
    const mustSplit =
      totalChurn >= HARD_CHURN_LIMIT ||
      substantiveChurn >= LARGE_CHURN_LIMIT ||
      (structurallyLargeChange && !validException);
    if (mustSplit && reviewability.status !== "must-split") {
      errors.push("oversized or multi-surface change must be classified as must-split");
    }
    if (!mustSplit && reviewability.status !== "reviewable") {
      errors.push("reviewability status must match the measured change");
    }
    if (
      reviewability.status === "must-split" &&
      (reviewability.completenessClaim !== "preliminary-non-exhaustive" ||
        !/\b(?:preliminary|non-exhaustive|not exhaustive)\b/i.test(report.summary) ||
        !Array.isArray(reviewability.splitBoundaries) ||
        reviewability.splitBoundaries.length < 2 ||
        !reviewability.splitBoundaries.every(
          (boundary) =>
            isObject(boundary) &&
            specific(boundary.name) &&
            specific(boundary.rationale) &&
            Array.isArray(boundary.paths) &&
            boundary.paths.length > 0 &&
            boundary.paths.every((boundaryPath) => expectedFiles.includes(boundaryPath)) &&
            Array.isArray(boundary.evidence) &&
            boundary.evidence.length > 0 &&
            boundary.evidence.every(evidenceReference),
        ) ||
        new Set(reviewability.splitBoundaries.map((boundary) => boundary.name)).size !==
          reviewability.splitBoundaries.length ||
        !sameStrings(
          [...new Set(reviewability.splitBoundaries.flatMap((boundary) => boundary.paths))].sort(),
          expectedFiles,
        ) ||
        (expectedFiles.length > 1 &&
          reviewability.splitBoundaries.flatMap((boundary) => boundary.paths).length !==
            new Set(reviewability.splitBoundaries.flatMap((boundary) => boundary.paths)).size) ||
        !report.findings?.some(
          (finding) =>
            finding.category === "reviewability" &&
            (finding.severity === "Critical" || finding.severity === "Important"),
        ))
    ) {
      errors.push("must-split reviews require a blocking reviewability finding and non-exhaustive claim");
    }
    if (reviewability.status === "reviewable" && reviewability.completenessClaim !== "exhaustive") {
      errors.push("reviewable changes require an exhaustive completeness claim");
    }
    if (
      reviewability.status === "reviewable" &&
      Array.isArray(reviewability.splitBoundaries) &&
      reviewability.splitBoundaries.length > 0
    ) {
      errors.push("reviewable changes must not declare split boundaries");
    }
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
  validateReviewLedger(report, options, errors);
  crossCheckReviewLedger(report, options, errors);
  crossCheckClassSweep(report, options, errors, expectedFiles);
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
      (finding.severity === "Minor" && !finding.description.startsWith("Nit: ")) ||
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
  console.error("usage: validate-review-report.mjs <review.json> [--expected-head SHA] [--expected-diff-digest SHA256] [--changed-files PATH] [--diff-numstat PATH]");
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
