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
const sessionContractPath = path.join(
  repoRoot,
  "copilot",
  "skills",
  "ow-a11y-host-setup",
  "scripts",
  "session-readiness-contract.ps1",
);

const skill = fs.readFileSync(skillPath, "utf8");
const script = fs.readFileSync(scriptPath, "utf8");
const sessionContract = fs.readFileSync(sessionContractPath, "utf8");

for (const action of [
  "Probe",
  "InstallSafeDependencies",
  "InstallPersonalEvaluatorBrowser",
  "CheckPersonalEvaluatorBrowser",
  "StageVbCable",
  "LaunchVbCableInstaller",
  "OpenVoiceAccess",
  "DisableVoiceAccessAutoStart",
  "InstallSessionAutomation",
  "RunSessionBootstrap",
  "GetSessionReadiness",
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
assert.match(script, /-RunLevel Limited/);
assert.match(script, /-UserId 'SYSTEM'/);
assert.match(script, /-LogonType ServiceAccount/);
assert.match(script, /New-ScheduledTaskTrigger -AtLogOn/);
assert.match(script, /SetThreadExecutionState\(`\$executionFlags\)/);
assert.match(script, /'rdp-sxs'/);
assert.match(script, /consoleUnlocked/);
assert.match(script, /legacyLockPresent/);
assert.match(script, /Get-Process consent/);
assert.match(script, /CredentialUIBroker/);
assert.match(script, /OpenInputDesktop/);
assert.match(script, /\$inputDesktop -ne 'Default'/);
assert.match(script, /Get-Process VoiceAccess, VoiceAccessHost/);
assert.match(script, /function Disable-VoiceAccessAutoStart/);
assert.match(script, /Stop-Process -Id \$process\.Id/);
assert.match(skill, /Voice Access is agent-controlled/);
assert.match(sessionContract, /function Select-AgentOWActiveRdpSession/);
assert.match(sessionContract, /function Test-AgentOWReadinessHeartbeat/);
assert.match(script, /atReady = `\$nvda -and `\$edge -and `\$voiceAccess\.Count -eq 0/);
assert.match(script, /\$template = \$template\.Replace\('__EXPECTED_USER__'/);
assert.match(sessionContract, /\[int\]\$Heartbeat\.sessionId -eq \$ExpectedSessionId/);
assert.match(sessionContract, /\$Heartbeat\.sessionName -match '\^rdp-sxs'/);
assert.match(sessionContract, /\$heartbeatAt -gt \$NotBefore/);
assert.match(skill, /must not reconnect/);
assert.match(script, /-EncodedCommand \$encodedTask/);
assert.match(script, /Get-Process explorer/);
assert.match(script, /showSpeechViewerAtStartup = True/);
assert.match(script, /VoiceAccessMicrophoneId/);
assert.match(script, /default-cable-fallback/);
assert.match(script, /remote-audio-active/);
assert.match(skill, /manual microphone selection is\s+not necessarily required/);
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
  const contractCommand = `
    . '${sessionContractPath.replaceAll("'", "''")}';
    $lines = @(
      '>rongqizhou rdp-sxs260519750#0 2 Active . 9/2/2026 5:11 PM',
      'other rdp-sxs260519750#1 3 Active . 9/2/2026 5:12 PM'
    );
    $selected = Select-AgentOWActiveRdpSession -Lines $lines -ExpectedUser 'rongqizhou';
    if ($selected.sessionId -ne 2) { throw 'wrong session selected' }
    $now = [DateTimeOffset]::UtcNow;
    $heartbeat = [pscustomobject]@{
      heartbeatAt = $now.ToString('o'); user = 'rongqizhou'; sessionId = 2;
      sessionName = 'rdp-sxs260519750#0'; sessionState = 'Active';
      consoleUnlocked = $false; atReady = $true; authenticated = $true;
      legacyLockPresent = $false; secureSurfacePresent = $false;
      voiceAccessStopped = $true
    };
    if (-not (Test-AgentOWReadinessHeartbeat -Heartbeat $heartbeat -ExpectedUser 'rongqizhou' -ExpectedSessionId 2 -Phase Bootstrap -NotBefore $now.AddSeconds(-1))) {
      throw 'valid bootstrap heartbeat rejected'
    }
    $heartbeat.sessionId = 9;
    if (Test-AgentOWReadinessHeartbeat -Heartbeat $heartbeat -ExpectedUser 'rongqizhou' -ExpectedSessionId 2 -Phase Bootstrap -NotBefore $now.AddSeconds(-1)) {
      throw 'wrong-session heartbeat accepted'
    }
    $heartbeat.sessionId = 2; $heartbeat.sessionName = 'console'; $heartbeat.consoleUnlocked = $true;
    if (-not (Test-AgentOWReadinessHeartbeat -Heartbeat $heartbeat -ExpectedUser 'rongqizhou' -ExpectedSessionId 2 -Phase Console -NotBefore $now.AddSeconds(-1))) {
      throw 'valid Console heartbeat rejected'
    }
    $heartbeat.voiceAccessStopped = $false;
    if (Test-AgentOWReadinessHeartbeat -Heartbeat $heartbeat -ExpectedUser 'rongqizhou' -ExpectedSessionId 2 -Phase Console -NotBefore $now.AddSeconds(-1)) {
      throw 'Voice Access heartbeat accepted'
    }
  `;
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", contractCommand],
    { encoding: "utf8", stdio: "pipe" },
  );
  assert.throws(
    () =>
      execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-ExecutionPolicy",
          "Bypass",
          "-Command",
          `. '${sessionContractPath.replaceAll("'", "''")}'; Select-AgentOWActiveRdpSession -Lines @('>rongqizhou rdp-sxs0 2 Active', 'rongqizhou rdp-sxs1 3 Active') -ExpectedUser 'rongqizhou'`,
        ],
        { encoding: "utf8", stdio: "pipe" },
      ),
    (error) => error.status !== 0,
  );

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

  const codespaceEnvironment = { ...process.env, CODESPACES: "true" };
  delete codespaceEnvironment.LOCALAPPDATA;
  delete codespaceEnvironment.USERPROFILE;
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
          env: codespaceEnvironment,
        },
      ),
    (error) =>
      error.status !== 0 &&
      `${error.stdout ?? ""}${error.stderr ?? ""}`.includes("not supported in a Codespace"),
  );
}

console.log("a11y host setup tests passed");
