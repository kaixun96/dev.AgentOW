---
name: ow-review
description: "Run the agentOW review gate on its own in Copilot CLI, outside the full pipeline. Use for ow-review, review this PR, review PR 1234567, re-review before publishing, review my branch, or standalone code review of odsp-web. Reviews an existing Azure DevOps PR by ID, or the current branch when no PR is given."
---

# agentOW standalone review (Copilot CLI)

Review an existing change with the same evidence gate the pipeline uses, without planning, implementing, or shipping anything.

This command inspects and reports only. Never edit product code, never create or publish a PR, and never mark unreviewed code as approved. PR-comment policy: do not post comments when reviewing your own PR; when reviewing another author's PR, post actionable comments on that PR.

## Step 1: Resolve the target

| User input | Mode | Reviewed change |
|---|---|---|
| `/ow-review` | branch | current branch vs its base |
| `/ow-review 1234567` | PR | that PR's source vs its target branch |
| `/ow-review https://dev.azure.com/onedrive/ODSP-Web/_git/odsp-web/pullrequest/1234567` | PR | same, ID parsed from the URL |
| `... --base <ref>` | either | overrides the base ref |

A bare number or an ADO pull request URL selects PR mode. Anything else defaults to branch mode. Never guess a PR ID the user did not provide.

Create the session:

```bash
reviewTs=$(date +%Y%m%d-%H%M%S)
sessionDir=/workspaces/odsp-web/.aero/review-${reviewTs}
mkdir -p "$sessionDir"
echo "[$(date +%H:%M:%S)] 🚀 Session started: review-${reviewTs}" >> "$sessionDir/progress.log"
```

`{sessionDir}/report.json` is the NDJSON report file; `{sessionDir}/review.md` and `{sessionDir}/review.json` are the review artifacts.

## Step 2a: PR mode — resolve and materialize the PR head

```bash
az repos pr show --id <prId> \
  --org https://dev.azure.com/onedrive --project ODSP-Web \
  --output json > "$sessionDir/pr.json"
```

If `az` is missing or unauthenticated, stop and tell the user to run `CODESPACES=false az login` (plus `az extension add --name azure-devops`) in this Codespace. Do not silently fall back to reviewing the current branch when a PR was requested.

Read `pr.json` and take `sourceRefName`, `targetRefName`, `lastMergeSourceCommit.commitId`, `title`, `description`, `status`, and `isDraft`. Strip the `refs/heads/` prefix from both ref names. Save the PR description, because the review contract requires inspecting it:

```bash
node -e 'const p=process.argv[1],fs=require("fs");const pr=JSON.parse(fs.readFileSync(p+"/pr.json","utf8"));fs.writeFileSync(p+"/pr-description.md",(pr.description??"").toString())' "$sessionDir"
```

Fetch both refs, then decide where to review:

```bash
git -C /workspaces/odsp-web fetch origin <sourceBranch> <targetBranch>
git -C /workspaces/odsp-web rev-parse HEAD
git -C /workspaces/odsp-web status --porcelain
```

- If the main checkout is already at `<headSha>` and clean, review in place: `reviewRoot=/workspaces/odsp-web`.
- Otherwise create a detached worktree **outside** the odsp-web working tree, so `HEAD` is exactly the PR head and the user's checkout is never disturbed:

  ```bash
  reviewWorktree="$HOME/.cache/agentow/review/pr-<prId>-${reviewTs}"
  git -C /workspaces/odsp-web worktree add --detach "$reviewWorktree" <headSha>
  ```

  Then `reviewRoot=$reviewWorktree`. Never create the worktree under `.aero/` or anywhere else inside `/workspaces/odsp-web`; a nested checkout pollutes the user's status and diff.

This worktree is review-only: it is never built, never served, and never used by the `ow` MCP tools, which stay rooted at `/workspaces/odsp-web`.

Set `baseRef=origin/<targetBranch>` unless the user passed `--base`. Record the target:

```bash
echo "[$(date +%H:%M:%S)] 🔎 Review target — PR <prId> (<sourceBranch> → <targetBranch>)" >> "$sessionDir/progress.log"
```

## Step 2b: Branch mode — review the current branch

```bash
reviewRoot=/workspaces/odsp-web
git -C "$reviewRoot" rev-parse --abbrev-ref HEAD
git -C "$reviewRoot" status --porcelain
git -C "$reviewRoot" fetch origin main
```

Set `baseRef=origin/main` unless the user passed `--base`. Stop if the current branch is `main` or the branch has no unique commits — there is nothing to review. If the worktree is dirty, tell the user that only committed work is reviewed, then continue.

```bash
echo "[$(date +%H:%M:%S)] 🔎 Review target — branch <branch> vs <baseRef>" >> "$sessionDir/progress.log"
```

## Step 3: Compute immutable diff identity

```bash
mergeBase=$(git -C "$reviewRoot" merge-base "$baseRef" HEAD)
reviewedHead=$(git -C "$reviewRoot" rev-parse HEAD)
git -C "$reviewRoot" diff --no-renames --name-only "$mergeBase"...HEAD > "$sessionDir/review-changed-files.txt"
git -C "$reviewRoot" diff --no-renames --diff-filter=D --name-only "$mergeBase"...HEAD > "$sessionDir/review-deleted-files.txt"
git -C "$reviewRoot" diff --no-renames --numstat "$mergeBase"...HEAD > "$sessionDir/review-numstat.txt"
diffDigest=$(git -C "$reviewRoot" diff --no-renames "$mergeBase"...HEAD | sha256sum | cut -d' ' -f1)
```

An empty changed-file list is a stop condition, not an APPROVE.

Before reading any review contract, inspect the immutable diff and classify it. If every
substantive change retires a Flight, KS, Experiment, Feature, or Rollout gate, set
`reviewPolicy=graduation-only` and read only
`${CLAUDE_PLUGIN_ROOT}/skills/ow-review/references/graduation.md`. Do not read
`docs/review-contract.md`, profiles, review-miss documents, or other review references. Otherwise,
including every mixed graduation/feature change, set `reviewPolicy=general` and read
`${CLAUDE_PLUGIN_ROOT}/docs/review-contract.md`.

For `graduation-only`, record every gate identifier established during this independent
classification, one per line, in `$sessionDir/review-gates.txt` before dispatch. The reviewer must
not create or modify this inventory. Reverse-scan merge-base and HEAD by each gate/Flight name,
helper/wrapper name, GUID/ID, export/import, alias, fixed parameter, and downstream call chain.
Write every surviving `fixed-return-helper`, `retained-export`, `fixed-parameter`, and
`fixed-conditional` candidate as one NDJSON identity object (`id`, `gateName`, `kind`, `symbol`,
`path`, `line`) to `$sessionDir/review-residual-candidates.jsonl`; create an empty file when no
candidate exists. This caller-owned inventory is immutable after dispatch.

Also freeze every non-example content block from the isolated graduation reference:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/build-review-rule-inventory.mjs" \
  --repo "${CLAUDE_PLUGIN_ROOT}" \
  --expected-head "$reviewedHead" \
  --expected-merge-base "$mergeBase" \
  --expected-diff-digest "$diffDigest" \
  --registry "${CLAUDE_PLUGIN_ROOT}/graduation-review-rule-registry.json" \
  --out "$sessionDir/review-rule-inventory.json"
```

The reviewer must emit exactly one `ruleResults` entry for every graduation rule ID; missing,
extra, duplicate, or unlinked results forbid `APPROVE`.

For `general`, freeze every non-example content block from every canonical general-review reference.
The registry is caller-owned and exhaustive; applicability is decided per rule in the report, never
by omitting a metric or reference before dispatch:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/build-review-rule-inventory.mjs" \
  --repo "${CLAUDE_PLUGIN_ROOT}" \
  --expected-head "$reviewedHead" \
  --expected-merge-base "$mergeBase" \
  --expected-diff-digest "$diffDigest" \
  --registry "${CLAUDE_PLUGIN_ROOT}/review-rule-registry.json" \
  --out "$sessionDir/review-rule-inventory.json"
```

Do not let the reviewer create, edit, or narrow this caller-owned inventory.

## Step 4: Resolve the review ledger for general review

Skip this step when `reviewPolicy=graduation-only`. For general review, a finding already accepted
on this branch must never be re-raised:

```bash
ledgerSlug=$(printf '%s' "<branch>" | tr '/' '-')
reviewLedgerPath="$HOME/.config/agentow/review-ledger/${ledgerSlug}.json"
```

Use the PR source branch in PR mode. When that file does not exist and a PR description was saved, recover the ledger the description carries:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/review-ledger.mjs" parse \
  --description "$sessionDir/pr-description.md" --out "$reviewLedgerPath"
```

## Step 5: Dispatch the reviewer

```bash
echo "[$(date +%H:%M:%S)] 📝 Reviewer started" >> "$sessionDir/progress.log"
```

Dispatch `@agentow-copilot:reviewer` with:

```yaml
mode: standalone
reviewPolicy: <graduation-only or general>
branch: <PR source branch or current branch>
reviewRoot: <reviewRoot>
baseRef: <baseRef>
sessionDir: <sessionDir>
reportFile: <sessionDir>/report.json
reportWriterCommand: node ${CLAUDE_PLUGIN_ROOT}/tools/run-state.mjs report <sessionDir>
progressLog: <sessionDir>/progress.log
artifactPath: <sessionDir>/review.md
artifactJsonPath: <sessionDir>/review.json
gateInventoryPath: <sessionDir>/review-gates.txt             # graduation-only
deletedFilesPath: <sessionDir>/review-deleted-files.txt       # graduation-only
residualCandidatesPath: <sessionDir>/review-residual-candidates.jsonl # graduation-only
ruleInventoryPath: <sessionDir>/review-rule-inventory.json           # general and graduation-only
reviewLedgerPath: <resolved reviewLedgerPath>
prDescriptionPath: <sessionDir>/pr-description.md   # PR mode only
contextDocuments:
  - <every routed feature/domain context document, when a context library is linked>
```

For graduation-only, instruct the reviewer to use only the graduation reference's review procedure
and minimal report contract, then return without generic review passes. For general review, state
explicitly that this is a standalone, adversarial review with no plan, implementation, or evaluation
artifacts. Require the reviewer to apply the general contract's challenge protocol and evidence
requirements. Strictness never permits unsupported findings or inflated severity.

Do not dispatch planner or evaluator, and do not start the `agentow` pipeline from this command.

## Step 6: Validate before showing anything

When `reviewPolicy=graduation-only`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/validate-graduation-review-report.mjs" \
  "$sessionDir/review.json" \
  --expected-head "$reviewedHead" \
  --expected-merge-base "$mergeBase" \
  --expected-diff-digest "$diffDigest" \
  --rule-inventory "$sessionDir/review-rule-inventory.json" \
  --rule-registry "${CLAUDE_PLUGIN_ROOT}/graduation-review-rule-registry.json" \
  --changed-files "$sessionDir/review-changed-files.txt" \
  --deleted-files "$sessionDir/review-deleted-files.txt" \
  --expected-gates "$sessionDir/review-gates.txt" \
  --residual-candidates "$sessionDir/review-residual-candidates.jsonl"
```

Otherwise:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/validate-review-report.mjs" \
  "$sessionDir/review.json" \
  --expected-head "$reviewedHead" \
  --expected-merge-base "$mergeBase" \
  --expected-diff-digest "$diffDigest" \
  --rule-inventory "$sessionDir/review-rule-inventory.json" \
  --rule-registry "${CLAUDE_PLUGIN_ROOT}/review-rule-registry.json" \
  --changed-files "$sessionDir/review-changed-files.txt" \
  --diff-numstat "$sessionDir/review-numstat.txt" \
  --ledger "$reviewLedgerPath" \
  --repo "$reviewRoot"
```

If `review.md`, `review.json`, or the reviewer NDJSON line is missing, or validation fails, classify it as `reviewer-spec` and re-dispatch the reviewer once with the validation errors against the same unchanged head. If the retry still fails, report the failure. Never present an unvalidated verdict as a review result.

## Step 7: Report and clean up

Append the verdict line. If a temporary worktree was created, remove it while keeping the artifacts in `sessionDir`:

```bash
git -C /workspaces/odsp-web worktree remove --force "$reviewWorktree"
git -C /workspaces/odsp-web worktree prune
echo "[$(date +%H:%M:%S)] ✅ Workflow complete" >> "$sessionDir/progress.log"
```

Report the verdict, Critical/Important/Minor counts, carried findings, and the artifact paths. Then stop:

- For every finding you raise, also provide a concrete likely fix direction. Point to the preferred component, pattern, prop, structure, utility, or test change that would resolve the issue; do not stop at naming the defect alone.
- Blocking findings go back to the user; this command never fixes them. Use `/agentow` to implement fixes.
- To keep a Minor from being re-raised later, record the decision instead of ignoring it silently:

  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/tools/review-ledger.mjs" accept \
    --report "$sessionDir/review.json" \
    --ledger "$reviewLedgerPath" \
    --repo "$reviewRoot" \
    --branch "<branch>" \
    --accept '<findingId>=<why this stays as-is in this PR>'
  ```
