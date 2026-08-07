# Review misses

Defects that real human reviewers found in PRs this reviewer had already reviewed. Each entry
records what was missed and the mechanism that caused the miss. General review standards live
in `docs/review-contract.md`. Once a miss is fully encoded by the contract or a routed review
reference, remove it here rather than maintaining the same rule twice. Every remaining claim is
cited to code, not to the review comment that reported it.

Read this before finalizing a review. These are not additional checklist items to recite; they
are the failure modes this reviewer actually has.

## How a miss gets here

An entry is added only when a human found a real defect in code this reviewer had already
reviewed and passed, and the underlying fact was verifiable independently of the reviewer's
comment. A comment that turned out to be wrong is recorded too, under "Calibration", because
a false positive costs the author's trust just as a miss costs the author a bug.

---

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
