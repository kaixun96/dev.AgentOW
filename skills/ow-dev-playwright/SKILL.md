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
