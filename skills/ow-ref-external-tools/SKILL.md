---
name: ow-ref-external-tools
description: "Must invoke this skill if use/match: killswitch, KS, GUID, guid, generate guid, user alias, timestamp, bluebird, semantic search, code search, ADO work item, work item, ado link, visualstudio.com, merge conflict, code review, /cr"
---

# External Tools & Skills Available in This Codespace

This codespace has additional MCP servers and skills installed alongside agentOW. Use them instead of reimplementing their functionality.

## MCP Tools (from odsp-web-mcp-servers-opt-out)

These tools are always available — the plugin is enabled by default.

### odsp-generate-guid

Generate a UUID v4. **ALWAYS use this tool when you need a GUID** — never generate manually.

```
odsp-generate-guid(format="lowercase")   → sp-client killswitches
odsp-generate-guid(format="uppercase")   → odsp-next / odsp-common / service-worker killswitches
```

### odsp-get-user-alias

Returns the current user's Microsoft alias (e.g. `kaixun`). Use for killswitch comments, PR descriptions, branch names.

### odsp-get-timestamp

Returns the current date and time. Use for killswitch comments (MM/DD/YYYY format).

### odsp-add-killswitch-* (Blueprint Tools)

When adding a killswitch, invoke the project-specific blueprint tool. It auto-generates GUID + alias + timestamp and provides the exact code snippet:

| File location | Blueprint tool |
|---------------|----------------|
| `sp-client/**` | `odsp-add-killswitch-sp-client` |
| `odsp-next/**`, `odsp-common/**` (excl. SW/Photos) | `odsp-add-killswitch-common-next` |
| `odsp-common/odsp-serviceworker/**` | `odsp-add-killswitch-service-worker` |
| `odsp-common/high-value-components/onedrive-photos/**` | `odsp-add-killswitch-onedrive-photos` |

### odsp-remove-killswitch-sp-client

Guidance for graduating (removing) killswitches in sp-client.

---

## MCP Tools (from odsp-web-mcp-servers-opt-in)

These require the opt-in plugin to be enabled. Check availability before using.

### Bluebird (Semantic Code Search)

Much better than grep for understanding code — uses a pre-built index covering the entire repo.

**IMPORTANT:** Call `_get_started` FIRST before any search. Without it, natural language queries return 0 results.

| Tool | Use for |
|------|---------|
| `search_code` | Find code by concept, class/method prefixes, file/path filters |
| `code_history` | Git history for a file or symbol |
| `search_file_paths` | Find files by path pattern |
| `list_directory` | Browse directory contents |
| `get_file_content` | Read file content |
| `search_work_items` | Find ADO work items |
| `search_wiki` | Search ADO wiki |

### ADO (Azure DevOps)

Full access to work items, PRs, repos, pipelines.

| Tool | Use for |
|------|---------|
| `wit_get_work_item` | Get work item details by ID |
| `wit_my_work_items` | List my assigned work items |
| `repo_list_pull_requests_by_repo_or_project` | List PRs |
| `repo_get_pull_request_by_id` | Get PR details |
| `repo_list_pull_request_threads` | Get PR comments/threads |
| `pipelines_get_builds` | Get build results |

### Microsoft Learn

| Tool | Use for |
|------|---------|
| `microsoft_docs_search` | Search official MS/Azure docs |
| `microsoft_code_sample_search` | Find code samples |
| `microsoft_docs_fetch` | Fetch full doc page as markdown |

---

## Skills (from other plugins)

### Killswitch Skill (odsp-web-mcp-servers-opt-out)

Comprehensive guidance at `.ai/odsp-web-mcp-servers-opt-out/skills/killswitches/SKILL.md`. Key rules:

- **Activated KS = OLD/fallback code**, NOT activated = NEW code
- `!isActivated()` → new code runs (normal), `isActivated()` → old code runs (emergency)
- **Never suggest activating a KS as a bug fix** — fix the new code instead
- **Direction pattern:** `if (!isMyKSActivated()) { newCode } else { oldCode }`
- **Ternary:** `!isMyKSActivated() ? newValue : oldValue`
- **GUID case:** lowercase for sp-client, UPPERCASE for everything else
- sp-client uses `_SPKillSwitch` from `@microsoft/sp-core-library`
- odsp-next/common uses `KillSwitch` from `@msinternal/utilities-killswitch`

### ADO/VSO Link Handler (odsp-web-mcp-servers-opt-out)

URL parser at `.ai/odsp-web-mcp-servers-opt-out/skills/ado-vso-link/parse-vso-url.ts`. Handles PR links, file links, comment threads.

Key patterns:
- Use `az devops invoke` for PR threads (no `az repos pr threads` command exists)
- Always use `--detect false` and `-o json` with az commands
- For PR diffs: compute merge-base with `git merge-base` — do NOT use `lastMergeTargetCommit` directly

### Code Review (/cr from code-review-tools)

Structured 3-agent parallel code review. Invoke via `/cr` skill. Supports:
- GitHub PRs, ADO PRs, and local branch diffs
- Agent 1: Correctness & Security
- Agent 2: Patterns, Modularity & React
- Agent 3: Docs, Style, Conventions + CLAUDE.md gap analysis

### Merge Conflict Resolution (odsp-fix-merge-conflict blueprint)

Available as a blueprint tool. Key workflow:
- `pnpm-lock.yaml` conflicts: `git checkout --theirs` + `rush update` — never resolve manually
- Default strategy: merge (not rebase)
- Resolve one file at a time
