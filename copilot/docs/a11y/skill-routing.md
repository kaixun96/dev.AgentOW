# A11y capability include policy

Use an explicit include set for each A11y run. Only included capabilities may load or invoke
skills or introduce additional implementation/review requirements. This policy applies to the
main session and every reviewer/evaluator handoff, including resumed runs.

## Build the include set

Before loading an optional skill, record its exact path, capability, phase, positive trigger,
and evidence in `a11y/knowledge-manifest.json`. Use `capabilityIncludes` for these entries alongside
the existing document/version records. At intake, include only the core below and capabilities
whose triggers are already known. Recompute before source work and review using the acceptance
criteria and actual diff; preserve the previous decision and rationale when updating the set.

| Capability | Included resource | Positive trigger |
|---|---|---|
| A11y remediation core | `skills/agentow-a11y/SKILL.md`, `docs/a11y/README.md`, `docs/a11y/evidence-contract.md`, `docs/a11y/pr-evidence-capture-guide.md`, `skills/ow-review/references/accessibility.md` | Every A11y run: intake, evidence, minimal fix, verification, and draft delivery |
| Host evidence procedures | `docs/a11y/windows-host-testing.md` | Environment discovery and supported evidence collection as specified by the A11y flow |
| Review gate | `agents/reviewer.agent.md`, `docs/review-contract.md`, `docs/review-misses.md`, and the applicable repository profile | Every pre-PR review: diff correctness, evidence, rollout, and regressions |
| React runtime | `skills/vercel-react-best-practices/SKILL.md` and its compiled `AGENTS.md` | The fix changes React/Next.js runtime source; apply version-compatible rules to that changed path |
| Monorepo operations | `skills/ow-ref-monorepo/SKILL.md` | A required build/dependency operation needs the repository's Rush/package guidance |
| External lookup | `skills/ow-ref-external-tools/SKILL.md` | A specific intake/source fact needs one of that reference's supported external tools |
| Surface theme | `skills/detheme/SKILL.md` | The failure or changed behavior involves surface ownership, theme/provider flow, or theme-dependent treatment; identify that relationship first |
| Component migration | `skills/ow-ref-replace-component/SKILL.md` | The user explicitly requests migration, or failure/API evidence proves the existing component cannot satisfy the accessibility acceptance criteria |
| Live rollout gate | `docs/killswitch-guidance.md` | The diff adds, moves, renames, or changes a live killswitch or its runtime use |

Every skill not selected by a positive trigger is absent from the include set, including skills
installed in the future. Skill availability, a matching word in a description, a reference link,
or the presence of rendered UI is not an include decision. Never enumerate everything installed
and load it speculatively.

An additional capability needs an explicit inclusion decision before use: name the exact
resource and the user-requested operation or concrete acceptance-criterion dependency that
requires it, with evidence and bounded phase/scope. If that relationship is uncertain, keep the
capability unselected and investigate the specific missing fact; do not guess or broaden the fix.
An explicit user request may extend the set, but does not bypass that skill's consent or safety
gates. A reviewer recommendation alone does not establish a new requirement.

## Include review requirements by changed behavior

Use the reviewer's positive reference-routing triggers only for requirements caused by the
acceptance criteria or actual diff. Reading a reference for one included capability does not
activate every capability mentioned in it. In particular, separate:

- **Existing-control accessibility:** include semantics, supported APIs, focus, keyboard,
  contrast, names/roles/states, and regressions on the affected control.
- **Component selection:** include component-fit comparisons and package-selection requirements
  when the diff introduces or replaces a component, or the component-migration trigger above
  matches. A retained control's focus/style/ARIA change alone does not match this trigger.
- **Other cross-cutting behavior:** include localization, theme, performance, shared-utility,
  or other reference requirements when their specific changed-behavior trigger is evidenced.

The caller passes the manifest and implementation note with the review request. The reviewer
checks inclusion evidence against the request and Git diff rather than trusting a narrowed list.
If a genuinely required capability is missing, return the matching trigger/evidence so the caller
updates the include set before that capability is used. New requirements cannot arise solely
from an available skill or a preferred alternative implementation.

Keep the immutable review-rule inventory exhaustive. Reading inventoried references for rule
accounting does not authorize optional skill invocation or product changes. Emit every required
rule result; mark rules outside the evidenced include scope not applicable with the concrete
reason. Do not narrow the inventory, skip the review gate, or suppress a demonstrated regression.
Non-A11y workflows retain their existing routing policy.

## Routing examples

| Change | Include decision |
|---|---|
| Add a focus outline to an existing Button, retaining its import | Existing-control accessibility; component selection is not triggered |
| Correct an accessible name in React code | A11y core and relevant React runtime rules; no additional capability without a matching trigger |
| Repair a proven theme-provider defect | Surface theme and relevant accessibility checks |
| Replace a control because its API cannot meet the required keyboard contract | Component migration and component selection, with the API/failure evidence recorded first |
| A new unrelated skill is installed during the run | Include set is unchanged |
