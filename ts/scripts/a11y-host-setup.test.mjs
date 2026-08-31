import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const tsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(tsDir, "..");
const skillPath = path.join(repoRoot, "copilot", "skills", "ow-a11y-host-setup", "SKILL.md");
const scriptPath = path.join(
  repoRoot,
  "copilot",
  "skills",
  "ow-a11y-host-setup",
  "scripts",
  "setup-windows-a11y.ps1",
);

const skill = fs.readFileSync(skillPath, "utf8");
const script = fs.readFileSync(scriptPath, "utf8");

for (const action of [
  "Probe",
  "InstallSafeDependencies",
  "StageVbCable",
  "LaunchVbCableInstaller",
  "OpenVoiceAccess",
]) {
  assert.match(skill, new RegExp(`-Action ${action}\\b`));
  assert.match(script, new RegExp(`'${action}'`));
}

assert.match(script, /https:\/\/download\.vb-audio\.com\/Download_CABLE\/VBCABLE_Driver_Pack45\.zip/);
assert.match(script, /B950E39F01AF1D04EA623C8F6D8EB9B6EA5C477C637295FABF20631C85116BFB/);
assert.match(script, /Get-AuthenticodeSignature/);
assert.match(script, /CN=BUREL VINCENT/);
assert.doesNotMatch(script, /Restart-Computer/);

if (process.platform === "win32") {
  const outputPath = path.join(os.tmpdir(), `agentow-a11y-host-${process.pid}.json`);
  try {
    execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-Action",
        "Probe",
        "-OutputPath",
        outputPath,
      ],
      { encoding: "utf8", stdio: "pipe" },
    );
    const capability = JSON.parse(fs.readFileSync(outputPath, "utf8").replace(/^\uFEFF/, ""));
    assert.equal(capability.schemaVersion, 1);
    assert.equal(capability.host, "windows");
    assert.equal(typeof capability.scenarios.browserKeyboard, "boolean");
    assert.match(capability.prerequisites.voiceAccess.languageModel, /^(ready|setup-required)$/);
  } finally {
    fs.rmSync(outputPath, { force: true });
  }
}

console.log("a11y host setup tests passed");
