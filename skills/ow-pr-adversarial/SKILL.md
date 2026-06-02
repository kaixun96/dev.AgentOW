---
name: ow-pr-adversarial
description: "Adversarially validate an existing odsp-web PR against the ReplaceComponent / SPDS recipe — multi-cycle GAN-style loop. Evaluator finds Tier 1 violations; fixer auto-patches them; loop continues until convergence or 5-cycle cap. Posts one consolidated PR comment at the end. Keywords: PR adversarial validation, recipe lint loop, SPDS validation, auto-fix Tier 1, validate PR against recipe."
---

# Adversarially validate an existing odsp-web PR (multi-cycle loop)

Run an adversarial generator ↔ evaluator loop on a PR. The evaluator runs deterministic Tier 1 recipe checks; the fixer auto-patches known violations; the loop continues until convergence (0 Tier 1 findings) or the 5-cycle cap. One consolidated PR comment is posted at the end.

**Usage:**
```
/ow-pr-adversarial 2218733                      # single PR
/ow-pr-adversarial 2218733 2219419              # multiple PRs (space or comma separated)
/ow-pr-adversarial 2218733 --no-fix             # evaluator only (Phase 2 behavior)
```

Each PR is processed in isolation. Per-PR loop artifacts are persisted under `/workspaces/odsp-web/.aero/adversarial-<timestamp>/pr-<prId>/`.

This skill is **Phase 3** of the adversarial-PR-validation pipeline (see `docs/adversarial-pr-validation.md`).

---

## Step 1: Parse arguments

Accept PR ids (positive integers) and optional flags:
- `--no-fix` — evaluator only, no fix cycles (Phase 2 behavior)
- `--max-cycles N` — override the default cycle cap (default 5)

Set `{prIds}` array, `{enableFix}` boolean (default true), `{maxCycles}` (default 5).

If no PRs provided: ask the user which to validate.

## Step 2: Set up batch workspace

```bash
batchTimestamp=$(date +%Y%m%d-%H%M%S)
batchDir=/workspaces/odsp-web/.aero/adversarial-${batchTimestamp}
mkdir -p ${batchDir}
batchSummary=${batchDir}/summary.md
```

Initialize summary header:

```markdown
# Adversarial Validation Batch — {batchTimestamp}

Mode: {enableFix ? "evaluate + fix" : "evaluate only"}
Cycle cap: {maxCycles}
Total PRs: {N}

| PR | Final verdict | Cycles | Tier 1 fixed | Tier 1 remaining | Comment |
|----|---------------|--------|--------------|------------------|---------|
```

Tell user:
```
🛡️  Adversarial validation started — {N} PR(s), mode: {mode}, cap: {maxCycles}.
Working dir: {batchDir}
```

## Step 3: For each PR — drive the loop

For PR `prId[i]` in `{prIds}`:

### 3a. Per-PR setup

```bash
prDir=${batchDir}/pr-${prId}
mkdir -p ${prDir}
```

Track per-PR state:
- `cycle = 0`
- `previousFindingsPath = ""`
- `cycleHistory = []` — list of `{ cycle, phase, verdict, ... }` events
- `totalFixed = 0`
- `branchCheckedOut = false`

### 3b. Loop until convergence or cap

While `cycle < maxCycles`:

#### Cycle: evaluator phase

```bash
cycle=$((cycle + 1))
iterDir=${prDir}/iter${cycle}
mkdir -p ${iterDir}
```

Dispatch evaluator:

```
Agent({
  subagent_type: "agentOW:ow-adversarial-evaluator",
  description: "Adversarial cycle {cycle} — evaluate PR #{prId}",
  prompt: "
    Run cycle {cycle} evaluation on PR #{prId}.

    prId: {prId}
    cycle: {cycle}
    outDir: {iterDir}
    previousFindingsPath: {previousFindingsPath}
    commitSha: {commitSha or empty for cycle 1}

    Follow your agent definition exactly. Return one RESULT line.
  "
})
```

In cycle 1 leave `commitSha` empty — lint runs against PR's `lastMergeSourceCommit`. In cycle 2+, pass the `commitSha` of the fixer's previous commit (stored in `cycleHistory[-1].commit`) so the evaluator audits the post-fix state, not the unchanged PR source.

Wait for RESULT, read `{iterDir}/findings.json`.

Decision tree on `verdict`:

| Verdict | Action |
|---|---|
| `pass` | Loop converged. Record event, break. |
| `skipped` | No recipe targets. Record, break. |
| `fail` | Stalled (all findings are persisted from previous cycle). Record, break — escalate to human. |
| `new_findings` | Continue to fix phase if `enableFix`, else break. |

Record event:
```json
{ "cycle": <N>, "phase": "evaluator", "verdict": "<v>", "newTier1": <N>, "persistedTier1": <N>, "path": "<findings.json>" }
```

Set `previousFindingsPath = {iterDir}/findings.json` for the next cycle.

If verdict ≠ `new_findings` OR `!enableFix`: break.

#### Cycle: fixer phase

**Checkout the PR branch** if not already done:

```bash
if [ "$branchCheckedOut" = "false" ]; then
  # Get branch from PR metadata
  TOKEN=$(az account get-access-token --resource=499b84ac-1321-427f-aa17-267ca6975798 --query accessToken -o tsv)
  branchName=$(curl -sL -H "Authorization: Bearer $TOKEN" \
    "https://dev.azure.com/onedrive/ODSP-Web/_apis/git/repositories/3829bdd7-1ab6-420c-a8ec-c30955da3205/pullRequests/${prId}?api-version=7.0" \
    | python3 -c "import json,sys;print(json.load(sys.stdin)['sourceRefName'].replace('refs/heads/',''))")
  cd /workspaces/odsp-web
  git fetch origin "${branchName}"
  git checkout -B "${branchName}" "origin/${branchName}"
  branchCheckedOut=true
fi
```

If branch checkout fails, record event `{phase: "fixer", status: "failed", reason: "branch-checkout-failed"}` and break out of the loop for this PR.

Dispatch fixer:

```
Agent({
  subagent_type: "agentOW:ow-adversarial-fixer",
  description: "Adversarial cycle {cycle} — fix PR #{prId}",
  prompt: "
    Apply fixes for PR #{prId} based on evaluator findings.

    prId: {prId}
    cycle: {cycle}
    findingsPath: {iterDir}/findings.json
    outDir: {iterDir}
    branch: {branchName}

    Follow your agent definition exactly. Return one RESULT line.
  "
})
```

Wait for RESULT, read `{iterDir}/fix-report.json`.

Record event:
```json
{ "cycle": <N>, "phase": "fixer", "status": "<fixed|nothing_to_fix|failed>", "fixed": <N>, "unfixable": <N>, "commit": "<sha>" }
```

Update `totalFixed += fix-report.summary.fixed`.

If status is `failed` or 0 actually fixed: break (loop is stalled at the fixer — no point re-evaluating).

#### Continue

Loop back to evaluator phase with the post-fix state.

### 3c. Decide final verdict

Based on the last evaluator event:
- Last verdict `pass` → `✅ CONVERGED`
- Last verdict `skipped` → `⏭️ SKIPPED`
- Last verdict `fail` → `🚫 STALLED — needs human attention`
- Last verdict `new_findings` + hit cap → `⚠️ CAPPED — {N} Tier 1 remaining`

### 3d. Post one consolidated PR comment

Build comment from `cycleHistory` and the **last cycle's findings.json**:

```markdown
## 🛡️ Adversarial Validation — {N} cycle(s)

**Final verdict**: {emoji + verdict text}
**Mode**: {evaluate + fix | evaluate only}
**Tier 1 fixed across all cycles**: {totalFixed}
**Tier 1 remaining in final cycle**: {finalNewTier1 + finalPersistedTier1}

### Cycle timeline

| Cycle | Phase | Verdict / Status | Detail |
|-------|-------|------------------|--------|
{for each cycleHistory event, one row}

### Remaining Tier 1 findings (final cycle)

{Render the last findings.json's tier1 entries as bullets with file:line + recipe anchor.}
{If 0 remaining: "✅ All Tier 1 violations resolved."}

### Advisory (Tier 3)

{Same format, from last findings.json}

---

🤖 Generated by `/ow-pr-adversarial` Phase 3 — recipe: [`docs/replace-component-recipe.md`](https://github.com/kaixun96/dev.AgentOW/blob/main/docs/replace-component-recipe.md)
```

Post via `ow-pr-attach`:
```
ow-pr-attach({ prId: {prId}, attachments: [], commentMarkdown: <above> })
```

Failures to post: log, do not abort batch.

### 3e. Append to batch summary

| Final verdict | Row |
|---|---|
| converged | `\| {prId} \| ✅ CONVERGED \| {cycles} \| {totalFixed} \| 0 \| posted \|` |
| capped | `\| {prId} \| ⚠️ CAPPED \| {cycles} \| {totalFixed} \| {remaining} \| posted \|` |
| stalled | `\| {prId} \| 🚫 STALLED \| {cycles} \| {totalFixed} \| {remaining} \| posted \|` |
| skipped | `\| {prId} \| ⏭️ SKIPPED \| 1 \| 0 \| - \| posted \|` |

### 3f. Continue

Failures / skips do not abort the batch.

## Step 4: Final summary

```markdown
## Summary

- Total: {N}
- ✅ Converged: {converged}
- ⚠️ Capped: {capped}
- 🚫 Stalled: {stalled}
- ⏭️ Skipped: {skipped}
- Total Tier 1 fixes applied: {batchTotalFixed}

Finished: {ISO timestamp}
```

Show user:
```
🎉 Adversarial validation batch complete

✅ {converged} PR(s) converged (clean)
⚠️ {capped} PR(s) hit the cycle cap
🚫 {stalled} PR(s) stalled (need human attention)
⏭️ {skipped} PR(s) skipped
Total Tier 1 fixes applied: {batchTotalFixed}

Summary: {batchSummary}
```

---

## Rules

- **One PR at a time.** Sequential — ow-recipe-lint, ow-build, git checkout all share state.
- **Cycle cap is non-negotiable.** Even if findings keep changing, stop at `maxCycles` and post the result. The cap protects against generator/evaluator infinite-bounce.
- **Checkout the PR branch ONCE per PR.** Switching branches mid-loop will discard the fixer's commits.
- **One PR comment per PR.** Consolidated at the end, not one per cycle — keeps the PR thread readable.
- **Never push.** The fixer commits locally; the PR author / reviewer pushes when they're satisfied.
- **`--no-fix` is a real mode**, not an error path. It's how the skill behaves for read-only audits.
- **Failures don't block the batch.** Per-PR failures are logged in `cycleHistory`; batch continues.
