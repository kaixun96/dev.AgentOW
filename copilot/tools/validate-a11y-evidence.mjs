#!/usr/bin/env node

import fs from "node:fs";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PHASE_OUTCOMES = {
  reproduce: new Set(["reproduced", "not-reproduced", "blocked", "inconclusive"]),
  verify: new Set(["pass", "fail", "blocked", "inconclusive"]),
};

const EVIDENCE_TYPES = new Set([
  "screenshot",
  "playwright-trace",
  "accessibility-tree",
  "axe",
  "keyboard-focus",
  "ui-automation",
  "nvda-transcript",
  "narrator-etl",
  "voice-access-result",
  "voice-access-audio",
  "contrast-measurement",
  "zoom-reflow",
]);

const REQUIRED_AT_EVIDENCE = new Map([
  ["nvda", ["nvda-transcript"]],
  ["narrator", ["narrator-etl"]],
  ["voice access", ["voice-access-result", "voice-access-audio"]],
  ["keyboard", ["keyboard-focus"]],
  ["windows ui automation", ["ui-automation"]],
]);

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function string(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${label} must be a non-empty string`);
  }
  return value;
}

function array(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function sha(value, label) {
  string(value, label);
  if (!/^[a-f0-9]{64}$/.test(value)) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
  return value;
}

function load(path, label) {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function computeScenarioHash(request) {
  const scenario = {
    scenarioId: request.scenarioId,
    target: {
      url: request.target.url,
      fixture: request.target.fixture,
      route: request.target.route,
      flags: request.target.flags,
      viewport: request.target.viewport,
    },
    assistiveTechnology: request.assistiveTechnology,
    steps: request.steps.map((step) => ({
      id: step.id,
      action: step.action,
      expected: step.expected,
      requiredEvidenceTypes: [...step.requiredEvidenceTypes].sort(),
    })),
    requiredEvidenceTypes: [...request.requiredEvidenceTypes].sort(),
  };
  return digest(JSON.stringify(canonicalize(scenario)));
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      fail("usage: validate-a11y-evidence --phase <phase> --request <path> --result <path>");
    }
    args[key.slice(2)] = value;
  }
  if (!PHASE_OUTCOMES[args.phase]) fail(`unsupported phase: ${args.phase}`);
  string(args.request, "--request");
  string(args.result, "--result");
  if (args.phase === "verify") {
    string(args["baseline-request"], "--baseline-request");
    string(args["baseline-result"], "--baseline-result");
    string(args["repo-root"], "--repo-root");
  }
  return args;
}

export function validateA11yEvidence(
  phase,
  request,
  result,
  baseline = null,
  expectedCommit = null,
) {
  object(request, "request");
  object(result, "result");
  if (request.version !== 1 || result.version !== 1) {
    fail("request and result version must be 1");
  }
  if (request.phase !== phase || result.phase !== phase) {
    fail(`request/result phase must both equal ${phase}`);
  }

  const scenarioId = string(request.scenarioId, "request.scenarioId");
  const scenarioHash = sha(request.scenarioHash, "request.scenarioHash");
  if (result.scenarioId !== scenarioId) fail("result scenarioId does not match request");
  if (result.scenarioHash !== scenarioHash) fail("result scenarioHash does not match request");

  object(request.bug, "request.bug");
  string(request.bug.title, "request.bug.title");
  const target = object(request.target, "request.target");
  string(target.url, "request.target.url");
  string(target.build, "request.target.build");
  string(target.fixture, "request.target.fixture");
  string(target.route, "request.target.route");
  array(target.flags, "request.target.flags");
  const viewport = object(target.viewport, "request.target.viewport");
  if (!Number.isInteger(viewport.width) || viewport.width <= 0) {
    fail("request.target.viewport.width must be a positive integer");
  }
  if (!Number.isInteger(viewport.height) || viewport.height <= 0) {
    fail("request.target.viewport.height must be a positive integer");
  }
  object(request.assistiveTechnology, "request.assistiveTechnology");
  string(request.assistiveTechnology.name, "request.assistiveTechnology.name");
  string(request.assistiveTechnology.mode, "request.assistiveTechnology.mode");
  if (typeof request.assistiveTechnology.required !== "boolean") {
    fail("request.assistiveTechnology.required must be boolean");
  }

  const requiredTypes = array(
    request.requiredEvidenceTypes,
    "request.requiredEvidenceTypes",
  );
  if (requiredTypes.length === 0) fail("request.requiredEvidenceTypes must not be empty");
  const requiredTypeSet = new Set();
  for (const type of requiredTypes) {
    string(type, "required evidence type");
    if (!EVIDENCE_TYPES.has(type)) fail(`unsupported evidence type: ${type}`);
    if (requiredTypeSet.has(type)) fail(`duplicate required evidence type: ${type}`);
    requiredTypeSet.add(type);
  }
  if (!requiredTypeSet.has("screenshot")) {
    fail("request must require screenshot evidence");
  }
  const atName = request.assistiveTechnology.name.trim().toLowerCase();
  const atRequiredTypes = REQUIRED_AT_EVIDENCE.get(atName);
  if (request.assistiveTechnology.required && !atRequiredTypes) {
    fail(`unsupported required assistive technology: ${request.assistiveTechnology.name}`);
  }
  for (const type of atRequiredTypes ?? []) {
    if (!requiredTypeSet.has(type)) {
      fail(`${request.assistiveTechnology.name} requires evidence type: ${type}`);
    }
  }

  const steps = array(request.steps, "request.steps");
  if (steps.length === 0) fail("request.steps must not be empty");
  const stepIds = new Set();
  const requestSteps = new Map();
  const stepEvidenceTypeUnion = new Set();
  for (const [index, step] of steps.entries()) {
    object(step, `request.steps[${index}]`);
    const id = string(step.id, `request.steps[${index}].id`);
    if (stepIds.has(id)) fail(`duplicate request step id: ${id}`);
    stepIds.add(id);
    string(step.action, `request.steps[${index}].action`);
    string(step.expected, `request.steps[${index}].expected`);
    const stepRequiredTypes = array(
      step.requiredEvidenceTypes,
      `request.steps[${index}].requiredEvidenceTypes`,
    );
    if (stepRequiredTypes.length === 0) {
      fail(`request step ${id} must require evidence`);
    }
    for (const type of stepRequiredTypes) {
      if (!requiredTypeSet.has(type)) {
        fail(`request step ${id} requires undeclared evidence type: ${type}`);
      }
      stepEvidenceTypeUnion.add(type);
    }
    for (const type of atRequiredTypes ?? []) {
      if (!stepRequiredTypes.includes(type)) {
        fail(`request step ${id} must require assistive-technology evidence type: ${type}`);
      }
    }
    requestSteps.set(id, step);
  }
  if (
    [...requiredTypeSet].sort().join("\n") !==
    [...stepEvidenceTypeUnion].sort().join("\n")
  ) {
    fail("request.requiredEvidenceTypes must equal the union of per-step requirements");
  }

  if (computeScenarioHash(request) !== scenarioHash) {
    fail("request scenarioHash does not match canonical scenario fields");
  }

  const outcome = string(result.outcome, "result.outcome");
  if (!PHASE_OUTCOMES[phase].has(outcome)) {
    fail(`outcome ${outcome} is invalid for ${phase}`);
  }
  if (string(result.testedBuild, "result.testedBuild") !== target.build) {
    fail("result testedBuild does not match request target.build");
  }

  const stepResults = array(result.stepResults, "result.stepResults");
  if (stepResults.length !== steps.length) {
    fail("result.stepResults must have exactly one entry per request step");
  }
  const resultStepIds = new Set();
  for (const [index, step] of stepResults.entries()) {
    object(step, `result.stepResults[${index}]`);
    const id = string(step.stepId, `result.stepResults[${index}].stepId`);
    if (!stepIds.has(id)) fail(`unknown result step id: ${id}`);
    if (resultStepIds.has(id)) fail(`duplicate result step id: ${id}`);
    resultStepIds.add(id);
    if (!["pass", "fail", "blocked", "inconclusive"].includes(step.status)) {
      fail(`invalid status for result step ${id}`);
    }
    string(step.actual, `result step ${id}.actual`);
    array(step.evidence, `result step ${id}.evidence`);
  }

  const evidence = array(result.evidence, "result.evidence");
  if (evidence.length === 0) fail("result.evidence must not be empty");
  const evidenceIds = new Set();
  const evidenceTypes = new Set();
  for (const [index, item] of evidence.entries()) {
    object(item, `result.evidence[${index}]`);
    const id = string(item.id, `result.evidence[${index}].id`);
    if (evidenceIds.has(id)) fail(`duplicate evidence id: ${id}`);
    evidenceIds.add(id);
    const type = string(item.type, `evidence ${id}.type`);
    if (!EVIDENCE_TYPES.has(type)) fail(`unsupported result evidence type: ${type}`);
    evidenceTypes.add(type);
    string(item.uri, `evidence ${id}.uri`);
    sha(item.sha256, `evidence ${id}.sha256`);
  }
  for (const step of stepResults) {
    for (const id of step.evidence) {
      if (!evidenceIds.has(id)) fail(`step ${step.stepId} references unknown evidence ${id}`);
    }
  }

  for (const type of requiredTypes) {
    if (!evidenceTypes.has(type)) {
      fail(`${phase} ${outcome} is missing required evidence type: ${type}`);
    }
  }
  for (const step of stepResults) {
    if (step.evidence.length === 0) {
      fail(`result step ${step.stepId} has no linked evidence`);
    }
    const linkedTypes = new Set(
      step.evidence.map((id) => evidence.find((item) => item.id === id).type),
    );
    for (const type of requestSteps.get(step.stepId).requiredEvidenceTypes) {
      if (!linkedTypes.has(type)) {
        fail(`result step ${step.stepId} is missing linked evidence type: ${type}`);
      }
    }
  }

  if (phase === "reproduce" && outcome === "reproduced") {
    if (!stepResults.some((step) => step.status === "fail")) {
      fail("reproduced outcome requires at least one failed step");
    }
  }

  if (phase === "verify") {
    object(baseline, "baseline");
    object(baseline.request, "baseline.request");
    object(baseline.result, "baseline.result");
    const baselineSummary = validateA11yEvidence(
      "reproduce",
      baseline.request,
      baseline.result,
    );
    if (baselineSummary.outcome !== "reproduced") {
      fail("baseline result must have reproduced outcome");
    }
    if (baselineSummary.scenarioHash !== scenarioHash) {
      fail("verify scenario does not match reproduced baseline scenario");
    }
    const actualBaselineSha = digest(baseline.resultBytes);
    const baselineDigest = sha(
      request.baselineEvidenceSha256,
      "request.baselineEvidenceSha256",
    );
    if (baselineDigest !== actualBaselineSha) {
      fail("request baselineEvidenceSha256 does not match baseline result bytes");
    }
    if (result.baselineEvidenceSha256 !== actualBaselineSha) {
      fail("result baselineEvidenceSha256 does not match request");
    }
    if (!/^[a-f0-9]{40}$/.test(expectedCommit ?? "")) {
      fail("expected commit must be an independently resolved lowercase Git SHA");
    }
    if (target.commitSha !== expectedCommit) {
      fail("verify request target.commitSha does not match repository HEAD");
    }
    if (target.build !== `commit:${expectedCommit}`) {
      fail("verify request target.build must equal commit:<repository HEAD>");
    }
    if (result.testedCommitSha !== expectedCommit) {
      fail("result testedCommitSha does not match repository HEAD");
    }
    if (outcome === "pass") {
      if (stepResults.some((step) => step.status !== "pass")) {
        fail("verify pass requires every step to pass");
      }
    }
  }

  return {
    valid: true,
    phase,
    scenarioId,
    scenarioHash,
    outcome,
    evidenceTypes: [...evidenceTypes].sort(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const baseline =
      args.phase === "verify"
        ? {
            request: load(args["baseline-request"], "baseline request"),
            result: load(args["baseline-result"], "baseline result"),
            resultBytes: fs.readFileSync(args["baseline-result"]),
          }
        : null;
    const expectedCommit =
      args.phase === "verify"
        ? spawnSync(
            "git",
            ["-C", args["repo-root"], "rev-parse", "HEAD"],
            { encoding: "utf8" },
          )
        : null;
    if (expectedCommit && expectedCommit.status !== 0) {
      fail(`unable to resolve repository HEAD: ${expectedCommit.stderr.trim()}`);
    }
    const summary = validateA11yEvidence(
      args.phase,
      load(args.request, "request"),
      load(args.result, "result"),
      baseline,
      expectedCommit?.stdout.trim() ?? null,
    );
    process.stdout.write(`${JSON.stringify(summary)}\n`);
  } catch (error) {
    process.stderr.write(`A11y evidence invalid: ${error.message}\n`);
    process.exit(1);
  }
}
