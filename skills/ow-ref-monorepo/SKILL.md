---
name: ow-ref-monorepo
description: "Must invoke this skill if use/match: monorepo, rush.json, project structure, heft, rig, pnpm, package manager, lockfile, node_modules, build cache, eslint config"
---

# odsp-web Monorepo Reference

## Stack

| Layer | Tool |
|-------|------|
| Build orchestrator | Rush |
| Task runner | Heft |
| Package manager | pnpm (via Rush) |
| Module bundler | Webpack (per-project) |
| Transpiler | SWC (web rig) or TypeScript |
| Linter | ESLint |

## Key Paths

| What | Path |
|------|------|
| Monorepo root | `/workspaces/odsp-web` |
| Rush config | `/common/config/rush/` |
| Lockfile | `/common/config/rush/pnpm-lock.yaml` |
| pnpm overrides | `/common/config/rush/pnpm-config.json` |
| Node modules (symlinked) | `/common/temp/node_modules/.pnpm/` |
| Build cache | `common/temp/build-cache/` |
| ESLint config | `/tools/eslint-config/` |
| Web rig | `/tools/internal-web-rig` |
| Node tool rig | `/tools/internal-node-rig` |
| Node non-tool rig | `/tools/internal-non-tool-node-rig` |

## Per-Project Layout

```
<project>/
├── package.json
├── tsconfig.json         # typically extends from a rig
├── config/
│   ├── rush-project.json # cache config
│   ├── jest.config.json  # test config (if applicable)
│   └── heft.json         # heft task config
├── src/                  # TypeScript source
│   ├── index.ts
│   └── **/*.test.ts      # test files
├── lib-commonjs/         # CJS output (Jest runs here)
├── lib-esm/              # ESM output
└── lib-dts/              # Type declarations
```

## Heft Rigs (Build Profiles)

### Web packages (`/tools/internal-web-rig`)

**Transpile profile (current):** SWC transpilation
- ESM → `lib-esm/`
- CJS → `lib-commonjs/`
- Types → `lib-dts/`

**Default profile (deprecated):** TypeScript transpilation
- ESM → `lib/`
- CJS → `lib-commonjs/`
- Types → `lib/`

### Node packages

- Tool packages → `/tools/internal-node-rig`
- Non-tool packages → `/tools/internal-non-tool-node-rig`

## Build Output

Output folders vary by project. To find a project's output dirs:
1. Check `tsconfig.json` → `outDir`, `declarationDir`
2. Common patterns: `lib/`, `lib-dts/`, `lib-esm/`, `lib-commonjs/`
3. Jest always runs against CJS output in `lib-commonjs/`

## Rush Project Tags

Projects can have tags for group selection:
- `tag:spartan-apps` — Spartan app projects
- `tag:odsp-next-apps` — ODSP Next app projects

Use with: `rush build -t tag:<tag-name>`

## Coding Guidelines

- This repo enforces `@typescript-eslint/typedef` in most projects — add types for new code.
- Do not drop existing types when updating code.
- Use the `odsp-web:generate-guid` MCP tool when generating GUIDs — never generate manually.
