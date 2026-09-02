#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { aggregateResults } from "./a11y-explore-results.mjs";

const AZURE_DEVOPS_RESOURCE = "499b84ac-1321-427f-aa17-267ca6975798";
const SEVERITY = {
  Critical: "1 - Critical",
  High: "2 - High",
  Medium: "3 - Medium",
  Low: "4 - Low",
};

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (!argv[index].startsWith("--") || argv[index + 1] === undefined) {
      throw new Error(`Invalid argument: ${argv[index]}`);
    }
    args[argv[index].slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readConfig(configPath) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  for (const field of ["organization", "project"]) {
    if (typeof config[field] !== "string" || !config[field].trim()) {
      throw new Error(`ADO config ${field} is required`);
    }
  }
  const organization = config.organization.replace(/\/+$/, "");
  if (!/^https:\/\/dev\.azure\.com\/[^/]+$/i.test(organization)) {
    throw new Error("ADO config organization must be https://dev.azure.com/<organization>");
  }
  return {
    organization,
    project: config.project,
    areaPath: config.areaPath ?? "",
    iterationPath: config.iterationPath ?? "",
    assignedTo: config.assignedTo ?? "",
    workItemType: config.workItemType ?? "Bug",
  };
}

function getToken() {
  const command = process.platform === "win32" ? "az.cmd" : "az";
  const result = spawnSync(
    command,
    [
      "account",
      "get-access-token",
      "--resource",
      AZURE_DEVOPS_RESOURCE,
      "--query",
      "accessToken",
      "-o",
      "tsv",
    ],
    { encoding: "utf8", windowsHide: true },
  );
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error("Azure DevOps authentication is unavailable");
  }
  return result.stdout.trim();
}

async function checkedFetch(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    throw new Error(`Azure DevOps request failed (${response.status}): ${detail}`);
  }
  return response.json();
}

async function uploadAttachment(config, token, filePath) {
  const fileName = encodeURIComponent(path.basename(filePath));
  const project = encodeURIComponent(config.project);
  const url = `${config.organization}/${project}/_apis/wit/attachments?fileName=${fileName}&api-version=7.1-preview.3`;
  return checkedFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    body: fs.readFileSync(filePath),
  });
}

function buildDescription(finding) {
  const steps = finding.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
  return `<h2>Accessibility finding</h2>
<p><strong>Category:</strong> ${escapeHtml(finding.category)}</p>
<p><strong>WCAG:</strong> ${escapeHtml(finding.wcagSc)}</p>
<h3>Steps</h3><ol>${steps}</ol>
<p><strong>Expected:</strong> ${escapeHtml(finding.expected)}</p>
<p><strong>Actual:</strong> ${escapeHtml(finding.actual)}</p>
<p>Generated from an agentOW Accessibility exploratory test. Review the attached evidence before triage.</p>`;
}

async function createBug(config, token, finding, attachments) {
  const patch = [
    { op: "add", path: "/fields/System.Title", value: `[A11Y] ${finding.title}`.slice(0, 255) },
    { op: "add", path: "/fields/System.Description", value: buildDescription(finding) },
    { op: "add", path: "/fields/Microsoft.VSTS.Common.Severity", value: SEVERITY[finding.severity] },
    { op: "add", path: "/fields/System.Tags", value: "Accessibility; agentOW" },
  ];
  for (const [field, value] of [
    ["System.AreaPath", config.areaPath],
    ["System.IterationPath", config.iterationPath],
    ["System.AssignedTo", config.assignedTo],
  ]) {
    if (value) patch.push({ op: "add", path: `/fields/${field}`, value });
  }
  for (const attachment of attachments) {
    patch.push({
      op: "add",
      path: "/relations/-",
      value: {
        rel: "AttachedFile",
        url: attachment.url,
        attributes: { comment: "agentOW Accessibility evidence" },
      },
    });
  }
  const project = encodeURIComponent(config.project);
  const type = encodeURIComponent(config.workItemType);
  const url = `${config.organization}/${project}/_apis/wit/workitems/$${type}?api-version=7.1`;
  return checkedFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json-patch+json",
    },
    body: JSON.stringify(patch),
  });
}

function writeFileInsideRun(runDir, filePath, content) {
  const realRun = fs.realpathSync(runDir);
  const resolved = path.resolve(filePath);
  if (!isPathInside(path.resolve(runDir), resolved)) {
    throw new Error("ADO output must remain inside the run directory");
  }
  const parent = path.dirname(resolved);
  fs.mkdirSync(parent, { recursive: true });
  const realParent = fs.realpathSync(parent);
  if (!isPathInside(realRun, realParent)) {
    throw new Error("ADO output parent resolves outside the run directory");
  }
  if (fs.existsSync(resolved) && fs.lstatSync(resolved).isSymbolicLink()) {
    throw new Error("ADO output must not be a symbolic link");
  }
  const temporary = path.join(realParent, `.${path.basename(resolved)}.${process.pid}.tmp`);
  fs.writeFileSync(temporary, content);
  fs.renameSync(temporary, resolved);
}

function writeMappings(runDir, filePath, entries) {
  const content = `${JSON.stringify(entries, null, 2)}\n`;
  writeFileInsideRun(runDir, filePath, content);
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateScreenshot(runDir, evidence) {
  if (
    !evidence ||
    evidence.type !== "screenshot" ||
    typeof evidence.category !== "string" ||
    typeof evidence.uri !== "string" ||
    !path.isAbsolute(evidence.uri) ||
    typeof evidence.sha256 !== "string"
  ) {
    throw new Error("Screenshot evidence metadata is incomplete");
  }
  const categoryDir = path.join(runDir, "categories", evidence.category);
  if (!fs.existsSync(categoryDir) || !fs.existsSync(evidence.uri)) {
    throw new Error(`Screenshot evidence is missing: ${evidence.uri}`);
  }
  const realCategoryDir = fs.realpathSync(categoryDir);
  const realEvidence = fs.realpathSync(evidence.uri);
  if (!isPathInside(realCategoryDir, realEvidence)) {
    throw new Error(`Screenshot evidence escapes its category directory: ${evidence.uri}`);
  }
  const actualHash = crypto.createHash("sha256").update(fs.readFileSync(realEvidence)).digest("hex");
  if (actualHash !== evidence.sha256) {
    throw new Error(`Screenshot evidence hash mismatch: ${evidence.uri}`);
  }
  return realEvidence;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args["run-dir"] || !args.config) throw new Error("--run-dir and --config are required");
  const runDir = path.resolve(args["run-dir"]);
  const config = readConfig(path.resolve(args.config));
  const aggregate = aggregateResults(runDir);
  const violations = aggregate.findings.filter(
    (finding) => finding.classification === "VIOLATION" && SEVERITY[finding.severity],
  );
  const evidenceByUri = new Map((aggregate.evidence ?? []).map((entry) => [entry.uri, entry]));
  const plans = violations.map((finding) => ({
    finding,
    screenshots: finding.evidenceUris.flatMap((uri) => {
      const evidence = evidenceByUri.get(uri);
      return (
        evidence?.type === "screenshot" &&
        [".png", ".jpg", ".jpeg"].includes(path.extname(uri).toLowerCase())
      )
        ? [validateScreenshot(runDir, evidence)]
        : [];
    }),
  }));

  if (args.dryRun) {
    const output = path.join(runDir, "ado-dry-run.json");
    writeFileInsideRun(
      runDir,
      output,
      `${JSON.stringify(
        plans.map(({ finding, screenshots }) => ({
          findingId: finding.id,
          title: `[A11Y] ${finding.title}`.slice(0, 255),
          severity: SEVERITY[finding.severity],
          screenshots,
        })),
        null,
        2,
      )}\n`,
    );
    process.stdout.write(`${output}\n`);
    return;
  }

  const mappingPath = path.join(runDir, "ado-bugs.json");
  if (
    fs.existsSync(mappingPath) &&
    !isPathInside(fs.realpathSync(runDir), fs.realpathSync(mappingPath))
  ) {
    throw new Error("ado-bugs.json resolves outside the run directory");
  }
  const mappings = fs.existsSync(mappingPath)
    ? JSON.parse(fs.readFileSync(mappingPath, "utf8"))
    : [];
  if (!Array.isArray(mappings)) throw new Error("ado-bugs.json must contain an array");
  const completed = new Set(mappings.map((entry) => entry.findingId));
  const token = getToken();
  for (const { finding, screenshots } of plans) {
    if (completed.has(finding.id)) continue;
    const attachments = [];
    for (const screenshot of screenshots) {
      attachments.push(await uploadAttachment(config, token, screenshot));
    }
    const workItem = await createBug(config, token, finding, attachments);
    mappings.push({
      findingId: finding.id,
      bugId: workItem.id,
      bugUrl: `${config.organization}/${encodeURIComponent(config.project)}/_workitems/edit/${workItem.id}`,
    });
    completed.add(finding.id);
    writeMappings(runDir, mappingPath, mappings);
  }
  process.stdout.write(`${mappingPath}\n`);
}

main().catch((error) => {
  console.error(`[a11y-explore-ado] ${error.message}`);
  process.exitCode = 1;
});
