---
name: ow-ref-monorepo
description: "Use for Rush, Heft, pnpm, rigs, project tags, lockfiles, package outputs, build cache, or ODSP-Web monorepo structure."
---

# ODSP-Web monorepo reference

- Rush orchestrates builds; Heft runs project phases; pnpm is managed through Rush.
- Read the project's `package.json`, `tsconfig.json`, `config/rush-project.json`, `heft.json`, and
  Jest config before choosing commands.
- Web packages normally use `tools/internal-web-rig`; Node tools and non-tools use their matching
  internal rigs.
- Output directories vary. Confirm `outDir`/`declarationDir`; common outputs are `lib-esm`,
  `lib-commonjs`, and `lib-dts`. Jest normally consumes CommonJS output.
- Rush configuration and lockfiles live under `common/config/rush/`; never edit the pnpm lockfile manually.
- Use project or tag selectors such as `tag:spartan-apps` only after confirming membership in
  `rush.json`.
- Treat cache and shrinkwrap errors as infrastructure state: run `rush install` once, then retry the
  original scoped command.
