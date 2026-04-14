---
name: ow-dev-pr
description: "Must invoke this skill if use/match: create PR, pull request, ADO PR, az repos, branch naming, draft PR, publish PR, code review"
---

# PR Workflow — odsp-web

## Repository Info

| Field | Value |
|-------|-------|
| ADO Org | `https://dev.azure.com/onedrive` |
| ADO Project | `ODSP-Web` |
| Repository ID | `3829bdd7-1ab6-420c-a8ec-c30955da3205` |
| Repo name | `odsp-web` |

## CRITICAL RULES

- **ALL** branches MUST follow: `user/<alias>/<feature-name>`
- **ALWAYS** create PRs as `--draft true` first (note: `--draft true`, NOT bare `--draft`)
- **ALWAYS** push your branch before creating a PR
- **NEVER** target anything other than `main` unless specifically instructed

## Creating a Draft PR

```bash
# 1. Push your branch first
git push -u origin user/<alias>/<feature-name>

# 2. Create draft PR
az repos pr create \
  --repository 3829bdd7-1ab6-420c-a8ec-c30955da3205 \
  --source-branch user/<alias>/<feature-name> \
  --target-branch main \
  --title "<title>" \
  --description "<description>" \
  --draft true \
  --org https://dev.azure.com/onedrive \
  --project ODSP-Web
```

## Publishing a Draft PR

```bash
az repos pr update \
  --id <pr-id> \
  --draft false \
  --org https://dev.azure.com/onedrive
```

## Viewing PR Details

```bash
az repos pr show \
  --id <pr-id> \
  --org https://dev.azure.com/onedrive
```

## PR Description Template

```markdown
## Summary
- Brief description of what changed and why

## Changes
- List of specific changes made

## Testing
- How the changes were tested
- Test results (pass/fail counts)

## Debug Link
- Include debug link if applicable for manual verification
```

## Common Errors

| Symptom | Fix |
|---------|-----|
| "TF401035: not found" | Wrong repository ID — use `3829bdd7-1ab6-420c-a8ec-c30955da3205` |
| "--draft is not recognized" | Use `--draft true` (with explicit `true`), not bare `--draft` |
| "branch not found on remote" | Push first: `git push -u origin <branch>` |
| Auth failure | Run `az login` or check PAT token |

## Gotchas

- The `--draft` flag in `az repos pr create` requires an explicit `true` value.
- Always use the repository GUID, not the name, for `--repository`.
- PR reviewers are auto-assigned by CODEOWNERS in this repo.
- CI pipelines run automatically on PR creation.
