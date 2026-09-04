#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CATEGORIES = [
  "keyboard-focus",
  "screen-reader",
  "structure-semantics",
  "orientation-input-purpose",
  "visual-color",
  "timing-motion",
  "dynamic-content",
  "touch-pointer",
  "authentication-forms",
];

const STATUSES = new Set(["completed", "blocked", "inconclusive", "skipped-environment", "failed"]);
const SC_STATUSES = new Set(["PASS", "FAIL", "NEEDS_REVIEW", "NOT_APPLICABLE", "NOT_TESTED"]);
const PRODUCERS = new Set(["copilot-browser", "windows-host", "twin", "external"]);
const CLASSIFICATIONS = new Set(["VIOLATION", "BEST-PRACTICE", "PASS", "NEEDS-REVIEW"]);
const SEVERITIES = new Set(["Critical", "High", "Medium", "Low"]);
const SHA256 = /^[a-f0-9]{64}$/;
export const CATEGORY_SC = {
  "keyboard-focus": ["2.1.1", "2.1.2", "2.1.4", "2.4.3", "2.4.7", "2.4.11"],
  "screen-reader": [
    "1.1.1",
    "1.2.1",
    "1.2.2",
    "1.2.3",
    "1.2.4",
    "1.2.5",
    "1.3.1",
    "1.3.2",
    "2.4.2",
    "2.4.4",
    "3.3.2",
    "4.1.2",
    "4.1.3",
  ],
  "structure-semantics": [
    "1.3.1",
    "1.3.2",
    "1.3.3",
    "1.3.5",
    "2.4.1",
    "2.4.5",
    "2.4.6",
    "3.1.1",
    "3.1.2",
  ],
  "orientation-input-purpose": ["1.3.4", "1.3.5"],
  "visual-color": [
    "1.4.1",
    "1.4.2",
    "1.4.3",
    "1.4.4",
    "1.4.5",
    "1.4.10",
    "1.4.11",
    "1.4.12",
    "1.4.13",
  ],
  "timing-motion": ["2.2.1", "2.2.2", "2.3.1"],
  "dynamic-content": ["1.3.2", "2.4.3", "3.2.1", "3.2.2", "3.2.3", "3.2.4", "3.2.6", "4.1.3"],
  "touch-pointer": ["2.5.1", "2.5.2", "2.5.3", "2.5.4", "2.5.7", "2.5.8"],
  "authentication-forms": ["3.3.1", "3.3.2", "3.3.3", "3.3.4", "3.3.7", "3.3.8"],
};
const A_AA_SC = new Set([
  "1.1.1",
  "1.2.1",
  "1.2.2",
  "1.2.3",
  "1.2.4",
  "1.2.5",
  "1.3.1",
  "1.3.2",
  "1.3.3",
  "1.3.4",
  "1.3.5",
  "1.4.1",
  "1.4.2",
  "1.4.3",
  "1.4.4",
  "1.4.5",
  "1.4.10",
  "1.4.11",
  "1.4.12",
  "1.4.13",
  "2.1.1",
  "2.1.2",
  "2.1.4",
  "2.2.1",
  "2.2.2",
  "2.3.1",
  "2.4.1",
  "2.4.2",
  "2.4.3",
  "2.4.4",
  "2.4.5",
  "2.4.6",
  "2.4.7",
  "2.4.11",
  "2.5.1",
  "2.5.2",
  "2.5.3",
  "2.5.4",
  "2.5.7",
  "2.5.8",
  "3.1.1",
  "3.1.2",
  "3.2.1",
  "3.2.2",
  "3.2.3",
  "3.2.4",
  "3.2.6",
  "3.3.1",
  "3.3.2",
  "3.3.3",
  "3.3.4",
  "3.3.7",
  "3.3.8",
  "4.1.2",
  "4.1.3",
]);
const CLAIM_RULES = {
  "browser-keyboard-tested": {
    producers: ["copilot-browser"],
    evidence: [
      "screenshot",
      "focus-sequence",
      "focus-visual-comparison",
      "keyboard-navigation",
      "interaction-coverage",
    ],
  },
  "browser-semantics-tested": {
    producers: ["copilot-browser"],
    evidence: ["screenshot", "accessibility-tree", "interaction-log", "interaction-coverage"],
  },
  "browser-visual-tested": {
    producers: ["copilot-browser"],
    evidence: ["screenshot", "measurement", "interaction-log", "interaction-coverage"],
  },
  "browser-dynamic-tested": {
    producers: ["copilot-browser"],
    evidence: ["screenshot", "interaction-log", "interaction-coverage"],
  },
  "browser-touch-pointer-tested": {
    producers: ["copilot-browser"],
    evidence: ["screenshot", "measurement", "interaction-log", "interaction-coverage"],
  },
  "browser-forms-tested": {
    producers: ["copilot-browser"],
    evidence: ["screenshot", "accessibility-tree", "interaction-log", "interaction-coverage"],
  },
  "nvda-tested": {
    producers: ["windows-host", "twin", "external"],
    evidence: ["nvda-transcript", "screenshot", "uia-state"],
  },
  "narrator-tested": {
    producers: ["windows-host", "twin", "external"],
    evidence: ["narrator-etl", "screenshot", "uia-state"],
  },
  "voice-access-tested": {
    producers: ["windows-host", "twin", "external"],
    evidence: [
      "voice-access-result",
      "voice-access-audio",
      "capture-state",
      "overlay-map",
      "screenshot",
    ],
  },
  "real-os-input-tested": {
    producers: ["windows-host", "twin", "external"],
    evidence: ["os-input-log", "screenshot"],
  },
  "uia-focus-tested": {
    producers: ["windows-host", "twin", "external"],
    evidence: ["uia-state", "screenshot"],
  },
};
const CATEGORY_CLAIMS = {
  "keyboard-focus": ["browser-keyboard-tested", "real-os-input-tested", "uia-focus-tested"],
  "screen-reader": ["nvda-tested", "narrator-tested"],
  "structure-semantics": ["browser-semantics-tested"],
  "orientation-input-purpose": ["browser-semantics-tested"],
  "visual-color": ["browser-visual-tested"],
  "timing-motion": ["browser-dynamic-tested"],
  "dynamic-content": ["browser-dynamic-tested"],
  "touch-pointer": ["browser-touch-pointer-tested", "voice-access-tested"],
  "authentication-forms": ["browser-forms-tested"],
};
const SCREEN_READER_EVIDENCE_TYPES = new Set([
  "nvda-transcript",
  "narrator-etl",
  "screenshot",
  "uia-state",
  "video",
  "recording-metrics",
]);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--") || !argv[index + 1]) {
      throw new Error(`Invalid argument: ${key}`);
    }
    args[key.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeWriteFile(runDir, output, content) {
  const resolvedRun = fs.realpathSync(runDir);
  const resolvedOutput = path.resolve(output);
  if (!isPathInside(path.resolve(runDir), resolvedOutput)) {
    throw new Error("Output path must remain inside the run directory");
  }
  const parent = path.dirname(resolvedOutput);
  fs.mkdirSync(parent, { recursive: true });
  const realParent = fs.realpathSync(parent);
  if (!isPathInside(resolvedRun, realParent)) {
    throw new Error("Output parent resolves outside the run directory");
  }
  if (fs.existsSync(resolvedOutput) && fs.lstatSync(resolvedOutput).isSymbolicLink()) {
    throw new Error("Output path must not be a symbolic link");
  }
  const temporary = path.join(realParent, `.${path.basename(resolvedOutput)}.${process.pid}.tmp`);
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, resolvedOutput);
}

function validateEvidence(evidence, categoryDir, category, resultProducer, index) {
  assertObject(evidence, `${category}.evidence[${index}]`);
  for (const field of ["type", "uri", "sha256", "producer"]) {
    if (typeof evidence[field] !== "string" || !evidence[field]) {
      throw new Error(`${category}.evidence[${index}].${field} is required`);
    }
  }
  if (!SHA256.test(evidence.sha256)) {
    throw new Error(`${category}.evidence[${index}].sha256 must be lowercase SHA-256`);
  }
  if (!PRODUCERS.has(evidence.producer)) {
    throw new Error(`${category}.evidence[${index}].producer is invalid`);
  }
  if (evidence.producer !== resultProducer) {
    throw new Error(`${category}.evidence[${index}].producer does not match result producer`);
  }
  if (evidence.annotation !== undefined) {
    if (
      !evidence.annotation ||
      !["element", "page", "infrastructure"].includes(evidence.annotation.kind) ||
      typeof evidence.annotation.label !== "string" ||
      !evidence.annotation.label.trim()
    ) {
      throw new Error(`${category}.evidence[${index}].annotation is invalid`);
    }
  }
  if (/^https?:\/\//i.test(evidence.uri) || !path.isAbsolute(evidence.uri)) {
    throw new Error(`${category}.evidence[${index}].uri must be a materialized absolute local path`);
  }
  const resolvedCategoryDir = path.resolve(categoryDir);
  const resolvedEvidence = path.resolve(evidence.uri);
  if (!isPathInside(resolvedCategoryDir, resolvedEvidence)) {
    throw new Error(`${category}.evidence[${index}].uri escapes the category directory`);
  }
  if (!fs.existsSync(evidence.uri)) {
    throw new Error(`${category}.evidence[${index}].uri does not exist: ${evidence.uri}`);
  }
  const realCategoryDir = fs.realpathSync(categoryDir);
  const realEvidence = fs.realpathSync(evidence.uri);
  if (!isPathInside(realCategoryDir, realEvidence)) {
    throw new Error(`${category}.evidence[${index}].uri escapes the category directory`);
  }
  const actualHash = crypto.createHash("sha256").update(fs.readFileSync(realEvidence)).digest("hex");
  if (actualHash !== evidence.sha256) {
    throw new Error(`${category}.evidence[${index}] hash mismatch`);
  }
  validateEvidenceShape(realEvidence, evidence.type, category);
}

function validateEvidenceShape(filePath, type, category) {
  if (type === "focus-sequence") {
    const sequence = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (
      !Array.isArray(sequence) ||
      !sequence.every(
        (entry) =>
          typeof entry === "string" ||
          (entry &&
            typeof entry === "object" &&
            typeof entry.tag === "string" &&
            typeof entry.text === "string"),
      )
    ) {
      throw new Error(`${category} focus-sequence evidence has an invalid schema`);
    }
  }
  if (type === "focus-visual-comparison") {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (
      !Array.isArray(value?.executedSteps) ||
      value.executedSteps.length === 0 ||
      !Array.isArray(value?.items) ||
      value.items.length === 0 ||
      !value.items.every(
        (entry) =>
          Number.isInteger(entry.index) &&
          typeof entry.beforeSha256 === "string" &&
          SHA256.test(entry.beforeSha256) &&
          typeof entry.afterSha256 === "string" &&
          SHA256.test(entry.afterSha256) &&
          typeof entry.pixelChanged === "boolean" &&
          typeof entry.styleChanged === "boolean" &&
          typeof entry.indicatorObserved === "boolean" &&
          typeof entry.geometryStable === "boolean" &&
          typeof entry.caretBearing === "boolean" &&
          typeof entry.targetPath === "string" &&
          entry.targetPath.trim() &&
          typeof entry.beforeUri === "string" &&
          typeof entry.afterUri === "string" &&
          entry.indicatorObserved ===
            (entry.styleChanged ||
              (entry.pixelChanged && (!entry.caretBearing || !entry.geometryStable))),
      )
    ) {
      throw new Error(`${category} focus-visual-comparison evidence has an invalid schema`);
    }
    const comparisonRoot = fs.realpathSync(path.dirname(filePath));
    for (const entry of value.items) {
      if (
        entry.pixelChanged !==
        (entry.beforeSha256 !== entry.afterSha256)
      ) {
        throw new Error(
          `${category} focus-visual-comparison pixelChanged contradicts capture hashes`,
        );
      }
      for (const [uriField, hashField] of [
        ["beforeUri", "beforeSha256"],
        ["afterUri", "afterSha256"],
      ]) {
        const resolved = path.resolve(entry[uriField]);
        const realCapture = fs.existsSync(resolved) ? fs.realpathSync(resolved) : resolved;
        if (
          !isPathInside(comparisonRoot, realCapture) ||
          !fs.existsSync(resolved) ||
          crypto.createHash("sha256").update(fs.readFileSync(realCapture)).digest("hex") !==
            entry[hashField]
        ) {
          throw new Error(
            `${category} focus-visual-comparison ${uriField} is missing, escaped, or hash-mismatched`,
          );
        }
      }
    }
  }
  if (type === "keyboard-navigation") {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const inventoryPaths = Array.isArray(value?.inventory)
      ? value.inventory.map((entry) => entry?.path)
      : [];
    const forwardPaths = Array.isArray(value?.forward)
      ? value.forward.map((entry) => entry?.path)
      : [];
    const reversePaths = Array.isArray(value?.reverse)
      ? value.reverse.map((entry) => entry?.path)
      : [];
    const computedReverseMatches =
      JSON.stringify(reversePaths) === JSON.stringify([...forwardPaths].reverse());
    const inventoryIndex = new Map(inventoryPaths.map((entry, index) => [entry, index]));
    const compositeResolvedPaths = Array.isArray(value?.compositeResolvedPaths)
      ? value.compositeResolvedPaths
      : [];
    const compositeInventoryPaths = Array.isArray(value?.compositeInventoryPaths)
      ? value.compositeInventoryPaths
      : [];
    const tabSkippedPaths = Array.isArray(value?.tabSkippedPaths)
      ? value.tabSkippedPaths
      : [];
    const coveredPaths = new Set([...forwardPaths, ...compositeResolvedPaths]);
    const forwardSet = new Set(forwardPaths);
    const inventoryPathsSkippedByTab = inventoryPaths.filter(
      (entry) => !forwardSet.has(entry),
    );
    const allInventory = new Set([...inventoryPaths, ...compositeInventoryPaths]);
    const computedMissingPaths = [...allInventory]
      .filter((entry) => !coveredPaths.has(entry))
      .sort();
    const computedExtraPaths = [...coveredPaths]
      .filter((entry) => !allInventory.has(entry))
      .sort();
    const reachedPositions = forwardPaths
      .filter((entry) => inventoryIndex.has(entry))
      .map((entry) => inventoryIndex.get(entry));
    const computedDomOrder =
      JSON.stringify(reachedPositions) === JSON.stringify([...reachedPositions].sort((a, b) => a - b));
    const interactionHasFailure = Array.isArray(value?.interactions) &&
      value.interactions.some(
        (entry) =>
          entry?.failures?.length > 0 ||
          entry?.focusRestored === false ||
          entry?.urlStable === false,
      );
    const searchHasFailure =
      value?.search?.applicable === true &&
      (value.search.focusRetained === false || value.search.urlStable === false);
    if (
      !Array.isArray(value?.executedSteps) ||
      value.executedSteps.length === 0 ||
      inventoryPaths.length === 0 ||
      inventoryPaths.some((entry) => typeof entry !== "string" || !entry.trim()) ||
      new Set(inventoryPaths).size !== inventoryPaths.length ||
      forwardPaths.length === 0 ||
      forwardPaths.some((entry) => typeof entry !== "string" || !entry.trim()) ||
      new Set(forwardPaths).size !== forwardPaths.length ||
      reversePaths.length !== forwardPaths.length ||
      reversePaths.some((entry) => typeof entry !== "string" || !entry.trim()) ||
      value.reverseMatches !== computedReverseMatches ||
      value.domOrderMonotonic !== computedDomOrder ||
      !Array.isArray(value?.missingPaths) ||
      !value.missingPaths.every((entry) => typeof entry === "string" && entry.trim()) ||
      JSON.stringify([...value.missingPaths].sort()) !== JSON.stringify(computedMissingPaths) ||
      !Array.isArray(value?.extraPaths) ||
      !value.extraPaths.every((entry) => typeof entry === "string" && entry.trim()) ||
      JSON.stringify([...value.extraPaths].sort()) !== JSON.stringify(computedExtraPaths) ||
      compositeResolvedPaths.some((entry) => typeof entry !== "string" || !entry.trim()) ||
      new Set(compositeResolvedPaths).size !== compositeResolvedPaths.length ||
      compositeInventoryPaths.some((entry) => typeof entry !== "string" || !entry.trim()) ||
      new Set(compositeInventoryPaths).size !== compositeInventoryPaths.length ||
      compositeResolvedPaths.some((entry) => !compositeInventoryPaths.includes(entry)) ||
      tabSkippedPaths.some((entry) => typeof entry !== "string" || !entry.trim()) ||
      new Set(tabSkippedPaths).size !== tabSkippedPaths.length ||
      tabSkippedPaths.some(
        (entry) =>
          !compositeInventoryPaths.includes(entry) ||
          !compositeResolvedPaths.includes(entry),
      ) ||
      inventoryPathsSkippedByTab.some((entry) => !tabSkippedPaths.includes(entry)) ||
      !Array.isArray(value?.interactions) ||
      !value.interactions.every(
        (entry) =>
          entry &&
          typeof entry.name === "string" &&
          typeof entry.applicable === "boolean" &&
          (entry.failures === undefined || Array.isArray(entry.failures)) &&
          (entry.focusRestored === undefined || typeof entry.focusRestored === "boolean") &&
          (entry.urlStable === undefined || typeof entry.urlStable === "boolean") &&
          (entry.enteredExpandedRegion === undefined ||
            typeof entry.enteredExpandedRegion === "boolean"),
      ) ||
      !Array.isArray(value?.failures) ||
      !value.failures.every((entry) => typeof entry === "string" && entry.trim()) ||
      !value?.search ||
      typeof value.search.applicable !== "boolean" ||
      (value.search.applicable &&
        (typeof value.search.focusRetained !== "boolean" ||
          typeof value.search.urlStable !== "boolean")) ||
      (value.failures.length === 0 &&
        (value.missingPaths.length > 0 ||
          value.extraPaths.length > 0 ||
          !computedReverseMatches ||
          !computedDomOrder ||
          interactionHasFailure ||
          searchHasFailure))
    ) {
      throw new Error(`${category} keyboard-navigation evidence has an invalid schema`);
    }
  }
  if (type === "interaction-coverage") {
      const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const allowedRisk = new Set(["safe", "confirmation-required"]);
      const allowedStatus = new Set([
        "executed",
        "stopped-before-confirmation",
      ]);
      const allowedOutcome = new Set([
        "no-change",
        "ui-change",
        "navigation",
        "stopped-before-confirmation",
      ]);
      const allowedScope = new Set([
        "not-navigation",
        "in-scope",
        "out-of-scope-user-confirmed",
      ]);
      const controls = Array.isArray(value?.controls) ? value.controls : [];
      const surfaces = Array.isArray(value?.surfaces) ? value.surfaces : [];
      const surfaceIds = surfaces.map((entry) => entry?.id);
      const surfaceById = new Map(surfaces.map((entry) => [entry?.id, entry]));
      const referencedSurfaceIds = new Set(
        controls.flatMap((entry) =>
          Array.isArray(entry?.newSurfaceIds) ? entry.newSurfaceIds : [],
        ),
      );
      const controlKeys = controls.map(
        (entry) => `${entry?.surfaceId ?? ""}\u0000${entry?.path ?? ""}`,
      );
      const inventoryKeys = surfaces.flatMap((entry) =>
        Array.isArray(entry?.actionablePaths)
          ? entry.actionablePaths.map((pathValue) => `${entry.id}\u0000${pathValue}`)
          : [],
      );
      const normalizePaths = (entries) => [...new Set(entries)].sort();
      const normalizeUrl = (value) => {
        try {
          return new URL(value).href;
        } catch {
          return null;
        }
      };
      if (
        !Array.isArray(value?.executedSteps) ||
        value.executedSteps.length === 0 ||
        typeof value?.route !== "string" ||
        !value.route.trim() ||
        controls.length === 0 ||
        new Set(controlKeys).size !== controlKeys.length ||
        controls.some(
          (entry) =>
            typeof entry.role !== "string" ||
            typeof entry.name !== "string" ||
            typeof entry.surfaceId !== "string" ||
            !surfaceById.has(entry.surfaceId) ||
            !allowedRisk.has(entry.risk) ||
            !allowedStatus.has(entry.status) ||
            typeof entry.action !== "string" ||
            !entry.action.trim() ||
            !allowedOutcome.has(entry.outcome) ||
            !entry.before ||
            typeof entry.before.url !== "string" ||
            typeof entry.before.focusPath !== "string" ||
            !entry.before.state ||
            typeof entry.before.state !== "object" ||
            Array.isArray(entry.before.state) ||
            Object.keys(entry.before.state).length === 0 ||
            !entry.after ||
            typeof entry.after.url !== "string" ||
            typeof entry.after.focusPath !== "string" ||
            !entry.after.state ||
            typeof entry.after.state !== "object" ||
            Array.isArray(entry.after.state) ||
            Object.keys(entry.after.state).length === 0 ||
            typeof entry.before.focusPath !== "string" ||
            !entry.before.focusPath.trim() ||
            typeof entry.after.focusPath !== "string" ||
            !entry.after.focusPath.trim() ||
            !Array.isArray(entry.newSurfaceIds) ||
            entry.newSurfaceIds.some((id) => !surfaceById.has(id)) ||
            !allowedScope.has(entry.scopeDecision) ||
            (entry.risk === "safe" && entry.status !== "executed") ||
            (entry.risk === "confirmation-required" &&
              entry.status !== "stopped-before-confirmation") ||
            (entry.risk === "safe" && entry.outcome === "stopped-before-confirmation") ||
            (entry.risk === "confirmation-required" &&
              (entry.outcome !== "stopped-before-confirmation" ||
                normalizeUrl(entry.before.url) !== normalizeUrl(entry.after.url))) ||
            (entry.outcome === "no-change" &&
              (entry.newSurfaceIds.length > 0 ||
                normalizeUrl(entry.before.url) !== normalizeUrl(entry.after.url))) ||
            (entry.outcome === "ui-change" && entry.newSurfaceIds.length === 0) ||
            (entry.outcome === "navigation" &&
              (!["in-scope", "out-of-scope-user-confirmed"].includes(entry.scopeDecision) ||
                !normalizeUrl(entry.before.url) ||
                normalizeUrl(entry.before.url) === normalizeUrl(entry.after.url) ||
                (entry.scopeDecision === "in-scope" && entry.newSurfaceIds.length === 0) ||
                (entry.scopeDecision === "out-of-scope-user-confirmed" &&
                  entry.newSurfaceIds.length !== 0))) ||
            (entry.scopeDecision === "out-of-scope-user-confirmed" &&
              entry.outcome !== "navigation"),
        ) ||
        surfaces.length === 0 ||
        new Set(surfaceIds).size !== surfaceIds.length ||
        surfaces.filter((entry) => entry.triggerPath === null).length !== 1 ||
        surfaces.some(
          (entry) =>
            entry.triggerPath !== null && !referencedSurfaceIds.has(entry.id),
        ) ||
        surfaces.some(
          (entry) =>
            typeof entry.id !== "string" ||
            !entry.id.trim() ||
            typeof entry.route !== "string" ||
            !entry.route.trim() ||
            (entry.triggerPath !== null &&
              (typeof entry.triggerPath !== "string" || !entry.triggerPath.trim())) ||
            typeof entry.type !== "string" ||
            !entry.type.trim() ||
            !Array.isArray(entry.actionablePaths) ||
            entry.actionablePaths.some(
              (pathValue) => typeof pathValue !== "string" || !pathValue.trim(),
            ) ||
            controls.some(
              (control) =>
                !surfaceById.get(control.surfaceId)?.actionablePaths.includes(control.path) ||
                control.before.url !== surfaceById.get(control.surfaceId)?.route ||
                control.newSurfaceIds.some((surfaceId) => {
                  const surface = surfaceById.get(surfaceId);
                  return (
                    surface.triggerPath !== control.path ||
                    surface.route !== control.after.url
                  );
                }),
            ) ||
            entry.inventoryComplete !== true ||
            entry.tested !== true,
        ) ||
        JSON.stringify(normalizePaths(controlKeys)) !==
          JSON.stringify(normalizePaths(inventoryKeys)) ||
        !value?.summary ||
        value.summary.discovered !== controls.length ||
        value.summary.executed !== controls.filter((entry) => entry.status === "executed").length ||
        value.summary.stoppedBeforeConfirmation !==
          controls.filter((entry) => entry.status === "stopped-before-confirmation").length ||
        value.summary.untestedSafe !== 0
      ) {
        throw new Error(`${category} interaction-coverage evidence has an invalid schema`);
    }
  }
  if (type === "interaction-log") {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (
      !Array.isArray(value?.executedSteps) ||
      value.executedSteps.length === 0 ||
      !value.executedSteps.every(
        (entry) =>
          entry &&
          typeof entry === "object" &&
          typeof entry.action === "string" &&
          entry.action.trim() &&
          typeof entry.observed === "string" &&
          entry.observed.trim() &&
          typeof entry.at === "string" &&
          !Number.isNaN(Date.parse(entry.at)),
      )
    ) {
      throw new Error(`${category} interaction-log evidence has no executed live steps`);
    }
    if (
      category === "timing-motion" &&
      (!Number.isFinite(value?.ordinaryMotion?.observationSeconds) ||
        value.ordinaryMotion.observationSeconds < 5 ||
        !Number.isInteger(value.ordinaryMotion.samples) ||
        value.ordinaryMotion.samples < 2 ||
        !Number.isFinite(value?.reducedMotion?.observationSeconds) ||
        value.reducedMotion.observationSeconds <= 0 ||
        !Number.isInteger(value.reducedMotion.samples) ||
        value.reducedMotion.samples < 1)
    ) {
      throw new Error("timing-motion interaction-log lacks ordinary and reduced-motion observation");
    }
  }
  if (type !== "accessibility-tree") return;
  const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (category === "structure-semantics") {
    if (
      !Array.isArray(value?.inventory?.headings) ||
      !value.inventory.headings.every(
        (entry) =>
          Number.isInteger(entry.level) &&
          entry.level >= 1 &&
          entry.level <= 6 &&
          typeof entry.text === "string",
      ) ||
      !Array.isArray(value?.inventory?.landmarks) ||
      !value.inventory.landmarks.every(
        (entry) =>
          typeof entry.tag === "string" &&
          typeof entry.role === "string" &&
          typeof entry.name === "string",
      )
    ) {
      throw new Error("structure-semantics accessibility-tree evidence has an invalid schema");
    }
  }
  if (category === "orientation-input-purpose") {
    if (
      !Array.isArray(value?.inputs) ||
      !value.inputs.every(
        (entry) =>
          typeof entry.tag === "string" &&
          typeof entry.type === "string" &&
          typeof entry.name === "string" &&
          typeof entry.autocomplete === "string",
      ) ||
      !value.axTree ||
      typeof value.axTree !== "object"
    ) {
      throw new Error("orientation-input-purpose accessibility-tree evidence has an invalid schema");
    }
  }
}
function validateFinding(finding, category, evidenceByUri, status, index) {
  assertObject(finding, `${category}.findings[${index}]`);
  if (typeof finding.id !== "string" || !/^[A-Z-]+-\d+$/.test(finding.id)) {
    throw new Error(`${category}.findings[${index}].id is invalid`);
  }
  if (!CLASSIFICATIONS.has(finding.classification)) {
    throw new Error(`${category}.findings[${index}].classification is invalid`);
  }
  if (status !== "completed" && finding.classification !== "NEEDS-REVIEW") {
    throw new Error(`${category}.findings[${index}] cannot report ${finding.classification} from ${status}`);
  }
  if (finding.classification === "VIOLATION") {
    if (!SEVERITIES.has(finding.severity)) {
      throw new Error(`${category}.findings[${index}].severity is required for a violation`);
    }
  } else if (finding.severity !== undefined) {
    throw new Error(`${category}.findings[${index}] must not assign severity to ${finding.classification}`);
  }
  for (const field of [
    "wcagSc",
    "title",
    "selector",
    "expected",
    "actual",
    "userImpact",
    "reproducibility",
    "testedScope",
  ]) {
    if (typeof finding[field] !== "string") {
      throw new Error(`${category}.findings[${index}].${field} must be a string`);
    }
    if (finding.wcagSc && !A_AA_SC.has(finding.wcagSc)) {
      throw new Error(`${category}.findings[${index}].wcagSc is not WCAG 2.2 A/AA`);
    }
    if (
      !finding.userImpact.trim() ||
      !["always", "intermittent", "once", "not-reproduced"].includes(finding.reproducibility) ||
      !finding.testedScope.trim() ||
      !Array.isArray(finding.evidenceLimitations) ||
      !finding.evidenceLimitations.every((value) => typeof value === "string")
    ) {
      throw new Error(`${category}.findings[${index}] lacks report context`);
    }
    if (["VIOLATION", "PASS"].includes(finding.classification)) {
      if (
        !finding.wcagSc ||
        !finding.title.trim() ||
        finding.steps.length === 0 ||
        !finding.expected.trim() ||
        !finding.actual.trim()
      ) {
        throw new Error(`${category}.findings[${index}] lacks reproducible observed behavior`);
      }
    }
  }
  if (!Array.isArray(finding.steps) || !finding.steps.every((step) => typeof step === "string")) {
    throw new Error(`${category}.findings[${index}].steps must be strings`);
  }
  if (!Array.isArray(finding.evidenceUris)) {
    throw new Error(`${category}.findings[${index}].evidenceUris must be an array`);
  }
  const infrastructureException =
    status !== "completed" &&
    finding.classification === "NEEDS-REVIEW" &&
    finding.evidenceUris.length === 0;
  if (!infrastructureException && finding.evidenceUris.length === 0) {
    throw new Error(`${category}.findings[${index}] has no evidence`);
  }
  for (const uri of finding.evidenceUris) {
    if (!evidenceByUri.has(uri)) {
      throw new Error(`${category}.findings[${index}] references unknown evidence: ${uri}`);
    }
  }
  const linkedScreenshots = finding.evidenceUris
    .map((uri) => evidenceByUri.get(uri))
    .filter((entry) => entry.type === "screenshot");
  if (!infrastructureException && linkedScreenshots.length === 0) {
    throw new Error(`${category}.findings[${index}] has no screenshot evidence`);
  }
  if (
    finding.classification !== "PASS" &&
    linkedScreenshots.length > 0 &&
    !linkedScreenshots.some((entry) => entry.annotation)
  ) {
    throw new Error(`${category}.findings[${index}] has no annotated screenshot`);
  }
}

function validateScResult(scResult, category, evidenceByUri, blockers, index) {
  assertObject(scResult, `${category}.scResults[${index}]`);
  if (
    typeof scResult.wcagSc !== "string" ||
    !A_AA_SC.has(scResult.wcagSc) ||
    scResult.standardRule !== `WCAG 2.2 SC ${scResult.wcagSc}` ||
    scResult.standardCheck !== "w3c-recommendation-consulted" ||
    !SC_STATUSES.has(scResult.status) ||
    typeof scResult.details !== "string" ||
    !scResult.details.trim() ||
    !["live-interaction", "live-observation", "real-at", "not-applicable-check", "not-tested"].includes(
      scResult.testMode,
    ) ||
    !Array.isArray(scResult.stepsExecuted) ||
    scResult.stepsExecuted.length === 0 ||
    !scResult.stepsExecuted.every((step) => typeof step === "string" && step.trim()) ||
    typeof scResult.observedAt !== "string" ||
    Number.isNaN(Date.parse(scResult.observedAt)) ||
    !Array.isArray(scResult.evidenceUris)
  ) {
    throw new Error(`${category}.scResults[${index}] is invalid`);
  }
  if (scResult.status !== "NOT_TESTED" && scResult.evidenceUris.length === 0) {
    throw new Error(`${category}.scResults[${index}] requires evidence`);
  }
  if (
    (scResult.status === "NOT_TESTED" && scResult.testMode !== "not-tested") ||
    (scResult.status !== "NOT_TESTED" && scResult.testMode === "not-tested")
  ) {
    throw new Error(`${category}.scResults[${index}] testMode conflicts with status`);
  }
  if (
    scResult.status !== "NOT_TESTED" &&
    category === "screen-reader" &&
    scResult.testMode !== "real-at"
  ) {
    throw new Error(`${category}.scResults[${index}] requires real-at testMode`);
  }
  if (
    scResult.status !== "NOT_TESTED" &&
    category !== "screen-reader" &&
    !["live-interaction", "live-observation", "not-applicable-check", "real-at"].includes(
      scResult.testMode,
    )
  ) {
    throw new Error(`${category}.scResults[${index}] requires a live testMode`);
  }
  if (
    ["PASS", "FAIL", "NEEDS_REVIEW"].includes(scResult.status) &&
    scResult.testMode === "not-applicable-check"
  ) {
    throw new Error(`${category}.scResults[${index}] testMode conflicts with tested status`);
  }
  if (
    scResult.status === "NOT_TESTED" &&
    (typeof scResult.blocker !== "string" ||
      !scResult.blocker.trim() ||
      !blockers.includes(scResult.blocker) ||
      typeof scResult.attemptedRoute !== "string" ||
      !scResult.attemptedRoute.trim())
  ) {
    throw new Error(`${category}.scResults[${index}] NOT_TESTED requires a recorded blocker and attempted route`);
  }
  for (const uri of scResult.evidenceUris) {
    if (!evidenceByUri.has(uri)) {
      throw new Error(`${category}.scResults[${index}] references unknown evidence: ${uri}`);
    }
  }
}

export function validateCategoryResult(result, runDir, expectedCategory) {
  assertObject(result, expectedCategory);
  if (result.schemaVersion !== 1) throw new Error(`${expectedCategory}.schemaVersion must be 1`);
  if (result.category !== expectedCategory || !CATEGORIES.includes(result.category)) {
    throw new Error(`${expectedCategory}.category is invalid`);
  }
  if (!STATUSES.has(result.status)) throw new Error(`${expectedCategory}.status is invalid`);
  if (!PRODUCERS.has(result.producer)) throw new Error(`${expectedCategory}.producer is invalid`);
  if (!["codespace", "windows-host", "unsupported-host"].includes(result.environment)) {
    throw new Error(`${expectedCategory}.environment is invalid`);
  }
  if (
    typeof result.profileIsolationId !== "string" ||
    !result.profileIsolationId.trim() ||
    !Number.isFinite(result.durationSeconds) ||
    result.durationSeconds < 0 ||
    !Array.isArray(result.capabilitiesUsed) ||
    !Array.isArray(result.blockers)
  ) {
    throw new Error(`${expectedCategory} execution metadata is invalid`);
  }
  if (result.status === "completed" && result.durationSeconds <= 0) {
    throw new Error(`${expectedCategory} completed result must record positive execution time`);
  }
  for (const field of ["startedAt", "endedAt"]) {
    if (typeof result[field] !== "string" || Number.isNaN(Date.parse(result[field]))) {
      throw new Error(`${expectedCategory}.${field} must be ISO-8601`);
    }
  }
  if (!Array.isArray(result.claims) || !result.claims.every((claim) => typeof claim === "string")) {
    throw new Error(`${expectedCategory}.claims must be strings`);
  }
  if (
    !Array.isArray(result.evidence) ||
    !Array.isArray(result.findings) ||
    !Array.isArray(result.scResults)
  ) {
    throw new Error(`${expectedCategory}.evidence, findings, and scResults must be arrays`);
  }
  const categoryDir = path.join(runDir, "categories", expectedCategory);
  result.evidence.forEach((entry, index) =>
    validateEvidence(entry, categoryDir, expectedCategory, result.producer, index),
  );
  const evidenceTypes = new Set(result.evidence.map((entry) => entry.type));
  if (
    expectedCategory === "screen-reader" &&
    [...evidenceTypes].some((type) => !SCREEN_READER_EVIDENCE_TYPES.has(type))
  ) {
    throw new Error("screen-reader can use only real NVDA or Narrator evidence");
  }
  for (const claim of result.claims) {
    const rule = CLAIM_RULES[claim];
    if (!rule) {
      throw new Error(`${expectedCategory} uses unknown claim: ${claim}`);
    }
    if (!rule.producers.includes(result.producer)) {
      throw new Error(`${expectedCategory} claim ${claim} is invalid for ${result.producer}`);
    }
    if (!CATEGORY_CLAIMS[expectedCategory].includes(claim)) {
      throw new Error(`${expectedCategory} cannot use claim ${claim}`);
    }
    for (const required of rule.evidence) {
      if (!evidenceTypes.has(required)) {
        throw new Error(`${expectedCategory} claim ${claim} is missing ${required} evidence`);
      }
    }
  }
  const evidenceByUri = new Map(result.evidence.map((entry) => [entry.uri, entry]));
  if (expectedCategory === "keyboard-focus" && result.claims.includes("browser-keyboard-tested")) {
    const sequenceEvidence = result.evidence.find((entry) => entry.type === "focus-sequence");
    const comparisonEvidence = result.evidence.find(
      (entry) => entry.type === "focus-visual-comparison",
    );
    if (sequenceEvidence && comparisonEvidence) {
      const sequence = JSON.parse(fs.readFileSync(sequenceEvidence.uri, "utf8"));
      const comparison = JSON.parse(fs.readFileSync(comparisonEvidence.uri, "utf8"));
      const indices = new Set(comparison.items.map((entry) => entry.index));
      if (
        !sequence.every(
          (entry, index) =>
            entry &&
            typeof entry === "object" &&
            entry.index === index + 1 &&
            typeof entry.path === "string" &&
            entry.path.trim(),
        ) ||
        comparison.items.length !== sequence.length ||
        indices.size !== sequence.length ||
        comparison.items.some(
          (entry) =>
            entry.index < 1 ||
            entry.index > sequence.length ||
            entry.targetPath !== sequence[entry.index - 1].path,
        )
      ) {
        throw new Error(
          "keyboard-focus visual comparisons do not exactly match the focus sequence",
        );
      }
    }
  }
  const findingIds = new Set();
  for (const finding of result.findings) {
    if (findingIds.has(finding.id)) {
      throw new Error(`${expectedCategory} contains duplicate finding ID: ${finding.id}`);
    }
    findingIds.add(finding.id);
  }
  result.findings.forEach((finding, index) =>
    validateFinding(finding, expectedCategory, evidenceByUri, result.status, index),
  );
  const scIds = new Set();
  result.scResults.forEach((scResult, index) => {
    validateScResult(scResult, expectedCategory, evidenceByUri, result.blockers, index);
    if (scResult.status !== "NOT_TESTED" && result.claims.length > 0) {
      const linkedTypes = new Set(
        scResult.evidenceUris.map((uri) => evidenceByUri.get(uri)?.type),
      );
      const requiredTypes = new Set(
        result.claims.flatMap((claim) => CLAIM_RULES[claim]?.evidence ?? []),
      );
      for (const requiredType of requiredTypes) {
        if (!linkedTypes.has(requiredType)) {
          throw new Error(
            `${expectedCategory}.scResults[${index}] ${scResult.status} is missing linked ${requiredType} evidence`,
          );
        }
      }
    }
    if (scIds.has(scResult.wcagSc)) {
      throw new Error(`${expectedCategory} contains duplicate SC result: ${scResult.wcagSc}`);
    }
    scIds.add(scResult.wcagSc);
  });
  if (
    expectedCategory === "screen-reader" &&
    result.scResults.some((scResult) => ["PASS", "FAIL", "NEEDS_REVIEW"].includes(scResult.status)) &&
    !result.claims.some((claim) => ["nvda-tested", "narrator-tested"].includes(claim))
  ) {
    throw new Error("screen-reader tested success criteria require an NVDA or Narrator claim");
  }
  if (
    result.scResults.some((scResult) => scResult.status === "NOT_TESTED") &&
    result.status !== "inconclusive"
  ) {
    throw new Error(`${expectedCategory} with NOT_TESTED success criteria must be inconclusive`);
  }
  for (const scResult of result.scResults) {
    if (
      scResult.status === "FAIL" &&
      !result.findings.some(
        (finding) =>
          finding.classification === "VIOLATION" && finding.wcagSc === scResult.wcagSc,
      )
    ) {
      throw new Error(`${expectedCategory} FAIL ${scResult.wcagSc} lacks a violation finding`);
    }
    for (const finding of result.findings) {
      if (
        finding.classification === "VIOLATION" &&
        !result.scResults.some(
          (scResult) => scResult.status === "FAIL" && scResult.wcagSc === finding.wcagSc,
        )
      ) {
        throw new Error(`${expectedCategory} violation ${finding.id} lacks a matching FAIL SC result`);
      }
    }
  }
  return result;
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findingKey(finding) {
  return [
    finding.classification,
    finding.wcagSc,
    normalize(finding.title),
    normalize(finding.selector),
    normalize(finding.actual),
  ].join("|");
}

const severityOrder = new Map([
  ["Critical", 0],
  ["High", 1],
  ["Medium", 2],
  ["Low", 3],
]);

function compareFindings(left, right) {
  const classificationOrder = { VIOLATION: 0, "BEST-PRACTICE": 1, "NEEDS-REVIEW": 2, PASS: 3 };
  return (
    classificationOrder[left.classification] - classificationOrder[right.classification] ||
    (severityOrder.get(left.severity) ?? 99) - (severityOrder.get(right.severity) ?? 99) ||
    CATEGORIES.indexOf(left.category) - CATEGORIES.indexOf(right.category) ||
    left.id.localeCompare(right.id)
  );
}

export function validatePlan(plan) {
  assertObject(plan, "plan.json");
  if (
    plan.schemaVersion !== 1 ||
    plan.standard !== "WCAG" ||
    plan.standardVersion !== "2.2" ||
    plan.standardLevel !== "AA" ||
    !plan.standardAttestation ||
    plan.standardAttestation.sourceType !== "w3c-recommendation" ||
    plan.standardAttestation.sourceUrl !== "https://www.w3.org/TR/WCAG22/" ||
    plan.standardAttestation.contentEmbedded !== false ||
    typeof plan.standardAttestation.checkedAt !== "string" ||
    Number.isNaN(Date.parse(plan.standardAttestation.checkedAt)) ||
    plan.fullCoverage !== true ||
    typeof plan.target !== "string" ||
    !plan.target.trim() ||
    typeof plan.url !== "string" ||
    !plan.url.trim() ||
    !["codespace", "windows-host", "unsupported-host"].includes(plan.executionEnvironment) ||
    !Array.isArray(plan.focusAreas) ||
    !plan.focusAreas.every((entry) => typeof entry === "string") ||
    !Array.isArray(plan.scCoverage) ||
    plan.scCoverage.length === 0 ||
    !plan.scCoverage.every((entry) => A_AA_SC.has(entry)) ||
    !Array.isArray(plan.requestedCategories) ||
    !plan.requestedCategories.every((entry) => CATEGORIES.includes(entry)) ||
    !Array.isArray(plan.categories) ||
    plan.categories.length === 0
  ) {
    throw new Error("plan.json does not satisfy the WCAG 2.2 A/AA explore plan schema");
  }
  const seen = new Set();
  const categoryCoverage = new Set();
  for (const [index, entry] of plan.categories.entries()) {
    assertObject(entry, `plan.json.categories[${index}]`);
    if (!CATEGORIES.includes(entry.category) || seen.has(entry.category)) {
      throw new Error("plan.json contains invalid or duplicate categories");
    }
    seen.add(entry.category);
    if (
      !["parallel-browser", "serial-browser", "serial-real-at"].includes(entry.executionClass) ||
      !Array.isArray(entry.wcagSc) ||
      entry.wcagSc.length === 0 ||
      !entry.wcagSc.every(
        (criterion) => A_AA_SC.has(criterion) && CATEGORY_SC[entry.category]?.includes(criterion),
      ) ||
      !Array.isArray(entry.focusAreas) ||
      !entry.focusAreas.every((value) => typeof value === "string") ||
      !Array.isArray(entry.requiredCapabilities) ||
      !entry.requiredCapabilities.every((value) => typeof value === "string") ||
      !Array.isArray(entry.requiredEvidenceTypes) ||
      entry.requiredEvidenceTypes.length === 0 ||
      !entry.requiredEvidenceTypes.every((value) => typeof value === "string") ||
      !CLAIM_RULES[entry.maximumClaim]
    ) {
      throw new Error(`plan.json category contract is invalid: ${entry.category ?? index}`);
    }
    const claimRule = CLAIM_RULES[entry.maximumClaim];
    if (!CATEGORY_CLAIMS[entry.category].includes(entry.maximumClaim)) {
      throw new Error(`plan.json category cannot use claim: ${entry.category}/${entry.maximumClaim}`);
    }
    if (claimRule.evidence.some((type) => !entry.requiredEvidenceTypes.includes(type))) {
      throw new Error(`plan.json category omits evidence required by ${entry.maximumClaim}`);
    }
    if (
      entry.executionClass === "serial-real-at"
        ? claimRule.producers.includes("copilot-browser")
        : !claimRule.producers.includes("copilot-browser")
    ) {
      throw new Error(`plan.json execution class conflicts with ${entry.maximumClaim}`);
    }
    entry.wcagSc.forEach((criterion) => categoryCoverage.add(criterion));
  }
  if (plan.requestedCategories.some((category) => !seen.has(category))) {
    throw new Error("plan.json omits an explicitly requested category");
  }
  if (
    seen.size !== CATEGORIES.length ||
    CATEGORIES.some((category) => !seen.has(category)) ||
    new Set(plan.requestedCategories).size !== CATEGORIES.length
  ) {
    throw new Error("plan.json full coverage requires all nine categories");
  }
  for (const entry of plan.categories) {
    const expected = [...CATEGORY_SC[entry.category]].sort();
    const actual = [...entry.wcagSc].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`plan.json ${entry.category} must cover its complete WCAG 2.2 A/AA mapping`);
    }
  }
  const declaredCoverage = [...new Set(plan.scCoverage)].sort();
  const actualCoverage = [...categoryCoverage].sort();
  if (JSON.stringify(declaredCoverage) !== JSON.stringify(actualCoverage)) {
    throw new Error("plan.json scCoverage must equal category coverage");
  }
  return plan;
}

export function aggregateResults(runDir) {
  const realRunDir = fs.realpathSync(runDir);
  const planPath = path.join(runDir, "plan.json");
  if (!fs.existsSync(planPath)) throw new Error("plan.json is required");
  const realPlanPath = fs.realpathSync(planPath);
  if (!isPathInside(realRunDir, realPlanPath)) {
    throw new Error("plan.json resolves outside the run directory");
  }
  const plan = JSON.parse(fs.readFileSync(realPlanPath, "utf8"));
  validatePlan(plan);
  const plannedCategories = plan.categories.map((entry) => entry.category);
  const categoriesRoot = path.join(runDir, "categories");
  const records = [];
  const parallelIsolationIds = new Set();
  for (const category of plannedCategories) {
    const categoryDir = path.join(categoriesRoot, category);
    const resultPath = path.join(categoryDir, "result.json");
    if (!fs.existsSync(resultPath)) {
      throw new Error(`Missing planned category result: ${category}`);
    }
    const realCategoryDir = fs.realpathSync(categoryDir);
    const realResultPath = fs.realpathSync(resultPath);
    if (
      !isPathInside(realRunDir, realCategoryDir) ||
      !isPathInside(realCategoryDir, realResultPath)
    ) {
      throw new Error(`${category} result path escapes the run directory`);
    }
    const result = validateCategoryResult(
      JSON.parse(fs.readFileSync(realResultPath, "utf8")),
      runDir,
      category,
    );
    if (result.environment !== plan.executionEnvironment) {
      throw new Error(`${category}.environment does not match plan.json`);
    }
    for (const coverage of result.evidence.filter(
      (entry) => entry.type === "interaction-coverage",
    )) {
      const value = JSON.parse(fs.readFileSync(coverage.uri, "utf8"));
      if (value.route !== plan.url) {
        throw new Error(`${category} interaction coverage route does not match plan URL`);
      }
      const rootSurface = value.surfaces.find((entry) => entry.triggerPath === null);
      if (!rootSurface || rootSurface.route !== plan.url || rootSurface.id !== "root") {
        throw new Error(`${category} interaction coverage root does not match plan URL`);
      }
      const planOrigin = new URL(plan.url).origin;
      for (const control of value.controls) {
        const before = new URL(control.before.url);
        const after = new URL(control.after.url);
        if (before.origin !== planOrigin) {
          throw new Error(`${category} interaction begins outside the planned origin`);
        }
        if (
          control.outcome !== "navigation" &&
          control.outcome !== "stopped-before-confirmation" &&
          before.href !== after.href
        ) {
          throw new Error(`${category} interaction changed URL without a navigation outcome`);
        }
        if (
          control.outcome === "navigation" &&
          control.scopeDecision === "in-scope" &&
          !control.newSurfaceIds.some(
            (surfaceId) => {
              const surface = value.surfaces.find((entry) => entry.id === surfaceId);
              return (
                surface?.triggerPath === control.path &&
                surface?.route === control.after.url
              );
            },
          )
        ) {
          throw new Error(`${category} in-scope navigation lacks recursive surface coverage`);
        }
        if (control.outcome === "navigation" && control.scopeDecision === "in-scope") {
          if (after.origin !== planOrigin) {
            throw new Error(`${category} in-scope navigation leaves the planned origin`);
          }
        }
      }
    }
    const planned = plan.categories.find((entry) => entry.category === category);
    const resultCriteria = [...result.scResults.map((entry) => entry.wcagSc)].sort();
    const plannedCriteria = [...planned.wcagSc].sort();
    if (JSON.stringify(resultCriteria) !== JSON.stringify(plannedCriteria)) {
      throw new Error(`${category} scResults do not exactly match planned coverage`);
    }
    if (
      result.status === "completed" &&
      result.scResults.some((entry) => entry.status === "NOT_TESTED")
    ) {
      throw new Error(`${category} completed result contains NOT_TESTED success criteria`);
    }
    if (result.scResults.some((entry) => entry.status !== "NOT_TESTED")) {
      if (!result.claims.includes(planned.maximumClaim)) {
        throw new Error(`${category} did not satisfy its planned maximum claim`);
      }
      const usedCapabilities = new Set(result.capabilitiesUsed);
      for (const capability of planned.requiredCapabilities) {
        if (!usedCapabilities.has(capability)) {
          throw new Error(`${category} did not use planned capability: ${capability}`);
        }
      }
      const evidenceTypes = new Set(result.evidence.map((entry) => entry.type));
      const evidenceByUri = new Map(result.evidence.map((entry) => [entry.uri, entry]));
      for (const evidenceType of planned.requiredEvidenceTypes) {
        if (!evidenceTypes.has(evidenceType)) {
          throw new Error(`${category} is missing planned evidence: ${evidenceType}`);
        }
      }
      if (
        planned.executionClass === "parallel-browser" &&
        ["shared", "none"].includes(result.profileIsolationId.trim().toLowerCase())
      ) {
        throw new Error(`${category} parallel execution lacks an isolated profile`);
      }
      if (planned.executionClass === "parallel-browser") {
        const isolationId = result.profileIsolationId.trim().toLowerCase();
        if (parallelIsolationIds.has(isolationId)) {
          throw new Error(`${category} reuses parallel profile isolation ID: ${result.profileIsolationId}`);
        }
        parallelIsolationIds.add(isolationId);
      }
      if (
        planned.executionClass === "serial-real-at" &&
        result.producer === "copilot-browser"
      ) {
        throw new Error(`${category} planned real AT cannot use a browser producer`);
      }
      for (const finding of result.findings) {
        if (finding.wcagSc && !planned.wcagSc.includes(finding.wcagSc)) {
          throw new Error(`${category} finding ${finding.id} is outside planned WCAG coverage`);
        }
        if (["VIOLATION", "PASS"].includes(finding.classification)) {
          const linkedTypes = new Set(
            finding.evidenceUris.map((uri) => evidenceByUri.get(uri)?.type).filter(Boolean),
          );
          for (const claim of result.claims) {
            for (const evidenceType of CLAIM_RULES[claim].evidence) {
              if (!linkedTypes.has(evidenceType)) {
                throw new Error(
                  `${category} finding ${finding.id} lacks ${evidenceType} evidence for ${claim}`,
                );
              }
            }
          }
        }
      }
    }
    records.push({ ...result, resultPath });
  }

  const deduplicated = new Map();
  for (const record of records) {
    for (const finding of record.findings) {
      const namespaced = {
        ...finding,
        id: `${record.category}:${finding.id}`,
        category: record.category,
        sourceResult: record.resultPath,
        sourceResults: [record.resultPath],
      };
      const key = findingKey(namespaced);
      const existing = deduplicated.get(key);
      if (!existing) {
        deduplicated.set(key, namespaced);
      } else {
        existing.evidenceUris = [...new Set([...existing.evidenceUris, ...namespaced.evidenceUris])].sort();
        existing.sourceResults = [...new Set([...existing.sourceResults, record.resultPath])].sort();
        if (
          existing.classification === "VIOLATION" &&
          (severityOrder.get(namespaced.severity) ?? 99) < (severityOrder.get(existing.severity) ?? 99)
        ) {
          existing.severity = namespaced.severity;
        }
      }
    }
  }
  const findings = [...deduplicated.values()].sort(compareFindings);
  const byClassification = {};
  const bySeverity = {};
  for (const finding of findings) {
    byClassification[finding.classification] = (byClassification[finding.classification] ?? 0) + 1;
    if (finding.severity) bySeverity[finding.severity] = (bySeverity[finding.severity] ?? 0) + 1;
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    categories: records.map((record) => ({
      category: record.category,
      status: record.status,
      environment: record.environment,
      producer: record.producer,
      durationSeconds: record.durationSeconds,
      claims: record.claims,
      blockers: record.blockers,
      resultPath: record.resultPath,
    })),
    scResults: records
      .flatMap((record) =>
        record.scResults.map((entry) => ({ ...entry, category: record.category })),
      )
      .sort(
        (left, right) =>
          left.wcagSc.localeCompare(right.wcagSc) ||
          CATEGORIES.indexOf(left.category) - CATEGORIES.indexOf(right.category),
      ),
    counts: { total: findings.length, byClassification, bySeverity },
    evidence: records
      .flatMap((record) =>
        record.evidence.map((entry) => ({ ...entry, category: record.category })),
      )
      .sort((left, right) => left.uri.localeCompare(right.uri)),
    findings,
  };
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== "aggregate") {
    throw new Error("Usage: a11y-explore-results.mjs aggregate --run-dir <dir> --out <file>");
  }
  const args = parseArgs(rest);
  if (!args["run-dir"] || !args.out) throw new Error("--run-dir and --out are required");
  const runDir = path.resolve(args["run-dir"]);
  const output = path.resolve(args.out);
  safeWriteFile(runDir, output, `${JSON.stringify(aggregateResults(runDir), null, 2)}\n`);
  process.stdout.write(`${output}\n`);
}

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isEntry) {
  try {
    main();
  } catch (error) {
    console.error(`[a11y-explore-results] ${error.message}`);
    process.exitCode = 1;
  }
}
