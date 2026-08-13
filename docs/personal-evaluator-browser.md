# Personal-account evaluator browser

This runbook configures a Windows-hosted Agent or Twinbot to capture long-running
SharePoint UI evidence with the owner's compliant Microsoft work identity,
without FIC and without depending on an active RDP desktop.

Use this route when the agent runs on the same Windows Devbox as the profile.
A remote Linux Codespace cannot read the Devbox profile; it should use the
repository Playwright/Heft FIC route instead.

## What this creates

- A Playwright-owned persistent Chromium profile:
  `%USERPROFILE%\.playwright\personal-evaluator-profile`
- Microsoft's official **Microsoft Single Sign On** Chrome extension:
  `ppnbnpeolgkicgegkbkbjmhlideopiji`
- Internal `page.screenshot()` capture that continues after RDP disconnects
- A `bootstrap` / `check` lifecycle so the agent asks for owner interaction only
  when Conditional Access explicitly requires it

The tool never copies the normal Edge Cookie DB and never stores a password,
PIN, MFA response, or certificate.

## Prerequisites

Run on the Windows machine that is registered/compliant for the owner's work
account:

```powershell
python --version
pip install playwright
playwright install chromium
```

Copy `tools\personal-evaluator-browser.py` from this repository to a stable,
owner-controlled location. The examples below assume:

```powershell
$Evaluator = "C:\agent-tools\personal-evaluator-browser.py"
```

## 1. Configure the owner and target

Set these environment variables for the Twin/Agent service account. Put them in
the service launcher or its private machine-local configuration; do not commit a
real email address or profile directory to a shared repository.

```powershell
$env:PERSONAL_EVALUATOR_OWNER_EMAIL = "owner@contoso.com"
$env:PERSONAL_EVALUATOR_PROFILE_DIR =
  "$env:USERPROFILE\.playwright\personal-evaluator-profile"

# ODSP Campaign evaluator defaults. Override for another tenant/route.
$env:PERSONAL_EVALUATOR_CAMPAIGN_ROUTE =
  "https://<tenant>.sharepoint.com/_layouts/15/sharepoint.aspx/publish/campaigns"
$env:PERSONAL_EVALUATOR_CAMPAIGN_FLIGHTS =
  "61636,62501,62142,62520,62626,1535"
```

The script defaults to the SharePoint dogfood Campaign route when these ODSP
variables are omitted. `PERSONAL_EVALUATOR_AUTHENTICATED_SELECTOR` may override
the app-shell selector for another SharePoint surface.

## 2. Bootstrap the profile once

Connect to the Devbox desktop for this step, then run:

```powershell
python $Evaluator bootstrap --timeout-minutes 30
```

The script downloads the official Web Store CRX, verifies that its public key
derives the expected Microsoft extension ID, and sideloads it into the dedicated
profile. The extension talks to Windows BrowserCore so Conditional Access sees
the compliant device.

Usually Windows SSO completes automatically. If the browser explicitly asks:

1. Confirm the displayed owner email.
2. Complete the shown password, Windows Hello, MFA, certificate, or consent
   prompt.
3. Do not close the browser manually. The command exits after the authenticated
   SharePoint shell loads and the profile is persisted.

The agent may click ordinary **Sign in**, account-selection, **Continue**, and
**Stay signed in** controls. It must not type or store passwords/PINs, approve
MFA, or accept consent on the owner's behalf.

## 3. Health-check before every evaluator run

```powershell
python $Evaluator check
```

Expected success:

```json
{"action":"check","state":"authenticated", ...}
```

Cookie dates are not a hard run limit. BrowserCore normally renews them silently
while the Windows device remains compliant. If `check` reports `needs-user`,
launch `bootstrap` and tell the owner the exact prompt shown. Do not ask them to
"log in again" without naming whether it is password, Windows Hello, MFA, or
consent.

## 4. Capture target versus PR

For the included ODSP Campaign evaluator:

```powershell
python $Evaluator capture-campaign `
  --pr-asset-root `
    "https://odspwebcidev.z13.web.core.windows.net/odsp-web-pr_<PR>.<BUILD>/" `
  --output-dir "C:\evidence\pr-<PR>"
```

The command:

1. Clears `srr` and captures **BEFORE** from target/current deployed.
2. Sets the ODSP-Next PR `srr` root and captures **AFTER**.
3. Uses the authentic **Create a campaign** trigger.
4. Keeps the same flights, route, viewport, fixture, and UI state.
5. Saves full-viewport PNGs, drawer crops, and `metrics.json`.
6. Clears `srr` in `finally`, including after failures.

Do not define BEFORE/AFTER as flight OFF/ON unless the change itself introduces
that flight and OFF is exactly the pre-change implementation.

## 5. Twinbot configuration

Add this owner-specific overlay to the Twinbot's
`custom-main-prompt.md` (or use its supported custom-prompt API):

```markdown
## Visual evaluator preference

For UI screenshot validation:

1. Run `C:\agent-tools\personal-evaluator-browser.py check` first.
2. When authenticated, use the persistent personal profile and internal
   `page.screenshot()` capture.
3. BEFORE is target/current; AFTER is the changed build. Keep all runtime flags,
   fixture, viewport, route, trigger, and state identical.
4. If silent renewal fails, run `bootstrap`. Ask the owner only for an explicit
   password, Windows Hello, MFA, or consent prompt.
5. If this host cannot reach the Windows profile, use repository Playwright/Heft
   with FIC as fallback. Host unreachability is not a product failure.
```

Restart the bot's Copilot process after changing a versioned prompt. A
data-backed custom overlay applies to newly composed sessions without rebuilding
the Twin binary.

## 6. AgentOW dispatcher contract

When dispatching the evaluator, provide:

- `personalEvaluatorScript`: absolute path on the Windows host, or
- `personalEvaluatorEvidence`: validated screenshot/metrics artifact paths

The evaluator must prefer that route only when reachable. A standalone
Codespace records `personal-route: not-reachable-from-host` and immediately uses
FIC:

1. repo Playwright/Heft + local `rush start`
2. PR CDN FIC only for a proven route-specific local failure

Use `visualValidation.source=personal-persistent-profile` for personal-profile
evidence. Full-viewport BEFORE/AFTER screenshots remain mandatory; component
crops are supplemental.

## Security and cleanup

- Never commit, zip, sync, or attach the profile directory.
- Restrict its ACL to the Windows service/owner account.
- Never copy normal Edge/Chrome Cookie databases.
- Never print cookies, tokens, account IDs, or raw tenant IDs in logs.
- Always clear build-selector cookies such as `srr` in `finally`.
- Delete only the dedicated evaluator profile when intentionally resetting auth.

Reset command:

```powershell
Remove-Item -Recurse -Force `
  "$env:USERPROFILE\.playwright\personal-evaluator-profile"
python $Evaluator bootstrap
```

## Troubleshooting

| Symptom | Meaning | Action |
|---|---|---|
| `You can't get there from here` | Windows Accounts extension/BrowserCore is absent | Use this script; do not sign into Chrome Web Store |
| Password/Hello/MFA page | Silent renewal reached an interactive CA boundary | Tell the owner the exact prompt |
| Works while RDP connected, screenshots fail after disconnect | OS-level screenshot path was used | Use Playwright `page.screenshot()`, not Snipping Tool/ShareX |
| `profile is already in use` | Another evaluator/bootstrap owns the profile | Wait or close only the dedicated evaluator browser |
| `ERR_ABORTED` after setting `srr` | ODSP-Next replaced the navigation | Treat as expected and wait for the app-shell discriminator |
| Codespace cannot find profile | Expected host boundary | Fall back to FIC; do not copy the profile |

## Proven reference

This design was validated on a disconnected Windows Devbox:

- BrowserCore silently authenticated the owner's compliant account.
- Headless `check` succeeded after the headed bootstrap exited.
- Target/current and PR ODSP-Next captures completed without FIC/TRIPS.
- The PR build selector was cleared after capture.
