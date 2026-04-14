---
name: ow-dev-debuglink
description: "Must invoke this skill if use/match: rush start, debug link, debugManifestsFile, loadSPFX, devhost, localhost, dev server, inner loop, debug URL"
---

# Debug Link Workflow

## Overview

`rush start` launches a local dev server that serves debug manifests. To test changes on a live SharePoint page, you append a debug query string to the page URL.

## Workflow

### Step 1: Start Dev Server

```bash
# Start rush start in tmux (via ow-start tool)
ow-start --project <package-name>
```

This runs `rush start --to <project>` in a tmux window named `rush`.

### Step 2: Wait for Ready

Poll `ow-session-capture` on target `agentow:rush` until you see:
- `[WATCHING]` — dev server is ready
- `FAILURE:` — build failed, investigate errors

```bash
# Poll tmux output
ow-session-capture --target agentow:rush
```

### Step 3: Extract Debug Link

```bash
# Extract URLs from rush start output
ow-debuglink
```

Returns:
- `landingPage` — `https://localhost:<port>/`
- `debugQueryString` — `?debugManifestsFile=...` or `?loadSPFX=true&...`
- `devhostLink` — direct devhost URL if available

### Step 4: Use Debug Link

Append the debug query string to a SharePoint page URL:

```
https://<tenant>.sharepoint.com/sites/<site>/<page>?debugManifestsFile=https://localhost:<port>/temp/manifests.js
```

### Step 5: Verify

- Navigate to the SharePoint page with debug params
- The page loads your local dev code instead of production
- Verify the feature works as expected

## Tmux Controls

| Action | Command |
|--------|---------|
| Stop rush start | `ow-session-send` with `text='q'`, `pressEnter=false` |
| Invalidate cache | `ow-session-send` with `text='i'`, `pressEnter=false` |
| Interrupt (Ctrl+C) | `ow-session-interrupt` on `agentow:rush` |
| Check output | `ow-session-capture` on `agentow:rush` |

## Common Issues

| Symptom | Fix |
|---------|-----|
| Port already in use | Kill existing session: `ow-session-kill --name rush`, then restart |
| Dev server not starting | Check `ow-session-capture` output for build errors |
| Debug link not found | Wait longer — initial build can be slow; poll again |
| Page not loading debug code | Ensure the debug query string matches the localhost port |

## Gotchas

- The port is dynamically assigned — always extract it from rush start output, don't hardcode.
- Dashboard is available at `https://localhost:<port>/dashboard/index.html`.
- `rush start` must remain running in tmux while debugging — don't kill the session.
- Only one `rush start` can run at a time — stop existing one before starting another.
