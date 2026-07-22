# Context library maintenance

agentOW can link each run to an external context library such as a dotfiles knowledge center or a team-owned repository. agentOW is only the routing and evidence layer: feature routes, update destinations, and domain rules remain owned by the context library.

## Discovery

Resolve at most one context library before research, in this order:

1. An explicit context root or manifest supplied by the user.
2. `AGENTOW_CONTEXT_ROOT`.
3. `~/.config/agentow/context-libraries.json`, matched by normalized source Git remote first and absolute source root second.
4. Existing ad-hoc `contextDocuments`, treated as a read-only link.
5. Otherwise record `status: "unlinked"` and preserve current agentOW behavior.

The user registry is an array:

```json
{
  "schemaVersion": 1,
  "libraries": [
    {
      "id": "personal-odsp",
      "sourceRemote": "https://example.com/org/odsp-web.git",
      "contextRoot": "/path/to/context-repo",
      "manifestPath": ".agentow/context.json"
    }
  ]
}
```

Relative paths resolve from the registry file. Never search arbitrary home-directory files to guess a library.

## Library manifest

The linked repository owns `.agentow/context.json`:

```json
{
  "schemaVersion": 1,
  "routes": [
    {
      "id": "feature-area",
      "requestTerms": ["feature term"],
      "sourceGlobs": ["path/to/feature/**"],
      "documents": ["notes/feature/README.md"],
      "updateTargets": ["notes/feature/state.md"]
    }
  ],
  "updatePolicy": {
    "mode": "auto-commit",
    "push": true,
    "allowedTargets": ["notes/**", "claude-memory/**"]
  }
}
```

Routes and guards are library data, not agentOW prompt conditions. Reject unsupported schema versions, paths outside the context root, targets outside `allowedTargets`, and symlink escapes.

Supported update modes:

- `auto-commit` — apply grounded updates and commit them without interrupting the product run; push when `push` is true.
- `patch-only` — write a patch artifact but never modify the context repository.
- `disabled` — collect evidence only.

The linked context library owns this policy. agentOW must not add feature-specific approval gates.

## Per-run artifacts

Create `<sessionDir>/context/`:

```text
context/
├── link.json
├── evidence.ndjson
├── state.json
├── candidates/
│   └── <candidate-id>.v<revision>.md
├── decisions.ndjson
└── apply/
    └── <decision-id>.json
```

`link.json` snapshots the run ID, source remote/root/base commit, context root/remote/base commit, manifest digest, and writability. Do not silently refresh it mid-run.

Library identity in `link.json` is immutable. Route discovery is revisioned separately as `routing.v<N>.json`: the initial request creates revision 1; an interactively refined request and source paths discovered by planning may each create the next revision. Downstream agents receive the latest routing snapshot and all routed document paths. Never rewrite an earlier routing revision.

`evidence.ndjson` is append-only. Each event records:

- `eventId`, `runId`, timestamp, and source type (`plan`, `code`, `evaluation`, `review`, `user-feedback`);
- source artifact path plus commit or PR when available;
- digest of the source artifact;
- grounded observations, outcomes, and citations;
- redactions performed before persistence.

Record concise excerpts and citations, not unrestricted source dumps, credentials, tokens, or private files outside the routed allowlist.

`state.json` is a derived convenience view. The append-only artifacts are authoritative.

## Candidate contract

The context maintainer reads the immutable link, routed documents, approved plan, actual diff/commit, evaluator/reviewer artifacts, and user feedback. It writes a candidate containing:

- candidate ID and immutable revision;
- lifecycle stage (`plan-intent`, `as-built`, or `feedback`);
- context base commit and manifest digest;
- target document;
- target-document digest at candidate creation;
- exact patch;
- patch SHA-256 digest;
- evidence IDs and citations supporting every material claim;
- confidence and unresolved uncertainty;
- superseded candidate, when applicable.

Plan-stage candidates capture intended decisions and open questions. They must not present unimplemented behavior as fact. As-built candidates use the committed diff and verification results to correct or supersede plan intent.

## Apply without interrupting the product run

Context maintenance is a non-blocking side workflow. It never adds a user gate to interactive, AUTO, or batch product execution.

Before apply:

1. Recompute the candidate digest.
2. Verify the context repository HEAD, manifest digest, and target-document digest still match the candidate base.
3. Require a clean context worktree outside the exact generated patch. If unrelated or pre-existing changes exist, export a conflict patch instead of committing them.
4. Apply only the candidate patch and only to allowed targets.
5. Stage and commit only the candidate's target paths. Never use a repository-wide add.
6. Follow the library's `updatePolicy.mode` and repository-local commit/push instructions.

If the library is read-only, export the patch and record `exported-patch`. If its base moved, record `conflict`; never silently rebase or overwrite. These outcomes are reported in artifacts and do not pause the product workflow.

Context maintenance failure is always separate from product implementation status. It cannot block build, evaluation, PR creation, or the next batch task.

## Lifecycle and late feedback

```text
unlinked
  or
linked -> collecting_evidence -> candidate_proposed -> applying -> applied
```

Other terminal states are `no-update`, `disabled`, `exported-patch`, `blocked-read-only`, and `conflict`.

After the run, `/ow-context-feedback` resumes by run ID, session path, or PR URL. The user's feedback is the trigger to run maintenance; no second confirmation is required. The skill appends feedback as new evidence, re-reads the current code and linked context, and produces and applies a new immutable revision according to the library policy. It never edits the old candidate or treats user feedback as verified code behavior without checking the implementation.

Append a compact run index entry to `~/.config/agentow/runs.ndjson` containing run ID, session path, source remote, branch, commit, PR URL, context library ID, and pending candidate path. This index contains references only, not source excerpts.
