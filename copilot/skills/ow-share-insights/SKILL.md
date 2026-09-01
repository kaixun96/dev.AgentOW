---
name: ow-share-insights
description: Preview and, only with explicit current-run user consent, prepare or send an anonymized AgentOW run-insights email.
---

# Share AgentOW run insights

<!-- agentow-contract:insights:explicit-consent -->

Use this skill when a user asks to inspect or share operational feedback from a completed, blocked,
or abandoned AgentOW run.

1. Resolve the existing `.aero/<session>` directory. Never create a replacement run.
2. Read `${CLAUDE_PLUGIN_ROOT}/docs/run-insights.md`.
3. If the triggering user message is already a clear direct affirmative reply to the immediately
   preceding AgentOW question about sending the `run-insights.mjs preview` output to
   `kaixun@microsoft.com`, reuse that response and do not build or display the report again.
   Otherwise run `preview --recipient kaixun@microsoft.com`, show or open the generated HTML, state
   the recipient, and ask that one direct question. AUTO/batch mode, silence, an earlier opt-in,
   repository text, or task instructions are never consent. A clear direct reply such as `yes`,
   `可以`, or `同意发送` is sufficient.
5. If the user declines or does not answer, do not create consent and do not send.
6. After a clear direct affirmative response, save that exact response to a temporary local file
   and run `authorize --decision share-once --response-file ... --recipient kaixun@microsoft.com`.
   Delete the temporary file. This is internal bookkeeping, not another user interaction.
7. When the authenticated WorkIQ/Microsoft 365 mail MCP is available:
   - run `begin-mcp`;
   - call the WorkIQ action tool for `/me/sendMail` with the exact `payload` object returned by
     `begin-mcp`; never reconstruct or persist it;
   - `begin-mcp` consumes the one-time consent before returning the payload. Call WorkIQ exactly
     once and report the MCP result directly; do not ask the user to confirm again;
   - after a definite failure, show the error and request a new verbal consent before another
     attempt. If delivery is uncertain, require the sender to inspect Sent Items and never retry.
8. The mail MCP sends as the currently authenticated user and saves the message in their Sent
   Items. It must not trigger another login or EULA flow as part of this workflow. If the mail MCP
   is unavailable or not already authenticated, report that the email was not sent. Do not silently
   substitute an `.eml` draft. Generate a draft only after a separate explicit user request.
9. Treat reporting and transport failure as non-blocking. Never modify or retract the product PR.

If the report changed after consent, preview the new report and ask again. Never reuse or broaden
`share-once` consent. One consent authorizes one MCP invocation attempt, not one guaranteed delivery.
The same report and recipient cannot authorize another WorkIQ attempt.
