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
  "InstallPersonalEvaluatorBrowser",
  "CheckPersonalEvaluatorBrowser",
  "StageVbCable",
  "LaunchVbCableInstaller",
  "OpenVoiceAccess",
  "InstallConsoleTransferTask",
  "RunConsoleTransfer",
  "ValidateHost",
]) {
  assert.match(skill, new RegExp(`-Action ${action}\\b`));
  assert.match(script, new RegExp(`'${action}'`));
}

assert.match(script, /https:\/\/download\.vb-audio\.com\/Download_CABLE\/VBCABLE_Driver_Pack45\.zip/);
assert.match(script, /B950E39F01AF1D04EA623C8F6D8EB9B6EA5C477C637295FABF20631C85116BFB/);
assert.match(script, /Get-AuthenticodeSignature/);
assert.match(script, /CN=BUREL VINCENT/);
assert.match(script, /\$env:CODESPACES -eq 'true'/);
assert.match(script, /\$env:CODESPACE_NAME/);
assert.match(skill, /not supported in a Codespace/);
assert.match(script, /-LogonType Interactive/);
assert.match(script, /-EncodedCommand \$encodedTask/);
assert.match(script, /Get-Process explorer/);
assert.match(script, /showSpeechViewerAtStartup = True/);
assert.match(script, /VoiceAccessMicrophoneId/);
assert.match(script, /personal-evaluator-browser\.py/);
assert.match(skill, /PERSONAL_EVALUATOR_OWNER_EMAIL/);
assert.match(script, /Audio capture did not complete/);
assert.match(script, /audio\.is_format_supported/);
assert.match(script, /do not share a supported sample rate/);
assert.match(script, /result\["screen"\]\["std"\] > 1/);
assert.match(script, /result\["audio"\]\["rms"\] > 500/);
assert.match(script, /LastTaskResult -ne 0/);
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
    assert.equal(typeof capability.prerequisites.vbCable.currentSessionAvailable, "boolean");
    assert.match(capability.prerequisites.voiceAccess.languageModel, /^(ready|setup-required)$/);
  } finally {
    fs.rmSync(outputPath, { force: true });
  }

  assert.throws(
    () =>
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
        ],
        {
          encoding: "utf8",
          stdio: "pipe",
          env: { ...process.env, CODESPACES: "true" },
        },
      ),
    (error) =>
      error.status !== 0 &&
      `${error.stdout ?? ""}${error.stderr ?? ""}`.includes("not supported in a Codespace"),
  );
}

console.log("a11y host setup tests passed");
