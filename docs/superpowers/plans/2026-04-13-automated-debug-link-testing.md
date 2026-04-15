# Automated Debug Link Testing + PR Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add end-to-end automated Playwright MCP verification and PR creation to dev.AgentOW so the evaluator can navigate SharePoint pages with debug links, inspect DOM, take screenshots, and produce structured evidence — then the orchestrator auto-creates a draft PR.

**Architecture:** Two new MCP tools (`ow-pr-create`, enhanced `ow-debuglink`), rewritten evaluator agent (Playwright MCP interactive), updated orchestrator (auto review + PR), new Playwright skill, updated hooks.

**Tech Stack:** TypeScript (MCP server), Markdown (agents/skills), Bash (hooks), Playwright MCP, Azure DevOps CLI (`az repos`)

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `ts/src/ow/tools/prClient.ts` | git push + az repos pr create |
| Modify | `ts/src/ow/tools/debugLink.ts` | Add `buildFullTestUrl()` |
| Modify | `ts/src/ow/mcp/owTools.ts` | Register `ow-pr-create`, update `ow-debuglink` |
| Modify | `ts/src/ow/mcp/instructions.ts` | Add ow-pr-create docs, update ow-debuglink docs |
| Rewrite | `agents/ow-evaluator.md` | Playwright MCP interactive verification |
| Modify | `agents/ow-orchestrator.md` | Auto review + PR after PASS |
| Create | `skills/ow-dev-playwright/SKILL.md` | Playwright MCP usage guide |
| Modify | `skills/ow-dev-debuglink/SKILL.md` | Add full URL construction section |
| Modify | `hooks/hooks.json` | Add `browser_` matcher |
| Modify | `README.md` | Add ow-pr-create, Playwright MCP setup |

---

## Task 1: Add `buildFullTestUrl` to `debugLink.ts`

**Files:**
- Modify: `ts/src/ow/tools/debugLink.ts`

- [ ] **Step 1: Add the URL construction function**

Append to end of `ts/src/ow/tools/debugLink.ts`:

```typescript
/**
 * Combines a SharePoint page URL with a debug query string into a full test URL.
 * Handles both cases: page URL with existing query params and without.
 */
export function buildFullTestUrl(pageUrl: string, debugQueryString: string): string {
  const cleanDebug = debugQueryString.replace(/^\?/, "");
  const separator = pageUrl.includes("?") ? "&" : "?";
  return pageUrl + separator + cleanDebug;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /workspaces/dev.AgentOW/ts && npm run typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /workspaces/dev.AgentOW
git add ts/src/ow/tools/debugLink.ts
git commit -m "feat: add buildFullTestUrl helper to debugLink.ts"
```

---

## Task 2: Update `ow-debuglink` tool registration

**Files:**
- Modify: `ts/src/ow/mcp/owTools.ts:164-178`

- [ ] **Step 1: Update the ow-debuglink registration**

In `ts/src/ow/mcp/owTools.ts`, replace the current `ow-debuglink` tool registration (lines 164-178) with:

```typescript
  // ── 6. ow-debuglink ───────────────────────────────────────────────────────
  registerMcpTool(server, "ow-debuglink", {
    description: "Extract debug link URL from rush start tmux output. Pass sharePointPageUrl to get a ready-to-use fullTestUrl for browser testing.",
    inputSchema: {
      target: z.string().optional().describe("Tmux target (default: agentow:rush)"),
      sharePointPageUrl: z.string().optional().describe("SharePoint page URL. When provided, returns fullTestUrl = page URL + debug query string combined."),
    },
  }, async (input, extras) => {
    const target = input.target ?? `${OW.tmuxSession}:${OW.rushWindow}`;
    const captured = await tmux.capture(target, 200, extras.signal);
    const links = extractDebugLinks(captured);
    let fullTestUrl: string | undefined;
    if (input.sharePointPageUrl && links.debugQueryString) {
      fullTestUrl = buildFullTestUrl(input.sharePointPageUrl, links.debugQueryString);
    }
    return successResultWithDebug(logger, "ow-debuglink", {
      ...links,
      fullTestUrl,
      tmuxTarget: target,
    });
  });
```

- [ ] **Step 2: Add the import**

At the top of `ts/src/ow/mcp/owTools.ts`, update the debugLink import (line 9) from:

```typescript
import { extractDebugLinks } from "../tools/debugLink.js";
```

to:

```typescript
import { extractDebugLinks, buildFullTestUrl } from "../tools/debugLink.js";
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /workspaces/dev.AgentOW/ts && npm run typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
cd /workspaces/dev.AgentOW
git add ts/src/ow/mcp/owTools.ts
git commit -m "feat: add sharePointPageUrl param and fullTestUrl output to ow-debuglink"
```

---

## Task 3: Create `prClient.ts`

**Files:**
- Create: `ts/src/ow/tools/prClient.ts`

- [ ] **Step 1: Create the file**

Write `ts/src/ow/tools/prClient.ts`:

```typescript
import * as cp from "node:child_process";
import { OW } from "../../shared/constants.js";
import type { FileLogger } from "../../shared/logger.js";

export interface PrCreateInput {
  title: string;
  description: string;
  targetBranch?: string;
  draft?: boolean;
  workItems?: string;
}

export interface PrCreateResult {
  prId: number;
  prUrl: string;
  branch: string;
  draft: boolean;
}

const BRANCH_PATTERN = /^user\/[^/]+\/[^/]+$/;
const ODSP_WEB_REPO_ID = "3829bdd7-1ab6-420c-a8ec-c30955da3205";
const ADO_ORG = "https://dev.azure.com/onedrive";
const ADO_PROJECT = "ODSP-Web";

function execCmd(cmd: string, cwd: string, signal?: AbortSignal): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = cp.exec(cmd, { cwd, signal }, (err, stdout, stderr) => {
      if (err && err.killed) { reject(new Error("Aborted")); return; }
      resolve({ exitCode: err?.code ?? 0, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

export class PrClient {
  constructor(
    private readonly cwd: string = OW.odspWebRoot,
    private readonly logger?: FileLogger,
  ) {}

  async createPr(input: PrCreateInput, signal?: AbortSignal): Promise<PrCreateResult> {
    // 1. Get current branch
    const branchResult = await execCmd("git rev-parse --abbrev-ref HEAD", this.cwd, signal);
    if (branchResult.exitCode !== 0) {
      throw new Error(`Failed to get current branch: ${branchResult.stderr}`);
    }
    const branch = branchResult.stdout;

    // 2. Validate branch name
    if (!BRANCH_PATTERN.test(branch)) {
      throw new Error(
        `Branch '${branch}' does not match required pattern 'user/<alias>/<feature>'. ` +
        `Create a properly named branch first.`
      );
    }

    this.logger?.info("pr-create", `branch=${branch}, pushing...`);

    // 3. Push
    const pushResult = await execCmd(`git push -u origin ${branch}`, this.cwd, signal);
    if (pushResult.exitCode !== 0) {
      throw new Error(`git push failed: ${pushResult.stderr}`);
    }
    this.logger?.info("pr-create", `pushed ${branch}`);

    // 4. Create PR
    const target = input.targetBranch ?? "main";
    const draft = input.draft ?? true;

    const azArgs = [
      "az", "repos", "pr", "create",
      "--repository", ODSP_WEB_REPO_ID,
      "--source-branch", branch,
      "--target-branch", target,
      "--title", JSON.stringify(input.title),
      "--description", JSON.stringify(input.description),
      "--draft", String(draft),
      "--org", ADO_ORG,
      "--project", ADO_PROJECT,
      "--output", "json",
    ];
    if (input.workItems) {
      azArgs.push("--work-items", input.workItems);
    }

    const azCmd = azArgs.join(" ");
    this.logger?.info("pr-create", `running: ${azCmd.slice(0, 200)}`);

    const prResult = await execCmd(azCmd, this.cwd, signal);
    if (prResult.exitCode !== 0) {
      throw new Error(
        `az repos pr create failed (exit ${prResult.exitCode}):\n${prResult.stderr}\n\n` +
        `Make sure 'az' is installed and authenticated:\n` +
        `  az extension add --name azure-devops\n` +
        `  az login\n`
      );
    }

    // 5. Parse output
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(prResult.stdout);
    } catch {
      throw new Error(`Failed to parse az output as JSON:\n${prResult.stdout}`);
    }

    const prId = parsed.pullRequestId as number;
    const prUrl = `${ADO_ORG}/${ADO_PROJECT}/_git/odsp-web/pullrequest/${prId}`;

    this.logger?.info("pr-create", `PR #${prId} created: ${prUrl}`);

    return { prId, prUrl, branch, draft };
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /workspaces/dev.AgentOW/ts && npm run typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /workspaces/dev.AgentOW
git add ts/src/ow/tools/prClient.ts
git commit -m "feat: add prClient.ts — git push + az repos pr create"
```

---

## Task 4: Register `ow-pr-create` tool

**Files:**
- Modify: `ts/src/ow/mcp/owTools.ts`

- [ ] **Step 1: Add import**

At the top of `ts/src/ow/mcp/owTools.ts`, add after the existing imports:

```typescript
import { PrClient } from "../tools/prClient.js";
```

- [ ] **Step 2: Instantiate PrClient**

Inside `registerOwTools()`, after `const git = new GitClient(...)` (line 37), add:

```typescript
  const pr = new PrClient(OW.odspWebRoot, logger);
```

- [ ] **Step 3: Register the tool**

Add before the closing `}` of `registerOwTools()` (before line 290):

```typescript
  // ── 14. ow-pr-create ─────────────────────────────────────────────────────
  registerMcpTool(server, "ow-pr-create", {
    description: "Push current branch to origin and create a draft PR on Azure DevOps. Branch must match 'user/<alias>/<feature>' pattern. Returns PR URL.",
    inputSchema: {
      title: z.string().describe("PR title (keep under 70 chars)"),
      description: z.string().describe("PR body in markdown"),
      targetBranch: z.string().optional().describe("Target branch (default: main)"),
      draft: z.boolean().optional().describe("Create as draft (default: true)"),
      workItems: z.string().optional().describe("Space-separated work item IDs to link"),
    },
  }, async (input, extras) => {
    const result = await pr.createPr({
      title: input.title,
      description: input.description,
      targetBranch: input.targetBranch,
      draft: input.draft,
      workItems: input.workItems,
    }, extras.signal);
    return successResultWithDebug(logger, "ow-pr-create", result);
  });
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /workspaces/dev.AgentOW/ts && npm run typecheck`
Expected: no errors

- [ ] **Step 5: Build**

Run: `cd /workspaces/dev.AgentOW/ts && npm run build`
Expected: `dist/ow/index.js` created without errors

- [ ] **Step 6: Commit**

```bash
cd /workspaces/dev.AgentOW
git add ts/src/ow/mcp/owTools.ts
git commit -m "feat: register ow-pr-create MCP tool"
```

---

## Task 5: Update MCP instructions

**Files:**
- Modify: `ts/src/ow/mcp/instructions.ts`

- [ ] **Step 1: Update instructions**

Replace the entire content of `ts/src/ow/mcp/instructions.ts` with:

```typescript
export const OW_MCP_INSTRUCTIONS = `
You are connected to the ow MCP server — a dev toolkit for odsp-web development running inside a GitHub Codespace.

## Available Tools

### Environment
- ow-status          — ALWAYS call first. Returns: git branch, rush install status, tmux sessions, node version.

### Rush
- ow-rush            — Run any rush command with structured output and error parsing.
- ow-build           — rush build -t <project>. Auto-scopes from git diff if project not specified.
- ow-test            — rush test with Jest output parsing (passed/failed/skipped).
- ow-start           — Start rush start --to <project> in a tmux window. Returns tmux target.
- ow-debuglink       — Extract debug link from rush start output. Pass sharePointPageUrl to get a ready-to-use fullTestUrl.

### Tmux Sessions (for long-running processes like rush start)
- ow-session-open     — Open/attach a named tmux window.
- ow-session-send     — Send text to a tmux pane.
- ow-session-capture  — Capture visible output of a tmux pane.
- ow-session-list     — List all tmux windows.
- ow-session-kill     — Kill a tmux window or the entire session.
- ow-session-interrupt — Send Ctrl+C to a tmux pane.

### Git
- ow-git             — Run git commands with structured output.

### PR Creation
- ow-pr-create       — Push current branch and create a draft PR on Azure DevOps. Returns PR URL.

## Development Loop

Since Claude Code runs directly inside the Codespace, all commands execute locally:

1. ow-status — confirm git branch, node version, rush state.
2. Edit code directly (Read/Edit/Write/Grep/Glob on /workspaces/odsp-web).
3. ow-build — rush build.
4. ow-test — rush test.
5. ow-start — rush start in tmux for dev server.
6. ow-session-capture on 'agentow:rush' — poll until [WATCHING] or FAILURE:.
7. ow-debuglink — extract debug URL from rush output.
8. ow-pr-create — push and create draft PR when ready.

## Rules

- Never use npm/pnpm/yarn/jest/tsc/webpack directly — always use rush.
- Tests run on compiled .js in lib-commonjs, not .ts source.
- If package.json was edited, run rush update before rush build.
- Rush project names use @ms/ scope (e.g. @ms/sp-pages). Check rush.json for valid names.
- Tmux targets use 'agentow:<windowname>' format.
- To stop rush: ow-session-send with text='q' pressEnter=false.
- To invalidate cache: ow-session-send with text='i' pressEnter=false.
`;
```

- [ ] **Step 2: Build**

Run: `cd /workspaces/dev.AgentOW/ts && npm run build`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
cd /workspaces/dev.AgentOW
git add ts/src/ow/mcp/instructions.ts
git commit -m "docs: add ow-pr-create to MCP instructions, update ow-debuglink description"
```

---

## Task 6: Rewrite `ow-evaluator.md`

**Files:**
- Rewrite: `agents/ow-evaluator.md`

- [ ] **Step 1: Replace the file**

Write `agents/ow-evaluator.md` with the following complete content:

```markdown
---
model: opus
permission: bypassPermissions
name: ow-evaluator
description: "Verify implementation via Playwright MCP on SharePoint pages with debug links. Takes screenshots, inspects DOM, produces structured evidence reports."
allowedTools:
  - ow-status
  - ow-debuglink
  - ow-start
  - ow-session-capture
  - ow-session-send
  - ow-session-list
  - Read
  - Write
  - Glob
  - Grep
  - Bash
disallowedTools:
  - ow-build
  - ow-rush
  - ow-git
  - ow-pr-create
  - ow-session-kill
  - ow-session-interrupt
  - Edit
---

# ow-evaluator

You are the **evaluator** agent in the odsp-web agent team. Your job is to verify that the generator's implementation meets the plan's acceptance criteria using **Playwright MCP** for interactive browser verification.

## Input

You receive a message from the orchestrator containing:
- `planPath` — path to the plan file
- `reportFile` — path to shared NDJSON report file
- `cycle` — iteration number
- `generatorReport` — the generator's NDJSON record (parsed)

## Default Test Page

```
https://microsoft.sharepoint-df.com/sites/JimuCommTest2/SitePages/A-ElevationTest.aspx
```

If the plan specifies a different test page in its acceptance criteria, use that instead.

## Steps

### Step 1: Read Plan & Extract Criteria

```
Read {planPath}
```

Extract all acceptance criteria. For each criterion, classify:
- **UI criterion** — requires Playwright MCP verification (browser navigation, DOM inspection, screenshot)
- **Non-UI criterion** — verified via code inspection (Read/Grep)

Determine the test page URL: use plan-specified URL if present, otherwise the default above.

### Step 2: Check Generator Status

Read `{reportFile}`, find the latest `ow-generator` NDJSON record. Confirm:
- `buildStatus` is `"success"`
- `testStatus` is `"pass"`
- `rushStartTarget` exists (dev server should be running)

If generator status is not success, stop and report failure to orchestrator.

### Step 3: Get Debug Link

```
ow-debuglink(sharePointPageUrl=<test page URL>)
```

This returns `fullTestUrl` — the complete URL with debug query string appended.

**If no debug link** (rush not running):
1. Try `ow-start(project=<from plan>)` to launch rush
2. Poll `ow-session-capture(target="agentow:rush")` until `[WATCHING]` appears
3. Retry `ow-debuglink(sharePointPageUrl=<page>)`
4. If still no link → fall back to code inspection for all criteria, mark UI criteria as UNVERIFIED

### Step 4: Create Evidence Directory

```bash
mkdir -p <sessionDir>/evaluation/iter<N>/
```

Where `<sessionDir>` is the `.aero/{fruit}/` directory from the orchestrator.

### Step 5: Playwright MCP Interactive Verification

For each **UI criterion**:

1. **Navigate**: `browser_navigate(url=<fullTestUrl>)`
2. **Wait for load**: `browser_snapshot()` — check that the page has loaded (look for SPFx webpart containers in the accessibility tree, not just the page shell). If page shows AAD login, ask the user to log in manually and retry.
3. **Inspect DOM**: `browser_snapshot()` — analyze the accessibility tree:
   - Check that expected elements exist
   - Check text content matches expectations
   - Check element visibility/state
   - Record the relevant DOM snippet as evidence
4. **Screenshot**: `browser_screenshot()` — save evidence. Note the screenshot path.
5. **Record result**: PASS if DOM state matches criterion, FAIL with specific details if not.

For each **non-UI criterion**:
- Use `Read`/`Grep` to inspect source code
- Verify changes match the plan
- Check test coverage exists

### Step 6: Write Evidence Report

Write a markdown report to `<sessionDir>/evaluation/YYYY-MM-DD-iter<N>.md`:

```markdown
# Evaluation Report — iter{N}

## Context
- Plan: {planPath}
- Branch: {branch}
- Test URL: {fullTestUrl}
- Cycle: {N}

## Criteria Results

### Criterion 1: <description>
**Method**: PlaywrightMCP
**Expected**: <from acceptance criteria>
**Screenshot**: evaluation/iter{N}/criterion-1-<desc>.png
**DOM Evidence**:
<relevant DOM snippet or accessibility tree excerpt from browser_snapshot>
**Result**: PASS / FAIL
**Reason**: <if FAIL, specific reason with details>

### Criterion 2: <description>
**Method**: CodeInspection
**Expected**: <from acceptance criteria>
**Evidence**: <code snippet or grep result>
**Result**: PASS / FAIL

## Overall Result: PASS / FAIL

## Blockers (if FAIL)
- Criterion {id}: <description> — Suggested fix: <file:line + specific change>
```

### Step 7: Write NDJSON Report

Append to `{reportFile}`:

```json
{
  "sender": "ow-evaluator",
  "timestamp": "<ISO>",
  "status": "success",
  "result": "PASS|FAIL",
  "cycle": 1,
  "evalReportPath": "<sessionDir>/evaluation/YYYY-MM-DD-iter<N>.md",
  "fullTestUrl": "<complete test URL>",
  "criteriaResults": [
    {
      "id": 1,
      "description": "<criterion>",
      "methods": ["PlaywrightMCP"],
      "status": "PASS|FAIL|UNVERIFIED",
      "evidence": "<DOM snippet / screenshot path>"
    }
  ],
  "blockers": [],
  "details": "<narrative>"
}
```

## Rules

- **Playwright MCP is the primary verification method** for UI criteria. Code inspection is secondary.
- **Every UI criterion must have a screenshot** — save to the evidence directory.
- **Every UI criterion must have DOM evidence** — use `browser_snapshot` and record the relevant snippet.
- **Be specific in evidence** — quote exact DOM elements, text content, attribute values.
- **Be specific in blockers** — include file paths, line numbers, and concrete fix suggestions.
- Do NOT modify source code — you are a verifier, not a fixer.
- Do NOT build or run rush commands (except ow-start as fallback if rush is not running).
- Always write the evidence report and append NDJSON, even if evaluation encounters errors.
- A criterion is UNVERIFIED only if it genuinely cannot be checked (e.g. odsp-next package needing cookie injection). Don't use UNVERIFIED as a cop-out.
- If `browser_snapshot` shows an AAD login page instead of SharePoint content, ask the user to log in manually in the Playwright browser, then retry.

## Verification Paths

| Package type | Method | Status |
|-------------|--------|--------|
| sp-client (SPFx) | fullTestUrl → Playwright MCP | Supported |
| odsp-next | devhost + cookie injection | Deferred — falls back to code inspection |
```

- [ ] **Step 2: Commit**

```bash
cd /workspaces/dev.AgentOW
git add agents/ow-evaluator.md
git commit -m "feat: rewrite ow-evaluator with Playwright MCP interactive verification"
```

---

## Task 7: Update `ow-orchestrator.md`

**Files:**
- Modify: `agents/ow-orchestrator.md`

- [ ] **Step 1: Add ow-pr-create to allowedTools**

In `agents/ow-orchestrator.md`, update the frontmatter `allowedTools` list to add `ow-pr-create`:

```yaml
allowedTools:
  - ow-status
  - ow-session-list
  - ow-pr-create
  - Read
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
  - SendMessage
```

- [ ] **Step 2: Replace Step 4 section**

Replace the entire `### Step 4: Loop or Complete` section and everything after it (from line `### Step 4:` to end of the `## Rules` section), with:

```markdown
### Step 4: Loop or Complete

**If evaluator result is FAIL:**
1. Check cycle count. If `cycle >= 5`:
   - Inform user: "Max retry cycles reached. Here are the remaining blockers: ..."
   - Show blockers from evaluator
   - Ask user for guidance
2. If `cycle < 5`:
   - Inform user: "Evaluation found issues. Starting fix cycle <N+1>..."
   - Show blockers from evaluator
   - Go back to **Step 2** with `cycle = N + 1` and `blockers` from evaluator

**If evaluator result is PASS:**
Proceed to Step 5.

### Step 5: Review and PR

#### Step 5a: Code Review

Invoke `ow-review-agent`:

```
reportFile: <reportFile>
branch: <branch>
```

Wait for completion, read review NDJSON from `reportFile`.

#### Step 5b: Check Review Verdict

- If `verdict` is `REQUEST_CHANGES` and `criticalCount > 0`:
  - Show critical findings to user
  - Ask: "Review found {N} critical issues. Create PR anyway? (yes/no)"
  - If no → stop and report
- Otherwise → proceed to PR creation

#### Step 5c: Create PR

Invoke `ow-pr-create`:

```
title: <plan spec title>
description: |
  ## Summary
  <from plan spec>

  ## Changes
  <list from generator tasksCompleted>

  ## Testing
  - Build: {buildStatus}
  - Unit tests: {passed} passed, {failed} failed
  - Playwright verification: {criteriaResults count} criteria passed
```

#### Step 5d: Report to User

```
Feature complete!
PR: <prUrl>
Review: <verdict> (<criticalCount> critical, <warningCount> warnings)
Evaluation report: <evalReportPath>
```
```

- [ ] **Step 3: Commit**

```bash
cd /workspaces/dev.AgentOW
git add agents/ow-orchestrator.md
git commit -m "feat: add auto review + PR creation to orchestrator (Step 5)"
```

---

## Task 8: Create `ow-dev-playwright` skill

**Files:**
- Create: `skills/ow-dev-playwright/SKILL.md`

- [ ] **Step 1: Create directory and file**

```bash
mkdir -p /workspaces/dev.AgentOW/skills/ow-dev-playwright
```

Write `skills/ow-dev-playwright/SKILL.md`:

```markdown
---
name: ow-dev-playwright
description: "Must invoke this skill if use/match: playwright, browser_navigate, browser_snapshot, browser_screenshot, browser_click, DOM assertion, SharePoint page test, debug verification, headed browser, accessibility tree"
---

# Playwright MCP Verification

## Tool Reference

| Tool | Purpose |
|------|---------|
| `browser_navigate` | Go to a URL |
| `browser_snapshot` | Get accessibility tree / DOM structure (primary inspection tool) |
| `browser_screenshot` | Save page screenshot as PNG |
| `browser_click` | Click element by text or selector |
| `browser_type` | Type text into an input field |

## Authentication

Browser profile is stored at `/workspaces/.playwright-profile`. The Playwright MCP server is started with `--user-data-dir` pointing to this directory.

- **First use**: user must manually log in to SharePoint in the Playwright browser. Session cookies persist in the profile.
- **Subsequent uses**: session is automatically reused. No login needed.
- **Session expired**: `browser_snapshot` will show an AAD login page instead of SharePoint content. Ask the user to log in manually, then retry.

## SharePoint Page Loading

After `browser_navigate`, the page needs time to load SPFx bundles:

1. Call `browser_snapshot()` to check page state
2. Look for webpart container elements in the accessibility tree — not just the page shell
3. If snapshot shows "Loading..." or spinner elements, wait a few seconds and snapshot again
4. If snapshot shows "This site can't be reached" for localhost → rush start is not running

SPFx debug manifests are fetched from localhost. The debug query string redirects `sp-loader` to load bundles from the local dev server instead of CDN.

## DOM Verification Pattern

1. `browser_navigate(url=<fullTestUrl>)` — navigate to SharePoint page with debug params
2. `browser_snapshot()` — get accessibility tree
3. Search the tree for target elements by role, name, or text content
4. Verify: element exists, has correct text, is visible, has expected attributes
5. `browser_screenshot()` — save visual evidence
6. Record DOM snippet + screenshot path in evaluation report

## Gotchas

- **AAD consent prompts**: if `browser_snapshot` shows "Permissions requested", the agent cannot auto-approve. Ask user to approve manually.
- **SPFx manifest 404**: the debug query string URL must match the exact localhost port from `rush start`. Use `ow-debuglink` to get the correct URL — never hardcode ports.
- **Multiple webparts on page**: use `browser_snapshot` accessibility tree to identify the correct webpart by component name or aria-label.
- **Slow initial load**: first load after `rush start` may take 10-30 seconds while webpack compiles. Poll with `browser_snapshot` rather than using fixed waits.
- **Cache invalidation**: if the page shows stale content, send `i` to the rush tmux pane via `ow-session-send(target="agentow:rush", text="i", pressEnter=false)` to invalidate, then reload.
```

- [ ] **Step 2: Commit**

```bash
cd /workspaces/dev.AgentOW
git add skills/ow-dev-playwright/SKILL.md
git commit -m "feat: add ow-dev-playwright skill for Playwright MCP verification guidance"
```

---

## Task 9: Update `ow-dev-debuglink` skill

**Files:**
- Modify: `skills/ow-dev-debuglink/SKILL.md`

- [ ] **Step 1: Append new section**

Add the following after the existing `## Gotchas` section at the end of `skills/ow-dev-debuglink/SKILL.md`:

```markdown

## Constructing Full Test URLs

### sp-client (SPFx webparts)
Combine SharePoint page URL + debug query string from rush start:

```
Full URL = <page URL> + <debug query string>
Example: https://microsoft.sharepoint-df.com/sites/JimuCommTest2/SitePages/A-ElevationTest.aspx?debugManifestsFile=https://localhost:4321/temp/manifests.js&loadSPFX=true
```

Use `ow-debuglink` with `sharePointPageUrl` parameter to construct automatically:

```
ow-debuglink(sharePointPageUrl="https://microsoft.sharepoint-df.com/sites/JimuCommTest2/SitePages/A-ElevationTest.aspx")
→ returns fullTestUrl ready for browser_navigate
```

### odsp-next
Requires devhost link + cookie injection in browser console.
Details TBD — see Codespace CLAUDE.md for cookie injection steps.
Currently falls back to code inspection if odsp-next is detected.

### Default Test Page
```
https://microsoft.sharepoint-df.com/sites/JimuCommTest2/SitePages/A-ElevationTest.aspx
```

The planner can specify a different page in the plan's acceptance criteria.
The evaluator uses the plan's page if specified, otherwise the default.

### Testing Flights Locally
sp-client: append `&expOverrides=[[<flightId>,1]]` to the full test URL to enable a flight.
Disable: append `&expOverrides=[[<flightId>,0]]` instead.
```

- [ ] **Step 2: Commit**

```bash
cd /workspaces/dev.AgentOW
git add skills/ow-dev-debuglink/SKILL.md
git commit -m "docs: add full URL construction and default test page to ow-dev-debuglink skill"
```

---

## Task 10: Add Playwright hook to `hooks.json`

**Files:**
- Modify: `hooks/hooks.json`

- [ ] **Step 1: Add the hook entry**

In `hooks/hooks.json`, add a new entry at the end of the `PreToolUse` array (after the Bash entry, before the closing `]`):

```json
      ,
      {
        "description": "browser_* Playwright MCP tools: load ow-dev-playwright — authentication, page loading, DOM inspection patterns",
        "matcher": "browser_",
        "hooks": [
          {
            "type": "command",
            "command": "bash ${CLAUDE_PLUGIN_ROOT}/hooks/check-skill-required.sh ow-dev-playwright",
            "timeout": 3
          }
        ]
      }
```

- [ ] **Step 2: Validate JSON**

Run: `cd /workspaces/dev.AgentOW && python3 -c "import json; json.load(open('hooks/hooks.json'))"`
Expected: no output (valid JSON)

- [ ] **Step 3: Commit**

```bash
cd /workspaces/dev.AgentOW
git add hooks/hooks.json
git commit -m "feat: add browser_ hook guard for ow-dev-playwright skill injection"
```

---

## Task 11: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add Playwright MCP to prerequisites**

After the existing prerequisites list (line 12), add:

```markdown
- Playwright MCP server (for evaluator browser verification)
```

- [ ] **Step 2: Add Playwright MCP setup section**

After the "### 5. Enable Agent Teams" section (after line 67), add:

```markdown
### 6. Register Playwright MCP (for evaluator)

```bash
claude mcp add --scope user playwright -- npx @playwright/mcp@latest --user-data-dir=/workspaces/.playwright-profile
```

On first use, the evaluator will open a browser. Log in to SharePoint manually once — the session persists for future runs.
```

Update the subsequent section number ("### 6. Restart" becomes "### 7. Restart").

- [ ] **Step 3: Add ow-pr-create to MCP tools table**

In the `### MCP Tools` table (after the `ow-session-interrupt` row, line 134), add:

```markdown
| `ow-pr-create` | Push branch and create draft PR on Azure DevOps |
```

Update the tool count from "13 total" to "14 total" (line 119).

- [ ] **Step 4: Update evaluator description in Agents table**

Change the `ow-evaluator` row (line 144) from:

```
| `ow-evaluator` | opus | Verify acceptance criteria |
```

to:

```
| `ow-evaluator` | opus | Verify via Playwright MCP on SharePoint + code inspection |
```

- [ ] **Step 5: Add ow-dev-playwright to Skills table**

Add a row to the Skills table (after the `search-odspweb-wiki` row):

```markdown
| `ow-dev-playwright` | Playwright MCP, browser verification |
```

- [ ] **Step 6: Update Quick Start orchestrator description**

Update line 91 from:

```
4. Loop if needed (max 5 cycles)
```

to:

```
4. Loop if needed (max 5 cycles)
5. **ow-review-agent** — code review
6. **ow-pr-create** — push + draft PR on Azure DevOps
```

- [ ] **Step 7: Commit**

```bash
cd /workspaces/dev.AgentOW
git add README.md
git commit -m "docs: update README with ow-pr-create, Playwright MCP setup, evaluator changes"
```

---

## Task 12: Final build and verify

**Files:** None (verification only)

- [ ] **Step 1: Clean build**

```bash
cd /workspaces/dev.AgentOW/ts
rm -rf dist
npm run build
```

Expected: `dist/ow/index.js` created

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

Expected: no errors

- [ ] **Step 3: Verify plugin structure**

```bash
cd /workspaces/dev.AgentOW
echo "--- Plugin manifest ---"
cat .claude-plugin/plugin.json
echo "--- Agents ---"
ls agents/
echo "--- Skills ---"
ls -d skills/*/
echo "--- Hooks ---"
cat hooks/hooks.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'{len(d[\"hooks\"][\"PreToolUse\"])} PreToolUse hooks')"
echo "--- MCP tools ---"
grep 'registerMcpTool' ts/src/ow/mcp/owTools.ts | wc -l
```

Expected:
- 5 agent files
- 8 skill directories (7 existing + ow-dev-playwright)
- 6 PreToolUse hooks (5 existing + browser_)
- 14 registerMcpTool calls (13 existing + ow-pr-create)

- [ ] **Step 4: Commit all remaining changes**

```bash
cd /workspaces/dev.AgentOW
git status
# If any uncommitted files, add and commit them
```
