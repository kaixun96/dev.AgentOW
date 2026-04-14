---
name: ow-dev-git
description: "Must invoke this skill if use/match: git, branch, checkout, merge, fetch, pull, commit, push, branch naming, feature branch"
---

# odsp-web Git Conventions

## CRITICAL RULES

- **ALL** branches MUST follow: `user/<alias>/<feature-name>`
- **ALWAYS** branch from `origin/main` (fetch first)
- **NEVER** commit directly to `main`
- **ALWAYS** run `rush install` after switching branches or pulling changes

## Branch Workflow

```bash
# 1. Fetch latest
git fetch origin

# 2. Create feature branch from latest main
git checkout -b user/<alias>/<feature-name> origin/main

# 3. Verify branch
git rev-parse --abbrev-ref HEAD

# 4. Install deps (required after branch switch)
rush install
```

## Naming Convention

Format: `user/<alias>/<feature-name>`

Examples:
- `user/kaixun/fix-elevation-mobile`
- `user/kaixun/add-photo-grid-resize`
- `user/kaixun/update-sp-pages-config`

Rules:
- `<alias>` = your Microsoft alias (e.g. `kaixun`)
- `<feature-name>` = lowercase, hyphen-separated, descriptive
- No spaces, no uppercase, no special characters

## Common Operations

```bash
# Check current branch
git rev-parse --abbrev-ref HEAD

# See changes
git status --short
git diff --stat

# Stage and commit
git add <files>
git commit -m "descriptive message"

# Push to remote
git push -u origin user/<alias>/<feature-name>

# Diff against main
git diff origin/main...HEAD --stat
```

## Gotchas

- After `git checkout` or `git pull`, always run `rush install` — dependencies may have changed.
- If `rush install` tells you to run `rush update`, do that instead.
- Use `git diff origin/main...HEAD` (three dots) for branch comparison.
- Never force-push to shared branches without confirming with the user first.
