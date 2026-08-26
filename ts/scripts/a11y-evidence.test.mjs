import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  computeScenarioHash,
  validateA11yEvidence,
} from "../../tools/validate-a11y-evidence.mjs";

const digest = "a".repeat(64);

const reproduceRequest = {
  version: 1,
  phase: "reproduce",
  scenarioId: "dialog-focus",
  bug: { id: "123", title: "Dialog title is not announced" },
  target: {
    url: "https://example",
    build: "target",
    fixture: "page",
    route: "/dialog",
    flags: ["a11y-test"],
    viewport: { width: 1280, height: 720 },
  },
  assistiveTechnology: { name: "NVDA", mode: "speech-viewer", required: true },
  steps: [
    {
      id: "open",
      action: "Open dialog",
      expected: "Dialog title is announced",
      requiredEvidenceTypes: ["screenshot", "nvda-transcript"],
    },
  ],
  requiredEvidenceTypes: ["screenshot", "nvda-transcript"],
};
reproduceRequest.scenarioHash = computeScenarioHash(reproduceRequest);

const reproduceResult = {
  version: 1,
  phase: "reproduce",
  scenarioId: "dialog-focus",
  scenarioHash: reproduceRequest.scenarioHash,
  outcome: "reproduced",
  testedBuild: "target",
  stepResults: [
    {
      stepId: "open",
      status: "fail",
      actual: "No title was spoken",
      evidence: ["speech", "shot"],
    },
  ],
  evidence: [
    {
      id: "speech",
      type: "nvda-transcript",
      uri: "twin-evidence://run/before.log",
      sha256: digest,
    },
    {
      id: "shot",
      type: "screenshot",
      uri: "twin-evidence://run/before.png",
      sha256: "d".repeat(64),
    },
  ],
};

assert.equal(
  validateA11yEvidence("reproduce", reproduceRequest, reproduceResult).outcome,
  "reproduced",
);

assert.throws(
  () =>
    validateA11yEvidence("reproduce", reproduceRequest, {
      ...reproduceResult,
      scenarioHash: "c".repeat(64),
    }),
  /scenarioHash does not match/,
);

assert.throws(
  () =>
    validateA11yEvidence("reproduce", reproduceRequest, {
      ...reproduceResult,
      testedBuild: "changed",
    }),
  /testedBuild does not match/,
);

assert.throws(
  () =>
    validateA11yEvidence("reproduce", reproduceRequest, {
      ...reproduceResult,
      stepResults: [{ ...reproduceResult.stepResults[0], status: "pass" }],
    }),
  /requires at least one failed step/,
);

const screenshotOnlyRequest = {
  ...reproduceRequest,
  requiredEvidenceTypes: ["screenshot"],
  steps: reproduceRequest.steps.map((step) => ({
    ...step,
    requiredEvidenceTypes: ["screenshot"],
  })),
};
screenshotOnlyRequest.scenarioHash = computeScenarioHash(screenshotOnlyRequest);
assert.throws(
  () =>
    validateA11yEvidence("reproduce", screenshotOnlyRequest, {
      ...reproduceResult,
      scenarioHash: screenshotOnlyRequest.scenarioHash,
      stepResults: [
        {
          ...reproduceResult.stepResults[0],
          evidence: ["shot"],
        },
      ],
      evidence: reproduceResult.evidence.filter((item) => item.type === "screenshot"),
    }),
  /NVDA requires evidence type: nvda-transcript/,
);

assert.throws(
  () =>
    validateA11yEvidence("reproduce", reproduceRequest, {
      ...reproduceResult,
      outcome: "blocked",
      stepResults: [
        {
          ...reproduceResult.stepResults[0],
          status: "blocked",
          evidence: ["unknown"],
        },
      ],
      evidence: [
        {
          id: "unknown",
          type: "totally-unknown",
          uri: "twin-evidence://run/blocker.txt",
          sha256: digest,
        },
      ],
    }),
  /unsupported result evidence type/,
);

const verifyRequest = {
  ...reproduceRequest,
  phase: "verify",
  target: {
    ...reproduceRequest.target,
    build: `commit:${"e".repeat(40)}`,
    commitSha: "e".repeat(40),
  },
};
const baselineBytes = Buffer.from(JSON.stringify(reproduceResult));
const baselineDigest = crypto.createHash("sha256").update(baselineBytes).digest("hex");
verifyRequest.baselineEvidenceSha256 = baselineDigest;
const verifyResult = {
  ...reproduceResult,
  phase: "verify",
  outcome: "pass",
  testedBuild: verifyRequest.target.build,
  testedCommitSha: verifyRequest.target.commitSha,
  baselineEvidenceSha256: baselineDigest,
  stepResults: [
    {
      stepId: "open",
      status: "pass",
      actual: "Dialog title was spoken",
      evidence: ["speech", "shot"],
    },
  ],
  evidence: [
    {
      id: "speech",
      type: "nvda-transcript",
      uri: "twin-evidence://run/after.log",
      sha256: digest,
    },
    {
      id: "shot",
      type: "screenshot",
      uri: "twin-evidence://run/after.png",
      sha256: "c".repeat(64),
    },
  ],
};
const baseline = {
  request: reproduceRequest,
  result: reproduceResult,
  resultBytes: baselineBytes,
};

assert.equal(
  validateA11yEvidence(
    "verify",
    verifyRequest,
    verifyResult,
    baseline,
    verifyRequest.target.commitSha,
  ).outcome,
  "pass",
);

assert.throws(
  () =>
    validateA11yEvidence(
      "verify",
      { ...verifyRequest, requiredEvidenceTypes: ["nvda-transcript"] },
      verifyResult,
      baseline,
      verifyRequest.target.commitSha,
    ),
  /must require screenshot evidence|requires undeclared evidence type|union of per-step requirements|canonical scenario fields/,
);

assert.throws(
  () =>
    validateA11yEvidence(
      "verify",
      verifyRequest,
      verifyResult,
      { ...baseline, resultBytes: Buffer.from("{}") },
      verifyRequest.target.commitSha,
    ),
  /does not match baseline result bytes/,
);

assert.throws(
  () =>
    validateA11yEvidence(
      "verify",
      {
        ...verifyRequest,
        target: { ...verifyRequest.target, build: "changed" },
      },
      { ...verifyResult, testedBuild: "changed" },
      baseline,
      verifyRequest.target.commitSha,
    ),
  /target.build must equal/,
);

assert.throws(
  () =>
    validateA11yEvidence(
      "verify",
      {
        ...verifyRequest,
        target: { ...verifyRequest.target, fixture: "different-page" },
        scenarioHash: computeScenarioHash({
          ...verifyRequest,
          target: { ...verifyRequest.target, fixture: "different-page" },
        }),
      },
      verifyResult,
      baseline,
      verifyRequest.target.commitSha,
    ),
  /baseline scenario|scenarioHash does not match/,
);

assert.throws(
  () =>
    validateA11yEvidence(
      "verify",
      verifyRequest,
      { ...verifyResult, testedCommitSha: "f".repeat(40) },
      baseline,
      verifyRequest.target.commitSha,
    ),
  /testedCommitSha does not match/,
);

assert.throws(
  () =>
    validateA11yEvidence(
      "verify",
      verifyRequest,
      {
        ...verifyResult,
        stepResults: [{ ...verifyResult.stepResults[0], evidence: [] }],
      },
      baseline,
      verifyRequest.target.commitSha,
    ),
  /has no linked evidence/,
);

assert.throws(
  () =>
    validateA11yEvidence(
      "verify",
      verifyRequest,
      {
        ...verifyResult,
        evidence: verifyResult.evidence.filter((item) => item.type !== "screenshot"),
      },
      baseline,
      verifyRequest.target.commitSha,
    ),
  /unknown evidence shot|missing required evidence type: screenshot/,
);

console.log("A11y evidence contract fixtures passed");

const voiceTypes = [
  "screenshot",
  "voice-access-result",
  "voice-access-audio",
  "capture-state",
  "overlay-map",
];
const voiceRequest = {
  version: 1,
  phase: "reproduce",
  scenarioId: "voice-overlay",
  bug: { title: "Static text is numbered" },
  target: {
    url: "https://example.test/page",
    build: "target",
    fixture: "page",
    route: "/page",
    flags: [],
    viewport: { width: 1024, height: 768 },
  },
  assistiveTechnology: {
    name: "Voice Access",
    mode: "audio-loop",
    required: true,
  },
  steps: [
    {
      id: "numbers",
      action: "Say Show numbers",
      expected: "Only actionable page elements are numbered",
      requiredEvidenceTypes: voiceTypes,
    },
  ],
  requiredEvidenceTypes: voiceTypes,
};
voiceRequest.scenarioHash = computeScenarioHash(voiceRequest);
const voiceEvidence = voiceTypes.map((type, index) => ({
  id: type,
  type,
  uri: `evidence://${type}`,
  sha256: String(index + 1).repeat(64),
}));
const captureState = {
  canonicalUrl: voiceRequest.target.url,
  viewport: voiceRequest.target.viewport,
  deviceScaleFactor: 1,
  scrollX: 0,
  scrollY: 100,
  targetSelector: "#target",
  targetRect: { x: 10, y: 20, width: 300, height: 200 },
  debugBar: "hidden",
  dialogs: [],
  browserChromeIncluded: true,
  taskbarIncluded: true,
};
const voiceResult = {
  version: 1,
  phase: "reproduce",
  scenarioId: voiceRequest.scenarioId,
  scenarioHash: voiceRequest.scenarioHash,
  outcome: "reproduced",
  testedBuild: "target",
  captureState,
  reportedOverlayLabels: [1],
  overlayMap: [
    {
      label: 1,
      screenPoint: { x: 40, y: 80 },
      surface: "page",
      selector: "#target p",
      role: "text",
      name: "Static explanation",
      actionable: false,
      domRect: { x: 30, y: 70, width: 100, height: 20 },
    },
  ],
  stepResults: [
    {
      stepId: "numbers",
      status: "fail",
      actual: "Static text was numbered",
      evidence: voiceTypes,
    },
  ],
  evidence: voiceEvidence,
};
assert.equal(
  validateA11yEvidence("reproduce", voiceRequest, voiceResult).outcome,
  "reproduced",
);
for (const overlay of [
  { ...voiceResult.overlayMap[0], surface: "os-taskbar", actionable: true },
  {
    ...voiceResult.overlayMap[0],
    role: "link",
    name: "Learn more",
    actionable: true,
  },
]) {
  assert.throws(
    () =>
      validateA11yEvidence("reproduce", voiceRequest, {
        ...voiceResult,
        overlayMap: [overlay],
      }),
    /requires a mapped non-actionable page overlay/,
  );
}

assert.throws(
  () =>
    validateA11yEvidence("reproduce", voiceRequest, {
      ...voiceResult,
      reportedOverlayLabels: [1, 2],
    }),
  /complete reported overlay labels/,
);
assert.throws(
  () =>
    validateA11yEvidence("reproduce", voiceRequest, {
      ...voiceResult,
      overlayMap: [
        {
          ...voiceResult.overlayMap[0],
          role: "link",
          name: "Learn more",
          actionable: false,
        },
      ],
    }),
  /actionable role contradicts/,
);

const voiceBaselineBytes = Buffer.from(JSON.stringify(voiceResult));
const voiceBaselineDigest = crypto
  .createHash("sha256")
  .update(voiceBaselineBytes)
  .digest("hex");
const voiceCommit = "f".repeat(40);
const voiceVerifyRequest = {
  ...voiceRequest,
  phase: "verify",
  target: {
    ...voiceRequest.target,
    build: `commit:${voiceCommit}`,
    commitSha: voiceCommit,
  },
  baselineEvidenceSha256: voiceBaselineDigest,
};
const voiceVerifyResult = {
  ...voiceResult,
  phase: "verify",
  outcome: "pass",
  testedBuild: `commit:${voiceCommit}`,
  testedCommitSha: voiceCommit,
  baselineEvidenceSha256: voiceBaselineDigest,
  overlayMap: [
    {
      ...voiceResult.overlayMap[0],
      role: "link",
      name: "Learn more",
      actionable: true,
    },
  ],
  stepResults: [
    {
      ...voiceResult.stepResults[0],
      status: "pass",
      actual: "Only an actionable link was numbered",
    },
  ],
};
const voiceBaseline = {
  request: voiceRequest,
  result: voiceResult,
  resultBytes: voiceBaselineBytes,
};
assert.equal(
  validateA11yEvidence(
    "verify",
    voiceVerifyRequest,
    voiceVerifyResult,
    voiceBaseline,
    voiceCommit,
  ).outcome,
  "pass",
);
assert.throws(
  () =>
    validateA11yEvidence(
      "verify",
      voiceVerifyRequest,
      {
        ...voiceVerifyResult,
        captureState: { ...captureState, scrollY: captureState.scrollY + 10 },
      },
      voiceBaseline,
      voiceCommit,
    ),
  /capture-state mismatch: scrollY/,
);
