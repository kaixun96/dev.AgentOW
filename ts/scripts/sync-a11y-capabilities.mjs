import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const repository = "kaixun96/dev.A11yAssist";
const source = "runtime/evidence-v1.mjs";
const targets = ["tools/validate-a11y-evidence.mjs", "copilot/tools/validate-a11y-evidence.mjs"];
const lockPath = "copilot/a11y-capabilities.lock.json";
const executionLockPath = "copilot/a11y-execution.lock.json";
const executionTargets = {
  "native/windows-host.ps1": ["copilot/skills/ow-a11y-host-setup/scripts/setup-windows-a11y.ps1"],
  "integrations/agentow/runtime/personal-evaluator-browser.py": ["tools/personal-evaluator-browser.py", "copilot/tools/personal-evaluator-browser.py"],
  "native/ado-attachments.mjs": ["ts/src/ow/tools/shared-a11y/ado-attachments.mjs"],
  "native/ado-attachments.d.mts": ["ts/src/ow/tools/shared-a11y/ado-attachments.d.mts"],
  "native/pr-description.mjs": ["ts/src/ow/tools/shared-a11y/pr-description.mjs"],
};
const normalize = text => text.replaceAll("\r\n", "\n");
export const digest = text => createHash("sha256").update(normalize(text)).digest("hex");
function demand(condition, message) { if (!condition) throw new Error(message); }

export function validateExport(manifest) {
  demand(manifest?.schemaVersion === 1 && manifest.repository === repository, "Unexpected shared capability repository/schema");
  demand(/^\d+\.\d+\.\d+$/.test(manifest.version), "Invalid shared capability version");
  demand(Array.isArray(manifest.files) && manifest.files.length === 1, "Unexpected capability export count");
  const file = manifest.files[0];
  demand(file.source === source && file.target === targets[0] && /^[a-f0-9]{64}$/.test(file.sha256),
    "Unexpected capability export path/hash");
  return file;
}

export function renderCopy(commit, body) {
  demand(/^[a-f0-9]{40}$/.test(commit), "Use an exact reviewed source commit");
  const normalized = normalize(body);
  const split = normalized.startsWith("#!") ? normalized.indexOf("\n") + 1 : 0;
  demand(!normalized.startsWith("#!") || split > 0, "Shared shebang must end with a newline");
  const header = `// Generated from ${repository}@${commit}:${source}. Do not edit; use ts/scripts/sync-a11y-capabilities.mjs.\n`;
  return normalized.slice(0, split) + header + normalized.slice(split);
}

export function validateCopy(lock, body) {
  demand(lock?.schemaVersion === 1 && lock.repository === repository && /^[a-f0-9]{40}$/.test(lock.commit),
    "Invalid shared capability lock");
  demand(digest(lock.manifestText) === lock.manifestSha256, "Shared manifest lock hash mismatch");
  const file = validateExport(JSON.parse(lock.manifestText));
  const prefix = renderCopy(lock.commit, "");
  const normalized = normalize(body);
  const split = normalized.startsWith("#!") ? normalized.indexOf("\n") + 1 : 0;
  demand(normalized.slice(split).startsWith(prefix), "Shared capability provenance changed");
  demand(digest(normalized.slice(0, split) + normalized.slice(split + prefix.length)) === file.sha256,
    "Shared capability drift: update the canonical source, not the mirror");
}

async function fetchText(commit, path) {
  const response = await fetch(`https://raw.githubusercontent.com/${repository}/${commit}/${path}`, {
    signal: AbortSignal.timeout(20000), redirect: "error"
  });
  demand(response.ok, `Shared capability fetch failed: HTTP ${response.status} for ${path}`);
  const body = await response.text();
  demand(Buffer.byteLength(body) <= 1024 * 1024, "Shared capability exceeds size bound");
  return normalize(body);
}

export async function checkCopies(repoRoot = root) {
  const lock = JSON.parse(await readFile(join(repoRoot, lockPath), "utf8"));
  for (const target of targets) validateCopy(lock, await readFile(join(repoRoot, target), "utf8"));
}

export function validateExecutionExport(manifest) {
  demand(manifest?.schemaVersion === 1 && manifest.repository === repository &&
    /^\d+\.\d+\.\d+$/.test(manifest.version), "Unexpected execution capability repository/schema/version");
  demand(Array.isArray(manifest.files) && manifest.files.length === Object.keys(executionTargets).length,
    "Unexpected execution capability export count");
  const seen = new Set();
  for (const file of manifest.files) {
    demand(Object.hasOwn(executionTargets, file.source) && !seen.has(file.source) &&
      JSON.stringify(file.targets) === JSON.stringify(executionTargets[file.source]) &&
      /^[a-f0-9]{64}$/.test(file.sha256), "Unexpected execution capability path/hash");
    seen.add(file.source);
  }
  return manifest.files;
}

export function renderExecutionCopy(commit, sourcePath, body) {
  demand(/^[a-f0-9]{40}$/.test(commit), "Use an exact reviewed source commit");
  demand(Object.hasOwn(executionTargets, sourcePath), "Unknown execution capability source");
  const normalized = normalize(body);
  const split = normalized.startsWith("#!") ? normalized.indexOf("\n") + 1 : 0;
  demand(!normalized.startsWith("#!") || split > 0, "Shared shebang must end with a newline");
  const comment = /\.(ps1|py)$/.test(sourcePath) ? "#" : "//";
  const header = `${comment} Generated from ${repository}@${commit}:${sourcePath}. Do not edit; use ts/scripts/sync-a11y-capabilities.mjs.\n`;
  return normalized.slice(0, split) + header + normalized.slice(split);
}

export function validateExecutionCopy(lock, file, body) {
  demand(lock?.schemaVersion === 1 && lock.repository === repository && /^[a-f0-9]{40}$/.test(lock.commit),
    "Invalid execution capability lock");
  demand(digest(lock.manifestText) === lock.manifestSha256, "Execution manifest lock hash mismatch");
  const pinned = validateExecutionExport(JSON.parse(lock.manifestText)).find(entry => entry.source === file.source);
  demand(pinned && pinned.sha256 === file.sha256, "Execution source is not pinned");
  const prefix = renderExecutionCopy(lock.commit, file.source, "");
  const normalized = normalize(body);
  const split = normalized.startsWith("#!") ? normalized.indexOf("\n") + 1 : 0;
  demand(normalized.slice(split).startsWith(prefix), "Execution capability provenance changed");
  demand(digest(normalized.slice(0, split) + normalized.slice(split + prefix.length)) === pinned.sha256,
    "Shared execution capability drift: change the canonical source, not the mirror");
}

export async function checkExecutionCopies(repoRoot = root) {
  const lock = JSON.parse(await readFile(join(repoRoot, executionLockPath), "utf8"));
  for (const file of validateExecutionExport(JSON.parse(lock.manifestText))) {
    for (const target of file.targets) validateExecutionCopy(lock, file, await readFile(join(repoRoot, target), "utf8"));
  }
}

async function updateExecution(commit) {
  demand(/^[a-f0-9]{40}$/.test(commit ?? ""), "Use --update-execution <full-reviewed-dev.A11yAssist-commit>");
  const manifestText = await fetchText(commit, "integrations/agentow/execution-manifest.json");
  const files = validateExecutionExport(JSON.parse(manifestText));
  const lock = { schemaVersion: 1, repository, commit, manifestSha256: digest(manifestText), manifestText };
  const copies = [];
  for (const file of files) {
    const body = await fetchText(commit, file.source);
    demand(digest(body) === file.sha256, "Downloaded execution capability hash mismatch");
    const generated = renderExecutionCopy(commit, file.source, body);
    validateExecutionCopy(lock, file, generated);
    for (const target of file.targets) copies.push({ target, generated });
  }
  for (const { target, generated } of copies) {
    await mkdir(dirname(join(root, target)), { recursive: true });
    await writeFile(join(root, target), generated);
  }
  await writeFile(join(root, executionLockPath), JSON.stringify(lock, null, 2) + "\n");
  await checkExecutionCopies();
}

async function update(commit) {
  demand(/^[a-f0-9]{40}$/.test(commit ?? ""), "Use --update <full-reviewed-dev.A11yAssist-commit>");
  const manifestText = await fetchText(commit, "integrations/agentow/exports.json");
  const file = validateExport(JSON.parse(manifestText));
  const body = await fetchText(commit, file.source);
  demand(digest(body) === file.sha256, "Downloaded shared capability hash mismatch");
  const lock = {
    schemaVersion: 1, repository, commit, manifestSha256: digest(manifestText), manifestText
  };
  const generated = renderCopy(commit, body);
  validateCopy(lock, generated);
  // All downloads are verified before any local mirror is replaced.
  for (const target of targets) await writeFile(join(root, target), generated);
  await writeFile(join(root, lockPath), JSON.stringify(lock, null, 2) + "\n");
  await checkCopies();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === "--check" && process.argv.length === 3) await checkCopies();
    else if (process.argv[2] === "--update" && process.argv.length === 4) await update(process.argv[3]);
    else if (process.argv[2] === "--check-execution" && process.argv.length === 3) await checkExecutionCopies();
    else if (process.argv[2] === "--update-execution" && process.argv.length === 4) await updateExecution(process.argv[3]);
    else throw new Error("Use --check, --check-execution, --update <commit> or --update-execution <commit>");
    console.log("Shared A11y capability copies match their pinned source.");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
