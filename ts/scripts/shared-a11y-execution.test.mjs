import assert from "node:assert/strict";
import {
  digest, validateExecutionExport, renderExecutionCopy, validateExecutionCopy, checkExecutionCopies,
} from "./sync-a11y-capabilities.mjs";

const commit = "a".repeat(40);
const entries = [
  ["native/windows-host.ps1", ["copilot/skills/ow-a11y-host-setup/scripts/setup-windows-a11y.ps1"], "# PowerShell fixture\n"],
  ["integrations/agentow/runtime/personal-evaluator-browser.py",
    ["tools/personal-evaluator-browser.py", "copilot/tools/personal-evaluator-browser.py"], "#!/usr/bin/env python3\nprint('fixture')\n"],
  ["native/ado-attachments.mjs", ["ts/src/ow/tools/shared-a11y/ado-attachments.mjs"], "export const fixture = true;\n"],
  ["native/ado-attachments.d.mts", ["ts/src/ow/tools/shared-a11y/ado-attachments.d.mts"], "export const fixture: boolean;\n"],
  ["native/pr-description.mjs", ["ts/src/ow/tools/shared-a11y/pr-description.mjs"], "export const fixture = true;\n"],
];
const manifest = { schemaVersion: 1, repository: "kaixun96/dev.A11yAssist", version: "0.5.0",
  files: entries.map(([source, targets, body]) => ({ source, targets, sha256: digest(body) })) };
const manifestText = JSON.stringify(manifest);
const lock = { schemaVersion: 1, repository: manifest.repository, commit, manifestText, manifestSha256: digest(manifestText) };
validateExecutionExport(manifest);
for (const [source, , body] of entries) {
  const file = manifest.files.find(entry => entry.source === source);
  const rendered = renderExecutionCopy(commit, source, body);
  validateExecutionCopy(lock, file, rendered);
  validateExecutionCopy(lock, file, rendered.replaceAll("\n", "\r\n"));
  assert.throws(() => validateExecutionCopy(lock, file, body), /provenance/);
  assert.throws(() => validateExecutionCopy(lock, file, rendered + "drift"), /drift/);
  assert.throws(() => renderExecutionCopy("main", source, body), /exact reviewed/);
  if (source.endsWith(".py")) assert.match(rendered, /^#![^\n]+\n# Generated/);
}
assert.throws(() => validateExecutionExport({ ...manifest, files: manifest.files.slice(1) }), /count/);
assert.throws(() => validateExecutionExport({ ...manifest, files: manifest.files.map((file, i) =>
  i === 0 ? { ...file, targets: ["../escape"] } : file) }), /path/);
assert.throws(() => validateExecutionExport({ ...manifest, files: [manifest.files[1], ...manifest.files.slice(1)] }), /path/);
await checkExecutionCopies();
console.log("Shared Windows/browser/publication provenance and drift checks passed.");
