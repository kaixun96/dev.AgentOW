import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { validateGraduationReview } from "../../tools/validate-graduation-review-report.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentow-graduation-review-"));
const changedFilesPath = path.join(tempDir, "changed-files.txt");
const deletedFilesPath = path.join(tempDir, "deleted-files.txt");
const expectedGatesPath = path.join(tempDir, "expected-gates.txt");
fs.writeFileSync(changedFilesPath, "src/consumer.tsx\nsrc/flights.ts\n");
fs.writeFileSync(deletedFilesPath, "src/flights.ts\n");
fs.writeFileSync(expectedGatesPath, "EditFlight\n");

const options = new Map([
  ["--changed-files", changedFilesPath],
  ["--deleted-files", deletedFilesPath],
  ["--expected-gates", expectedGatesPath],
  ["--expected-head", "a".repeat(40)],
  ["--expected-merge-base", "c".repeat(40)],
  ["--expected-diff-digest", "b".repeat(64)],
]);

const makeReport = () => ({
  schemaVersion: 1,
  reviewMode: "graduation-only",
  reviewedHead: "a".repeat(40),
  mergeBase: "c".repeat(40),
  diffDigest: "b".repeat(64),
  summary: "The permanent enabled branch is preserved and retired artifacts are removed",
  authorizationEvidence: ["artifact:pr-description.md rollout reached 100 percent"],
  gates: [
    {
      name: "EditFlight",
      type: "Flight",
      permanentState: "enabled",
      directionEvidence: ["src/flights.ts:10"],
      callSitesChecked: ["src/consumer.tsx:20"],
      cleanupEvidence: ["command:rg EditFlight src => no matches"],
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
  findings: [],
  counts: { critical: 0, important: 0, minor: 0 },
  verdict: "APPROVE",
});

assert.deepEqual(validateGraduationReview(makeReport(), options), [], "valid graduation report passes");

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

const blockingReport = makeReport();
blockingReport.gates[0].disposition = "finding";
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
