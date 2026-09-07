---
name: ow-a11y-host-setup
description: "Prepare or recover a Windows evaluator host for agentOW Accessibility testing. Uses an approved Windows App controller to restore a disconnected session before Console handoff, installs missing scriptable dependencies, and checks real desktop/audio readiness. Use for ow-a11y-host-setup, configure A11Y host, recover disconnected DevBox, install VB-CABLE, configure Voice Access, or prepare Windows AT."
---

# Prepare a Windows Accessibility evaluator host

This command performs one-time host setup or recovery of an already-provisioned session. It does not run an Accessibility test, modify
product code, create a branch, or create a pull request.

For a disconnected, locked, or non-interactive desktop, read
`references/unattended-session-recovery.md` before asking the owner to reconnect. Missing Windows
App connection recovery is not proof that every run requires manual desktop access. The controller
restores the connection; the worker, bootstrap, and `tscon` do not unlock Windows.

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

   If prerequisites are already installed but the session is unavailable, use the recovery procedure
   rather than repeating installation or sending native input to a locked desktop. Only genuine
   authentication, consent, or one-time provisioning requirements require owner intervention.

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

   Voice Access is agent-controlled after first-run setup. Disable automatic startup before any
   non-Voice-Access AT run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup `
    -Action DisableVoiceAccessAutoStart
   ```

   This preserves other Accessibility startup entries, removes only `voiceaccess`, sets its
   `RunningState` to 0, and stops only the discovered Voice Access process IDs. `OpenVoiceAccess`
   explicitly sets `RunningState` to 1 when a Voice Access scenario needs it.

8. Install the persistent user worker and one-time Console transfer task when real AT, unattended
   recording, or Voice Access evidence is required:

   ```powershell
   $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$setup`" -Action InstallSessionAutomation"
   Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList $arguments
   ```

   This creates an `AtLogOn + Interactive + Limited` user worker with unlimited execution time and
   a `SYSTEM + ServiceAccount + Highest` transfer task. Both scripts are embedded in their protected
   task definitions. The worker prevents idle display/system sleep and publishes a five-second
   readiness heartbeat; the SYSTEM task dynamically selects exactly one
   `<expected user> + Active + rdp-sxs*` session. It never hard-codes a session ID or treats
   `tscon` exit 0 as sufficient proof. The owner completes the one-time elevation.
   `-Action InstallConsoleTransferTask` remains a compatibility alias for this same installation.

9. Establish or recover an interactive session using the approved controller and visible Chromium
   Windows App profile. Match the selected device's actual machine identity to the expected host;
   do not guess from its display name. Use existing sign-in state and normal Connect/Reconnect.
   Disable unnecessary clipboard, file, printer, microphone, camera, and location redirection.
   Follow `references/unattended-session-recovery.md`; stop for explicit password, Windows Hello,
   MFA, certificate, or consent prompts rather than bypassing them.

   Once the remote connection owns an authenticated `rdp-sxs` desktop, bootstrap the user worker
   if its fresh readiness heartbeat does not already satisfy this step:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup `
    -Action RunSessionBootstrap
   ```

   Password, MFA, Windows Hello, and consent surfaces require owner action. Otherwise bootstrap must
   complete automatically. It requires a fresh heartbeat with `authenticated=true` and
   `atReady=true`. Portal sign-in alone is not proof that the Windows desktop or the selected
   evaluator profile is authenticated. Match the expected user and actual active RDP session to
   the worker's session ID before transfer.

10. Before a real-AT, audio, or desktop-capture run, invoke:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup `
     -Action RunConsoleTransfer
   ```

   Use only the provisioned, owner-approved transfer task; never construct an ad hoc elevated
   command or broaden its allowed session selection during a test. A disconnected session must
   first pass connection recovery in step 9; the task intentionally requires active RDP.

   The RDP client disconnects and must not reconnect. The SYSTEM task waits for a heartbeat newer
   than the transfer and requires `consoleUnlocked=true`, `atReady=true`, `authenticated=true`, and
   `legacyLockPresent=false`. For screen-reader runs, stop Voice Access first; its presence makes
   `atReady=false`. A missing user, ambiguous session, `No User exists for *`, stale
   heartbeat, inaccessible input desktop, secure surface, or task exit failure makes the host
   unavailable; do not start NVDA or use lock-screen output as evidence. Verify the outcome over a
   non-RDP control channel, not by reconnecting to inspect it. A later RDP connection/disconnection
   invalidates the old readiness result and requires the recovery sequence again.

   A resident LockApp process alone does not establish that the desktop is locked. In this worker,
   `legacyLockPresent` aliases `secureSurfacePresent`; it is not a task-mutex flag. Other producers
   may define that field differently, so inspect their contract rather than importing its meaning.

11. Inspect readiness directly when diagnosing the session:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup `
     -Action GetSessionReadiness -OutputPath ".aero\ow-a11y-host-setup-<timestamp>\readiness.json"
   ```

12. Run the deterministic host validation after the verified readiness heartbeat:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup `
     -Action ValidateHost -OutputPath ".aero\ow-a11y-host-setup-<timestamp>\validation.json"
   ```

   This captures a composed desktop frame and requires non-zero image variance, then plays a fixed
   tone into `CABLE Input`, records `CABLE Output`, and requires non-silent RMS and peak values.

13. Re-run `Probe` after every restart or manual setup step. Report:
   - installed versions and command paths;
   - persisted VB-CABLE render/capture endpoints and whether the current session exposes them;
   - personal evaluator script/profile presence and authentication check result;
   - Voice Access executable and process state;
   - session type and fresh worker readiness fields;
   - which scenario groups are ready;
   - exact remaining setup or restart steps.

Do not treat package installation, a running process, or an output file alone as proof that
recording works. The first real scenario must still validate non-silent audio, image variance,
visible focus, and the applicable AT transcript or ETW evidence.

For screen-reader evidence, correlate native input with actual NVDA `Speaking` output and the
correct browser foreground/route. When audio/video proof is required, preserve continuous desktop
capture and real speech audio; a debug log alone does not prove audio was played. DOM/UIA evidence
can corroborate focus, but never substitute for a screen-reader result.
