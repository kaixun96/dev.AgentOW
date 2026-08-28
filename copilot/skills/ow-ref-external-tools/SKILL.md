---
name: ow-ref-external-tools
description: "Use when agentOW needs a GUID, user alias, timestamp, killswitch blueprint, Bluebird search, ADO work item or PR data, ODSP wiki content, Microsoft Learn, or merge-conflict guidance."
---

# ODSP-Web external tools

Use installed ODSP-Web tools instead of reimplementing them. Tool availability comes from
`capabilities.json`; never invent results when an optional server is unavailable.

## Baseline tools

- `odsp-generate-guid`: generate UUIDs; lowercase for `sp-client`, uppercase for ODSP
  common/next/service-worker conventions.
- `odsp-get-user-alias` and `odsp-get-timestamp`: obtain attribution values instead of guessing.
- `odsp-add-killswitch-*`: select the blueprint for the behavior-owning package.
- `odsp-remove-killswitch-sp-client`: graduation guidance for SP-Client.

## Bluebird

Call `_get_started` before the first semantic search. Then use `search_code`, `code_history`,
`search_file_paths`, `get_file_content`, `search_work_items`, or `search_wiki` as appropriate.
Confirm semantic-search conclusions in the real source before planning edits.

## Azure DevOps

- Use `wit_get_work_item` when a request cites a work item; its description and acceptance criteria
  are planning evidence.
- Use repository PR APIs for PR metadata and thread retrieval.
- For CLI fallback, use `az devops invoke` for PR threads; there is no `az repos pr threads`
  command. Pass `--detect false` and request JSON output.
- Compute PR diffs from `git merge-base`; do not treat `lastMergeTargetCommit` as the diff base.

## ODSP Wiki fallback

Prefer `search_wiki` when available. Otherwise use Azure DevOps REST with resource
`499b84ac-1321-427f-aa17-267ca6975798` against `ODSP-Web.wiki`. Include
`includeContent=true` when reading a page and handle continuation tokens.

Authentication or consent failures are explicit blockers; never store or echo tokens.
