# Windows host Accessibility testing

Use this procedure only when `/agentow-a11y` is running directly on an independently controlled
Windows host. A Codespace must not run these installation or assistive-technology commands; it
either consumes external evidence or records the applicable test as `skipped-environment`.
A Twin-managed DevBox is also excluded: Twinbot retains exclusive control of its browsers and real
AT, and agentOW consumes the resulting evidence through the Twin bridge.

This guide contains the complete host setup and routing contract needed by `/agentow-a11y`. The
setup below incorporates Jimu team guidance and the ADO `odsp-automation-test-tool`
`skills/a11y-test` procedures. The workflow does not require or invoke an external test skill.

## Preflight

1. Confirm the current host is Windows and record whether the session is `Console` or RDP.
2. Confirm Microsoft Edge and the commands required by the selected procedure are available.
   For authenticated SharePoint browser evidence, install and check the dedicated personal evaluator
   profile through `/ow-a11y-host-setup`; never copy a normal Edge/Chrome cookie database.
3. Select only the AT required by the bug. Never run NVDA and Narrator simultaneously.
4. Check the required commands, devices, language packs, elevation, browser login, and evidence
   output directory before launching AT.
5. For unattended recording, verify the machine's one-time setup: signed VB-CABLE endpoints,
   configured NVDA or Narrator, Python GDI/MSS and WASAPI/PyAudioWPatch capture dependencies, and
   an owner-approved elevated scheduled task that starts audio services and transfers a disconnected
   RDP session to the Hyper-V console. Do not create or modify that task during a test run.

## Safe scriptable installation

Use `/ow-a11y-host-setup` for one-time Windows evaluator provisioning. It installs the scriptable
dependencies and dedicated personal evaluator browser, stages the pinned signed VB-CABLE package,
opens the vendor installer, opens Voice Access first-run setup, and writes a capability report.

Install a missing dependency only when the selected scenario needs it:

```powershell
winget install --id NVAccess.NVDA --exact --accept-package-agreements --accept-source-agreements
winget install --id Gyan.FFmpeg --exact --accept-package-agreements --accept-source-agreements
powershell.exe -NoProfile -Command "Install-Module AudioDeviceCmdlets -Scope CurrentUser -Force -Confirm:`$false"
```

Re-run the preflight after installation. A successful installer exit is not proof that the AT,
driver, audio endpoint, language model, console session, or evidence capture works.

Do not automate installation of VB-CABLE, a Voice Access language model, Windows Performance
Analyzer, or other one-time prerequisites during an Accessibility test run. Complete those host
steps through `/ow-a11y-host-setup`, restart Windows when the VB-CABLE installer requires it, and
rerun the capability probe before collecting evidence.

## Unattended screen-reader recording

After the one-time machine setup passes preflight, an NVDA or Narrator recording may run without
human interaction:

1. Start and configure only the requested screen reader, then drive Microsoft Edge through Windows
   UI Automation and real OS input.
2. Keep the desktop rendered after RDP disconnect by invoking the pre-provisioned elevated task that
   transfers the session to the Hyper-V console. Do not use ordinary disconnected RDP or invoke
   `tscon` directly from an unelevated run.
3. Capture the composed desktop with GDI/MSS and crop frames to the browser bounds.
   Browser-only capture is insufficient because it can omit Narrator's blue focus overlay.
4. Route screen-reader speech through persistent VB-CABLE endpoints and record it through
   WASAPI/PyAudioWPatch. Never use RDP Remote Audio as proof.
5. Detect speech onset, then wait for at least 1.2 seconds of continuous silence before advancing
   focus. Fixed delays alone are not a valid synchronization strategy.
6. Encode the cropped browser video and speech as MP4. Validate duration, frame dimensions,
   image variance, audio RMS and peak, and an extracted frame showing visible focus.

Fail explicitly if the browser, expected speech, audio endpoint, console renderer, focus frame, or
any media-quality check is unavailable. An MP4 file's existence alone is not evidence.

## Route selection

| Scenario | Procedure | Required proof |
|---|---|---|
| General keyboard, browser, or WCAG | Run the canonical scenario directly with real OS input and the available browser tooling | Evidence required by `evidence-contract.md` |
| NVDA speech | Launch NVDA for the canonical scenario and capture Speech Viewer output | NVDA transcript, screenshot, focused element/UIA state |
| Narrator-specific behavior | Stop NVDA, collect Narrator/UIAutomationCore/Speech-TTS ETW from an elevated Windows session | Narrator ETL, screenshot, UIA state |
| Unattended NVDA or Narrator recording | Use the configured console-session, desktop-capture, and persistent-audio procedure above | Validated MP4 with real speech, visible focus, quality metrics, and the AT-specific transcript or ETL evidence |
| Voice Access | Signed VB-CABLE, FFmpeg, AudioDeviceCmdlets, installed language model, and a persistent Windows console-session harness | Result JSON, non-silent captured audio, capture state, complete overlay map, screenshot |

The Voice Access route is unavailable over ordinary RDP audio. Do not invoke `tscon`, disconnect a
session, install a driver, accept elevation, or restart Windows without explicit authorization.

## Failure and cleanup

- Missing prerequisites are `blocked`; unsupported host tests are `skipped-environment`.
- Accessibility-tree, axe, and source checks remain supporting evidence and never replace real AT.
- Preserve the command/version inventory, recording quality metrics, extracted focus frame, and all
  declared evidence hashes.
- Stop every AT process, trace, recorder, and temporary audio route started by the run, including on
  error paths. Confirm cleanup before completing the item.
