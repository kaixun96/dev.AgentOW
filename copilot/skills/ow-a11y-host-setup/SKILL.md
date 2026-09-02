---
name: ow-a11y-host-setup
description: "Prepare a Windows evaluator host for agentOW Accessibility testing. Installs scriptable dependencies, stages and launches the signed VB-CABLE driver installer, opens Voice Access first-run setup, and writes a capability report. Use for ow-a11y-host-setup, configure A11Y host, install VB-CABLE, configure Voice Access, or prepare Windows AT."
---

# Prepare a Windows Accessibility evaluator host

This command performs one-time host setup only. It does not run an Accessibility test, modify
product code, create a branch, or create a pull request.

The setup script is:

```powershell
$setup = "${CLAUDE_PLUGIN_ROOT}\skills\ow-a11y-host-setup\scripts\setup-windows-a11y.ps1"
```

1. Detect the execution environment before doing anything else. If `CODESPACES == "true"` or
   `CODESPACE_NAME` is non-empty, stop the entire setup and tell the user:

   ```text
   /ow-a11y-host-setup is not supported in a Codespace. Run it on the Windows evaluator host.
   ```

   Do not probe, install packages, download VB-CABLE, open Voice Access, or trigger elevation in a
   Codespace. For every other non-Windows host, stop and report that this setup must run on the
   Windows evaluator host.
2. Create `.aero/ow-a11y-host-setup-<timestamp>/` and set:

   ```powershell
   $capabilities = ".aero\ow-a11y-host-setup-<timestamp>\capabilities.json"
   ```

3. Run the initial probe:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup `
     -Action Probe -OutputPath $capabilities
   ```

4. If any scriptable prerequisite is missing, run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup `
     -Action InstallSafeDependencies -OutputPath $capabilities
   ```

   This installs NVDA, FFmpeg, AudioDeviceCmdlets, Python, Playwright, Chromium, MSS, and
   PyAudioWPatch only when missing.

5. Install the compliant persistent evaluator browser:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup `
     -Action InstallPersonalEvaluatorBrowser -OutputPath $capabilities
   ```

   While connected to the Windows desktop, bootstrap its dedicated profile once:

   ```powershell
   $env:PERSONAL_EVALUATOR_OWNER_EMAIL = '<owner-email>'
   $python = (Get-Content $capabilities -Raw | ConvertFrom-Json).prerequisites.python.path
   $evaluator = (Get-Content $capabilities -Raw | ConvertFrom-Json).prerequisites.personalEvaluatorBrowser.scriptPath
   & $python $evaluator bootstrap --timeout-minutes 30
   Remove-Item Env:\PERSONAL_EVALUATOR_OWNER_EMAIL
   ```

   The email stays process-local. The owner completes any password, Windows Hello, MFA, certificate,
   or consent prompt. Before each evaluator run, use `-Action CheckPersonalEvaluatorBrowser`; an
   authenticated result is required for the personal-profile route.

6. If the capability report does not contain both a VB-CABLE render endpoint (`CABLE Input`) and
   capture endpoint (`CABLE Output`), stage the fixed official package:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup `
     -Action StageVbCable
   ```

   The script accepts only the pinned package hash and a valid `BUREL VINCENT` Authenticode
   signature. Then launch the vendor installer:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup `
     -Action LaunchVbCableInstaller -OutputPath $capabilities
   ```

   The owner completes the vendor's **Install Driver** interaction. VB-CABLE requires a Windows
   restart. Do not claim the driver is ready until the host has restarted and both endpoints pass a
   new probe.

7. If Voice Access has not completed first-run language setup, open it:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup `
     -Action OpenVoiceAccess -OutputPath $capabilities
   ```

   The owner selects the required language and completes **Agree and continue**. The probe records
   the current language, first-run completion, consent, and model-update markers. A real Voice
   Access scenario must still prove recognition and captured audio. A manual microphone selection is
   not necessarily required: after Console transfer removes Remote Audio, Voice Access may use
   `CABLE Output` through Windows default-input fallback. Treat `VoiceAccessMicrophoneId` as a
   diagnostic only. The probe reports `explicit-cable`, `default-cable-fallback`,
   `remote-audio-active`, or `unresolved`; final readiness still requires an end-to-end harmless
   command played through `CABLE Input` and recognized by Voice Access after RDP disconnect.

8. Install the one-time Console transfer task when unattended recording or Voice Access evidence is
   required:

   ```powershell
   $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$setup`" -Action InstallConsoleTransferTask"
   Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList $arguments
   ```

   The task runs as the current interactive user with `InteractiveToken + Highest`. Its fixed
   service-start and `tscon` logic is embedded in the protected task definition; it does not execute
   a user-writable elevated script. The owner completes the one-time elevation.

9. Before a real audio or desktop-capture run, invoke:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup `
     -Action RunConsoleTransfer
   ```

   The RDP client disconnects. The command waits for the task's final result and fails if the
   transfer did not complete.

10. Run the deterministic host validation after the session becomes Console:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup `
     -Action ValidateHost -OutputPath ".aero\ow-a11y-host-setup-<timestamp>\validation.json"
   ```

   This captures a composed desktop frame and requires non-zero image variance, then plays a fixed
   tone into `CABLE Input`, records `CABLE Output`, and requires non-silent RMS and peak values.

11. Re-run `Probe` after every restart or manual setup step. Report:
   - installed versions and command paths;
   - persisted VB-CABLE render/capture endpoints and whether the current session exposes them;
   - personal evaluator script/profile presence and authentication check result;
   - Voice Access executable and process state;
   - session type (`Console`, `RDP`, or unknown);
   - which scenario groups are ready;
   - exact remaining setup or restart steps.

Do not treat package installation, a running process, or an output file alone as proof that
recording works. The first real scenario must still validate non-silent audio, image variance,
visible focus, and the applicable AT transcript or ETW evidence.
