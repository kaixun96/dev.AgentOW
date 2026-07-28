import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

const validator = new URL("../../tools/validate-review-report.mjs", import.meta.url);
const tempDir = fs.mkdtempSync(`${os.tmpdir()}/agentow-review-contract-`);
const changedFilesPath = `${tempDir}/changed-files.txt`;
const reportPath = `${tempDir}/review.json`;
fs.writeFileSync(changedFilesPath, "src/example.ts\n");

const dimensionNames = [
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
const dimensions = {};
const dimensionConclusions = {
  behavior: "Behavior and state transitions preserve the intended implementation flow",
  designMaintainability: "Design and maintainability avoid deprecated APIs, duplication, and hardcoded behavior",
  callersConsumers: "Direct caller and consumer usage preserves the returned value contract",
  tests: "Test coverage asserts both empty and populated result branches",
  typesContracts: "Type and interface contracts remain compatible with existing API usage",
  errorsEdgeCases: "Error handling covers invalid input and the empty-result edge case",
  securityPrivacy: "Security and privacy boundaries do not expose untrusted input or data",
  performance: "Performance remains linear without extra allocation or repeated scanning",
  accessibilityUi: "Accessibility and UI behavior are unaffected by this non-visual change",
  localization: "Localization resources and user-facing strings remain unchanged",
  compatibilityKillswitch: "Backward compatibility and rollback behavior remain intact",
  telemetry: "Telemetry and logging preserve stable events without sensitive payloads",
  repoInstructionsContext: "Repository instructions and documented conventions are satisfied",
  dependenciesTooling: "Dependency, build, and tooling configuration remain unchanged",
};
for (const key of dimensionNames) {
  dimensions[key] = {
    status: "reviewed",
    evidence: ["src/example.ts:1"],
    conclusion: dimensionConclusions[key],
  };
}

function makeReport() {
  return {
    schemaVersion: 1,
    reviewedHead: "a".repeat(40),
    mergeBase: "b".repeat(40),
    diffDigest: "c".repeat(64),
    verdict: "APPROVE",
    summary: "Reviewed the behavior and its direct consumer.",
    preReview: {
      intent: "Preserve the public return contract while handling empty results",
      evidence: ["artifact:planning/planner-report.md"],
      necessityAndScope: "The focused change is necessary to prevent valid empty results from crashing callers",
      intentMatch: "The implementation matches the stated behavior and does not expand beyond the affected path",
      profiles: ["global"],
    },
    riskMap: [{ path: "src/example.ts", risk: "medium", rationale: "Changes a public return value" }],
    coverage: {
      changedFiles: [
        {
          path: "src/example.ts",
          reviewedWholeFile: true,
          evidence: ["src/example.ts:1"],
          directConsumersChecked: ["src/caller.ts:2"],
          consumerDisposition: "The direct caller preserves the documented return contract",
          testsChecked: ["src/example.test.ts:3"],
          testDisposition: "The unit test covers empty and populated result branches",
          disposition: "The return contract and direct consumer handling remain compatible",
        },
      ],
      dimensions: structuredClone(dimensions),
    },
    secondPass: {
      completed: true,
      checks: [
        {
          hypothesis: "The caller mishandles an empty result",
          evidence: ["src/caller.ts:2"],
          result: "Caller handles the empty result explicitly",
        },
      ],
    },
    findings: [],
    counts: { critical: 0, important: 0, minor: 0 },
  };
}

function validate(report) {
  fs.writeFileSync(reportPath, JSON.stringify(report));
  return spawnSync(
    process.execPath,
    [
      validator.pathname,
      reportPath,
      "--expected-head",
      "a".repeat(40),
      "--expected-diff-digest",
      "c".repeat(64),
      "--changed-files",
      changedFilesPath,
    ],
    { encoding: "utf8" },
  );
}

assert.equal(validate(makeReport()).status, 0, "complete clean review should pass");

fs.unlinkSync(changedFilesPath);
assert.equal(validate(makeReport()).status, 1, "missing changed-file evidence should fail closed");
fs.writeFileSync(changedFilesPath, "\n");
assert.equal(validate(makeReport()).status, 1, "empty changed-file evidence should fail closed");
fs.writeFileSync(changedFilesPath, "src/example.ts\n");

const rubberStamp = makeReport();
rubberStamp.coverage.dimensions.tests = undefined;
assert.equal(validate(rubberStamp).status, 1, "incomplete coverage should fail");

const stale = makeReport();
stale.reviewedHead = "d".repeat(40);
assert.equal(validate(stale).status, 1, "stale HEAD should fail");

const missingOrientation = makeReport();
delete missingOrientation.preReview;
assert.equal(validate(missingOrientation).status, 1, "missing pre-review intent and scope analysis should fail");

fs.writeFileSync(changedFilesPath, "sp-client/src/example.ts\n");
const missingSpClientOrientation = makeReport();
delete missingSpClientOrientation.preReview;
missingSpClientOrientation.riskMap[0].path = "sp-client/src/example.ts";
missingSpClientOrientation.coverage.changedFiles[0].path = "sp-client/src/example.ts";
assert.equal(validate(missingSpClientOrientation).status, 1, "missing sp-client pre-review data should fail without crashing");

const missingSpClientProfile = makeReport();
missingSpClientProfile.riskMap[0].path = "sp-client/src/example.ts";
missingSpClientProfile.coverage.changedFiles[0].path = "sp-client/src/example.ts";
assert.equal(validate(missingSpClientProfile).status, 1, "sp-client changes require the scoped profile");
missingSpClientProfile.preReview.profiles.push("sp-client");
assert.equal(validate(missingSpClientProfile).status, 0, "explicit sp-client profile should satisfy scoped review");
fs.writeFileSync(changedFilesPath, "src/example.ts\n");

const incompleteScope = makeReport();
incompleteScope.riskMap[0].path = "src/other.ts";
assert.equal(validate(incompleteScope).status, 1, "changed-file mismatch should fail");

const emptyConsumerAnalysis = makeReport();
emptyConsumerAnalysis.coverage.changedFiles[0].directConsumersChecked = [];
assert.equal(validate(emptyConsumerAnalysis).status, 1, "generic empty consumer analysis should fail");

const emptyTestAnalysis = makeReport();
emptyTestAnalysis.coverage.changedFiles[0].testsChecked = [];
assert.equal(validate(emptyTestAnalysis).status, 1, "empty test analysis should fail");

const selfConsumer = makeReport();
selfConsumer.coverage.changedFiles[0].directConsumersChecked = ["src/example.ts:8"];
assert.equal(validate(selfConsumer).status, 1, "a changed file cannot cite itself as its direct consumer");

const aliasedSelfConsumer = makeReport();
aliasedSelfConsumer.coverage.changedFiles[0].directConsumersChecked = ["./src/example.ts:8"];
assert.equal(validate(aliasedSelfConsumer).status, 1, "an aliased changed path cannot cite itself as a consumer");

const nonTestEvidence = makeReport();
nonTestEvidence.coverage.changedFiles[0].testsChecked = ["src/test-utils.ts:8"];
assert.equal(validate(nonTestEvidence).status, 1, "file test evidence must point to a test-like path");

const fakeSearchEvidence = makeReport();
fakeSearchEvidence.coverage.changedFiles[0].directConsumersChecked = ["command:true"];
fakeSearchEvidence.coverage.changedFiles[0].testsChecked = ["command:true"];
assert.equal(validate(fakeSearchEvidence).status, 1, "arbitrary commands cannot stand in for bounded no-match searches");

const boundedNoMatchEvidence = makeReport();
boundedNoMatchEvidence.coverage.changedFiles[0].directConsumersChecked = [
  "command:rg caller src => no matches",
];
boundedNoMatchEvidence.coverage.changedFiles[0].testsChecked = [
  "command:rg spec src => 0 matches",
];
assert.equal(validate(boundedNoMatchEvidence).status, 0, "bounded searches with explicit no-match results should pass");

const injectedSearchEvidence = makeReport();
injectedSearchEvidence.coverage.changedFiles[0].directConsumersChecked = [
  "command:true; rg caller / => no matches",
];
assert.equal(validate(injectedSearchEvidence).status, 1, "shell composition and unbounded search paths should fail");

for (const unsafePath of ["--version", "~"]) {
  const unsafePathEvidence = makeReport();
  unsafePathEvidence.coverage.changedFiles[0].directConsumersChecked = [
    `command:rg consumer ${unsafePath} => no matches`,
  ];
  assert.equal(validate(unsafePathEvidence).status, 1, `unsafe search path ${unsafePath} should fail`);
}

const paddedDimensions = makeReport();
for (const key of dimensionNames) {
  paddedDimensions.coverage.dimensions[key].conclusion = `Dimension ${key} checked against implementation evidence`;
}
assert.equal(validate(paddedDimensions).status, 1, "dimension-name padding without semantic conclusions should fail");

const important = makeReport();
important.findings.push({
  id: "R1",
  severity: "Important",
  category: "behavior",
  path: "src/example.ts",
  line: 1,
  description: "Empty results violate the caller contract",
  impact: "The command crashes for valid input",
  suggestedFix: "Preserve the empty-result branch",
  evidence: ["src/example.ts:1", "src/caller.ts:2"],
});
important.counts.important = 1;
assert.equal(validate(important).status, 1, "Important finding cannot use APPROVE");
important.verdict = "REQUEST_CHANGES";
assert.equal(validate(important).status, 0, "Important finding should request changes");

const critical = makeReport();
critical.findings.push({
  id: "R1",
  severity: "Critical",
  category: "security",
  path: "src/example.ts",
  line: 1,
  description: "Untrusted input reaches an executable shell",
  impact: "An attacker can execute arbitrary commands",
  suggestedFix: "Pass fixed arguments without shell interpolation",
  evidence: ["src/example.ts:1"],
});
critical.counts.critical = 1;
critical.verdict = "REQUEST_CHANGES";
assert.equal(validate(critical).status, 0, "Critical finding should request changes");

const badCounts = makeReport();
badCounts.counts.minor = 1;
assert.equal(validate(badCounts).status, 1, "count mismatch should fail");

const minor = makeReport();
minor.findings.push({
  id: "R1",
  severity: "Minor",
  category: "maintainability",
  path: "src/example.ts",
  line: 1,
  description: "Nit: Local name obscures the returned value",
  impact: "Small readability cost with no behavioral risk",
  suggestedFix: "Use the domain term already used by callers",
  evidence: ["src/example.ts:1"],
});
minor.counts.minor = 1;
minor.verdict = "COMMENT";
assert.equal(validate(minor).status, 0, "Minor-only review should comment");

const mandatoryNit = makeReport();
mandatoryNit.findings.push({
  id: "R1",
  severity: "Minor",
  category: "maintainability",
  path: "src/example.ts",
  line: 1,
  description: "Local name obscures the returned value",
  impact: "Small readability cost with no behavioral risk",
  suggestedFix: "Use the domain term already used by callers",
  evidence: ["src/example.ts:1"],
});
mandatoryNit.counts.minor = 1;
mandatoryNit.verdict = "COMMENT";
assert.equal(validate(mandatoryNit).status, 1, "Minor educational comments must use the Nit prefix");

fs.rmSync(tempDir, { recursive: true });
console.log("review report validator fixtures passed");
