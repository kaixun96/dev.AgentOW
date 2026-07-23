---
name: ow-init
description: "Initialize agentOW prerequisites once. Use for ow-init, initialize agentOW, first-time setup, install MCP prerequisites, or prepare agentOW."
---

# Initialize agentOW

Read `${CLAUDE_PLUGIN_ROOT}/docs/capability-bootstrap.md`.

This command performs setup only. Do not start planning, edit product code, or create a PR.

1. Create `.aero/ow-init-<timestamp>/`.
2. Write this fixed capability seed to `request.txt`:

   ```text
   Initialize agentOW for UI screenshots, Figma designs, Azure DevOps work items, a killswitch, and code review.
   ```

3. Run one forced comprehensive bootstrap:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/tools/agentow-bootstrap.mjs" \
     --host copilot \
     --session-dir ".aero/ow-init-<timestamp>" \
     --request-file ".aero/ow-init-<timestamp>/request.txt" \
     --force
   ```

4. Read `capabilities.json` and report:
   - installed or re-enabled trusted prerequisites;
   - whether Copilot CLI must be restarted;
   - authentication, OAuth, consent, browser-login, or fixture steps that remain manual;
   - any required capability with no viable fallback.

If `ado.auth` is unavailable, explicitly tell the user: run `CODESPACES=false az login` in the current Codespace terminal, then rerun `/ow-init`.

Exit code `20` means initialization succeeded but Copilot CLI must be restarted. Never expose secrets, identities, or credential contents.
