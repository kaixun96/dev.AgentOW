---
name: ow-screenshot
description: "Use to capture BEFORE/AFTER screenshots for one or more existing odsp-web PRs and post them as PR comments. Keywords: PR validation screenshots, BEFORE AFTER screenshot, visual validation, screenshot existing PR, batch screenshot PRs."
---

# Screenshot existing odsp-web PRs

Capture BEFORE/AFTER screenshots of the UI surface changed by one or more existing PRs, and post them as PR comments. Independent of `/ow-team` — does NOT create PRs, does NOT modify code, only reads PR diff + posts comments.

**Usage:**
```
/ow-screenshot 2219557                          # single PR
/ow-screenshot 2219557 2219558 2219559          # multiple PRs (space or comma separated)
```

Each PR is processed in isolation by a fresh `ow-screenshot-agent`. Per-PR results are aggregated into a summary table at the end.

---

## Step 1: Parse PR numbers from the user's arguments

Accept any of these formats:
- `2219557` (single)
- `2219557 2219558` (space-separated)
- `2219557,2219558` (comma-separated)

Strip whitespace, validate each is a positive integer. Set `{prIds}` = array of PR numbers.

If the user did not provide any PRs, ask: "Which PR(s) should I screenshot? Provide one or more PR numbers."

## Step 2: Set up batch workspace

```bash
batchTimestamp=$(date +%Y%m%d-%H%M%S)
batchDir=/workspaces/odsp-web/.aero/screenshot-${batchTimestamp}
mkdir -p ${batchDir}
batchSummary=${batchDir}/summary.md
```

Initialize the summary header:

```markdown
# Screenshot Batch — {batchTimestamp}

Total PRs: {N}

| PR | Pattern | Status | Result |
|----|---------|--------|--------|
```

Tell the user:
```
📸 Screenshot batch started — {N} PR(s).
Working dir: {batchDir}
Each PR is processed sequentially; you can leave and come back to {batchSummary}.
```

## Step 3: For each PR, dispatch ow-screenshot-agent

For PR `prId[i]` in `{prIds}`:

### 3a. Create per-PR output directory

```bash
outDir=${batchDir}/pr-${prId}
mkdir -p ${outDir}
```

### 3b. Dispatch the agent

Use the `Agent` tool (subagent, NOT a team):

```
Agent({
  subagent_type: "agentOW:ow-screenshot-agent",
  description: "Screenshot PR #{prId}",
  prompt: "
    Capture BEFORE/AFTER screenshots for PR #{prId} and post them as a PR comment.

    prId: {prId}
    outDir: {outDir}

    Follow your agent definition exactly. Return one of:
    - RESULT: success | prId: {prId} | pattern: <X> | before: <url> | after: <url>
    - RESULT: skipped | prId: {prId} | reason: <reason>
    - RESULT: failed | prId: {prId} | reason: <reason>
  "
})
```

Wait for the agent's final message containing `RESULT:`.

### 3c. Parse result and append to summary

Append one row to `{batchSummary}`:

| Outcome | Row |
|---------|-----|
| Success | `\| {prId} \| {pattern} \| ✅ Posted \| [BEFORE]({before-url}) \| [AFTER]({after-url}) \|` |
| Skipped | `\| {prId} \| {pattern} \| ⏭️ Skipped \| {reason} \|` |
| Failed | `\| {prId} \| - \| ❌ Failed \| {reason} \|` |

### 3d. Continue to next PR

Failures or skips do NOT abort the batch. Move on to the next PR.

## Step 4: Final summary

After all PRs are processed, write the final summary block:

```markdown
## Summary

- Total: {N}
- ✅ Posted screenshots: {successCount}
- ⏭️ Skipped: {skipCount}
- ❌ Failed: {failureCount}

Finished: {ISO timestamp}
```

Show the user:

```
🎉 Screenshot batch complete

✅ {successCount} PRs got screenshots posted
⏭️ {skipCount} skipped (server-side / external dep / unclear surface)
❌ {failureCount} failed (check {batchDir}/pr-<N>/ for diagnostics)

Summary: {batchSummary}
```

---

## Rules

- **One agent per PR.** Process sequentially. Do not spawn multiple agents in parallel — they would race on tmux state, Playwright browser, and az auth context.
- **Failures don't block.** A failed PR gets logged and the batch continues.
- **You are a dispatcher, not the worker.** Do not read PR diffs or call ADO yourself — that's the agent's job.
- **No flags, no overrides.** The agent decides pattern and selector from source code. If it can't, it skips. Users wanting manual control should screenshot manually.
