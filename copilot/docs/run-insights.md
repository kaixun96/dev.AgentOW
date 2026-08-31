# Run insights

AgentOW can turn the durable `.aero/<session>` state into a privacy-filtered operational report.
The report is local by default. Nothing is shared without a direct user response recorded for the
current report digest.

## What is collected

- wall, active, interrupted, and per-phase duration;
- workflow profile, revision count, cycle counts, outcome, and whether a Draft PR was created;
- explicitly recorded blocker category, phase, duration, attempts, resolution type, and whether a
  person intervened;
- deterministic improvement signals derived from those fields.

The shareable report excludes request text, source code, raw logs, artifact paths, URLs, tenant
identifiers, user identity, and user-authored free text. The shareable report uses normalized
category, strategy, outcome, and resolution labels; detailed local lifecycle prose is never copied.

## Record blockers

Use a unique blocker ID for the run. Record each recovery attempt instead of summarizing several
attempts after the fact.

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/run-state.mjs" event "<sessionDir>" \
  --type blocker-opened \
  --blocker-id evaluator-auth-1 \
  --category auth \
  --summary "Fresh evaluator credential was rejected" \
  --human-intervention false \
  --event-id blocker-evaluator-auth-1-open

node "${CLAUDE_PLUGIN_ROOT}/tools/run-state.mjs" event "<sessionDir>" \
  --type blocker-attempted \
  --blocker-id evaluator-auth-1 \
  --strategy "Refresh the delegated evaluator credential" \
  --strategy-kind credential-refresh \
  --outcome succeeded \
  --automated true \
  --event-id blocker-evaluator-auth-1-attempt-1

node "${CLAUDE_PLUGIN_ROOT}/tools/run-state.mjs" event "<sessionDir>" \
  --type blocker-resolved \
  --blocker-id evaluator-auth-1 \
  --resolution "Refreshed the delegated credential and retried the same route" \
  --resolution-kind credential-refresh \
  --automated true \
  --event-id blocker-evaluator-auth-1-resolved
```

Supported categories are `auth`, `build`, `dependency`, `environment`, `evaluation`, `network`,
`requirements`, `review`, `source`, `test`, `tooling`, and `other`. Use `blocker-abandoned` instead
of `blocker-resolved` when the run ships with or stops on the blocker.

## Build and preview

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/run-insights.mjs" build "<sessionDir>"
node "${CLAUDE_PLUGIN_ROOT}/tools/run-insights.mjs" preview "<sessionDir>"
```

These commands write:

```text
<sessionDir>/insights/
├── meta.json
├── run-insights.v1.json
└── run-insights.md
```

`contracts/run-insights.schema.json` defines the shareable JSON shape. Rebuilding preserves the
anonymous report ID. Any report change invalidates earlier consent.

## Consent and email

Do not infer consent from AUTO mode, a repository file, task text, or an earlier run. Show the
Markdown preview, name the recipient, and ask the user to reply exactly
`SHARE RUN INSIGHTS ONCE`. Save that exact direct response to a temporary local file, then record
only its SHA-256:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/run-insights.mjs" authorize "<sessionDir>" \
  --decision share-once \
  --response-file "<direct-user-response-file>" \
  --recipient "<maintainer-email>"
```

Without mail credentials, prepare a standards-compatible email draft:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/run-insights.mjs" prepare-email "<sessionDir>"
```

This writes `insights/run-insights.eml` with the Markdown summary and JSON attachment. Opening and
sending the draft remains a user action.

When a delegated Microsoft Graph token with `Mail.Send` is available, place it in a short-lived
environment variable and send:

```bash
AGENTOW_GRAPH_ACCESS_TOKEN="<token>" \
node "${CLAUDE_PLUGIN_ROOT}/tools/run-insights.mjs" send-email "<sessionDir>"
```

The token is never written to disk. Successful delivery consumes the one-run consent and writes
`insights/delivery-attempt.json` before network I/O and `insights/delivery-receipt.json` after Graph
accepts the message. A failed report or mail command never changes product delivery,
the branch, or the Draft PR; report it separately and leave the local report available for retry.
Concurrent sends are rejected by an exclusive lock. An interrupted `sending` or `accepted`
delivery attempt is also fail-closed: inspect it and the mailbox before retrying, because Graph may
have accepted the message before the process stopped.
