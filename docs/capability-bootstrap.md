# Session capability bootstrap

Every Claude or Copilot terminal session runs agentOW bootstrap once, before context routing, brainstorming, or planning. The bootstrap is non-interactive and writes `<sessionDir>/capabilities.json`.

## Invocation

Write the exact user request to `<sessionDir>/request.txt`, then run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/agentow-bootstrap.mjs" \
  --host claude \
  --session-dir "<sessionDir>" \
  --request-file "<sessionDir>/request.txt"
```

Use `--host copilot` in Copilot CLI. `/ow-doctor` may add `--force` to ignore the per-terminal-session cache. Tests use `--probe-only`, which never installs or edits settings.

## First-run identity

The script identifies both the terminal session and the current Claude/Copilot host process. The installation-cache key prefers `AGENTOW_SESSION_ID`, `CLAUDE_SESSION_ID`, `COPILOT_SESSION_ID`, or `TERM_SESSION_ID`, then falls back to the nearest host PID plus process start time. The marker is stored under `~/.cache/agentow/bootstrap-sessions/`.

Each agentOW run still gets its own `capabilities.json`; only installation attempts are cached. A new terminal/CLI process runs bootstrap again.
If the current host installed a plugin or enabled Agent Teams, its marker records that host PID/start-time as `pendingRestart`; every retry in that same host process returns exit code 20. A real Claude/Copilot restart changes the host key, clears the pending condition, and re-probes the installed capability.
Partial failures store `bootstrapComplete: false` independently from `pendingRestart`, so successful installs still require a restart while failed baseline actions are retried on the next invocation.

## Automatic installation

Only fixed packages from the trusted local marketplace `/workspaces/odsp-web/.ai` are installed:

| Capability | Install policy |
|---|---|
| `playwright-mcp-servers` | Baseline |
| `odsp-web-mcp-servers-opt-out` | Baseline |
| `code-review-tools` | Baseline |
| `odsp-web-mcp-servers-opt-in` (Figma, ADO, Bluebird, Learn) | When the request references those sources |
| `sharp`, `pngjs`, `pixelmatch` | For UI/visual tasks |
| Azure DevOps CLI extension | Only for ADO-signaled tasks, when `az` exists and the extension is missing |
| Claude Agent Teams flag | Written to `~/.claude/settings.json` when safely parseable |
| Disabled Copilot baseline/task plugin | Re-enabled in `~/.copilot/settings.json`; restart required |

Plugin installation uses:

```text
<host> plugin marketplace add /workspaces/odsp-web/.ai
<host> plugin install <plugin>@odsp-web-plugins
```

Never install from a URL supplied by the user or from an untrusted marketplace. Never run login commands, approve consent, or capture credentials.
Never store tool arguments, tokens, cookies, identities, or credential contents in bootstrap artifacts.
If Claude settings are managed through a symlink, the bootstrap atomically updates the resolved target and preserves the symlink.

## Manual or restart-only requirements

The bootstrap reports but cannot safely complete:

- restarting Claude/Copilot so newly installed MCP servers load;
- Claude auto-accept mode;
- `copilot auth`, Figma OAuth, AAD consent;
- Azure authentication: explicitly tell the user to run `CODESPACES=false az login` in the current Codespace terminal, then rerun `/ow-init` or the original agentOW command;
- first Playwright browser login or expired cookies;
- tenant/site/fixture eligibility and seeded test data;
- context-repository push permission.

If a newly installed capability is required for the current request, the run stops before planning with `overall: "restart-required"`. The next invocation after restart re-probes and continues.

## Capability manifest

`capabilities.json` contains:

```json
{
  "schemaVersion": 1,
  "generatedAt": "<ISO>",
  "host": "claude|copilot",
  "sessionKey": "<sha256 prefix>",
  "firstRunInTerminalSession": true,
  "taskSignals": {
    "ui": false,
    "figma": false,
    "ado": false,
    "optIn": false,
    "killswitch": false
  },
  "overall": "ready|ready-with-fallbacks|setup-required|restart-required|blocked",
  "restartRequired": false,
  "capabilities": [
    {
      "id": "browser.playwright-mcp",
      "role": "required|fallback|optional",
      "status": "available|installed-restart-required|missing|misconfigured|unknown|not-applicable",
      "redactedEvidence": "No tokens, cookies, tenant IDs, or credential contents",
      "fallbackIds": ["browser.fic-heft"],
      "blocksPlanning": false,
      "remediation": "Restart Copilot CLI"
    }
  ],
  "actions": []
}
```

Canonical capability groups:

- `core.source-repo`, `core.rush-node-tmux`
- `host.claude-agent-teams`, `host.claude-auto-accept`, `host.copilot-auth`
- `browser.playwright-mcp`, `browser.fic-heft`, `fixture.playwright-profile`, `fixture.tenant-site`
- `design.figma`
- `odsp.mcp-opt-out`, `odsp.mcp-opt-in`
- `ado.cli`, `ado.azure-devops-extension`, `ado.auth`
- `review.code-review-tools`, `review.superpowers`
- `visual.image-diff-deps`
- `context.library`, `context.git-permissions`

Unknown availability is not the same as missing. Optional capabilities and capabilities with a viable fallback never block planning.
