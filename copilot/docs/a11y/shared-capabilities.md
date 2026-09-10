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

The v0.7 shared source also provides the single-read file loader used by its
CLI and direct checker. Baseline parsing and hashing use the same bytes.
The mirrored CLI remains structural-only; local artifact hashing is available
through the explicitly selected small-plugin tool below, not an invented CLI flag.

Do not hand-edit either mirror. In an AgentOW source checkout, update through:

```powershell
node ts/scripts/sync-a11y-capabilities.mjs --update <reviewed-source-commit>
npm --prefix ts run validate-a11y
```

The updater downloads only the fixed repository at an exact commit, verifies
the export and source hashes, and generates both copies. Build validation
rejects drift. Publish a new plugin version through review; existing running
sessions remain on their recorded version.

## Shared execution sources

Windows host setup, the retained personal-browser profile, ADO attachment writes
and description budgeting now have one maintained source in dev.A11yAssist.
`a11y-execution.lock.json` pins their exact source commit and hashes. Update with
`node ts/scripts/sync-a11y-capabilities.mjs --update-execution <reviewed-commit>`;
the normal A11y validation rejects drift, including generated Python/PowerShell.

`PrAttach` now only supplies the existing project, authentication and logging.
The shared implementation verifies the active Draft and source HEAD before
upload, checks downloaded attachment bytes, updates only the description and
confirms live Draft/HEAD/description afterward. The existing input/result API and
description budget markers remain. An optional `expectedHead` binds the caller's
evidence commit; supply it when available. There is no automatic mutation retry.

These are source changes, not a live plugin/worker cutover. The retained browser
script is still the AgentOW campaign compatibility scenario, not a generic AT
recorder. Resource ownership/recovery, real AT handlers and independent media
evaluation remain deployment responsibilities.

## Optional direct MCP calls

When the user installs a small capability in the SAME Copilot session, its
advertised MCP tools can be called at the appropriate place in AgentOW's own
workflow. Verify actual tool availability; do not invent a plugin path or claim
an installation changed a currently running session.

- `a11y_validate_evidence`: structural evidence-v1 checking from request/result
  paths, plus baseline paths and repository root for verify. No provider
  configuration or global workflow run is needed. With A11yAssist v0.7, explicit
  `artifactRoot` (and `baselineArtifactRoot` for verify) additionally hashes all
  root-relative local evidence files using the same shared artifact verifier.
- `a11y_capture_invoke`: one caller-requested capture through an authorized
  Windows connection, with stable operationId and scenario/evaluator/build context.
- `a11y_publish_invoke`: one caller-authorized Draft publication through an
  authorized connection. Do not create a competing PR writer.

Without those roots the checker does not verify evidence URI bytes. The opt-in
requires local relative URIs and rejects missing/changed/escaping files or
remote schemes; it never downloads a URI or silently falls back. Even successful
byte checks do not prove runtime/AT/media provenance or independently interpreted
behavior. Direct calls do not waive
AgentOW's existing phase/evidence policy, the dispatcher's stricter restrictions,
or resource ownership. A tool installed in a Codespace does not grant DevBox
control.

Keep one operation ID for unknown/pending calls and reconcile it. The caller
decides sequencing and the next action. Never recursively invoke a second full
workflow from an active AgentOW source phase.
