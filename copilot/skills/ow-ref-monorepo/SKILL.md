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
- Never manually create or hand-write a Rush change file under `common/changes/**/*.json`. Run the
  repository-approved `rush change` command first, then edit only the generated file when its
  message or metadata needs adjustment. If generation hangs or fails, repair the command path or
  report the blocker; do not construct the JSON as a fallback.
- Use project or tag selectors such as `tag:spartan-apps` only after confirming membership in
  `rush.json`.
- Treat cache and shrinkwrap errors as infrastructure state: run `rush install` once, then retry the
  original scoped command.
