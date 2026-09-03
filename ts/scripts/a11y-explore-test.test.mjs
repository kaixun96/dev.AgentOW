import assert from "node:assert/strict";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  aggregateResults,
  CATEGORIES,
  CATEGORY_SC,
  validateCategoryResult,
  validatePlan,
} from "../../tools/a11y-explore-results.mjs";
import { summarizeScResults } from "../../tools/a11y-explore-report.mjs";

const tsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(tsDir, "..");
const reportTool = path.join(repoRoot, "tools", "a11y-explore-report.mjs");
const adoTool = path.join(repoRoot, "tools", "a11y-explore-ado.mjs");
const skillRoot = path.join(repoRoot, "copilot", "skills", "agentow-a11y-explore-test");
const plannerAgent = path.join(repoRoot, "copilot", "agents", "a11y-explore-planner.agent.md");
const testerAgent = path.join(repoRoot, "copilot", "agents", "a11y-explore-category-tester.agent.md");
const PLAN_CONTRACT = {
  "keyboard-focus": ["serial-browser", ["browser", "keyboard"], ["screenshot", "focus-sequence"], "browser-keyboard-tested"],
  "screen-reader": ["serial-real-at", ["nvda", "real-os-input", "uia"], ["nvda-transcript", "screenshot", "uia-state"], "nvda-tested"],
  "structure-semantics": ["serial-browser", ["browser"], ["screenshot", "accessibility-tree", "interaction-log"], "browser-semantics-tested"],
  "orientation-input-purpose": ["serial-browser", ["browser"], ["screenshot", "accessibility-tree", "interaction-log"], "browser-semantics-tested"],
  "visual-color": ["serial-browser", ["browser"], ["screenshot", "measurement", "interaction-log"], "browser-visual-tested"],
  "timing-motion": ["serial-browser", ["browser"], ["screenshot", "interaction-log"], "browser-dynamic-tested"],
  "dynamic-content": ["serial-browser", ["browser"], ["screenshot", "interaction-log"], "browser-dynamic-tested"],
  "touch-pointer": ["serial-browser", ["browser"], ["screenshot", "measurement", "interaction-log"], "browser-touch-pointer-tested"],
  "authentication-forms": ["serial-browser", ["browser"], ["screenshot", "accessibility-tree", "interaction-log"], "browser-forms-tested"],
};
const planCategory = (category) => {
  const [executionClass, requiredCapabilities, requiredEvidenceTypes, maximumClaim] =
    PLAN_CONTRACT[category];
  return {
    category,
    executionClass,
    wcagSc: CATEGORY_SC[category],
    focusAreas: ["sample"],
    requiredCapabilities,
    requiredEvidenceTypes,
    maximumClaim,
  };
};
const plan = () => ({
  schemaVersion: 1,
  standard: "MAS",
  standardProfile: "web",
  standardAttestation: {
    sourceType: "authorized-mas-web",
    checkedAt: "2026-09-02T00:00:00.000Z",
    contentEmbedded: false,
  },
  fullCoverage: true,
  target: "Sample",
  url: "https://example.test",
  executionEnvironment: "windows-host",
  requestedCategories: [...CATEGORIES],
  focusAreas: ["sample"],
  scCoverage: [...new Set(CATEGORIES.flatMap((category) => CATEGORY_SC[category]))],
  categories: CATEGORIES.map((category) => planCategory(category)),
});
const scResults = (category, evidenceUris, overrides = {}) =>
  CATEGORY_SC[category].map((wcagSc) => {
    const status = overrides[wcagSc]?.status ?? "NEEDS_REVIEW";
    return {
      wcagSc,
      standardRule: `MAS ${wcagSc}`,
      standardCheck: "authorized-source-consulted",
      status,
      testMode:
        status === "NOT_TESTED"
          ? "not-tested"
          : category === "screen-reader"
            ? "real-at"
            : status === "NOT_APPLICABLE"
              ? "not-applicable-check"
              : "live-interaction",
      stepsExecuted: ["Load the live surface", "Execute the category procedure"],
      observedAt: "2026-09-02T00:00:02.000Z",
      details: overrides[wcagSc]?.details ?? "Evidence captured; manual review required.",
      evidenceUris,
    };
  });
const writeGenericCategoryResult = (runDir, category) => {
  const directory = path.join(runDir, "categories", category);
  fs.mkdirSync(directory, { recursive: true });
  const [, capabilities, evidenceTypes, claim] = PLAN_CONTRACT[category];
  const producer = category === "screen-reader" ? "external" : "copilot-browser";
  const evidence = evidenceTypes.map((type) => {
    const extension = type === "screenshot" ? "png" : "json";
    const file = path.join(directory, `${type}.${extension}`);
    let content = JSON.stringify({ type });
    if (type === "nvda-transcript") content = "NVDA transcript fixture";
    if (type === "interaction-log") {
      content = JSON.stringify({
        executedSteps: [
          {
            action: "Activate the live control",
            observed: "The rendered state changed.",
            at: "2026-09-02T00:00:02.000Z",
          },
        ],
        ...(category === "timing-motion"
          ? {
              ordinaryMotion: { observationSeconds: 6, samples: 3 },
              reducedMotion: { observationSeconds: 1, samples: 2 },
            }
          : {}),
      });
    }
    if (type === "accessibility-tree" && category === "orientation-input-purpose") {
      content = JSON.stringify({ inputs: [], axTree: { nodes: [] } });
    }
    fs.writeFileSync(file, content);
    return {
      type,
      uri: file,
      sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      producer,
    };
  });
  const evidenceUris = evidence.map((entry) => entry.uri);
  const categoryResult = {
    schemaVersion: 1,
    category,
    status: "completed",
    environment: "windows-host",
    producer,
    profileIsolationId: `fixture-${category}`,
    startedAt: "2026-09-02T00:00:00.000Z",
    endedAt: "2026-09-02T00:00:03.000Z",
    durationSeconds: 3,
    capabilitiesUsed: capabilities,
    claims: [claim],
    scResults: scResults(category, evidenceUris),
    evidence,
    findings: [],
    blockers: [],
  };
  fs.writeFileSync(path.join(directory, "result.json"), JSON.stringify(categoryResult));
};

assert.equal(CATEGORIES.length, 9);
const skillText = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
assert.match(skillText, /```bash[\s\S]*a11y-explore-results\.mjs[\s\S]*\\\r?\n/);
assert.match(skillText, /```powershell[\s\S]*a11y-explore-results\.mjs[\s\S]*`\r?\n/);
assert.match(skillText, /references\/report-rules\.md/);
for (const file of [
  path.join(skillRoot, "SKILL.md"),
  path.join(skillRoot, "references", "category-execution.md"),
  path.join(skillRoot, "references", "severity-guidelines.md"),
  path.join(skillRoot, "references", "mas-standard.md"),
  path.join(skillRoot, "references", "bug-patterns.md"),
  path.join(skillRoot, "references", "wcag-criteria.md"),
  path.join(skillRoot, "references", "report-rules.md"),
  plannerAgent,
  testerAgent,
]) {
  assert.equal(fs.existsSync(file), true, `missing ${file}`);
}
assert.match(skillText, /Static source, DOM, Accessibility Tree,[\s\S]*cannot independently produce/);
for (const category of CATEGORIES) {
  assert.equal(
    fs.existsSync(path.join(skillRoot, "references", "test-procedures", `${category}.md`)),
    true,
    `missing procedure ${category}`,
  );
}

const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentow-a11y-explore-"));
try {
  const categoryDir = path.join(runDir, "categories", "keyboard-focus");
  fs.mkdirSync(categoryDir, { recursive: true });
  const screenshot = path.join(categoryDir, "focus.png");
  const focusSequence = path.join(categoryDir, "focus-sequence.json");
  fs.writeFileSync(screenshot, "image fixture");
  fs.writeFileSync(
    focusSequence,
    JSON.stringify([
      "body",
      {
        tag: "A",
        text: "Save",
        id: "save",
        outlineStyle: "solid",
        outlineWidth: "2px",
        boxShadow: "none",
        obscured: true,
      },
    ]),
  );
  const hash = crypto.createHash("sha256").update(fs.readFileSync(screenshot)).digest("hex");
  const focusHash = crypto.createHash("sha256").update(fs.readFileSync(focusSequence)).digest("hex");
  const result = {
    schemaVersion: 1,
    category: "keyboard-focus",
    status: "completed",
    environment: "windows-host",
    producer: "copilot-browser",
    profileIsolationId: "shared",
    startedAt: "2026-09-02T00:00:00.000Z",
    endedAt: "2026-09-02T00:00:03.000Z",
    durationSeconds: 3,
    capabilitiesUsed: ["browser", "keyboard"],
    claims: ["browser-keyboard-tested"],
    scResults: scResults("keyboard-focus", [screenshot, focusSequence], {
      "2.4.3": { status: "FAIL", details: "Focus order issue observed." },
    }),
    evidence: [
      {
        type: "screenshot",
        uri: screenshot,
        sha256: hash,
        producer: "copilot-browser",
        annotation: {
          kind: "element",
          label: "VIOLATION-1 Focus missing",
        },
      },
      {
        type: "focus-sequence",
        uri: focusSequence,
        sha256: focusHash,
        producer: "copilot-browser",
      },
    ],
    findings: [
      {
        id: "VIOLATION-1",
        classification: "VIOLATION",
        severity: "High",
        wcagSc: "2.4.3",
        title: "<script>alert('x')</script> Focus missing",
        selector: "#save",
        steps: ["Press Tab"],
        expected: "Visible focus",
        actual: "No visible focus",
        userImpact: "Keyboard users cannot reliably identify the active control.",
        reproducibility: "always",
        testedScope: "Forward Tab navigation on the live surface.",
        evidenceLimitations: [],
        evidenceUris: [screenshot, focusSequence],
      },
    ],
    blockers: [],
  };
  fs.writeFileSync(
    path.join(runDir, "plan.json"),
    JSON.stringify(plan()),
  );
  fs.writeFileSync(path.join(categoryDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);

  assert.throws(() => aggregateResults(runDir), /Missing planned category result: screen-reader/);
  assert.throws(
    () =>
      validateCategoryResult(
        { ...result, durationSeconds: 0 },
        runDir,
        "keyboard-focus",
      ),
    /completed result must record positive execution time/,
  );
  assert.throws(
    () =>
      validateCategoryResult(
        {
          ...result,
          scResults: result.scResults.map((entry, index) =>
            index === 0 ? { ...entry, testMode: "static", stepsExecuted: [] } : entry,
          ),
        },
        runDir,
        "keyboard-focus",
      ),
    /scResults\[0\] is invalid/,
  );
  assert.throws(
    () =>
      validateCategoryResult(
        {
          ...result,
          findings: [{ ...result.findings[0], userImpact: "" }],
        },
        runDir,
        "keyboard-focus",
      ),
    /lacks report context/,
  );

  const codespaceAtClaim = {
    ...result,
    environment: "codespace",
    producer: "copilot-browser",
    claims: ["nvda-tested"],
  };
  assert.throws(
    () => validateCategoryResult(codespaceAtClaim, runDir, "keyboard-focus"),
    /invalid for copilot-browser/,
  );

  const screenReaderDir = path.join(runDir, "categories", "screen-reader");
  fs.mkdirSync(screenReaderDir, { recursive: true });
  const realAtEvidence = ["nvda-transcript", "screenshot", "uia-state"].map((type) => {
    const file = path.join(screenReaderDir, `${type}.txt`);
    fs.writeFileSync(file, type);
    return {
      type,
      uri: file,
      sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      producer: "external",
    };
  });
  assert.doesNotThrow(() =>
    validateCategoryResult(
      {
        ...result,
        category: "screen-reader",
        environment: "codespace",
        producer: "external",
        claims: ["nvda-tested"],
        evidence: realAtEvidence,
        scResults: [
          {
            wcagSc: "1.3.1",
            standardRule: "MAS 1.3.1",
            standardCheck: "authorized-source-consulted",
            status: "PASS",
            testMode: "real-at",
            stepsExecuted: ["Open the live page", "Navigate its structure with NVDA"],
            observedAt: "2026-09-02T00:00:02.000Z",
            details: "NVDA structure announcement was captured.",
            evidenceUris: realAtEvidence.map((entry) => entry.uri),
          },
        ],
        findings: [],
      },
      runDir,
      "screen-reader",
    ),
  );
  assert.throws(
    () =>
      validateCategoryResult(
        {
          ...result,
          category: "screen-reader",
          environment: "codespace",
          producer: "external",
          claims: ["nvda-tested"],
          evidence: realAtEvidence,
          scResults: [
            {
              wcagSc: "1.3.1",
              standardRule: "MAS 1.3.1",
              standardCheck: "authorized-source-consulted",
              status: "PASS",
              testMode: "real-at",
              stepsExecuted: ["Open the live page", "Navigate its structure with NVDA"],
              observedAt: "2026-09-02T00:00:02.000Z",
              details: "An incomplete evidence link must not prove NVDA PASS.",
              evidenceUris: [
                realAtEvidence.find((entry) => entry.type === "screenshot").uri,
              ],
            },
          ],
          findings: [],
        },
        runDir,
        "screen-reader",
      ),
    /PASS is missing linked nvda-transcript evidence/,
  );
  const narratorFile = path.join(screenReaderDir, "narrator.etl");
  fs.writeFileSync(narratorFile, "narrator ETL fixture");
  const narratorEvidence = {
    type: "narrator-etl",
    uri: narratorFile,
    sha256: crypto
      .createHash("sha256")
      .update(fs.readFileSync(narratorFile))
      .digest("hex"),
    producer: "external",
  };
  assert.throws(
    () =>
      validateCategoryResult(
        {
          ...result,
          category: "screen-reader",
          environment: "codespace",
          producer: "external",
          claims: ["nvda-tested", "narrator-tested"],
          evidence: [...realAtEvidence, narratorEvidence],
          scResults: [
            {
              wcagSc: "1.3.1",
              standardRule: "MAS 1.3.1",
              standardCheck: "authorized-source-consulted",
              status: "PASS",
              testMode: "real-at",
              stepsExecuted: ["Open the live page", "Navigate with NVDA and Narrator"],
              observedAt: "2026-09-02T00:00:02.000Z",
              details: "Both claimed AT routes require linked evidence.",
              evidenceUris: realAtEvidence.map((entry) => entry.uri),
            },
          ],
          findings: [],
        },
        runDir,
        "screen-reader",
      ),
    /PASS is missing linked narrator-etl evidence/,
  );
  assert.throws(
    () =>
      validatePlan({
        schemaVersion: 1,
        standard: "MAS",
        standardProfile: "web",
        standardAttestation: {
          sourceType: "authorized-mas-web",
          checkedAt: "2026-09-02T00:00:00.000Z",
          contentEmbedded: false,
        },
        fullCoverage: true,
        target: "Screen reader",
        url: "https://example.test",
        executionEnvironment: "codespace",
        requestedCategories: ["screen-reader"],
        focusAreas: [],
        scCoverage: ["1.3.1"],
        categories: [
          {
            category: "screen-reader",
            executionClass: "serial-browser",
            wcagSc: ["1.3.1"],
            focusAreas: [],
            requiredCapabilities: ["browser"],
            requiredEvidenceTypes: ["screenshot", "accessibility-tree"],
            maximumClaim: "browser-semantics-tested",
          },
        ],
      }),
    /category cannot use claim/,
  );
  const voicePlan = plan();
  voicePlan.categories = voicePlan.categories.map((entry) =>
    entry.category === "touch-pointer"
      ? {
          ...entry,
          executionClass: "serial-real-at",
          requiredCapabilities: ["voice-access", "audio"],
          requiredEvidenceTypes: [
            "voice-access-result",
            "voice-access-audio",
            "capture-state",
            "overlay-map",
            "screenshot",
          ],
          maximumClaim: "voice-access-tested",
        }
      : entry,
  );
  assert.doesNotThrow(() => validatePlan(voicePlan));

  const escapedEvidence = {
    ...result,
    evidence: [{ ...result.evidence[0], uri: path.join(runDir, "..", "outside.png") }],
    findings: [],
  };
  assert.throws(
    () => validateCategoryResult(escapedEvidence, runDir, "keyboard-focus"),
    /escapes the category directory/,
  );
  assert.throws(
    () =>
      validateCategoryResult(
        {
          ...result,
          findings: [{ ...result.findings[0], wcagSc: "2.3.3" }],
        },
        runDir,
        "keyboard-focus",
      ),
    /not WCAG 2.2 A\/AA/,
  );
  assert.throws(
    () =>
      validateCategoryResult(
        {
          ...result,
          scResults: result.scResults.map((entry) =>
            entry.wcagSc === "2.4.3" ? { ...entry, status: "PASS" } : entry,
          ),
        },
        runDir,
        "keyboard-focus",
      ),
    /violation VIOLATION-1 lacks a matching FAIL/,
  );
  const notTestedBlocker = "Console desktop is locked";
  const notTestedResult = {
    schemaVersion: 1,
    category: "screen-reader",
    status: "inconclusive",
    environment: "windows-host",
    producer: "windows-host",
    profileIsolationId: "none",
    startedAt: "2026-09-02T00:00:00.000Z",
    endedAt: "2026-09-02T00:00:03.000Z",
    durationSeconds: 3,
    capabilitiesUsed: ["nvda"],
    claims: [],
    scResults: [
      {
        wcagSc: "1.1.1",
        standardRule: "MAS 1.1.1",
        standardCheck: "authorized-source-consulted",
        status: "NOT_TESTED",
        testMode: "not-tested",
        stepsExecuted: ["Attempt NVDA in the Console session"],
        observedAt: "2026-09-02T00:00:02.000Z",
        details: "NVDA could not enter the page while the Console desktop was locked.",
        blocker: notTestedBlocker,
        attemptedRoute: "NVDA 2026 + real OS input in Console",
        evidenceUris: [],
      },
    ],
    evidence: [],
    findings: [],
    blockers: [notTestedBlocker],
  };
  assert.doesNotThrow(() =>
    validateCategoryResult(notTestedResult, runDir, "screen-reader"),
  );
  assert.throws(
    () =>
      validateCategoryResult(
        {
          ...notTestedResult,
          scResults: [{ ...notTestedResult.scResults[0], attemptedRoute: "" }],
        },
        runDir,
        "screen-reader",
      ),
    /NOT_TESTED requires a recorded blocker and attempted route/,
  );
  assert.throws(
    () =>
      validateCategoryResult(
        { ...notTestedResult, status: "blocked" },
        runDir,
        "screen-reader",
      ),
    /with NOT_TESTED success criteria must be inconclusive/,
  );
  for (const prohibitedType of [
    "accessibility-tree",
    "dom-snapshot",
    "aria-snapshot",
    "axe-results",
  ]) {
    const prohibitedFile = path.join(screenReaderDir, `${prohibitedType}.json`);
    fs.writeFileSync(prohibitedFile, "{}");
    assert.throws(
      () =>
        validateCategoryResult(
          {
            ...notTestedResult,
            evidence: [
              {
                type: prohibitedType,
                uri: prohibitedFile,
                sha256: crypto
                  .createHash("sha256")
                  .update(fs.readFileSync(prohibitedFile))
                  .digest("hex"),
                producer: "windows-host",
              },
            ],
          },
          runDir,
          "screen-reader",
        ),
      /screen-reader can use only real NVDA or Narrator evidence/,
    );
  }

  fs.writeFileSync(
    path.join(runDir, "plan.json"),
    JSON.stringify({ schemaVersion: 1, categories: [{ category: "keyboard-focus" }] }),
  );
  assert.throws(() => aggregateResults(runDir), /does not satisfy the MAS Web explore plan schema/);
  fs.writeFileSync(
    path.join(runDir, "plan.json"),
    JSON.stringify({
      ...plan(),
    }),
  );
  assert.throws(() => aggregateResults(runDir), /Missing planned category result: screen-reader/);
  fs.writeFileSync(
    path.join(runDir, "plan.json"),
    JSON.stringify(plan()),
  );

  const dynamicDir = path.join(runDir, "categories", "dynamic-content");
  fs.mkdirSync(dynamicDir, { recursive: true });
  const dynamicEvidence = path.join(dynamicDir, "dialog.png");
  const interactionEvidence = path.join(dynamicDir, "interaction.json");
  fs.writeFileSync(dynamicEvidence, "dynamic fixture");
  fs.writeFileSync(
    interactionEvidence,
    JSON.stringify({
      executedSteps: [
        {
          action: "Open the live dialog",
          observed: "The dialog opened and focus moved.",
          at: "2026-09-02T00:00:02.000Z",
        },
      ],
    }),
  );
  const dynamicHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(dynamicEvidence))
    .digest("hex");
  const interactionHash = crypto
    .createHash("sha256")
    .update(fs.readFileSync(interactionEvidence))
    .digest("hex");
  const dynamicResult = {
    ...result,
    category: "dynamic-content",
    capabilitiesUsed: ["browser"],
    evidence: [
      {
        type: "screenshot",
        uri: dynamicEvidence,
        sha256: dynamicHash,
        producer: "copilot-browser",
        annotation: {
          kind: "element",
          label: "VIOLATION-1 Dynamic issue",
        },
      },
      {
        type: "interaction-log",
        uri: interactionEvidence,
        sha256: interactionHash,
        producer: "copilot-browser",
      },
    ],
    claims: ["browser-dynamic-tested"],
    scResults: scResults("dynamic-content", [dynamicEvidence, interactionEvidence], {
      "2.4.3": { status: "FAIL", details: "Dynamic focus issue observed." },
    }),
    findings: [
      {
        ...result.findings[0],
        id: "VIOLATION-1",
        severity: "Critical",
        evidenceUris: [dynamicEvidence, interactionEvidence],
      },
    ],
  };
  fs.writeFileSync(path.join(dynamicDir, "result.json"), JSON.stringify(dynamicResult));
  const structureDir = path.join(runDir, "categories", "structure-semantics");
  fs.mkdirSync(structureDir, { recursive: true });
  const structureScreenshot = path.join(structureDir, "structure.png");
  const structureTree = path.join(structureDir, "accessibility-tree.json");
  const structureInteraction = path.join(structureDir, "interaction.json");
  fs.writeFileSync(structureScreenshot, "structure screenshot");
  fs.writeFileSync(
    structureInteraction,
    JSON.stringify({
      executedSteps: [
        {
          action: "Activate the representative live control",
          observed: "Its rendered semantic state changed.",
          at: "2026-09-02T00:00:02.000Z",
        },
      ],
    }),
  );
  fs.writeFileSync(
    structureTree,
    JSON.stringify({
      inventory: {
        headings: [
          { level: 1, text: "Page title" },
          { level: 3, text: "Skipped heading" },
        ],
        landmarks: [{ tag: "MAIN", role: "main", name: "Main content" }],
      },
    }),
  );
  const structureResult = {
    ...result,
    category: "structure-semantics",
    capabilitiesUsed: ["browser"],
    claims: ["browser-semantics-tested"],
    scResults: scResults(
      "structure-semantics",
      [structureScreenshot, structureTree, structureInteraction],
      {
      "1.3.1": { status: "PASS", details: "Headings and landmarks were captured." },
      },
    ),
    evidence: [
      {
        type: "screenshot",
        uri: structureScreenshot,
        sha256: crypto.createHash("sha256").update(fs.readFileSync(structureScreenshot)).digest("hex"),
        producer: "copilot-browser",
      },
      {
        type: "accessibility-tree",
        uri: structureTree,
        sha256: crypto.createHash("sha256").update(fs.readFileSync(structureTree)).digest("hex"),
        producer: "copilot-browser",
      },
      {
        type: "interaction-log",
        uri: structureInteraction,
        sha256: crypto
          .createHash("sha256")
          .update(fs.readFileSync(structureInteraction))
          .digest("hex"),
        producer: "copilot-browser",
      },
    ],
    findings: [
      {
        id: "PASS-1",
        classification: "PASS",
        wcagSc: "1.3.1",
        title: "Structure captured",
        selector: "main",
        steps: ["Inspect headings and landmarks"],
        expected: "Structure is exposed.",
        actual: "Headings and main landmark were captured.",
        userImpact: "Users can navigate the page structure predictably.",
        reproducibility: "always",
        testedScope: "Live heading, landmark, and representative control transition.",
        evidenceLimitations: [],
        evidenceUris: [structureScreenshot, structureTree, structureInteraction],
      },
    ],
  };
  fs.writeFileSync(path.join(structureDir, "result.json"), JSON.stringify(structureResult));
  for (const category of CATEGORIES.filter(
    (value) => !["keyboard-focus", "dynamic-content", "structure-semantics"].includes(value),
  )) {
    writeGenericCategoryResult(runDir, category);
  }
  const timingInteractionPath = path.join(
    runDir,
    "categories",
    "timing-motion",
    "interaction-log.json",
  );
  fs.writeFileSync(timingInteractionPath, JSON.stringify({ executedSteps: [] }));
  const timingResultPath = path.join(
    runDir,
    "categories",
    "timing-motion",
    "result.json",
  );
  const timingResult = JSON.parse(fs.readFileSync(timingResultPath, "utf8"));
  timingResult.evidence = timingResult.evidence.map((entry) =>
    entry.uri === timingInteractionPath
      ? {
          ...entry,
          sha256: crypto
            .createHash("sha256")
            .update(fs.readFileSync(timingInteractionPath))
            .digest("hex"),
        }
      : entry,
  );
  fs.writeFileSync(timingResultPath, JSON.stringify(timingResult));
  assert.throws(
    () => aggregateResults(runDir),
    /interaction-log evidence has no executed live steps/,
  );
  writeGenericCategoryResult(runDir, "timing-motion");
  const incompleteTiming = JSON.parse(fs.readFileSync(timingInteractionPath, "utf8"));
  delete incompleteTiming.reducedMotion.samples;
  fs.writeFileSync(timingInteractionPath, JSON.stringify(incompleteTiming));
  const incompleteTimingResult = JSON.parse(fs.readFileSync(timingResultPath, "utf8"));
  incompleteTimingResult.evidence = incompleteTimingResult.evidence.map((entry) =>
    entry.uri === timingInteractionPath
      ? {
          ...entry,
          sha256: crypto
            .createHash("sha256")
            .update(fs.readFileSync(timingInteractionPath))
            .digest("hex"),
        }
      : entry,
  );
  fs.writeFileSync(timingResultPath, JSON.stringify(incompleteTimingResult));
  assert.throws(
    () => aggregateResults(runDir),
    /timing-motion interaction-log lacks ordinary and reduced-motion observation/,
  );
  writeGenericCategoryResult(runDir, "timing-motion");
  const falsePassPath = path.join(
    runDir,
    "categories",
    "screen-reader",
    "result.json",
  );
  const falsePass = JSON.parse(fs.readFileSync(falsePassPath, "utf8"));
  fs.writeFileSync(
    falsePassPath,
    JSON.stringify({ ...falsePass, status: "blocked", claims: [] }),
  );
  assert.throws(
    () => aggregateResults(runDir),
    /tested success criteria require an NVDA or Narrator claim/,
  );
  writeGenericCategoryResult(runDir, "screen-reader");
  const partialPass = JSON.parse(fs.readFileSync(falsePassPath, "utf8"));
  partialPass.status = "inconclusive";
  partialPass.blockers = [notTestedBlocker];
  partialPass.scResults[0] = {
    ...partialPass.scResults[0],
    status: "NOT_TESTED",
    testMode: "not-tested",
    blocker: notTestedBlocker,
    attemptedRoute: "NVDA 2026 + real OS input in Console",
  };
  partialPass.scResults[1] = {
    ...partialPass.scResults[1],
    status: "PASS",
    details: "NVDA evidence confirmed this success criterion.",
  };
  fs.writeFileSync(falsePassPath, JSON.stringify(partialPass));
  assert.doesNotThrow(() => aggregateResults(runDir));
  writeGenericCategoryResult(runDir, "screen-reader");
  const completedUntestedPath = path.join(
    runDir,
    "categories",
    "screen-reader",
    "result.json",
  );
  const completedUntested = JSON.parse(fs.readFileSync(completedUntestedPath, "utf8"));
  completedUntested.blockers = [notTestedBlocker];
  completedUntested.scResults = completedUntested.scResults.map((entry) => ({
    ...entry,
    status: "NOT_TESTED",
    testMode: "not-tested",
    blocker: notTestedBlocker,
    attemptedRoute: "NVDA 2026 + real OS input in Console",
  }));
  fs.writeFileSync(completedUntestedPath, JSON.stringify(completedUntested));
  assert.throws(
    () => aggregateResults(runDir),
    /with NOT_TESTED success criteria must be inconclusive/,
  );
  writeGenericCategoryResult(runDir, "screen-reader");
  const duplicateIsolationPlan = plan();
  duplicateIsolationPlan.categories = duplicateIsolationPlan.categories.map((entry) =>
    ["keyboard-focus", "dynamic-content"].includes(entry.category)
      ? { ...entry, executionClass: "parallel-browser" }
      : entry,
  );
  fs.writeFileSync(path.join(runDir, "plan.json"), JSON.stringify(duplicateIsolationPlan));
  fs.writeFileSync(
    path.join(categoryDir, "result.json"),
    JSON.stringify({ ...result, profileIsolationId: "duplicate-profile" }),
  );
  fs.writeFileSync(
    path.join(dynamicDir, "result.json"),
    JSON.stringify({ ...dynamicResult, profileIsolationId: "DUPLICATE-PROFILE" }),
  );
  assert.throws(() => aggregateResults(runDir), /reuses parallel profile isolation ID/);
  fs.writeFileSync(path.join(categoryDir, "result.json"), JSON.stringify(result));
  fs.writeFileSync(path.join(dynamicDir, "result.json"), JSON.stringify(dynamicResult));
  fs.writeFileSync(
    path.join(runDir, "plan.json"),
    JSON.stringify(plan()),
  );
  const deduplicated = aggregateResults(runDir);
  assert.equal(deduplicated.findings.length, 2);
  assert.equal(deduplicated.findings[0].severity, "Critical");
  assert.equal(deduplicated.findings[0].sourceResults.length, 2);
  assert.equal(
    summarizeScResults([
      { category: "screen-reader", status: "NOT_TESTED", details: "NVDA blocked." },
      { category: "structure-semantics", status: "PASS", details: "Browser passed." },
    ]).status,
    "NEEDS_REVIEW",
  );
  assert.equal(
    summarizeScResults([
      { category: "screen-reader", status: "NOT_TESTED", details: "NVDA blocked." },
      { category: "structure-semantics", status: "FAIL", details: "Violation confirmed." },
    ]).status,
    "FAIL",
  );

  fs.writeFileSync(
    path.join(runDir, "run.json"),
    JSON.stringify({
      target: "Sample",
      url: "https://example.test",
      executionEnvironment: "windows-host",
    }),
  );
  const findingsDir = path.join(runDir, "findings");
  fs.mkdirSync(findingsDir, { recursive: true });
  const findings = path.join(findingsDir, "aggregated.json");
  const outputJson = path.join(runDir, "report.json");
  const outputHtml = path.join(runDir, "report.html");
  fs.writeFileSync(findings, JSON.stringify(deduplicated));
  execFileSync(process.execPath, [
    reportTool,
    "--run-dir",
    runDir,
    "--findings",
    findings,
    "--out-json",
    outputJson,
    "--out-html",
    outputHtml,
  ]);
  const html = fs.readFileSync(outputHtml, "utf8");
  assert.match(html, /&lt;script&gt;alert/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /does not claim full MAS conformance/);
  assert.match(html, /class="summary-grid"/);
  assert.match(html, /<link rel="icon" href="data:image\/svg\+xml,/);
  assert.match(html, /MAS Web Evaluation/);
  assert.match(html, /<strong>Standard:<\/strong> MAS Web/);
  assert.match(html, /User impact/);
  assert.match(html, /Reproducibility/);
  assert.match(html, /Tested scope/);
  assert.match(html, /Evidence limitations/);
  assert.match(html, /2\.4\.3 Focus Order<\/td><td>FAIL<\/td>/);
  assert.match(html, /<img src="categories\//);
  assert.match(html, /Tab Order Map/);
  assert.match(html, /Heading Hierarchy/);
  assert.match(html, /Landmark Regions/);
  assert.match(html, /Task Runtime/);
  assert.match(html, /NVDA Transcript \(excerpts\)/);
  assert.match(html, /Test Coverage Notes/);
  assert.match(html, /Screen reader:<\/strong> NVDA \(completed\)/);
  assert.match(html, />body<\/td>|>#save<\/td>/);
  assert.match(html, /Obscured/);
  assert.match(html, /h1: Page title/);
  assert.match(html, /h3: Skipped heading/);
  assert.match(html, /Main content/);
  assert.doesNotMatch(html, /No screenshot artifact/);
  assert.doesNotMatch(html, /\{Page\/Feature Name\}|\{duration\}|\{status\}/);

  fs.writeFileSync(
    path.join(runDir, "run.json"),
    JSON.stringify({
      target: "Unsafe URL fixture",
      url: "javascript:alert(1)",
      executionEnvironment: "windows-host",
    }),
  );
  execFileSync(process.execPath, [
    reportTool,
    "--run-dir",
    runDir,
    "--findings",
    findings,
    "--out-json",
    outputJson,
    "--out-html",
    outputHtml,
  ]);
  const unsafeUrlHtml = fs.readFileSync(outputHtml, "utf8");
  assert.doesNotMatch(unsafeUrlHtml, /href="javascript:/);
  assert.match(unsafeUrlHtml, /javascript:alert\(1\)/);

  const outsideReportDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentow-report-outside-"));
  const linkedReportDir = path.join(runDir, "linked-report");
  try {
    fs.symlinkSync(outsideReportDir, linkedReportDir, "junction");
    assert.throws(
      () =>
        execFileSync(process.execPath, [
          reportTool,
          "--run-dir",
          runDir,
          "--findings",
          findings,
          "--out-json",
          outputJson,
          "--out-html",
          path.join(linkedReportDir, "report.html"),
        ]),
      /Report output ancestor resolves outside --run-dir/,
    );
  } finally {
    fs.rmSync(linkedReportDir, { force: true });
    fs.rmSync(outsideReportDir, { recursive: true, force: true });
  }

  const adoConfig = path.join(runDir, "ado-config.json");
  fs.writeFileSync(
    adoConfig,
    JSON.stringify({
      organization: "https://dev.azure.com/example",
      project: "Example",
      areaPath: "Example",
      iterationPath: "Example",
      assignedTo: "owner@example.test",
    }),
  );
  execFileSync(process.execPath, [
    adoTool,
    "--run-dir",
    runDir,
    "--config",
    adoConfig,
    "--dry-run",
  ]);
  const adoPlan = JSON.parse(fs.readFileSync(path.join(runDir, "ado-dry-run.json"), "utf8"));
  assert.equal(adoPlan.length, 1);
  assert.equal(adoPlan[0].findingId, "keyboard-focus:VIOLATION-1");
  assert.equal(adoPlan[0].severity, "1 - Critical");
} finally {
  fs.rmSync(runDir, { recursive: true, force: true });
}

console.log("a11y explore test contracts passed");
