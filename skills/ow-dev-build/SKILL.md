---
name: ow-dev-build
description: "Must invoke this skill if use/match: rush, rush build, rush install, rush update, rush start, inner loop, devhost, SPFx debug, Heft error, lib-commonjs, build odsp-web, build failed, install failed, shrinkwrap"
---

# odsp-web Build & Install

## CRITICAL RULES

- **NEVER** use directly: `npm`, `pnpm`, `yarn`, `jest`, `tsc`, `webpack`, `npx` — ALWAYS use `rush` commands
- **NEVER** edit `*.test.js` files in `/lib-commonjs` — always edit `*.test.ts` in `<project>/src/`
- **ALWAYS** check that new imports have corresponding entries in `package.json` before building
- **ALWAYS** run `rush install` after cloning, pulling changes, or switching branches
- **ONLY** run `rush update` after adding/removing dependencies in `package.json`, adding/removing a package from `rush.json`, or modifying `common/config/rush`

## Quick Commands

| Task | Command |
|------|---------|
| Build project + deps | `rush --quiet build -t <package-name>` |
| Build from project dir | `rush --quiet build -t .` |
| Clean rebuild | `rush --quiet rebuild -t <package-name>` |
| Build by file path | `rush --quiet build -t path:/absolute/path/to/file.ts` |
| Install deps | `rush install` |
| Update lockfile | `rush update` |
| Inner loop dev server | `rush --quiet start -t <package-name>` |
| Clean everything | `rush purge` |

## Project Selectors

- `.` — current project directory
- `@ms/sp-pages` — package name from package.json
- `tag:<tag-name>` — e.g. `tag:spartan-apps`, `tag:odsp-next-apps`
- `path:/absolute/path/to/file.ts` — build project containing file
- `git:<ref>` — projects changed since git ref

## Selector Flags

- `-t` / `--to` — build target and all dependencies
- `-o` / `--only` — build only specified project(s)
- `--from` — build project, consumers, and all dependencies
- `--impacted-by` — build affected projects only

## Common Errors

| Symptom | Fix |
|---------|-----|
| Missing dependency / module not found | `rush install` (or `rush purge && rush install`) |
| "shrinkwrap-deps.json" error | `rush install` |
| After adding deps to package.json | `rush update` (NOT rush install) |
| Build stalls / cache issue | Delete `<project>/.heft/build-cache` |
| Peer dep warnings | `rm common/temp/last-install.flag && rush install` |
| Persistent issues | `rush purge` then `rush update` |
| Type errors in tests | Edit `.test.ts` in `src/`, not `.test.js` in `lib-commonjs/` |

## Gotchas

- Build commands emit status from upstream deps first — they may appear slow. Do NOT truncate output.
- Use `--quiet` flag to suppress Rush version info noise.
- The `-t` flag means "to" (target + deps). `-o` means "only" (no deps).
- `rush update` regenerates `pnpm-lock.yaml`. Only needed for package.json / rush.json changes.
- Build output folders vary: check project's `tsconfig.json` for `outDir`/`declarationDir`.
- Common output patterns: `lib/`, `lib-dts/`, `lib-esm/`, `lib-commonjs/`.
