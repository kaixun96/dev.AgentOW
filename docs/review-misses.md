# Review misses

Defects that real human reviewers found in PRs this reviewer had already reviewed. Each entry
records what was missed, the mechanism that caused the miss, and the generalized rule. Every
claim is cited to code, not to the review comment that reported it.

Read this before finalizing a review. These are not additional checklist items to recite; they
are the failure modes this reviewer actually has.

## How a miss gets here

An entry is added only when a human found a real defect in code this reviewer had already
reviewed and passed, and the underlying fact was verifiable independently of the reviewer's
comment. A comment that turned out to be wrong is recorded too, under "Calibration", because
a false positive costs the author's trust just as a miss costs the author a bug.

---

## M1. Reporting the first instance and stopping

**Missed:** an unvalidated `href` was reported at one render site while a second site in the
same diff rendered a user-writable URL the same way. The fix for the first did not reach the
second. The same review reported a response body reaching telemetry at one call site while two
other call sites in the same file put a user-chosen file name into the same sink.

**Mechanism:** a finding was treated as a location. Once the location was cited, the reviewer
moved to the next dimension. Nothing required asking whether the defect *class* occurred
elsewhere in the diff.

**Rule:** a finding is a class, not a line. Before finalizing, sweep the whole changed set for
every other instance of each Critical or Important finding's class, and account for every hit —
as its own finding, or as an explicit reason it is safe. `preReview.classSweep` and the
validator enforce this: the reviewer declares the query, and the validator runs that query
itself and rejects the report if a hit is unaccounted for.

## M2. Reasoning about a dependency without reading it

**Missed, and both were blocking:**

- A route wrapper was placed inside a fallback `<Switch>`. `Switch` reads `path` off its
  **direct children**: `react-router@4.2.0/Switch.js` does
  `React.Children.forEach(children, element => { var pathProp = element.props.path; ... })`,
  and when `path` is undefined it falls back to `route.match`, which is always truthy — so the
  first child always won and every URL rendered the same page. The wrapper hid `path` from
  `Switch`. The proof is three hops outside the diff:
  `sp-pages-core/src/core/ReactRouter.ts` → `sp-page-router-shared/src/ReactRouter.ts:4`
  (`export { default as Switch } from 'react-router/Switch'`, `react-router: ~4.2.0`) →
  `react-router/Switch.js`.
- A DST window compared a Win32 `SYSTEMTIME` transition rule against a raw UTC instant. The
  rule's `Hour`/`Minute` are **local wall-clock time in that zone**, so the comparison was
  wrong by a whole base offset. The unit semantics are a property of the platform structure,
  not of the changed file.

Three more followed the same shape: a QoS monitor whose **constructor** already emits the Start
event (`sp-diagnostics/src/Api/Qos/QosMonitor.ts:80` calls `QosLogger.instance.startQosMonitor`),
so constructing it unconditionally and ending it conditionally leaks an unclosed event; a
telemetry helper that classifies a plain `Error.message` as privacy-unsafe; and a type
re-declared locally behind `as unknown as` when the package already imported in that same file
exports the real shape.

**Mechanism:** the reviewer's consumer analysis runs *downstream* — who calls the changed code.
Every one of these defects is *upstream* — what the changed code calls, and what that thing
actually promises. The changed file reads plausibly in isolation in all five cases; the defect
is only visible in the dependency's source.

**Rule:** when correctness depends on what an external symbol does — a component's treatment of
its children, a platform structure's units or time base, a telemetry helper's event lifecycle,
an exported type's real shape — open that symbol's source and cite it. Record each one in
`preReview.externalContracts` with evidence outside the changed set. Trigger shapes seen so far:

| shape | what to open |
|---|---|
| a component is wrapped, or its children are composed indirectly | the component's own `render`/children handling |
| a platform/interop struct is read (`SYSTEMTIME`, offsets, ticks) | the structure's documented units and time base |
| a monitor/logger/scope object is constructed | its constructor and its end/dispose path |
| a value flows into telemetry | the sink's classification of that field |
| a type is re-declared locally, or cast through `unknown` | the package barrel, for the real exported type |

## M3. The diff contradicting itself

**Missed:** five post-action navigations used root-relative constants, which resolve against the
site-collection root rather than the current web, so every one of them broke on a sub-web —
while the same files already contained a helper that correctly derived the current web's path.
Separately, one component declared styles inline while every other component in the same app
kept them in a sibling `.styles.ts`; and one resource key was defined with two different values
in two `.resx` files whose surfaces appear in the same interaction.

**Mechanism:** each site was read on its own and looked reasonable. Nothing compared the diff
against itself.

**Rule:** when the changed set does the same thing two different ways, one of them is usually
wrong. Before finalizing, name the operations the diff performs more than once — URL
construction, permission resolution, error mapping, resource definition, styling location — and
check that every occurrence agrees. Prefer the form the codebase already uses.

## M4. Duplication reported as taste instead of as divergence

**Missed:** a permission ladder hand-written in three page components and a settings overlay
hand-written in four layouts — and **the copies had already diverged on the same flag**. Also
two byte-identical provider methods, a row model declared twice over one list, and eleven
byte-identical style blocks across two files.

**Mechanism:** "duplicated logic" was one clause in a design bullet, so duplication was treated
as a style preference and dropped as non-blocking. The reviewer never counted the copies, so it
never noticed that they had stopped agreeing.

**Rule:** duplication is a correctness finding the moment the copies disagree. Count the copies,
diff them, and report the divergence, not the repetition. Copies that still agree are Minor;
copies that have already diverged are at least Important, because one of them is now wrong.

## M5. Telemetry judged by content instead of by lifecycle

**Missed:** a page's headline `Load` scenario constructed its monitor unconditionally but wrote
success only inside the branch where data was present. The Start is emitted by the constructor,
and only the end call removes the event, so the cold-navigation path — the exact case worth
measuring — emitted a Start that was never closed and never reported. The signal was inverted:
success was recorded only when the page had *not* done the work.

**Mechanism:** the telemetry dimension asks whether events carry the right data and no sensitive
payload. It does not ask whether every start has an end on every path.

**Rule:** for each telemetry scope in the diff, trace start and end across *all* paths including
early returns, error branches, and the not-found case. A start without a guaranteed end is a
defect, and a scenario whose success branch excludes the work it names is worse than no
telemetry.

## M6. Impossible first paint from independently derived state

**Missed:** a preload was rejected as untrustworthy so the data state initialized to
`undefined`, but the loading flag initialized from the raw prop instead. First paint therefore
had "not loading" and "no data" simultaneously, flashing the empty state before the refetch.

**Mechanism:** each initializer was read separately and each was defensible alone.

**Rule:** when two pieces of initial state encode the same condition, derive them from one
expression. Check the first render for state combinations the component treats as impossible.

## M7. Comments accepted as documentation instead of checked as claims

**Missed:** a file header made three factual claims about the implementation — the endpoint it
used, a search feature, and which columns sorted. All three contradicted the code in the same
diff, one of them describing an approach the file itself explained it had abandoned.

**Mechanism:** comments were reviewed for style ("explain why, not what") rather than for truth.

**Rule:** a comment that states a fact about the code is an assertion to verify. Check header
comments, endpoint and contract claims, and "NOT covered" lists against the code they describe.
Stale claims are worst in new files, because they become the next reader's mental model.

## M8. Capability reinvented because nothing asked what already exists

**Missed:** a change hand-rolled a screen-reader announcement helper in a shared `styles.ts`.
The review produced 26 findings — three blockers, several correct parity defects in 64-bit
permission math — and never asked whether the platform already provided it. A human reviewer
named the existing hook from memory: `useScreenReaderAlert`, which ships in *two* places
(`odsp-common/shared-react/screen-reader-alert/` and
`sp-client/libraries/sp-component-utilities/src/hooks/`). The same reviewer, on a different PR
by a different author, caught a wrapper around string formatting when `Text.format` /
`StringHelper.format` were already used in 355 files, and hardcoded literals where a design
token with that exact value existed.

**Mechanism:** every dimension in the contract asks whether the code in front of the reviewer
is *wrong*. None asks whether it should *exist*. The profile's one prior-art rule is scoped to
"navigation, menus, lists, or other interactive structures" — UI components only — so hooks,
utilities, and style helpers fall outside it entirely.

**Rule:** shared code is answered against the platform before it is answered for correctness.
Every symbol exported from a shared-code path gets a repo search and one of three outcomes:
nothing exists, an existing implementation is adopted, or the divergence is justified against
the thing it duplicates. `preReview.priorArt` records this and the validator derives the symbol
list from the changed sources, so an export cannot be skipped by not mentioning it.

## M9. Comment volume treated as a style preference

**Missed:** across two PRs, one human reviewer raised unnecessary comments **seven** times —
"we usually only add comments for unavoidable hack methods", "not needed comment", "simplify
comments, only add when we cannot understand why", "confusing comments, do it by TypeScript
typing instead". The authors' own before/after measurements ran 43%→22%, 41%→21%, 36%→22%.
The review agent raised it zero times in either PR.

**Mechanism:** "comments/docs" is three words inside one design bullet listing eight concerns.
A dimension that only appears as a clause never fires. The same burial explains M4.

**Rule:** comment density is a reviewable property of the change. A comment that restates what
a well-named identifier already says is noise, and a comment doing work that a type could do
is a missing type. The exception worth protecting: comments citing classic source line numbers
are parity evidence in a migration, not commentary.

## M10. Localization checked for extraction, not for contract

**Missed:** new `.resx` strings without `{Locked=...}` on their placeholders; a count-bearing
string with no singular/plural pair ("1 more breadcrumb items"); English fallback strings
sitting in code with no answer to whether they are user-visible. Human reviewers raised these
five times across the two PRs; the agent raised none.

**Mechanism:** the contract lists `localization` as a dimension, which the agent satisfies by
confirming strings are externalized. Externalization is the easy half. The `{Locked=}`
convention is real and repo-wide — 85 occurrences across 43 `.resx` files.

**Rule:** for each added `.resx` entry, check placeholder locking, singular/plural coverage for
anything that can be 1, and whether any English string left in code can reach a user.

## M11. Sibling files reviewed one at a time

**Missed:** three new page layouts with, in the human reviewer's words, "the same private
members/functions, the only difference is the component it renders" — and separately, "the 3
pages look like totally the same structure and similar UX, should we split them into 3 pages?"
The agent reviewed each file's contents correctly and never compared them to each other.

**Mechanism:** this is M1 pointed at structure instead of defects. The class sweep asks whether
a *defect* recurs across the change; nothing asks whether the change's *files* are copies.

**Rule:** when a change adds several files of the same kind, diff them against each other
before reviewing them individually. Near-identical siblings are a design finding about the
change, not a defect in any one file.

---

---

## Calibration — findings that were wrong

**A localization finding against a declared parity contract.** The reviewer reported a
hardcoded `M/D/YYYY h:mm AM/PM` audit timestamp as a localization defect. The author declined:
the page's stated purpose is byte-parity with a classic page that renders exactly that format
in the site's regional timezone, and a bug had specifically asked for it. The PR description
said so.

**Rule:** when the PR declares a parity, compatibility, or bug-fix contract, check a proposed
change against that contract before reporting it. "The codebase has a better utility for this"
is not a finding when matching the old behavior is the requirement. Note the distinction the
same file demonstrates: the *format* was intentional parity, while the *timezone math* behind
it was genuinely wrong. Parity protects the observable contract, not the implementation.
