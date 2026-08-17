# UX architecture and bundle-boundary review reference

Use this reference when a change adds or substantially expands a rendered page or feature with multiple independent UI regions, stateful workflows, data/API contracts, domain mapping, dialogs/panels, or optional heavy dependencies. It applies across product areas and design systems; it is not SharePoint- or SPDS-specific.

## Architecture analysis before implementation

Plan a substantial page or feature as a composition of cohesive responsibilities before writing its main component. Source/component decomposition and runtime bundle splitting are separate decisions: use modules to make ownership and testing clear; create async chunks only when a real loading boundary and bundle evidence justify them.

### Component and module decomposition

1. Inventory the feature's independent responsibilities, including page orchestration, data access, stateful workflows, reusable interaction regions, dialogs/panels, data presentation, domain mapping, and pure formatting or validation.
2. Keep the page/root component responsible for composition, route/context integration, and shared workflow coordination. Extract a child component when a region has its own semantic purpose, state/interaction contract, accessibility boundary, repeated rendering, independent test surface, or meaningful props contract.
3. Extract stateful logic into a custom hook when it coordinates a cohesive workflow or external lifecycle and can expose a small domain API. Keep state in the nearest common owner when multiple sibling regions must coordinate; do not scatter one workflow across unrelated hooks.
4. Keep API transport, response mapping, and domain types outside rendering components when they form independent contracts. Search for existing providers, hooks, utilities, and models before creating new ones, and preserve package/layer ownership.
5. Colocate single-use components and helpers with the feature unless there is a proven shared owner. Split by responsibility, change cadence, dependency direction, and testability, not by an arbitrary line count or a desire to create more files.
6. Avoid false decomposition: one-line JSX wrappers, prop-forwarding components with no semantic contract, hooks that merely rename one state variable, circular imports, generic `utils.ts`, and premature shared abstractions make the feature harder to follow without reducing complexity.

The plan must include a responsibility-to-module map for a substantial UX. For each responsibility, name the owning component/hook/service/model, public props or return contract, state owner, and why it remains inline or is extracted. Treat a monolithic implementation as an Important finding when independent UI, workflow, and data responsibilities are coupled in one component despite clear testable boundaries. File length alone is not a finding.

### Runtime bundle and lazy-loading decisions

1. Identify what is required for first meaningful render and what appears only after navigation, mode change, or an explicit user action. Inspect the package's existing loader/chunk conventions and build output before choosing an API.
2. Keep small, immediately needed child components in the current chunk. Consider an existing product lazy boundary for heavy editors, infrequently opened dialogs/panels, admin-only or edit-mode experiences, and large optional dependencies when deferral produces a meaningful bundle benefit.
3. Use the repository's established lazy-loading mechanism and design-system lazy entry where applicable. Do not introduce `React.lazy`, dynamic `import()`, `Suspense`, or a new chunk solely because source code moved to another file.
4. Keep loading, error, retry, focus restoration, telemetry, and rollout behavior correct across the async boundary. Avoid tiny chunk waterfalls across one common user journey.
5. Record `eager`, `lazy`, or `unchanged` for each planned module with the user boundary, dependency weight/build evidence, loading fallback, and rationale. Measure or inspect bundle output for material new surfaces rather than claiming a bundle improvement from file splitting alone.

## Review workflow

1. Enumerate the rendered regions, workflows, state clusters, external contracts, and optional dependencies in the changed surface.
2. Map each responsibility to its actual owning component, hook, service, model, or helper and compare it with the approved plan when available.
3. Verify state lives at the nearest common owner and child contracts are cohesive rather than broad bags of unrelated props.
4. Verify extracted modules improve ownership, dependency direction, or independent testing. Reject extraction that only moves lines or hides coupling.
5. Verify reusable providers, hooks, services, utilities, and models were searched before parallel implementations were introduced.
6. For async boundaries, verify a real user/load boundary, repository convention, dependency-weight or build-output evidence, fallback/error/focus behavior, and absence of a tiny-chunk waterfall.
7. Confirm tests target the extracted contracts and workflows rather than only snapshotting the root composition.

## Review questions

- Does the root component primarily compose regions and coordinate genuinely shared state?
- Which UI regions have an independent semantic, interaction, accessibility, or test contract?
- Can the main workflow state be described as one cohesive domain API, or is unrelated state mixed together?
- Are API transport, domain mapping, and rendering coupled without a reason?
- Would a proposed extraction clarify ownership, or merely add a file and prop forwarding?
- Is lazy loading tied to a user action/navigation boundary and meaningful dependency weight?
- Does build evidence support any claimed bundle improvement?
- Are loading, error, retry, focus, telemetry, and rollout behavior preserved across async boundaries?

## Severity

Raise an Important finding when clear, independently testable UI, workflow, and data responsibilities remain coupled in one component and the coupling materially increases defect risk, change risk, or prevents focused testing. Raise an Important finding for an unsupported lazy boundary that causes an initial-bundle regression, broken fallback/focus behavior, or a credible request waterfall. Do not raise a finding from file length alone, and do not demand extraction without naming the concrete responsibility, proposed owner, contract, and affected risk.

## Boundaries with other references

- For design-system component choice, supported component APIs, typography, tokens, and compound-component composition, apply the relevant design-system reference, including `sharepoint-design-system-and-ux-components.md` where applicable.
- For shared implementation discovery and contract-fit evidence, apply `shared-utility-reuse.md`.
- For general async correctness, React state behavior, performance, and existing lazy/chunk rules, apply `common-review-issues.md`.
- For accessibility semantics within extracted or lazy-loaded regions, apply `accessibility.md`.

This reference owns rendered-feature decomposition, responsibility and state ownership, source-module boundaries, and evidence-backed runtime chunk decisions.
