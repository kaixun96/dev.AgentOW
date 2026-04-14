---
name: search-odspweb-wiki
description: "Must invoke this skill if use/match: wiki, documentation, ADO wiki, ODSP wiki, search wiki, find docs, architecture docs, design docs"
---

# Search ODSP-Web Wiki

## Overview

The ODSP-Web project wiki is hosted in Azure DevOps. Use `az rest` to search and read wiki pages.

## ADO Wiki Details

| Field | Value |
|-------|-------|
| ADO Org | `https://dev.azure.com/onedrive` |
| Project | `ODSP-Web` |
| Wiki identifier | `ODSP-Web.wiki` |

## Searching the Wiki

```bash
# List wiki pages (top-level)
az rest --method GET \
  --uri "https://dev.azure.com/onedrive/ODSP-Web/_apis/wiki/wikis/ODSP-Web.wiki/pages?api-version=7.0" \
  --resource "499b84ac-1321-427f-aa17-267ca6975798"

# Get a specific wiki page by path
az rest --method GET \
  --uri "https://dev.azure.com/onedrive/ODSP-Web/_apis/wiki/wikis/ODSP-Web.wiki/pages?path=/<page-path>&includeContent=true&api-version=7.0" \
  --resource "499b84ac-1321-427f-aa17-267ca6975798"

# Search wiki content (using Azure DevOps search API)
az rest --method POST \
  --uri "https://almsearch.dev.azure.com/onedrive/ODSP-Web/_apis/search/wikisearchresults?api-version=7.0" \
  --resource "499b84ac-1321-427f-aa17-267ca6975798" \
  --body '{
    "$top": 10,
    "searchText": "<search-query>",
    "filters": {
      "Project": ["ODSP-Web"]
    }
  }'
```

## Common Search Patterns

| Looking for... | Search query |
|----------------|-------------|
| Architecture overview | "architecture" or "overview" |
| Build instructions | "build" or "rush" |
| Deployment process | "deploy" or "pipeline" |
| Feature flags / killswitches | "killswitch" or "feature flag" |
| Testing guide | "test" or "testing" |
| Onboarding | "onboarding" or "getting started" |

## Gotchas

- The `--resource` parameter is the Azure DevOps resource ID — always include it for auth.
- Wiki paths use `/` separators (e.g. `/Architecture/Overview`).
- Large wiki pages may need pagination — check `continuationToken` in response.
- If `az rest` fails with auth error, ensure you're logged in: `az login`.
