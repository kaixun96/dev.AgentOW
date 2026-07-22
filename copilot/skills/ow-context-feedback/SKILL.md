---
name: ow-context-feedback
description: "Resume an agentOW run after user feedback and propose an evidence-grounded update to its linked context library. Triggers on: update context from feedback, agentOW feedback, revise context after PR feedback, remember what we learned from this run."
---

# Resume context maintenance after feedback

Use this skill when feedback arrives after an agentOW run.

1. Resolve the run from an explicit session path, run ID, or PR URL. Search `~/.config/agentow/runs.ndjson` only; do not guess from arbitrary folders.
2. Read the run's `context/link.json`, `context/evidence.ndjson`, plan, final implementation artifact, current commit/diff, evaluator report, reviewer report, and latest candidate.
3. Append a `user-feedback` evidence event with the verbatim feedback, source reference, timestamp, and redactions. Feedback is an observation or requirement until verified against code.
4. Re-read the current implementation and linked context. If the code changed after the indexed commit, record that new base explicitly.
5. Dispatch `@agentow-copilot:context-maintainer` in `feedback` mode. The new immutable revision must set `supersedes` to the prior candidate.
6. User feedback is already the trigger. Verify the candidate digest, unchanged context HEAD/manifest/target-document digests, clean worktree outside the generated patch, and allowed target, then follow the policy without asking another question.
7. Stage only candidate target paths. On dirty or read-only repositories export a patch; on stale base record a conflict. Never silently rebase.
8. Update `state.json`, the apply result, run index, and progress log. Report the outcome, but do not block on user input.

Do not modify product code unless the user explicitly asks for a product fix as well.
