---
name: ow-review
description: "Run the agentOW review gate on its own in Copilot CLI, outside the full pipeline. Use for ow-review, review this PR, review PR 1234567, re-review before publishing, review my branch, or standalone code review of odsp-web. Reviews an existing Azure DevOps PR by ID, or the current branch when no PR is given."
---

# agentOW standalone review (Copilot CLI)

Review an existing change with the same evidence gate the pipeline uses, without planning, implementing, or shipping anything.

This command inspects and reports only. Never edit product code, never create or publish a PR, never post PR comments, and never mark unreviewed code as approved.

Read `${CLAUDE_PLUGIN_ROOT}/docs/review-contract.md` before dispatching. It is normative.

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
git -C "$reviewRoot" diff --no-renames --numstat "$mergeBase"...HEAD > "$sessionDir/review-numstat.txt"
diffDigest=$(git -C "$reviewRoot" diff --no-renames "$mergeBase"...HEAD | sha256sum | cut -d' ' -f1)
```

An empty changed-file list is a stop condition, not an APPROVE.

## Step 4: Resolve the review ledger

A finding already accepted on this branch must never be re-raised:

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
branch: <PR source branch or current branch>
reviewRoot: <reviewRoot>
baseRef: <baseRef>
sessionDir: <sessionDir>
reportFile: <sessionDir>/report.json
progressLog: <sessionDir>/progress.log
artifactPath: <sessionDir>/review.md
artifactJsonPath: <sessionDir>/review.json
reviewLedgerPath: <resolved reviewLedgerPath>
prDescriptionPath: <sessionDir>/pr-description.md   # PR mode only
contextDocuments:
  - <every routed feature/domain context document, when a context library is linked>
```

State explicitly that this is a standalone, adversarial review with no plan, implementation, or evaluation artifacts. Require the reviewer to apply the contract's adversarial challenge protocol: form falsifiable failure hypotheses for every high-risk file or behavior unit, test the strongest counterexamples and negative/fallback paths, and complete a final dissent pass before `APPROVE`. The reviewer must ground `preReview.evidence` in the PR description, commit messages, linked work item, and the diff itself, and must never synthesize pipeline artifact paths. Strictness never permits unsupported findings or inflated severity. `rolloutProtection.reviewContext` is `existing-pr` in PR mode and `pre-pr` in branch mode.

Do not dispatch planner or evaluator, and do not start the `agentow` pipeline from this command.

## Step 6: Validate before showing anything

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/validate-review-report.mjs" \
  "$sessionDir/review.json" \
  --expected-head "$reviewedHead" \
  --expected-diff-digest "$diffDigest" \
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
