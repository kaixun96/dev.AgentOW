---
name: ow-doctor
description: "Check and repair agentOW prerequisites. Use for doctor, setup, missing MCP, Playwright MCP, Figma MCP, agentOW prerequisites, or bootstrap problems."
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
