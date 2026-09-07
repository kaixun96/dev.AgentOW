# Recover an interactive Windows test session

Use this procedure before declaring that an already-provisioned evaluator needs manual RDP access.
It is an orchestration procedure for existing capabilities, not a new installer or a universal
Windows unlock script. On a Twin-managed host, Twin retains ownership of the controller, browser,
and native input. Other agents consume its evidence instead of competing for the desktop.

## What each component does

| Component | Responsibility | Not proof of readiness |
|---|---|---|
| Controller | Use Windows App in a visible Chromium with a dedicated persistent profile to establish or recover the target connection | Portal sign-in or a Connect click alone |
| Evaluator profile | Authenticate the application under test in its approved isolated browser profile | Authentication of the Windows App controller |
| User worker | Run in the expected user's interactive session and publish current readiness | A running process, Explorer presence, or an old heartbeat alone |
| Protected SYSTEM transfer task | Validate the intended active session and transfer it to Console | `tscon` exit code zero alone |
| Native test producer | Operate real AT and capture input, speech, focus, and required audio/video evidence | DOM/AX data or a log file's existence alone |

The controller must remain reachable through a non-RDP channel during handoff. Prefer an
independent controller when available; do not assume either that a second machine is always
required or that a co-located controller always survives. Verify the chosen control channel before
starting. Record environment-specific device bindings locally, never in the shared skill.

## Recovery sequence

1. Read fresh host readiness and the selected evaluator-profile contract. If the intended Console
   session is already active, unlocked, and healthy, leave it alone and proceed to native readiness
   checks. Do not reconnect an already-ready Console.
2. If disconnected or otherwise non-interactive, open the normal Windows App portal
   (`https://windows.cloud.microsoft/`) using the approved controller profile. Allow normal silent
   renewal of an existing sign-in. Inspect device details and match the actual machine identity to
   the expected evaluator host; display names are insufficient. Stop if the match is ambiguous.
3. Use the target's normal browser Connect/Reconnect flow. Disable redirection that the task does
   not need, including clipboard, files, printers, microphone, camera, and location. Do not grant
   extra permissions to make a test easier. Do not copy cookies, extract credentials, save
   passwords, or bypass authentication prompts.
4. Verify that the target user's real desktop became interactive. Require a fresh input-desktop
   result, no secure/authentication surface, and the expected user/session association. A browser
   showing the portal, a remote-session canvas, or a successful web login is insufficient. If
   Windows Hello, a password, MFA, a certificate decision, or consent is still required, notify the
   owner of that exact prompt and stop at it. Neither the worker nor bootstrap unlocks Windows.
5. Complete application authentication in the separately approved evaluator profile and start the
   existing user worker if needed. Discover the expected user's active RDP session using
   `qwinsta`/`quser` or the equivalent session API, then match it to the worker's actual session ID.
   Do not hard-code an ID, assume a token position in a disconnected-session row, or select a
   session solely because Explorer exists. Zero or multiple eligible matches forbid transfer.
6. Invoke only the existing, owner-approved protected Console transfer task through
   `RunConsoleTransfer`. The current task requires an active `rdp-sxs` session: restore that state
   first instead of repeatedly invoking an ineligible task or relaxing its guard.
7. Let the transfer finish. The controller's RDP client should report that another connection took
   over; do not manually disconnect or reconnect afterward. Reconnecting can move the target away
   from Console and recreate the failure. Inspect the result through the non-RDP control channel.
8. Require a heartbeat newer than the transfer, the correct Console user, the same worker/session,
   `sessionState=Active`, `inputDesktop=Default`, `consoleUnlocked=true`, `authenticated=true`, and
   no secure surface. Activate the intended browser through normal window APIs and verify its
   actual foreground PID/title/route before native input. Do not infer success from the activation
   call's return value.
9. Probe current audio endpoints and run `ValidateHost` for composed-desktop and non-silent
   loopback checks. RDP Remote Audio must not substitute for the required Console audio route.
   Only then start the selected AT. Verify real speech and the required recording in the first
   scenario; installed NVDA, a readiness flag, or a transcript alone does not prove audible output.

## One-time provisioning boundaries

- The user worker belongs to the specified test user: AtLogOn, InteractiveToken, Limited,
  IgnoreNew, and no execution-time limit for a long-running worker.
- The SYSTEM path is fixed and protected, accepts no arbitrary test commands, and runs neither
  the browser nor NVDA. The shipped task also prepares its fixed required audio services before
  session validation/transfer; inspect another deployment rather than assuming identical XML.
- Provisioning, elevation, driver installation, or security-policy changes require their existing
  approval flow. Do not register a new elevated task as an improvised recovery step.
- Do not kill LockApp/LogonUI, disable locking/security policies, or configure automatic login.
  A real authentication boundary can still require the owner; unattended recovery is not a
  guarantee of credential-free unlocking under every policy.

## Interpret readiness fields from their actual producer

The shipped worker assigns `legacyLockPresent = secureSurfacePresent`. Here it is a compatibility
alias for secure-surface state, not a mutex indicator. Another controller may use the same field
name for an unrelated lock; do not transfer that interpretation without inspecting its schema.

`lockAppProcessPresent` is diagnostic. LockApp may remain resident while the input desktop is
`Default` and the Console is unlocked. Likewise, `atReady` mostly reflects installed tools and
process compatibility, not the complete foreground/audio evidence gate.

## Report recovery honestly

Record the failure, the materially different route attempted, redacted target binding, transition
times, session match, and fresh verification results. Do not log credentials, auth query values,
or authentication-screen recordings. A past successful transfer is historical evidence, not proof
of today's state.

Before asking the owner to reconnect, attempt an available approved controller route and inspect
the exact remaining prompt or capability failure. Do not loop identical attempts, advertise a
missing capability without checking it, or turn an environment blocker into an AT PASS.

References: [Windows App](https://windows.cloud.microsoft/),
[Microsoft tscon documentation](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/tscon),
[NVDA user guide](https://download.nvaccess.org/documentation/userGuide.html).
