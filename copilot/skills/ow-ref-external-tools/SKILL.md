---
name: ow-ref-external-tools
description: "Use when agentOW needs a GUID, user alias, timestamp, killswitch blueprint, Bluebird search, ADO work item or PR data, ODSP wiki content, Microsoft Learn, or merge-conflict guidance."
---

# ODSP-Web external tools

Use installed ODSP-Web tools instead of reimplementing them. Tool availability comes from
`capabilities.json`; never invent results when an optional server is unavailable.

## Baseline tools

- `odsp-generate-guid`: generate UUIDs; use uppercase for most projects and lowercase for
  `sp-client` only.
- `odsp-get-user-alias` and `odsp-get-timestamp`: obtain attribution values instead of guessing.
- Before using `odsp-add-killswitch-*`, read the odsp-web repository skill at
  `.ai/killswitches/skills/killswitches/SKILL.md` and apply every applicable killswitch rule in it,
  not only format guidance. If absent, resolve its replacement only under
  `.ai/killswitches/**/SKILL.md`; never silently skip this prerequisite.
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
