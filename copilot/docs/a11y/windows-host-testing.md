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
3. Select only the AT required by the bug. Never run NVDA and Narrator simultaneously.
4. Check the required commands, devices, language packs, elevation, browser login, and evidence
   output directory before launching AT.

## Safe scriptable installation

Install a missing dependency only when the selected scenario needs it:

```powershell
winget install --id NVAccess.NVDA --exact --accept-package-agreements --accept-source-agreements
winget install --id Gyan.FFmpeg --exact --accept-package-agreements --accept-source-agreements
powershell.exe -NoProfile -Command "Install-Module AudioDeviceCmdlets -Scope CurrentUser -Force -Confirm:`$false"
```

Re-run the preflight after installation. A successful installer exit is not proof that the AT,
driver, audio endpoint, language model, console session, or evidence capture works.

Do not automate installation of VB-CABLE, a Voice Access language model, Windows Performance
Analyzer, or anything that needs an administrator/security/consent prompt or restart. Report the
exact missing prerequisite and wait for the required user action when that route is necessary.

## Route selection

| Scenario | Procedure | Required proof |
|---|---|---|
| General keyboard, browser, or WCAG | Run the canonical scenario directly with real OS input and the available browser tooling | Evidence required by `evidence-contract.md` |
| NVDA speech | Launch NVDA for the canonical scenario and capture Speech Viewer output | NVDA transcript, screenshot, focused element/UIA state |
| Narrator-specific behavior | Stop NVDA, collect Narrator/UIAutomationCore/Speech-TTS ETW from an elevated Windows session | Narrator ETL, screenshot, UIA state |
| Voice Access | Signed VB-CABLE, FFmpeg, AudioDeviceCmdlets, installed language model, and a persistent Windows console-session harness | Result JSON, non-silent captured audio, capture state, complete overlay map, screenshot |

The Voice Access route is unavailable over ordinary RDP audio. Do not invoke `tscon`, disconnect a
session, install a driver, accept elevation, or restart Windows without explicit authorization.

## Failure and cleanup

- Missing prerequisites are `blocked`; unsupported host tests are `skipped-environment`.
- Accessibility-tree, axe, and source checks remain supporting evidence and never replace real AT.
- Preserve the command/version inventory and all declared evidence hashes.
- Stop every AT process, trace, recorder, and temporary audio route started by the run, including on
  error paths. Confirm cleanup before completing the item.
