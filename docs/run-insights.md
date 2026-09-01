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
node "${CLAUDE_PLUGIN_ROOT}/tools/run-insights.mjs" preview "<sessionDir>" \
  --recipient "kaixun@microsoft.com"
```

These commands write:

```text
<sessionDir>/insights/
├── meta.json
├── run-insights.v1.json
├── run-insights.html
└── run-insights.md
```

The self-contained HTML report is the primary human-readable view and is attached to email. It has
no external scripts, fonts, images, or network dependencies. Email uses a separate Outlook-safe
HTML body built with tables and inline styles. Markdown remains a compact fallback, and JSON
remains the analysis contract.

`contracts/run-insights.schema.json` defines the shareable JSON shape. Rebuilding preserves the
anonymous report ID. Any report change invalidates earlier consent.
Consent binds the JSON, rich HTML, and Outlook-safe email body digests. A data or template change
requires a new preview and confirmation. `preview` writes a digest receipt including the named
recipient; authorization fails if the report or recipient differs.

## Consent and email

Do not infer consent from AUTO mode, silence, a repository file, task text, or an earlier run. Show
the HTML preview, name `kaixun@microsoft.com` as the recipient, and ask once whether the user agrees
to send this anonymized report through their connected WorkIQ mail account. A clear direct answer
such as `yes`, `可以`, or `同意发送` is sufficient. Save that exact response to a temporary local file,
then record only its SHA-256:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/run-insights.mjs" authorize "<sessionDir>" \
  --decision share-once \
  --response-file "<direct-user-response-file>" \
  --recipient "<maintainer-email>"
```

When an already authenticated WorkIQ/Microsoft 365 MCP is available, authorize one exact payload:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/run-insights.mjs" begin-mcp "<sessionDir>"
```

Pass the exact `payload` object returned by `begin-mcp` to the WorkIQ action tool at
`/me/sendMail`; do not reconstruct or persist it. Its digest and recipient are bound to the
consent. `begin-mcp` atomically consumes that one-time consent before returning the payload. Invoke
WorkIQ exactly once and use the MCP tool response as the delivery result. After a definite failure,
show the error and request fresh verbal consent before another attempt. An uncertain result must
not be retried—or converted to `.eml`—until the sender checks Sent Items.

The MCP uses its existing user authentication, so this flow adds no login or mail-permission prompt.
If WorkIQ mail is unavailable or not already authenticated, report that the email was not sent.
Do not substitute a draft under the WorkIQ consent. Only after a separate explicit request, prepare
a standards-compatible draft:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/run-insights.mjs" prepare-email "<sessionDir>"
```

The draft contains an Outlook-safe HTML summary plus the rich HTML and JSON reports as attachments.
Opening and sending it remains a user action.

Starting an MCP delivery consumes the one-run consent and writes
`insights/delivery-attempt.json` before network I/O. A failed report or mail command never changes
product delivery, the branch, or the Draft PR. Concurrent sends are rejected by an exclusive lock.
A consented attempt is single-use. The same unchanged report and recipient cannot authorize a
second WorkIQ attempt.
