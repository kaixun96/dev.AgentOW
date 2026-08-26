import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateGraduationReview } from "../../tools/validate-graduation-review-report.mjs";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentow-graduation-review-"));
const changedFilesPath = path.join(tempDir, "changed-files.txt");
fs.writeFileSync(changedFilesPath, "src/consumer.tsx\nsrc/flights.ts\n");

const options = new Map([
  ["--changed-files", changedFilesPath],
  ["--expected-head", "a".repeat(40)],
  ["--expected-diff-digest", "b".repeat(64)],
]);

const makeReport = () => ({
  schemaVersion: 1,
  reviewMode: "graduation-only",
  reviewedHead: "a".repeat(40),
  mergeBase: "c".repeat(40),
  diffDigest: "b".repeat(64),
  summary: "The permanent enabled branch is preserved and retired artifacts are removed",
  authorizationEvidence: ["PR description: rollout reached 100 percent"],
  gates: [
    {
      name: "EditFlight",
      type: "Flight",
      permanentState: "enabled",
      directionEvidence: ["src/flights.ts:10"],
      callSitesChecked: ["src/consumer.tsx:20"],
      cleanupEvidence: ["search: EditFlight => no matches"],
      disposition: "complete",
    },
  ],
  changedFiles: [
    {
      path: "src/consumer.tsx",
      reviewedWholeFile: true,
      graduationDisposition: "Consumer is mechanically simplified to the enabled branch",
    },
    {
      path: "src/flights.ts",
      reviewedWholeFile: true,
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

const missingCleanup = makeReport();
missingCleanup.gates[0].cleanupEvidence = [];
assert.ok(validateGraduationReview(missingCleanup, options).length > 0, "cleanup evidence is mandatory");

const incompleteCoverage = makeReport();
incompleteCoverage.changedFiles.pop();
assert.ok(validateGraduationReview(incompleteCoverage, options).length > 0, "all Git-changed files are mandatory");

const genericContractReport = makeReport();
delete genericContractReport.reviewMode;
genericContractReport.preReview = { profiles: ["global"] };
assert.ok(validateGraduationReview(genericContractReport, options).length > 0, "generic reports cannot use graduation validator");

const minorReport = makeReport();
minorReport.findings.push({
  id: "G-MINOR",
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
  severity: "Important",
  path: "src/consumer.tsx",
  line: 20,
  description: "The disabled branch was retained instead of the proven enabled branch",
  suggestedFix: "Restore the enabled branch and remove the disabled branch",
  evidence: ["src/consumer.tsx:20"],
});
blockingReport.counts.important = 1;
blockingReport.verdict = "REQUEST_CHANGES";
assert.deepEqual(validateGraduationReview(blockingReport, options), [], "Important graduation finding blocks");

console.log("graduation review report validator fixtures passed");
