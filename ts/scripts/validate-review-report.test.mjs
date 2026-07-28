import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

const validator = new URL("../../tools/validate-review-report.mjs", import.meta.url);
const tempDir = fs.mkdtempSync(`${os.tmpdir()}/agentow-review-contract-`);
const changedFilesPath = `${tempDir}/changed-files.txt`;
const diffNumstatPath = `${tempDir}/numstat.txt`;
const reportPath = `${tempDir}/review.json`;
fs.writeFileSync(changedFilesPath, "src/example.ts\n");
fs.writeFileSync(diffNumstatPath, "10\t2\tsrc/example.ts\n");

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
      profileChecks: [],
      reviewability: {
        status: "reviewable",
        changedFileCount: 1,
        additions: 10,
        deletions: 2,
        generatedOrMechanicalLines: 0,
        mechanicalBreakdown: [],
        independentBehaviorUnits: [{ name: "Empty-result handling", paths: ["src/example.ts"] }],
        highRiskDomains: ["public contract"],
        rationale: "One focused behavior and one contract risk can be reviewed reliably as a single unit",
        completenessClaim: "exhaustive",
        splitBoundaries: [],
      },
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

function addBlockingRolloutFinding(report) {
  report.findings.push({
    id: "R-ROLLOUT",
    severity: "Important",
    category: "rolloutProtection",
    path: "sp-client/src/example.ts",
    line: 1,
    description: "The runtime change is not fully protected by the declared rollout gate",
    impact: "Users can enter the new behavior when the gate should preserve the fallback path",
    suggestedFix: "Gate every runtime entry and add disabled-state regression coverage",
    evidence: ["sp-client/src/example.ts:1"],
  });
  report.counts.important = 1;
  report.verdict = "REQUEST_CHANGES";
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
      "--diff-numstat",
      diffNumstatPath,
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

const missingReviewability = makeReport();
delete missingReviewability.preReview.reviewability;
assert.equal(validate(missingReviewability).status, 1, "missing reviewability assessment should fail");

fs.writeFileSync(changedFilesPath, "sp-client/src/example.ts\n");
fs.writeFileSync(diffNumstatPath, "10\t2\tsp-client/src/example.ts\n");
const missingSpClientOrientation = makeReport();
delete missingSpClientOrientation.preReview;
missingSpClientOrientation.riskMap[0].path = "sp-client/src/example.ts";
missingSpClientOrientation.coverage.changedFiles[0].path = "sp-client/src/example.ts";
missingSpClientOrientation.preReview = undefined;
assert.equal(validate(missingSpClientOrientation).status, 1, "missing sp-client pre-review data should fail without crashing");

const missingSpClientProfile = makeReport();
missingSpClientProfile.riskMap[0].path = "sp-client/src/example.ts";
missingSpClientProfile.coverage.changedFiles[0].path = "sp-client/src/example.ts";
missingSpClientProfile.preReview.reviewability.independentBehaviorUnits[0].paths = ["sp-client/src/example.ts"];
assert.equal(validate(missingSpClientProfile).status, 1, "sp-client changes require the scoped profile");
missingSpClientProfile.preReview.profiles.push("sp-client");
missingSpClientProfile.preReview.profileChecks = [
  {
    id: "spClientRolloutTrace",
    status: "reviewed",
    evidence: ["sp-client/src/example.ts:1"],
    conclusion: "The rollout entry point and flight fallback were traced through the changed implementation",
  },
  {
    id: "spClientUiPrimitivesTokens",
    status: "reviewed",
    evidence: ["sp-client/src/example.ts:1"],
    conclusion: "Fluent and SPDS component primitives plus typography tokens were checked for reuse",
  },
  {
    id: "spClientThemeDetheme",
    status: "reviewed",
    evidence: ["sp-client/src/example.ts:1"],
    conclusion: "The SharePoint theme and Detheme provider flow requires no local override for this change",
  },
  {
    id: "spClientLargeCollections",
    status: "reviewed",
    evidence: ["sp-client/src/example.ts:1"],
    conclusion: "Collection pagination and bounded rendering behavior were reviewed for the changed data path",
  },
  {
    id: "spClientAutomatedTests",
    status: "reviewed",
    evidence: ["sp-client/src/example.test.ts:1"],
    conclusion: "Automated regression test coverage exercises the changed behavior and error paths",
  },
];
missingSpClientProfile.preReview.rolloutProtection = {
  runtimePaths: ["sp-client/src/example.ts"],
  reviewContext: "existing-pr",
  descriptionStatus: "documented",
  descriptionEvidence: ["artifact:pr-description"],
  protectionStatus: "protected",
  gateType: "flight",
  gateIdentifiers: ["ExampleFeatureFlight"],
  existingUpstreamGate: true,
  entryPointEvidence: ["sp-client/src/example.ts:1"],
  gateCheckEvidence: ["sp-client/src/example.ts:2"],
  newPathEvidence: ["sp-client/src/example.ts:3"],
  fallbackEvidence: ["sp-client/src/example.ts:4"],
  newPathState: "flight-enabled",
  fallbackState: "flight-disabled",
  disabledStateTestEvidence: ["sp-client/src/example.test.ts:1"],
  pathCoverage: [
    {
      path: "sp-client/src/example.ts",
      changedEvidence: ["sp-client/src/example.ts:1"],
      gateEvidence: ["sp-client/src/example.ts:2"],
      fallbackEvidence: ["sp-client/src/example.ts:4"],
      conclusion: "This changed runtime file is reached only after the Flight check and Flight off uses fallback",
    },
  ],
  conclusion: "The declared flight protects every runtime entry and Flight off preserves the original fallback path",
};
assert.equal(validate(missingSpClientProfile).status, 0, "explicit sp-client profile should satisfy scoped review");

const missingSpClientCheck = structuredClone(missingSpClientProfile);
missingSpClientCheck.preReview.profileChecks.pop();
assert.equal(validate(missingSpClientCheck).status, 1, "sp-client profile cannot omit a required evidence check");

const paddedSpClientChecks = structuredClone(missingSpClientProfile);
for (const check of paddedSpClientChecks.preReview.profileChecks) {
  check.conclusion = "This scoped profile check was reviewed against the implementation evidence";
}
assert.equal(validate(paddedSpClientChecks).status, 1, "sp-client checks require concern-specific conclusions");

const missingRolloutEvidence = structuredClone(missingSpClientProfile);
delete missingRolloutEvidence.preReview.rolloutProtection;
assert.equal(validate(missingRolloutEvidence).status, 1, "sp-client runtime changes require structured rollout evidence");

const wrongFlightDirection = structuredClone(missingSpClientProfile);
wrongFlightDirection.preReview.rolloutProtection.newPathState = "flight-disabled";
assert.equal(validate(wrongFlightDirection).status, 1, "protected rollout evidence must use the correct gate direction");

const missingRuntimePathCoverage = structuredClone(missingSpClientProfile);
missingRuntimePathCoverage.preReview.rolloutProtection.pathCoverage = [];
assert.equal(validate(missingRuntimePathCoverage).status, 1, "every runtime changed path needs gate and fallback evidence");

const missingFallbackEvidence = structuredClone(missingSpClientProfile);
missingFallbackEvidence.preReview.rolloutProtection.fallbackEvidence = [];
assert.equal(validate(missingFallbackEvidence).status, 1, "protected rollout evidence requires a fallback trace");

const incompleteRollout = structuredClone(missingSpClientProfile);
incompleteRollout.preReview.rolloutProtection.protectionStatus = "incomplete";
incompleteRollout.preReview.rolloutProtection.conclusion =
  "The Flight is identified but one changed runtime entry bypasses the gate";
addBlockingRolloutFinding(incompleteRollout);
assert.equal(validate(incompleteRollout).status, 0, "review can report partial gate coverage as a product finding");

const protectedKillswitch = structuredClone(missingSpClientProfile);
protectedKillswitch.preReview.rolloutProtection.gateType = "killswitch";
protectedKillswitch.preReview.rolloutProtection.gateIdentifiers = ["isExampleKSActivated"];
protectedKillswitch.preReview.rolloutProtection.newPathState = "ks-not-activated";
protectedKillswitch.preReview.rolloutProtection.fallbackState = "ks-activated";
assert.equal(validate(protectedKillswitch).status, 0, "killswitch direction should place new code in the not-activated state");

const protectedKillswitchAndFlight = structuredClone(missingSpClientProfile);
protectedKillswitchAndFlight.preReview.rolloutProtection.gateType = "killswitch+flight";
protectedKillswitchAndFlight.preReview.rolloutProtection.gateIdentifiers = [
  "isExampleKSActivated",
  "ExampleFeatureFlight",
];
protectedKillswitchAndFlight.preReview.rolloutProtection.newPathState =
  "ks-not-activated-and-flight-enabled";
protectedKillswitchAndFlight.preReview.rolloutProtection.fallbackState =
  "ks-activated-or-flight-disabled";
assert.equal(validate(protectedKillswitchAndFlight).status, 0, "combined gates require both safe fallback directions");

const runtimePathMismatch = structuredClone(missingSpClientProfile);
runtimePathMismatch.preReview.rolloutProtection.runtimePaths = ["sp-client/src/different.ts"];
assert.equal(validate(runtimePathMismatch).status, 1, "reported runtime paths must exactly match Git");

const undocumentedRollout = structuredClone(missingSpClientProfile);
undocumentedRollout.preReview.rolloutProtection.descriptionStatus = "missing";
undocumentedRollout.preReview.rolloutProtection.descriptionEvidence = [];
assert.equal(validate(undocumentedRollout).status, 1, "missing PR rollout metadata requires a finding");
addBlockingRolloutFinding(undocumentedRollout);
assert.equal(validate(undocumentedRollout).status, 0, "review can report missing rollout metadata as a product finding");

const unprotectedRuntime = structuredClone(missingSpClientProfile);
unprotectedRuntime.preReview.rolloutProtection.protectionStatus = "unprotected";
unprotectedRuntime.preReview.rolloutProtection.gateType = "unprotected";
unprotectedRuntime.preReview.rolloutProtection.conclusion =
  "No Flight or killswitch protects the changed runtime entry and fallback behavior";
assert.equal(validate(unprotectedRuntime).status, 1, "unprotected runtime code requires a finding");
addBlockingRolloutFinding(unprotectedRuntime);
assert.equal(validate(unprotectedRuntime).status, 0, "review can report unprotected runtime code as a product finding");

fs.writeFileSync(changedFilesPath, "sp-client/docs/example.md\n");
fs.writeFileSync(diffNumstatPath, "10\t2\tsp-client/docs/example.md\n");
const nonRuntimeSpClientChange = structuredClone(missingSpClientProfile);
nonRuntimeSpClientChange.riskMap[0].path = "sp-client/docs/example.md";
nonRuntimeSpClientChange.coverage.changedFiles[0].path = "sp-client/docs/example.md";
nonRuntimeSpClientChange.preReview.reviewability.independentBehaviorUnits[0].paths = [
  "sp-client/docs/example.md",
];
nonRuntimeSpClientChange.preReview.rolloutProtection = {
  runtimePaths: [],
  protectionStatus: "not-applicable",
  gateType: "not-applicable",
  notApplicableReason: "The Git diff contains only documentation and cannot change runtime behavior or styling",
  conclusion: "No SP-Client runtime path requires rollout protection",
};
assert.equal(validate(nonRuntimeSpClientChange).status, 0, "pure documentation changes can use rollout not-applicable");

fs.writeFileSync(changedFilesPath, "src/example.ts\n");
fs.writeFileSync(diffNumstatPath, "10\t2\tsrc/example.ts\n");

const hardOversizeApproval = makeReport();
hardOversizeApproval.preReview.reviewability.additions = 5001;
fs.writeFileSync(diffNumstatPath, "5001\t2\tsrc/example.ts\n");
assert.equal(validate(hardOversizeApproval).status, 1, "5000 or more substantive lines cannot be approved as exhaustive");

const hardOversizeBlocked = makeReport();
hardOversizeBlocked.summary = "Preliminary non-exhaustive scan found an oversized change that requires splitting";
hardOversizeBlocked.preReview.reviewability.additions = 5001;
hardOversizeBlocked.preReview.reviewability.status = "must-split";
hardOversizeBlocked.preReview.reviewability.completenessClaim = "preliminary-non-exhaustive";
hardOversizeBlocked.preReview.reviewability.splitBoundaries = [
  {
    name: "Separate public contract behavior",
    paths: ["src/example.ts"],
    rationale: "Isolate the contract change and its direct consumer verification in one review",
    evidence: ["src/example.ts:1"],
  },
  {
    name: "Separate regression test coverage",
    paths: ["src/example.ts"],
    rationale: "Review the negative and edge-case regression coverage as an independently verifiable unit",
    evidence: ["src/example.test.ts:3"],
  },
];
hardOversizeBlocked.findings.push({
  id: "R-SIZE",
  severity: "Important",
  category: "reviewability",
  path: "src/example.ts",
  line: 1,
  description: "The change is too large for one reliable exhaustive review",
  impact: "Independent behavior and risk interactions can escape reviewer attention",
  suggestedFix: "Split the change into independently testable behavior units",
  evidence: ["artifact:git-numstat"],
});
hardOversizeBlocked.counts.important = 1;
hardOversizeBlocked.verdict = "REQUEST_CHANGES";
assert.equal(validate(hardOversizeBlocked).status, 0, "oversized preliminary scan should pass only with a split blocker");
fs.writeFileSync(diffNumstatPath, "10\t2\tsrc/example.ts\n");

const mechanicalHardCeilingBypass = makeReport();
mechanicalHardCeilingBypass.preReview.reviewability.additions = 5845;
mechanicalHardCeilingBypass.preReview.reviewability.generatedOrMechanicalLines = 848;
mechanicalHardCeilingBypass.preReview.reviewability.mechanicalBreakdown = [
  {
    path: "src/example.ts",
    lines: 848,
    rationale: "Generated declarations account for these mechanically produced lines",
    evidence: ["artifact:generator-manifest.json"],
  },
];
mechanicalHardCeilingBypass.preReview.reviewability.largeChangeException = {
  singleCoherentChange: true,
  rationale: "The remaining implementation is represented as one coherent public contract change",
  evidence: ["artifact:planning/planner-report.md"],
};
fs.writeFileSync(diffNumstatPath, "5845\t2\tsrc/example.ts\n");
assert.equal(validate(mechanicalHardCeilingBypass).status, 1, "mechanical claims cannot bypass the 5000-line hard ceiling");
fs.writeFileSync(diffNumstatPath, "10\t2\tsrc/example.ts\n");

const unboundMechanicalClaim = makeReport();
unboundMechanicalClaim.preReview.reviewability.additions = 3000;
unboundMechanicalClaim.preReview.reviewability.generatedOrMechanicalLines = 1500;
unboundMechanicalClaim.preReview.reviewability.mechanicalBreakdown = [];
fs.writeFileSync(diffNumstatPath, "3000\t2\tsrc/example.ts\n");
assert.equal(validate(unboundMechanicalClaim).status, 1, "mechanical line claims require exact structured breakdown");
fs.writeFileSync(diffNumstatPath, "10\t2\tsrc/example.ts\n");

const substantiveExceptionBypass = makeReport();
substantiveExceptionBypass.preReview.reviewability.additions = 3000;
substantiveExceptionBypass.preReview.reviewability.largeChangeException = {
  singleCoherentChange: true,
  rationale: "The report claims all substantive churn is one coherent public contract behavior",
  evidence: ["artifact:planning/planner-report.md"],
};
fs.writeFileSync(diffNumstatPath, "3000\t2\tsrc/example.ts\n");
assert.equal(validate(substantiveExceptionBypass).status, 1, "exceptions cannot override 2000 substantive lines");
fs.writeFileSync(diffNumstatPath, "10\t2\tsrc/example.ts\n");

const crossFileMechanicalBypass = makeReport();
fs.writeFileSync(changedFilesPath, "src/example.ts\nsrc/tiny.ts\n");
fs.writeFileSync(diffNumstatPath, "3000\t0\tsrc/example.ts\n1\t0\tsrc/tiny.ts\n");
crossFileMechanicalBypass.riskMap.push({
  path: "src/tiny.ts",
  risk: "low",
  rationale: "A tiny supporting file should not absorb mechanical claims from another changed path",
});
crossFileMechanicalBypass.coverage.changedFiles.push({
  ...structuredClone(crossFileMechanicalBypass.coverage.changedFiles[0]),
  path: "src/tiny.ts",
  evidence: ["src/tiny.ts:1"],
});
crossFileMechanicalBypass.preReview.reviewability.changedFileCount = 2;
crossFileMechanicalBypass.preReview.reviewability.additions = 3001;
crossFileMechanicalBypass.preReview.reviewability.deletions = 0;
crossFileMechanicalBypass.preReview.reviewability.generatedOrMechanicalLines = 1002;
crossFileMechanicalBypass.preReview.reviewability.mechanicalBreakdown = [
  {
    path: "src/tiny.ts",
    lines: 1002,
    rationale: "The report incorrectly attributes mechanical churn from the large file to this tiny file",
    evidence: ["artifact:generator-manifest.json"],
  },
];
crossFileMechanicalBypass.preReview.reviewability.independentBehaviorUnits[0].paths.push("src/tiny.ts");
assert.equal(validate(crossFileMechanicalBypass).status, 1, "mechanical claims cannot exceed each path's numstat churn");
fs.writeFileSync(changedFilesPath, "src/example.ts\n");
fs.writeFileSync(diffNumstatPath, "10\t2\tsrc/example.ts\n");

const multiSurfaceApproval = makeReport();
multiSurfaceApproval.preReview.reviewability.independentBehaviorUnits = [
  { name: "Group page", paths: ["src/example.ts"] },
  { name: "User display page", paths: ["src/example.ts"] },
  { name: "User edit page", paths: ["src/example.ts"] },
];
assert.equal(validate(multiSurfaceApproval).status, 1, "three independent behavior units must not be approved as one review");

const structuralPaths = Array.from({ length: 40 }, (_, index) => `src/generated-${index}.ts`);
const structuralExceptionBypass = makeReport();
fs.writeFileSync(changedFilesPath, `${structuralPaths.join("\n")}\n`);
fs.writeFileSync(diffNumstatPath, structuralPaths.map((file) => `1\t0\t${file}`).join("\n") + "\n");
structuralExceptionBypass.riskMap = structuralPaths.map((file) => ({
  path: file,
  risk: "low",
  rationale: "Generated structural breadth still needs path-bound evidence before a review exception",
}));
structuralExceptionBypass.coverage.changedFiles = structuralPaths.map((file) => ({
  ...structuredClone(structuralExceptionBypass.coverage.changedFiles[0]),
  path: file,
  evidence: [`${file}:1`],
}));
structuralExceptionBypass.preReview.reviewability.changedFileCount = 40;
structuralExceptionBypass.preReview.reviewability.additions = 40;
structuralExceptionBypass.preReview.reviewability.deletions = 0;
structuralExceptionBypass.preReview.reviewability.independentBehaviorUnits[0].paths = structuralPaths;
structuralExceptionBypass.preReview.reviewability.largeChangeException = {
  singleCoherentChange: true,
  rationale: "The report claims all forty files are one coherent generated behavior change",
  evidence: ["artifact:generator-manifest.json"],
};
assert.equal(validate(structuralExceptionBypass).status, 1, "structural exceptions require mechanical evidence for every path");
fs.writeFileSync(changedFilesPath, "src/example.ts\n");
fs.writeFileSync(diffNumstatPath, "10\t2\tsrc/example.ts\n");

const incompleteSplitPlan = structuredClone(hardOversizeBlocked);
incompleteSplitPlan.preReview.reviewability.splitBoundaries = [];
fs.writeFileSync(diffNumstatPath, "5001\t2\tsrc/example.ts\n");
assert.equal(validate(incompleteSplitPlan).status, 1, "must-split reports require concrete split boundaries");

const unrelatedSplitPath = structuredClone(hardOversizeBlocked);
unrelatedSplitPath.preReview.reviewability.splitBoundaries[1].paths = ["src/not-changed.ts"];
assert.equal(validate(unrelatedSplitPath).status, 1, "split boundaries must be allocated to Git changed paths");

const dishonestSplitSummary = structuredClone(hardOversizeBlocked);
dishonestSplitSummary.summary = "Completed exhaustive review of the oversized change";
assert.equal(validate(dishonestSplitSummary).status, 1, "must-split summary cannot claim exhaustive coverage");
fs.writeFileSync(diffNumstatPath, "10\t2\tsrc/example.ts\n");

const renameReport = makeReport();
fs.writeFileSync(changedFilesPath, "src/new-name.ts\nsrc/old-name.ts\n");
fs.writeFileSync(diffNumstatPath, "10\t0\tsrc/new-name.ts\n0\t10\tsrc/old-name.ts\n");
renameReport.riskMap = [
  { path: "src/new-name.ts", risk: "low", rationale: "Adds the renamed module at its destination path" },
  { path: "src/old-name.ts", risk: "low", rationale: "Removes the renamed module from its original path" },
];
renameReport.coverage.changedFiles = [
  {
    ...renameReport.coverage.changedFiles[0],
    path: "src/new-name.ts",
    evidence: ["src/new-name.ts:1"],
  },
  {
    ...renameReport.coverage.changedFiles[0],
    path: "src/old-name.ts",
    evidence: ["src/old-name.ts:1"],
  },
];
renameReport.preReview.reviewability.changedFileCount = 2;
renameReport.preReview.reviewability.additions = 10;
renameReport.preReview.reviewability.deletions = 10;
renameReport.preReview.reviewability.independentBehaviorUnits[0].paths = ["src/new-name.ts", "src/old-name.ts"];
assert.equal(validate(renameReport).status, 0, "--no-renames file and numstat evidence should validate consistently");
fs.writeFileSync(changedFilesPath, "src/example.ts\n");
fs.writeFileSync(diffNumstatPath, "10\t2\tsrc/example.ts\n");

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
