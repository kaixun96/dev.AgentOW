# Durable run lifecycle

agentOW treats `.aero/<session>` as the continuity authority. The chat may be interrupted,
compacted, or continued after completion without being the only copy of run state.

## Files

- `run-state.json`: status, phase, revision, timestamps, artifact counts, and live timing summary.
- `request-history.ndjson`: exact initial request and later follow-ups.
- `lifecycle.ndjson`: initialized, interrupted, resumed, requirement-change, and completed events.
- `report-recovery.ndjson`: append-only supplement when the main report has an incomplete trailing
  record. Readers consume its union with `report.json` and deduplicate artifact IDs;
  reconciliation never truncates the report.
- `artifact-index.json`: content-hashed inventory rebuilt from files on disk.
- `checkpoints/revision-*/`: mutable plan/review/final artifacts saved before a revision.

`report.json` remains the machine-readable execution report. The artifact reconciler adds an
idempotent `artifact-reconciler` record for every discovered artifact. `progress.log` receives a
matching human-readable line with a stable artifact marker.

## Interruption and follow-up behavior

An unrelated message records interruption, is answered, and then resumes the prior phase. A
same-task requirement change checkpoints the current revision, increments the revision, and
restarts from understanding/planning. It does not reuse implementation/evaluation iteration paths.

The detached `progress-watcher.mjs` continuously reconciles artifacts. The main agent also invokes
reconciliation after every subagent return, before every user-visible status, and before durable
completion. This means evaluator screenshots remain indexed even if the conversation is steered
before the evaluator writes its final report event.

## Timing

`run-state.json.timing.summary` exposes wall-clock, active, interrupted, current-phase, and
per-phase durations in milliseconds. Active time excludes explicit user interruptions. Run
`node tools/run-state.mjs timing <sessionDir>` for the compact machine-readable summary. Durable
completion also writes a human-readable timing breakdown to `progress.log`.
