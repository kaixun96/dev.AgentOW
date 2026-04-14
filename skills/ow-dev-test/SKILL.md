---
name: ow-dev-test
description: "Must invoke this skill if use/match: rush test, jest, unit test, test failed, test-path-pattern, coverage, lib-commonjs test, include-phase-deps"
---

# odsp-web Testing

## CRITICAL RULES

- **NEVER** run `jest` directly — always use `rush test`
- **NEVER** use VS Code's built-in Test Explorer — it won't discover tests correctly
- **NEVER** edit `*.test.js` files in `/lib-commonjs` — always edit `*.test.ts` in `<project>/src/`
- **ALWAYS** include `--include-phase-deps` — it ensures all code is properly built before testing
- When using `--test-path-pattern`, **omit the file extension** — Jest resolves it automatically

## Quick Commands

```bash
# Run all tests for a project (MUST include --include-phase-deps):
rush --quiet test -o <package-name> --include-phase-deps

# Run a specific test file (omit extension!):
rush --quiet test -o <package-name> --include-phase-deps --test-path-pattern="<modulename>" --verbose

# Run tests from within project directory:
rush --quiet test -o . --include-phase-deps
```

## How Tests Work

1. Source: `<project>/src/**/*.test.ts`
2. Transpiled to: `<project>/lib-commonjs/**/*.test.js`
3. Jest runs against the `.js` files in `lib-commonjs/`
4. `--include-phase-deps` ensures both current project and upstream deps are built first

## Common Errors

| Symptom | Fix |
|---------|-----|
| "Cannot find module" in test | `rush install` then rebuild |
| Test not found with --test-path-pattern | Remove file extension from pattern |
| Coverage threshold not met | `rushx _phase:test` to see detailed coverage |
| Tests pass locally but CI fails | Ensure `--include-phase-deps` is used |
| Stale test output | Rebuild first: `rush --quiet build -t <package>` |

## Gotchas

- After tests pass successfully, no need to re-validate build unless you make new changes.
- Jest config is typically in `<project>/config/jest.config.json` or inherited from rig.
- Test utilities may be in `<project>/src/test/` or shared test packages.
- Some projects use `rushx _phase:test` for more detailed test execution with coverage.
