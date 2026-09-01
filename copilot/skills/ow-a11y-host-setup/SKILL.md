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

1. Confirm the current host is Windows. Otherwise stop and report that this setup must run on the
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

5. If the capability report does not contain both a VB-CABLE render endpoint (`CABLE Input`) and
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

6. If Voice Access has not completed first-run language setup, open it:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File $setup `
     -Action OpenVoiceAccess -OutputPath $capabilities
   ```

   The owner selects the required language and completes **Agree and continue**. The probe records
   the current language, first-run completion, consent, and model-update markers. A real Voice
   Access scenario must still prove recognition and captured audio.

7. Re-run `Probe` after every restart or manual setup step. Report:
   - installed versions and command paths;
   - persisted VB-CABLE render/capture endpoints and whether the current session exposes them;
   - Voice Access executable and process state;
   - session type (`Console`, `RDP`, or unknown);
   - which scenario groups are ready;
   - exact remaining setup or restart steps.

Do not treat package installation, a running process, or an output file alone as proof that
recording works. The first real scenario must still validate non-silent audio, image variance,
visible focus, and the applicable AT transcript or ETW evidence.
