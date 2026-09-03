---
name: agentow-a11y-explore-test
description: "Explore a SharePoint or M365 surface against the MAS Web standard, using public WCAG 2.2 identifiers as mapping keys, with browser evidence and optional real assistive technology. Produces deterministic findings and HTML reports and can optionally file validated ADO bugs. Use for agentow a11y explore test, exploratory accessibility testing, MAS audit, keyboard test, screen reader exploration, NVDA, Narrator, or Voice Access testing."
---

# agentOW Accessibility exploratory testing

This workflow discovers Accessibility issues. It does not modify product code, fix findings, create
a product branch, or create a product pull request. Use `/agentow-a11y` for remediation after a
finding becomes a concrete bug.

MAS Web is the normative pass/fail standard. Read `references/mas-standard.md`; use
`references/wcag-criteria.md` only as the public criterion mapping. Never publish internal or NDA
MAS content.

Read `references/bug-patterns.md` before planning. It is a de-identified heuristic checklist, not a
standards source.

## Invocation

```text
/agentow-a11y-explore-test --url <starting-url> <surface description>
/agentow-a11y-explore-test --file-ado --ado-config <json-path> <description>
```

`--url` is optional only when the description or routed context identifies a runnable fixture. A
full run always covers all nine categories. Inapplicable criteria receive an evidence-backed
`NOT_APPLICABLE` result; they are not silently omitted. `--file-ado` is opt-in and files only
validated `VIOLATION` findings.

## Ownership boundaries

- The main Copilot session owns orchestration, environment detection, authentication, profile
  allocation, browser/fixture setup, Windows AT lifecycle, deterministic aggregation, report
  generation, optional ADO filing, cleanup, and the final result.
- `@agentow-copilot:a11y-explore-planner` selects applicable categories and evidence requirements.
- `@agentow-copilot:a11y-explore-category-tester` executes or evaluates exactly one category.
- Category agents never edit product code, install software, file bugs, or launch another agent.
- NVDA, Narrator, Voice Access, Windows UI Automation, real OS input, Console transfer, and audio
  routing are serial machine-global resources. The main Windows host/Twin owns them.
- Screen-reader testing requires real NVDA or Narrator interaction and matching AT evidence.
  Accessibility-tree, axe, DOM, ARIA, and source evidence belong to structure/semantics checks;
  never use them to test, substitute for, prove, or report a screen-reader result.

## Step 0: Detect environment and create the run

Detect:

- `codespace`: `CODESPACES == "true"` or `CODESPACE_NAME` is non-empty.
- `windows-host`: not a Codespace and the host is Windows.
- `unsupported-host`: every other environment.

Create:

```text
<repo>/.aero/a11y-explore-<slug>-<timestamp>/
├── request.txt
├── progress.log
├── run.json
├── capabilities.json
├── plan.json
├── categories/<category>/
│   ├── result.json
│   ├── evidence.json
│   ├── screenshots/
│   ├── trace.zip
│   └── worker.log
├── findings/aggregated.json
├── report.json
├── report.html
├── ado-bugs.json
└── final.md
```

Write the exact request and append a timestamped progress line before each phase.

In a Windows host, run only the host setup script's probe action:

```powershell
$hostSetup = "${CLAUDE_PLUGIN_ROOT}\skills\ow-a11y-host-setup\scripts\setup-windows-a11y.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File $hostSetup `
  -Action Probe -OutputPath "<run>\capabilities.json"
```

Do not invoke the `/ow-a11y-host-setup` workflow from an explore run. A missing required host
capability is `blocked`, not permission to install or elevate.

In a Codespace, skip the entire Windows host setup. Use supported repository/FIC browser automation
or dispatcher-provided external evidence. Mark Windows-only tests `skipped-environment`; do not
install or launch Windows AT.

## Step 1: Plan

Dispatch `@agentow-copilot:a11y-explore-planner` with:

```yaml
description: <user description>
url: <starting URL or default>
requestedCategories: <explicit list or all>
executionEnvironment: <codespace|windows-host|unsupported-host>
capabilitiesPath: <run>/capabilities.json
artifactRoot: <run>
```

Write its returned object unchanged to `plan.json`. The exact category slugs are:

```text
keyboard-focus
screen-reader
structure-semantics
orientation-input-purpose
visual-color
timing-motion
dynamic-content
touch-pointer
authentication-forms
```

Require `standard: "MAS"`, `standardProfile: "web"`, `fullCoverage: true`, all nine category
objects, each category's complete public mapping from `references/wcag-criteria.md`, and a
`scCoverage` union containing every supported mapped criterion.

Do not ask for plan approval. Ask only when the URL/fixture or expected surface is too incomplete to
run.

Every category must execute against a live rendered surface. Static source, DOM, Accessibility Tree,
CSS, or attribute inventories may select targets only; they cannot independently produce
`PASS`, `FAIL`, `NEEDS_REVIEW`, or `NOT_APPLICABLE`.

## Step 2: Prepare browser and execution schedule

Read `references/category-execution.md`.

Authentication order:

1. Windows: dedicated personal evaluator profile from `/ow-a11y-host-setup`.
2. Codespace: repository-supported Playwright/FIC profile.
3. Explicit dispatcher-provided external evidence.

Never copy a normal browser cookie database or read credentials files.

Resolve an executable browser contract before dispatching a browser category:

- Windows personal route: `pythonPath`, `personalEvaluatorScript`, `profilePath`, and a successful
  authentication-check artifact from `capabilities.json`. The category worker imports the
  evaluator module and uses its `launch_context` with the supplied profile.
- Codespace FIC route: a concrete repository Playwright command/spec, selected project, exact URL,
  and isolated output directory.
- Dispatcher route: a concrete executable command or immutable evidence paths.

A symbolic route name is insufficient. If no executable contract exists, write a `blocked` category
result.

Classify planned categories:

- `parallel-browser`: browser/static only, with a dedicated isolated profile and fixture per worker.
- `serial-browser`: shared authenticated profile, shared fixture, stateful flow, or unknown isolation.
- `serial-real-at`: screen reader, Voice Access, real OS input, UIA, ETW, audio, or Console resources.

Default to serial. Parallel execution is allowed only when every worker has a distinct profile,
context, output directory, and non-shared mutable fixture. Cap concurrency at four.

## Step 3: Execute browser/static categories

For each non-real-AT category, dispatch
`@agentow-copilot:a11y-explore-category-tester` with:

```yaml
category: <slug>
description: <surface description>
url: <resolved URL>
runDir: <run>
categoryDir: <run>/categories/<slug>
executionEnvironment: <environment>
producer: copilot-browser
browserRoute: <personal-profile|repo-fic|dispatcher-provided>
pythonPath: <absolute path when personal-profile>
personalEvaluatorScript: <absolute path when personal-profile>
profilePath: <absolute profile path when personal-profile>
authenticationEvidencePath: <fresh capability/check artifact>
browserCommand: <concrete repo FIC/dispatcher command when not personal-profile>
profileIsolationId: <unique ID or shared>
focusAreas: <plan focusAreas>
requiredEvidenceTypes: <plan category evidence>
```

The category agent reads its procedure under `references/test-procedures/`, executes only the
supplied concrete browser contract, restores state it changes, saves evidence only under
`categoryDir`, and returns one category result object. The main session writes it to `result.json`.

Every observed finding requires evidence. Infrastructure failures use category status `blocked` or
`inconclusive`, never a fabricated product finding.

Every category result contains exactly one `scResults` entry for every criterion in that category's
plan. Allowed statuses are `PASS`, `FAIL`, `NEEDS_REVIEW`, `NOT_APPLICABLE`, and `NOT_TESTED`.
Use `NOT_TESTED` only when a concrete environment/capability blocker remains after the available
route was attempted. Record `blocker` and `attemptedRoute`, and include the same blocker in the
category result. A missing or duplicate criterion blocks aggregation.

Before capturing a non-PASS finding, add a red outline around the affected element and an external
finding-ID label, capture the screenshot, then remove the annotation. For missing-element,
page-level, or infrastructure findings, add a red diagnostic banner without covering relevant
content. Record annotation kind and label in the screenshot evidence metadata.

## Step 4: Execute the serial real-AT tail

Run only after all browser workers finish. Never overlap NVDA, Narrator, Voice Access, or another
focus/audio consumer.

On a Windows host:

1. Read `${CLAUDE_PLUGIN_ROOT}/docs/a11y/windows-host-testing.md`.
2. Re-run only `$hostSetup -Action Probe` and require Console, browser, audio, and selected AT
   readiness. Do not invoke the host setup workflow or any mutating setup action.
3. Run the canonical category procedure with real OS input and the required AT.
4. Preserve transcript/ETL/result JSON, UIA/focus state, screenshot, audio/video quality metrics,
   and hashes.
5. Dispatch the category tester with `producer: windows-host` and the immutable evidence paths so it
   classifies only the observed behavior.

In a Codespace, materialize supplied external Twin/Windows evidence under the category directory,
preserving its producer and verified hash. Otherwise write an `inconclusive` result with justified
`NOT_TESTED` criteria, the missing Windows-only evidence, a category blocker, and the attempted
external route. Do not retry a deliberate environment skip.

For screen-reader claims:

- NVDA requires transcript + screenshot + UIA/focus state.
- Narrator requires ETL + screenshot + UIA/focus state.
- Continuous screen-reader evidence requires real speech and visible focus.

Voice Access requires result JSON, captured non-silent audio, capture-state equivalence, complete
overlay attribution when numbers are used, and screenshot. A registry or endpoint check alone is
not a Voice Access PASS.

Always stop AT, traces, recorders, temporary audio routes, and test apps started by the run.

## Step 5: Aggregate and render deterministically

Read `references/report-rules.md`. It defines the required summary cards, complete WCAG table,
finding cards/badges, inline screenshots, structure maps, runtimes, transcript excerpts, coverage
notes, ADO links, and the unique high-saturation inline SVG favicon.

Codespace/Linux:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/a11y-explore-results.mjs" aggregate \
  --run-dir "<run>" \
  --out "<run>/findings/aggregated.json"

node "${CLAUDE_PLUGIN_ROOT}/tools/a11y-explore-report.mjs" \
  --run-dir "<run>" \
  --findings "<run>/findings/aggregated.json" \
  --out-json "<run>/report.json" \
  --out-html "<run>/report.html"
```

Windows:

```powershell
node "${CLAUDE_PLUGIN_ROOT}\tools\a11y-explore-results.mjs" aggregate `
  --run-dir "<run>" `
  --out "<run>\findings\aggregated.json"

node "${CLAUDE_PLUGIN_ROOT}\tools\a11y-explore-report.mjs" `
  --run-dir "<run>" `
  --findings "<run>\findings\aggregated.json" `
  --out-json "<run>\report.json" `
  --out-html "<run>\report.html"
```

These commands validate category names/statuses, namespace finding IDs, reject path escape and false
AT claims, require every planned category result, deduplicate deterministically while preserving the
highest severity, require complete per-SC coverage, escape report content, and compute
counts/durations. External evidence must be
materialized beneath its category directory before aggregation. Do not replace these commands with
an AI-authored report.

## Step 6: Optional ADO filing

Skip unless `--file-ado` is present.

1. Read the explicit `--ado-config` JSON containing organization, project, area path, iteration path,
   and assignee. Do not infer another team's values.
2. Select only deduplicated `VIOLATION` findings with complete evidence.
3. In interactive mode, show the count and ask once before creating work items. In `--auto`, the
   explicit `--file-ado` flag is authorization.
4. Upload sanitized screenshots and create one bug per finding with the configured Azure DevOps
   tools. Do not file PASS, BEST-PRACTICE, NEEDS-REVIEW, blocked, inconclusive, failed, or
   skipped-environment records.
5. Write idempotent `{ findingId, bugId, bugUrl }` entries to `ado-bugs.json`.
6. Re-run the deterministic report renderer to include bug links.

Use the deterministic filer.

Codespace/Linux:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/a11y-explore-ado.mjs" \
  --run-dir "<run>" \
  --config "<ado-config.json>"
```

Windows:

```powershell
node "${CLAUDE_PLUGIN_ROOT}\tools\a11y-explore-ado.mjs" `
  --run-dir "<run>" `
  --config "<ado-config.json>"
```

Use `--dry-run` to validate payloads without network writes.

## Step 7: Finalize

Write `final.md` with:

- environment, target, URL, categories planned/completed/skipped;
- WCAG SC coverage;
- violations by severity, best practices, passes, and needs-review items;
- real AT actually used and evidence paths;
- blocked/inconclusive categories and exact missing capability;
- report and trace paths;
- ADO bug links when filed;
- cleanup result.

Do not claim WCAG conformance from exploratory coverage. Report only what was actually exercised.
