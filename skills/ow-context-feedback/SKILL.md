---
name: ow-context-feedback
description: "Resume an agentOW run after user or PR feedback and propose an evidence-grounded update to its linked context library."
---

# Resume context maintenance after feedback

Follow `${CLAUDE_PLUGIN_ROOT}/docs/context-maintenance.md`.

1. Resolve the run from an explicit session path, run ID, or PR URL using `~/.config/agentow/runs.ndjson`. Never guess by scanning arbitrary user files.
2. Read the immutable context link, evidence, plan, implementation, evaluation, review, current code, and latest candidate.
3. Append the verbatim feedback as `user-feedback` evidence. Treat it as an observation or requirement until verified against code.
4. If an `ow-context-maintainer` teammate already exists, send it `mode: feedback`. Otherwise read `${CLAUDE_PLUGIN_ROOT}/agents/ow-context-maintainer.md` and spawn one bounded `general-purpose` agent with that definition, the run paths, evidence, and prior candidate.
5. Verify the candidate digest, context HEAD, manifest digest, target-document digest, clean worktree outside the generated patch, and allowed target.
6. Apply automatically according to `updatePolicy.mode`; user feedback is already the trigger and does not require a second confirmation.
7. Stage only candidate target paths. Export a patch for dirty/read-only libraries; record `conflict` for stale bases. Never silently rebase or rewrite an earlier candidate.
8. Update the run state, apply result, progress log, and `~/.config/agentow/runs.ndjson`. Report the result without interrupting the product workflow.

Do not change product code unless the user separately requests it.
