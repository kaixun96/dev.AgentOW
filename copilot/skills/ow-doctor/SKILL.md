---
name: ow-doctor
description: "Diagnose and repair agentOW prerequisite problems. Use for ow-doctor, doctor, troubleshooting, broken FIC Playwright, missing MCP, broken Figma MCP, or bootstrap failures."
---

# agentOW doctor

Read `${CLAUDE_PLUGIN_ROOT}/docs/capability-bootstrap.md`.

Create a temporary session folder, save the intended task text to `request.txt`, and run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/agentow-bootstrap.mjs" \
  --host copilot \
  --session-dir "<doctorDir>" \
  --request-file "<doctorDir>/request.txt" \
  --force
```

Report installed items, restart requirements, authentication/manual setup, fallbacks, and remaining blockers from `capabilities.json`. Never expose secrets or credential contents.
If `ado.auth` is unavailable, explicitly tell the user to run `CODESPACES=false az login` in the current Codespace terminal and then rerun `/ow-doctor`.
