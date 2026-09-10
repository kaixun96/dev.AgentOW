# Shared A11y capability consumption

AgentOW retains its own workflow. It may consume independently installed
capabilities from [dev.A11yAssist](https://github.com/kaixun96/dev.A11yAssist)
without routing its entrypoint through that repository's optional full workflow.

## One maintained evidence-validator implementation

The canonical validator source is `runtime/evidence-v1.mjs` in dev.A11yAssist.
AgentOW's `tools/validate-a11y-evidence.mjs` and its packaged mirror are generated
copies pinned by `a11y-capabilities.lock.json` in this plugin.

The original CLI, module exports, artifact shape and verdict semantics are
preserved. Existing evaluator calls continue to work offline, with no runtime
network fetch or additional plugin installation. Include the lock's source
commit/version identity in the run's knowledge manifest.

Do not hand-edit either mirror. In an AgentOW source checkout, update through:

```powershell
node ts/scripts/sync-a11y-capabilities.mjs --update <reviewed-source-commit>
npm --prefix ts run validate-a11y
```

The updater downloads only the fixed repository at an exact commit, verifies
the export and source hashes, and generates both copies. Build validation
rejects drift. Publish a new plugin version through review; existing running
sessions remain on their recorded version.

## Optional direct MCP calls

When the user installs a small capability in the SAME Copilot session, its
advertised MCP tools can be called at the appropriate place in AgentOW's own
workflow. Verify actual tool availability; do not invent a plugin path or claim
an installation changed a currently running session.

- `a11y_validate_evidence`: structural evidence-v1 checking from request/result
  paths, plus baseline paths and repository root for verify. No provider
  configuration or global workflow run is needed.
- `a11y_capture_invoke`: one caller-requested capture through an authorized
  Windows connection, with stable operationId and scenario/evaluator/build context.
- `a11y_publish_invoke`: one caller-authorized Draft publication through an
  authorized connection. Do not create a competing PR writer.

The structural checker does not inspect media, verify every evidence URI's
bytes or replace independent behavior evaluation. Direct calls do not waive
AgentOW's existing phase/evidence policy, the dispatcher's stricter restrictions,
or resource ownership. A tool installed in a Codespace does not grant DevBox
control.

Keep one operation ID for unknown/pending calls and reconcile it. The caller
decides sequencing and the next action. Never recursively invoke a second full
workflow from an active AgentOW source phase.
