# Automated Debug Link Testing + PR Creation

## Overview

Add an end-to-end automated verification and PR workflow to dev.AgentOW: the evaluator uses Playwright MCP to interactively navigate SharePoint pages with debug links, inspect DOM, take screenshots, and produce structured evidence reports. On PASS, the orchestrator automatically runs code review and creates a draft PR on Azure DevOps.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Playwright mode | Playwright MCP (interactive tool calls) | Agent can react to live page state; more flexible than scripted tests |
| Authentication | Browser Profile persistence (`--user-data-dir`) | First manual login, then auto-reuse session; avoids MFA automation |
| PR creation | Fully automatic (push + draft PR) | User wants zero-friction flow |
| Test page selection | Default page + plan can override | Covers 80% with default, plan handles special cases |
| Evidence dimensions | 4: Screenshot, DOM Inspection, Code Inspection, Build/Test Status | Playwright MCP doesn't support recordVideo/recordHar; Code Inspection compensates |
| odsp-next support | Deferred (requires cookie injection; details TBD from Codespace CLAUDE.md) | sp-client path first |

## Prerequisites

### Playwright MCP Registration

```bash
claude mcp add --scope user playwright -- npx @playwright/mcp@latest --user-data-dir=/workspaces/.playwright-profile
```

### First-Time SharePoint Login

After registering Playwright MCP, the user must manually log in to SharePoint once in the Playwright browser. The session persists in `/workspaces/.playwright-profile` and is reused by the evaluator agent.

---

## Change Inventory

### 1. New MCP Tool: `ow-pr-create`

**File**: `ts/src/ow/tools/prClient.ts` (new)
**Registration**: `ts/src/ow/mcp/owTools.ts`

**Purpose**: One-step git push + Azure DevOps draft PR creation.

**Input Schema**:
```typescript
{
  title: string,           // PR title
  description: string,     // PR body (markdown)
  targetBranch?: string,   // Default: "main"
  draft?: boolean,         // Default: true
  workItems?: string,      // Space-separated work item IDs
}
```

**Internal Logic**:
1. `git rev-parse --abbrev-ref HEAD` → get current branch
2. Validate branch matches `user/<alias>/<feature>` pattern
3. `git push -u origin <branch>`
4. `az repos pr create --repository 3829bdd7-1ab6-420c-a8ec-c30955da3205 --source-branch <branch> --target-branch <target> --title <title> --description <desc> --draft <draft> --org https://dev.azure.com/onedrive --project ODSP-Web`
5. Parse PR ID and URL from output

**Output Schema**:
```typescript
{
  prId: number,
  prUrl: string,
  branch: string,
  draft: boolean,
}
```

**Error Handling**:
- Branch name invalid → reject with error message
- `git push` fails → return git stderr
- `az` command fails → return full stderr
- `az` not installed or not authenticated → return setup instructions

**Agent Permissions**:
- `ow-orchestrator`: add to `allowedTools`
- All other agents: add to `disallowedTools`

---

### 2. Modified MCP Tool: `ow-debuglink`

**File**: `ts/src/ow/tools/debugLink.ts` (modify)
**Registration**: `ts/src/ow/mcp/owTools.ts` (modify)

**Change**: Add `sharePointPageUrl` input parameter and `fullTestUrl` output field.

**New Input Schema**:
```typescript
{
  target?: string,              // Tmux target (default: "agentow:rush")
  sharePointPageUrl?: string,   // SharePoint page URL to prepend to debug query string
}
```

**New Output Schema** (additions only):
```typescript
{
  // ... existing fields (landingPage, debugQueryString, devhostLink, tmuxTarget)
  fullTestUrl?: string,   // NEW: sharePointPageUrl + debugQueryString combined
}
```

**URL Construction Logic** (in `debugLink.ts`):
```typescript
export function buildFullTestUrl(pageUrl: string, debugQueryString: string): string {
  const separator = pageUrl.includes("?") ? "&" : "?";
  return pageUrl + separator + debugQueryString.replace(/^\?/, "");
}
```

Only populated when both `sharePointPageUrl` and `debugQueryString` are present.

---

### 3. Rewritten Agent: `ow-evaluator.md`

**Change**: Complete rewrite. Code inspection fallback becomes secondary; Playwright MCP interactive verification becomes primary.

#### New Workflow

```
Step 1: Read plan → extract acceptance criteria
        Determine test page URL (from plan, or default)
        Default: https://microsoft.sharepoint-df.com/sites/JimuCommTest2/SitePages/A-ElevationTest.aspx

Step 2: Check generator status
        Read reportFile → confirm buildStatus=success, debugUrl exists

Step 3: Get debug link
        ow-debuglink(sharePointPageUrl=<page>)
        → fullTestUrl
        If no debug link (rush not running):
          → Try ow-start to launch rush, then retry ow-debuglink
          → If still no link → fallback to code inspection only

Step 4: Create evidence directory
        mkdir -p .aero/{fruit}/evaluation/iter{N}/

Step 5: Playwright MCP interactive verification
        For each UI criterion:
          a. browser_navigate(url=fullTestUrl)
          b. browser_snapshot() → get accessibility tree / DOM structure
          c. Analyze DOM: check element existence, text content, attributes, visibility
          d. browser_screenshot(path=evaluation/iter{N}/criterion-{id}-{desc}.png)
          e. Record: PASS/FAIL + evidence (DOM snippet, screenshot path)

        For each non-UI criterion:
          → Code inspection via Read/Grep

Step 6: Write markdown evidence report
        Path: .aero/{fruit}/evaluation/YYYY-MM-DD-iter{N}.md

        Structure:
        ---
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
        **DOM Evidence**: <relevant DOM snippet from browser_snapshot>
        **Result**: PASS / FAIL
        **Reason**: <if FAIL, specific reason>

        ### Criterion 2: ...

        ## Overall Result: PASS / FAIL

        ## Blockers (if FAIL)
        - Criterion {id}: <description> — Suggested fix: <file:line + what to change>
        ---

Step 7: Append NDJSON to reportFile
```

#### Updated NDJSON Schema

```json
{
  "sender": "ow-evaluator",
  "timestamp": "<ISO>",
  "status": "success|failure",
  "result": "PASS|FAIL",
  "cycle": 1,
  "evalReportPath": ".aero/{fruit}/evaluation/YYYY-MM-DD-iter{N}.md",
  "fullTestUrl": "<complete test URL>",
  "criteriaResults": [
    {
      "id": 1,
      "description": "<criterion>",
      "methods": ["PlaywrightMCP", "CodeInspection"],
      "status": "PASS|FAIL|UNVERIFIED",
      "evidence": "<DOM snippet / screenshot path / code reference>"
    }
  ],
  "blockers": [
    {
      "criterionId": 1,
      "description": "<what failed>",
      "suggestedFix": "<specific fix with file:line>"
    }
  ],
  "details": "<narrative>"
}
```

#### Updated allowedTools

```yaml
allowedTools:
  - ow-status
  - ow-debuglink
  - ow-start              # NEW: launch rush if not running
  - ow-session-capture
  - ow-session-send        # NEW: cache invalidation ('i')
  - ow-session-list
  - Read
  - Write
  - Glob
  - Grep
  - Bash
  # Playwright MCP tools (browser_*) auto-registered by MCP server
disallowedTools:
  - ow-build
  - ow-rush
  - ow-git
  - ow-pr-create           # NEW
  - ow-session-kill
  - ow-session-interrupt
  - Edit
```

#### Evidence Dimensions

| Dimension | Source | Artifact | When |
|-----------|--------|----------|------|
| Screenshot | `browser_screenshot` | `.png` in `evaluation/iter{N}/` | Every UI criterion |
| DOM Inspection | `browser_snapshot` | Text in markdown report | Every UI criterion |
| Code Inspection | `Read` / `Grep` | Text in markdown report | Non-UI criteria, or supplementary |
| Build/Test Status | Generator NDJSON record | Referenced in report | Always checked |

#### Verification Paths by Package Type

| Package type | Path | Status |
|-------------|------|--------|
| sp-client (SPFx) | fullTestUrl = SharePoint page + debug query string → Playwright MCP | Implemented |
| odsp-next | devhost link + cookie injection → Playwright MCP | Deferred (TBD) |

If package is odsp-next and cookie flow is not yet implemented, evaluator falls back to code inspection and marks UI criteria as UNVERIFIED with note "odsp-next Playwright verification not yet supported".

---

### 4. Modified Agent: `ow-orchestrator.md`

**Change**: Step 4 PASS branch becomes automated review + PR.

#### New Step 4 (PASS branch)

```
If evaluator result is PASS:

  Step 5a: Invoke ow-review-agent
    Send: reportFile, branch
    Wait for completion, read review NDJSON

  Step 5b: Check review verdict
    If verdict is REQUEST_CHANGES and criticalCount > 0:
      → Show critical findings to user
      → Ask: "Review found {N} critical issues. Create PR anyway? (yes/no)"
      → If no → stop
    Otherwise → proceed

  Step 5c: Invoke ow-pr-create
    title = plan spec title
    description = generated from plan + generator + evaluator reports:
      ## Summary
      <from plan spec>

      ## Changes
      <from generator tasksCompleted>

      ## Testing
      - Build: {buildStatus}
      - Unit tests: {passed} passed, {failed} failed
      - Playwright verification: {N} criteria passed

  Step 5d: Report to user
    "Feature complete!
     PR: <prUrl>
     Review: <verdict> (<criticalCount> critical, <warningCount> warnings)
     Evaluation report: <evalReportPath>"
```

#### Updated allowedTools

```yaml
allowedTools:
  - ow-status
  - ow-session-list
  - ow-pr-create            # NEW
  - Read
  - Glob
  - Grep
  - Bash
  - AskUserQuestion
  - SendMessage
```

---

### 5. New Skill: `ow-dev-playwright`

**File**: `skills/ow-dev-playwright/SKILL.md` (new)

**Trigger keywords**: playwright, browser_navigate, browser_snapshot, browser_screenshot, browser_click, DOM assertion, SharePoint page test, debug verification

**Content sections**:

1. **Playwright MCP Tool Reference**
   - `browser_navigate` — go to URL
   - `browser_snapshot` — get accessibility tree (primary DOM inspection tool)
   - `browser_screenshot` — save PNG
   - `browser_click` — click element by text/selector
   - `browser_type` — type text into input
   - `browser_wait` — wait for condition

2. **Authentication**
   - Browser profile at `/workspaces/.playwright-profile`
   - First login: manual via Playwright browser
   - Session reuse: automatic via `--user-data-dir`
   - Session expired: agent should detect AAD login page in `browser_snapshot` and ask user to re-login

3. **SharePoint Page Loading**
   - After `browser_navigate`, use `browser_snapshot` to confirm page is ready
   - SPFx loader may take 5-10s to fetch debug manifests from localhost
   - Look for webpart container elements in snapshot, not just page shell
   - If `browser_snapshot` shows "This site can't be reached" for localhost → rush start not running

4. **Gotchas**
   - AAD consent prompts: if snapshot shows "Permissions requested", agent cannot auto-approve — ask user
   - SPFx debug manifest 404: debug query string URL must match rush start port exactly
   - Multiple webparts on page: use snapshot to identify the correct one by component name

---

### 6. Modified Skill: `ow-dev-debuglink`

**File**: `skills/ow-dev-debuglink/SKILL.md` (modify)

**Addition**: New section after existing content:

```markdown
## Constructing Full Test URLs

### sp-client (SPFx webparts)
Combine SharePoint page URL + debug query string from rush start:

  Full URL = <page URL> + <debug query string>
  Example: https://microsoft.sharepoint-df.com/sites/JimuCommTest2/SitePages/A-ElevationTest.aspx?debugManifestsFile=https://localhost:4321/temp/manifests.js&loadSPFX=true

Use `ow-debuglink` with `sharePointPageUrl` parameter to construct automatically.

### odsp-next
Requires devhost link + cookie injection in browser console.
Details TBD — see Codespace CLAUDE.md for cookie injection steps.
Currently falls back to code inspection if odsp-next is detected.

### Default Test Page
https://microsoft.sharepoint-df.com/sites/JimuCommTest2/SitePages/A-ElevationTest.aspx

The planner can specify a different page in the plan's acceptance criteria.
The evaluator uses the plan's page if specified, otherwise the default.

### Testing Flights Locally
sp-client: append `&expOverrides=[[<flightId>,1]]` to the full test URL.
```

---

### 7. Modified Hook: `hooks/hooks.json`

**Addition**: New PreToolUse entry:

```json
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

---

### 8. Modified: `ts/src/ow/mcp/instructions.ts`

Add `ow-pr-create` to the tool documentation:

```
### PR Creation
- ow-pr-create       — Push current branch and create a draft PR on Azure DevOps. Returns PR URL.
```

Update `ow-debuglink` description:

```
- ow-debuglink       — Extract debug link from rush start output. Pass sharePointPageUrl to get a ready-to-use fullTestUrl.
```

---

### 9. Modified: `README.md`

Update these sections:

**MCP Tools table**: Add `ow-pr-create` row.
**Agent roles table**: Update evaluator description to mention Playwright MCP verification.
**Prerequisites**: Add Playwright MCP registration command and first-time login instruction.
**Quick Start**: Add note about Playwright MCP setup.

---

## Out of Scope

- odsp-next devhost + cookie injection verification path
- `ow-initiator` agent
- Frontmatter `permission` → `permissionMode` fix
- `ow-build`/`ow-test` RawOutputLog
- `ow-status` rush state inference
- HTTP transport for MCP server
- Test suite for MCP tools
- Video recording / HAR capture (Playwright MCP limitation)

---

## End-to-End Flow (After Changes)

```
User: "Build feature X for odsp-web"

orchestrator
  ├─ Step 0: Create session .aero/{fruit}/
  │
  ├─ Step 1: ow-planner
  │    → research → spec → plan → user approves
  │    → plan has acceptance criteria + optional test page URL
  │
  ├─ Step 2: ow-generator
  │    → code → rush update (if needed) → build → test
  │    → rush start in tmux → extract debug link → commit
  │
  ├─ Step 3: ow-evaluator
  │    → ow-debuglink(sharePointPageUrl) → fullTestUrl
  │    → browser_navigate(fullTestUrl)
  │    → browser_snapshot → DOM inspection
  │    → browser_screenshot → evidence
  │    → markdown report + NDJSON
  │
  ├─ Step 4: FAIL? → back to Step 2 with blockers (max 5 cycles)
  │
  ├─ Step 5a: ow-review-agent → code review
  ├─ Step 5b: ow-pr-create → draft PR on ADO
  └─ Step 5c: Report PR URL + review + evaluation to user
```
