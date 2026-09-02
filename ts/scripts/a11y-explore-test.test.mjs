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
  validateCategoryResult,
  validatePlan,
} from "../../tools/a11y-explore-results.mjs";

const tsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(tsDir, "..");
const reportTool = path.join(repoRoot, "tools", "a11y-explore-report.mjs");
const adoTool = path.join(repoRoot, "tools", "a11y-explore-ado.mjs");
const skillRoot = path.join(repoRoot, "copilot", "skills", "agentow-a11y-explore-test");
const plannerAgent = path.join(repoRoot, "copilot", "agents", "a11y-explore-planner.agent.md");
const testerAgent = path.join(repoRoot, "copilot", "agents", "a11y-explore-category-tester.agent.md");
const planCategory = (category) =>
  category === "dynamic-content"
    ? {
        category,
        executionClass: "serial-browser",
        wcagSc: ["2.4.3"],
        focusAreas: ["sample"],
        requiredCapabilities: ["browser"],
        requiredEvidenceTypes: ["screenshot", "interaction-log"],
        maximumClaim: "browser-dynamic-tested",
      }
    : {
        category,
        executionClass: "serial-browser",
        wcagSc: ["2.4.3"],
        focusAreas: ["sample"],
        requiredCapabilities: ["browser", "keyboard"],
        requiredEvidenceTypes: ["screenshot", "focus-sequence"],
        maximumClaim: "browser-keyboard-tested",
      };
const plan = (categories) => ({
  schemaVersion: 1,
  target: "Sample",
  url: "https://example.test",
  executionEnvironment: "windows-host",
  requestedCategories: [],
  focusAreas: ["sample"],
  scCoverage: categories.map(() => "2.4.3"),
  categories: categories.map((category) => planCategory(category)),
});

assert.equal(CATEGORIES.length, 9);
const skillText = fs.readFileSync(path.join(skillRoot, "SKILL.md"), "utf8");
assert.match(skillText, /```bash[\s\S]*a11y-explore-results\.mjs[\s\S]*\\\r?\n/);
assert.match(skillText, /```powershell[\s\S]*a11y-explore-results\.mjs[\s\S]*`\r?\n/);
for (const file of [
  path.join(skillRoot, "SKILL.md"),
  path.join(skillRoot, "references", "category-execution.md"),
  path.join(skillRoot, "references", "severity-guidelines.md"),
  path.join(skillRoot, "references", "wcag-criteria.md"),
  plannerAgent,
  testerAgent,
]) {
  assert.equal(fs.existsSync(file), true, `missing ${file}`);
}
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
  fs.writeFileSync(focusSequence, JSON.stringify(["body", "#save"]));
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
    evidence: [
      {
        type: "screenshot",
        uri: screenshot,
        sha256: hash,
        producer: "copilot-browser",
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
        evidenceUris: [screenshot, focusSequence],
      },
    ],
    blockers: [],
  };
  fs.writeFileSync(
    path.join(runDir, "plan.json"),
    JSON.stringify(plan(["keyboard-focus"])),
  );
  fs.writeFileSync(path.join(categoryDir, "result.json"), `${JSON.stringify(result, null, 2)}\n`);

  const aggregate = aggregateResults(runDir);
  assert.equal(aggregate.findings[0].id, "keyboard-focus:VIOLATION-1");
  assert.equal(aggregate.counts.byClassification.VIOLATION, 1);

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
        findings: [],
      },
      runDir,
      "screen-reader",
    ),
  );
  assert.throws(
    () =>
      validatePlan({
        schemaVersion: 1,
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
  assert.doesNotThrow(() =>
    validatePlan({
      schemaVersion: 1,
      target: "Voice Access",
      url: "https://example.test",
      executionEnvironment: "windows-host",
      requestedCategories: ["touch-pointer"],
      focusAreas: ["voice command"],
      scCoverage: ["2.5.3"],
      categories: [
        {
          category: "touch-pointer",
          executionClass: "serial-real-at",
          wcagSc: ["2.5.3"],
          focusAreas: ["voice command"],
          requiredCapabilities: ["voice-access", "audio"],
          requiredEvidenceTypes: [
            "voice-access-result",
            "voice-access-audio",
            "capture-state",
            "overlay-map",
            "screenshot",
          ],
          maximumClaim: "voice-access-tested",
        },
      ],
    }),
  );

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

  fs.writeFileSync(
    path.join(runDir, "plan.json"),
    JSON.stringify({ schemaVersion: 1, categories: [{ category: "keyboard-focus" }] }),
  );
  assert.throws(() => aggregateResults(runDir), /does not satisfy the A\/AA explore plan schema/);
  fs.writeFileSync(
    path.join(runDir, "plan.json"),
    JSON.stringify({
      ...plan(["keyboard-focus", "dynamic-content"]),
    }),
  );
  assert.throws(() => aggregateResults(runDir), /Missing planned category result: dynamic-content/);
  fs.writeFileSync(
    path.join(runDir, "plan.json"),
    JSON.stringify(plan(["keyboard-focus"])),
  );

  const dynamicDir = path.join(runDir, "categories", "dynamic-content");
  fs.mkdirSync(dynamicDir, { recursive: true });
  const dynamicEvidence = path.join(dynamicDir, "dialog.png");
  const interactionEvidence = path.join(dynamicDir, "interaction.json");
  fs.writeFileSync(dynamicEvidence, "dynamic fixture");
  fs.writeFileSync(interactionEvidence, JSON.stringify({ action: "open dialog" }));
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
      },
      {
        type: "interaction-log",
        uri: interactionEvidence,
        sha256: interactionHash,
        producer: "copilot-browser",
      },
    ],
    claims: ["browser-dynamic-tested"],
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
  const duplicateIsolationPlan = plan(["keyboard-focus", "dynamic-content"]);
  duplicateIsolationPlan.categories = duplicateIsolationPlan.categories.map((entry) => ({
    ...entry,
    executionClass: "parallel-browser",
  }));
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
    JSON.stringify(plan(["keyboard-focus", "dynamic-content"])),
  );
  const deduplicated = aggregateResults(runDir);
  assert.equal(deduplicated.findings.length, 1);
  assert.equal(deduplicated.findings[0].severity, "Critical");
  assert.equal(deduplicated.findings[0].sourceResults.length, 2);

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
  assert.match(html, /does not claim full WCAG conformance/);

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
