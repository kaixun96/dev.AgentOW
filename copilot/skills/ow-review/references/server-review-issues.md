# Server-side review issues

Use this reference for server-side changes in SPO.Core. Apply only the sections relevant to the diff.

## Preload and startup critical paths

**Trigger:** changed preload, bootstrap, page-context serialization, navigation preload, initial
data hydration, first-render dependency, or a helper/getter newly called from one of those paths.

- Check whether data or work needed only by a specific feature has been added to every page's
  startup path. If so, users who never open that feature also incur its cost and can be blocked by
  its failures or permission requirements. Verify whether this work is needed for page startup or
  can wait until the feature is opened. Follow the callers and check all entry points that reach
  the changed code, including full page load and in-place navigation.
- Trace each newly reached helper, getter, serializer field, and property access transitively to the
  terminal data source. Record the cache or hydration precondition and whether a cold object can
  cause SQL, network, directory, cross-geo, file, or list work.
  Establish hydration for the exact object used by the caller; do not claim every invocation
  performs I/O when that object can already be warm.
  For new startup I/O, use source evidence and available measurements to check the added
  query/request count and latency against the startup budget, if one is defined.
- Verify the weakest supported viewer, not only an owner or site member. Item/page read permission
  does not automatically prove list-root, folder-browse, directory, or tenant-metadata permission.
  Follow authorization through the terminal operation and check whether absence, access denied,
  throttling, or a service failure can abort the startup path.
- Optional metadata must remain optional. Isolate its failure at the narrowest behavior-owning
  boundary, preserve the established omission-versus-null contract, and emit useful failure
  telemetry without exposing resource or identity data. A broad catch that converts unexpected
  failure into success is not acceptable.
- Verify that regression tests cover startup with unloaded data, the least-privileged supported
  viewer, missing optional data, and dependency failures.

**Page viewer boot SQL rule:** no additional SQL roundtrips are allowed during page viewer boot.
Any change that adds a SQL roundtrip in this phase, including on a supported cold/unhydrated path,
is `Critical` and requires a new design review before merge. Establish the added roundtrip through
the actual call path and source evidence or query-count measurements; a helper name alone is not
evidence. Do not downgrade a proven violation because latency has not been measured, the query is
fast, or no incident has occurred. This SQL-specific prohibition does not imply that all network
or storage operations have a zero-roundtrip budget.

For all other findings, apply the severity definitions in `docs/review-contract.md`.

**Failure hypotheses:** a page-only viewer reaches a list-root read and loses page access; a cold
property getter adds a SQL roundtrip during page viewer boot; an optional directory lookup rejects
the whole bootstrap aggregate.
