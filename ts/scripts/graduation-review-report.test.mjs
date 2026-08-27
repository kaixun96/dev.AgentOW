import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildInventory } from "../../tools/build-review-rule-inventory.mjs";
import { validateGraduationReview as validateGraduationReviewRaw } from "../../tools/validate-graduation-review-report.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentow-graduation-review-"));
const changedFilesPath = path.join(tempDir, "changed-files.txt");
const deletedFilesPath = path.join(tempDir, "deleted-files.txt");
const expectedGatesPath = path.join(tempDir, "expected-gates.txt");
const residualCandidatesPath = path.join(tempDir, "residual-candidates.jsonl");
const ruleRegistryPath = path.join(tempDir, "graduation-review-rule-registry.json");
const ruleInventoryPath = path.join(tempDir, "graduation-review-rule-inventory.json");
const graduationReferencePath = path.join(tempDir, "skills/ow-review/references/graduation.md");
fs.mkdirSync(path.dirname(graduationReferencePath), { recursive: true });
fs.writeFileSync(graduationReferencePath, "Preserve the permanent branch.\n\nRemove obsolete gate artifacts.\n");
const registryContent = `${JSON.stringify({ schemaVersion: 1, references: ["skills/ow-review/references/graduation.md"] }, null, 2)}\n`;
fs.writeFileSync(ruleRegistryPath, registryContent);
const ruleInventory = buildInventory({
  repoRoot: tempDir,
  references: ["skills/ow-review/references/graduation.md"],
  reviewedHead: "a".repeat(40),
  mergeBase: "c".repeat(40),
  diffDigest: "b".repeat(64),
});
ruleInventory.registryDigest = crypto.createHash("sha256").update(registryContent).digest("hex");
fs.writeFileSync(ruleInventoryPath, JSON.stringify(ruleInventory));
fs.writeFileSync(changedFilesPath, "src/consumer.tsx\nsrc/flights.ts\n");
fs.writeFileSync(deletedFilesPath, "src/flights.ts\n");
fs.writeFileSync(expectedGatesPath, "EditFlight\n");
fs.writeFileSync(residualCandidatesPath, "");

const options = new Map([
  ["--changed-files", changedFilesPath],
  ["--deleted-files", deletedFilesPath],
  ["--expected-gates", expectedGatesPath],
  ["--residual-candidates", residualCandidatesPath],
  ["--expected-head", "a".repeat(40)],
  ["--expected-merge-base", "c".repeat(40)],
  ["--expected-diff-digest", "b".repeat(64)],
  ["--rule-inventory", ruleInventoryPath],
  ["--rule-registry", ruleRegistryPath],
]);

const makeReport = () => ({
  schemaVersion: 1,
  reviewMode: "graduation-only",
  reviewedHead: "a".repeat(40),
  mergeBase: "c".repeat(40),
  diffDigest: "b".repeat(64),
  summary: "The permanent enabled branch is preserved and retired artifacts are removed",
  authorizationEvidence: ["artifact:pr-description.md rollout reached 100 percent"],
  ruleResults: ruleInventory.rules.map((rule) => ({
    ruleId: rule.id,
    disposition: "satisfied",
    evidence: ["src/consumer.tsx:20"],
    conclusion: "The graduation change satisfies this documented rule with concrete source evidence",
  })),
  gates: [
    {
      name: "EditFlight",
      type: "Flight",
      permanentState: "enabled",
      directionEvidence: ["src/flights.ts:10"],
      callSitesChecked: ["src/consumer.tsx:20"],
      cleanupEvidence: ["command:rg EditFlight src => no matches"],
      ruleChecks: [
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
      ].map((rule) => ({ rule, status: "clear", evidence: ["src/consumer.tsx:20"] })),
      disposition: "complete",
    },
  ],
  changedFiles: [
    {
      path: "src/consumer.tsx",
      reviewedWholeFile: true,
      reviewedVersion: "head",
      graduationDisposition: "Consumer is mechanically simplified to the enabled branch",
    },
    {
      path: "src/flights.ts",
      reviewedWholeFile: true,
      reviewedVersion: "merge-base",
      graduationDisposition: "Flight declaration and export are removed",
    },
  ],
  validation: {
    commandsRun: ["rushx test: passed"],
    notRun: [],
  },
  residualCandidates: [],
  findings: [],
  counts: { critical: 0, important: 0, minor: 0 },
  verdict: "APPROVE",
});

function validateGraduationReview(report, validationOptions) {
  const linkedFindingIds = (report.gates ?? []).flatMap((gate) =>
    (gate?.ruleChecks ?? []).flatMap((check) => check?.findingIds ?? []));
  if (linkedFindingIds.length > 0 && Array.isArray(report.ruleResults) && report.ruleResults.length > 0) {
    report.ruleResults[0] = {
      ...report.ruleResults[0],
      disposition: "finding",
      findingIds: [...new Set(linkedFindingIds)],
    };
  }
  return validateGraduationReviewRaw(report, validationOptions);
}

assert.deepEqual(validateGraduationReview(makeReport(), options), [], "valid graduation report passes");

const missingUniversalRule = makeReport();
missingUniversalRule.ruleResults.pop();
assert.ok(validateGraduationReview(missingUniversalRule, options).length > 0, "every graduation reference rule must be reported");

const originalGraduationReference = fs.readFileSync(graduationReferencePath, "utf8");
fs.writeFileSync(graduationReferencePath, `${originalGraduationReference}\nChanged after inventory creation.\n`);
assert.ok(validateGraduationReview(makeReport(), options).length > 0, "stale graduation rule sources are rejected");
fs.writeFileSync(graduationReferencePath, originalGraduationReference);

const fixedHelperCandidatesPath = path.join(tempDir, "fixed-helper-candidates.jsonl");
fs.writeFileSync(fixedHelperCandidatesPath, `${JSON.stringify({
  id: "R-SCHEDULING-HELPER",
  gateName: "EditFlight",
  kind: "fixed-return-helper",
  symbol: "isSchedulingEnabledForCoAuth",
  path: "src/consumer.tsx",
  line: 103,
})}\n`);
const fixedHelperOptions = new Map(options);
fixedHelperOptions.set("--residual-candidates", fixedHelperCandidatesPath);
const missedFixedHelper = makeReport();
assert.ok(
  validateGraduationReview(missedFixedHelper, fixedHelperOptions).length > 0,
  "exported fixed-return gate helper cannot be approved without a finding",
);

const unsupportedFixedHelperExemption = makeReport();
unsupportedFixedHelperExemption.residualCandidates.push({
  id: "R-SCHEDULING-HELPER",
  gateName: "EditFlight",
  kind: "fixed-return-helper",
  symbol: "isSchedulingEnabledForCoAuth",
  path: "src/consumer.tsx",
  line: 103,
  disposition: "independent-contract",
  independentSemanticEvidence: ["src/consumer.tsx:103"],
});
assert.ok(
  validateGraduationReview(unsupportedFixedHelperExemption, fixedHelperOptions).length > 0,
  "fixed helper exemption requires independent semantic and external caller evidence",
);

const reportedFixedHelper = makeReport();
reportedFixedHelper.gates[0].disposition = "finding";
reportedFixedHelper.gates[0].ruleChecks.find((check) => check.rule === "fixed-carriers").status = "finding";
reportedFixedHelper.gates[0].ruleChecks.find((check) => check.rule === "fixed-carriers").findingIds = ["G-FIXED-HELPER"];
reportedFixedHelper.residualCandidates.push({
  id: "R-SCHEDULING-HELPER",
  gateName: "EditFlight",
  kind: "fixed-return-helper",
  symbol: "isSchedulingEnabledForCoAuth",
  path: "src/consumer.tsx",
  line: 103,
  disposition: "finding",
  findingId: "G-FIXED-HELPER",
});
reportedFixedHelper.findings.push({
  id: "G-FIXED-HELPER",
  gateName: "EditFlight",
  severity: "Important",
  path: "src/consumer.tsx",
  line: 103,
  description: "The exported gate helper still returns the graduated literal true",
  suggestedFix: "Substitute true at every caller, simplify each branch, and delete the helper and export",
  evidence: ["src/consumer.tsx:103"],
  classSweepEvidence: ["command:rg isSchedulingEnabledForCoAuth src => 2 matches; all accounted"],
});
reportedFixedHelper.counts.important = 1;
reportedFixedHelper.verdict = "REQUEST_CHANGES";
assert.deepEqual(
  validateGraduationReview(reportedFixedHelper, fixedHelperOptions),
  [],
  "exported fixed-return gate helper produces a blocking finding",
);

const staleMergeBase = makeReport();
staleMergeBase.mergeBase = "d".repeat(40);
assert.ok(validateGraduationReview(staleMergeBase, options).length > 0, "merge base identity is immutable");

const missingHeadOptions = new Map(options);
missingHeadOptions.delete("--expected-head");
assert.ok(validateGraduationReview(makeReport(), missingHeadOptions).length > 0, "expected HEAD is mandatory");

const missingDigestOptions = new Map(options);
missingDigestOptions.delete("--expected-diff-digest");
assert.ok(validateGraduationReview(makeReport(), missingDigestOptions).length > 0, "expected diff digest is mandatory");

const malformedEvidence = makeReport();
malformedEvidence.authorizationEvidence = ["PR description says rollout is complete"];
assert.ok(validateGraduationReview(malformedEvidence, options).length > 0, "evidence uses structured references");

const incompleteGateInventory = makeReport();
incompleteGateInventory.gates[0].name = "OtherFlight";
assert.ok(validateGraduationReview(incompleteGateInventory, options).length > 0, "reported gates match independent inventory");

const missingCleanup = makeReport();
missingCleanup.gates[0].cleanupEvidence = [];
assert.ok(validateGraduationReview(missingCleanup, options).length > 0, "cleanup evidence is mandatory");

const unboundedCleanup = makeReport();
unboundedCleanup.gates[0].cleanupEvidence = ["command:rg EditFlight . => no matches"];
assert.ok(validateGraduationReview(unboundedCleanup, options).length > 0, "cleanup search must use a bounded scope");

const optionLikeQuery = makeReport();
optionLikeQuery.gates[0].cleanupEvidence = ["command:rg --files src => no matches"];
assert.ok(validateGraduationReview(optionLikeQuery, options).length > 0, "cleanup query cannot be an rg option");

const incompleteCoverage = makeReport();
incompleteCoverage.changedFiles.pop();
assert.ok(validateGraduationReview(incompleteCoverage, options).length > 0, "all Git-changed files are mandatory");

const wrongDeletedVersion = makeReport();
wrongDeletedVersion.changedFiles[1].reviewedVersion = "head";
assert.ok(validateGraduationReview(wrongDeletedVersion, options).length > 0, "deleted files are reviewed at merge base");

const invalidDeletedFilesPath = path.join(tempDir, "invalid-deleted-files.txt");
fs.writeFileSync(invalidDeletedFilesPath, "src/not-changed.ts\n");
const invalidDeletedOptions = new Map(options);
invalidDeletedOptions.set("--deleted-files", invalidDeletedFilesPath);
assert.ok(validateGraduationReview(makeReport(), invalidDeletedOptions).length > 0, "deleted files stay within Git changed files");

const genericContractReport = makeReport();
delete genericContractReport.reviewMode;
genericContractReport.preReview = { profiles: ["global"] };
assert.ok(validateGraduationReview(genericContractReport, options).length > 0, "generic reports cannot use graduation validator");

const minorReport = makeReport();
minorReport.gates[0].disposition = "finding";
minorReport.gates[0].ruleChecks.find((check) => check.rule === "minor-cleanup").status = "suggestion";
minorReport.gates[0].ruleChecks.find((check) => check.rule === "minor-cleanup").findingIds = ["G-MINOR"];
minorReport.findings.push({
  id: "G-MINOR",
  gateName: "EditFlight",
  severity: "Minor",
  path: "src/consumer.tsx",
  line: 21,
  description: "Nit: remove the redundant Fragment left by graduation",
  suggestedFix: "Render both children directly under the existing parent",
  evidence: ["src/consumer.tsx:21"],
});
minorReport.counts.minor = 1;
minorReport.verdict = "COMMENT";
assert.deepEqual(validateGraduationReview(minorReport, options), [], "Minor-only graduation report comments");

const fixedOptionSuggestion = makeReport();
fixedOptionSuggestion.gates[0].disposition = "finding";
fixedOptionSuggestion.gates[0].ruleChecks.find((check) => check.rule === "fixed-inputs").status = "suggestion";
fixedOptionSuggestion.gates[0].ruleChecks.find((check) => check.rule === "fixed-inputs").findingIds = ["G-FIXED-OPTION"];
fixedOptionSuggestion.findings.push({
  id: "G-FIXED-OPTION",
  gateName: "EditFlight",
  severity: "Minor",
  path: "src/consumer.tsx",
  line: 21,
  description: "Nit: Check whether isDashboardPersonalizationEnabled has any other callers or independent meaning",
  suggestedFix: "If not, remove the option and fold the enabled behavior into startFRETimer",
  evidence: ["src/consumer.tsx:21"],
});
fixedOptionSuggestion.counts.minor = 1;
fixedOptionSuggestion.verdict = "COMMENT";
assert.deepEqual(
  validateGraduationReview(fixedOptionSuggestion, options),
  [],
  "visible fixed option permits a Minor suggestion without residual inventory or a class sweep",
);

const blockingReport = makeReport();
blockingReport.gates[0].disposition = "finding";
blockingReport.gates[0].ruleChecks.find((check) => check.rule === "permanent-branch").status = "finding";
blockingReport.gates[0].ruleChecks.find((check) => check.rule === "permanent-branch").findingIds = ["G-DIRECTION"];
blockingReport.findings.push({
  id: "G-DIRECTION",
  gateName: "EditFlight",
  severity: "Important",
  path: "src/consumer.tsx",
  line: 20,
  description: "The disabled branch was retained instead of the proven enabled branch",
  suggestedFix: "Restore the enabled branch and remove the disabled branch",
  evidence: ["src/consumer.tsx:20"],
  classSweepEvidence: ["command:rg disabledBranch src => 1 matches; all accounted"],
});
blockingReport.counts.important = 1;
blockingReport.verdict = "REQUEST_CHANGES";
assert.deepEqual(validateGraduationReview(blockingReport, options), [], "Important graduation finding blocks");

const missingRuleCheck = makeReport();
missingRuleCheck.gates[0].ruleChecks.pop();
assert.ok(validateGraduationReview(missingRuleCheck, options).length > 0, "every mandatory rule class must be reported");

const unlinkedFinding = structuredClone(blockingReport);
delete unlinkedFinding.gates[0].ruleChecks.find((check) => check.rule === "permanent-branch").findingIds;
assert.ok(validateGraduationReview(unlinkedFinding, options).length > 0, "every finding must be linked from its rule check");

const duplicateFindingLink = structuredClone(blockingReport);
duplicateFindingLink.gates[0].ruleChecks.find((check) => check.rule === "fixed-carriers").status = "finding";
duplicateFindingLink.gates[0].ruleChecks.find((check) => check.rule === "fixed-carriers").findingIds = ["G-DIRECTION"];
assert.ok(validateGraduationReview(duplicateFindingLink, options).length > 0, "one finding cannot satisfy multiple rule classes");

const clearRuleWithFinding = makeReport();
clearRuleWithFinding.gates[0].ruleChecks[0].findingIds = ["G-NOT-PRESENT"];
assert.ok(validateGraduationReview(clearRuleWithFinding, options).length > 0, "clear checks cannot hide finding references");

const findingWithCompleteGate = structuredClone(blockingReport);
findingWithCompleteGate.gates[0].disposition = "complete";
assert.ok(validateGraduationReview(findingWithCompleteGate, options).length > 0, "a finding marks its gate as finding");

const findingDispositionWithoutGateFinding = makeReport();
findingDispositionWithoutGateFinding.gates[0].disposition = "finding";
assert.ok(validateGraduationReview(findingDispositionWithoutGateFinding, options).length > 0, "finding disposition requires a gate finding");

const unknownFindingGate = structuredClone(blockingReport);
unknownFindingGate.findings[0].gateName = "UnknownFlight";
assert.ok(validateGraduationReview(unknownFindingGate, options).length > 0, "findings reference inventoried gates");

const missingClassSweep = structuredClone(blockingReport);
delete missingClassSweep.findings[0].classSweepEvidence;
assert.ok(validateGraduationReview(missingClassSweep, options).length > 0, "blocking findings require a class sweep");

const genericCommandClassSweep = structuredClone(blockingReport);
genericCommandClassSweep.findings[0].classSweepEvidence = ["command:npm test => passed"];
assert.ok(validateGraduationReview(genericCommandClassSweep, options).length > 0, "generic commands cannot prove a class sweep");

const malformedFindings = makeReport();
malformedFindings.findings = [null];
assert.doesNotThrow(() => validateGraduationReview(malformedFindings, options), "malformed findings return validation errors");
assert.ok(validateGraduationReview(malformedFindings, options).length > 0, "malformed findings are rejected");

const malformedGates = makeReport();
malformedGates.gates.push(null);
assert.doesNotThrow(() => validateGraduationReview(malformedGates, options), "malformed gates return validation errors");
assert.ok(validateGraduationReview(malformedGates, options).length > 0, "malformed gates are rejected");

console.log("graduation review report validator fixtures passed");
