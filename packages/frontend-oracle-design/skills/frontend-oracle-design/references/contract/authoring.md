# Contract authoring from approved sources

Input: resolved profile, controller-scoped mode/task, approved source identities, confirmed finite axes.
Read [Space](space.md) at this stage. Author `oracle.md` directly, with Verification Profile, outcome,
source registry/mappings, rows, scenarios, t-way (or explicit full-product) Space, dispositions, realization plans and open
questions in the existing card format. No second source-of-truth DSL or generated policy package.
Never derive expected outcomes from existing code/tests, recommendations or observed browser behavior.

Scenario `given` is a generic record, not a required query/page/history/data/pending schema. Preserve
present falsy values including `false`, `0`, `""`, `null` and empty collections, distinguish them from
absent fields. Toggle, form, permission and async cases use their real source-backed state. Record
events/actions, expected requests/display/effects/never outcomes as applicable, with target, control,
completion barrier and observe plan. A plausible fixture is not approved policy or executed evidence.

Sweep new × inherited × runtime interactions and source-open cells. Each required case has approved
outcomes, every unresolved disposition remains visible and blocks lock. Include surviving questions with
candidate rows/options and recommendation, new Draft in full or existing revision's semantic delta.
Preflight enumeration/lint may run before approval without advancing beyond DISCOVERING.
Return raw review inputs for card-only cold-read/reverse-impossible and conditional source-aware review.
Only the controller obtains actual user approval before CHECKED whole-card hashing and later lock.
Never write consumer tests/production or claim a preflight as product RED/GREEN.

At current-stage authoring, investigate and carry forward or resolve intake's type applicability determination.
Before omitting type evidence, record exact investigated file paths, a grounded no-boundary rationale and its approved source.
Unknown applicability requires further investigation; unavailable required tools are an actual environment
failure, not N/A. This record is review input, not self-approval.

When choosing exposed type/state/API contracts, read [state selection](state-ladder.md),
[API surface](api-surface.md) and [advanced contracts](advanced-contracts.md) at that decision point.
Use real consumer type-fest relations and compiler witnesses, no dummy import/custom duplicate,
compiler-setting weakening or unrelated dependency change. Property plans target approved invariants.

Under default t-way, run `oracle-verify.mjs evidence-scaffold` and plan one test per `covered()` `F*`
frame (an `it.each` row over the frame's choices), one per `PATH*` (`[<ID>] <label>`) and, for an active
Async/Order family, the `sequence` test (fast-check, or hand-enumerated deferred orderings with the reason
fast-check is unavailable). Names map through `evidence.json`; no encoded identity token is needed.

For explicit full-product only, plan actual `contract-cases:reported` names as `[<frame ID>]` plus exactly one
`oracle-case:<base64url JSON>` token encoding this fixed identity shape:

```json
{
  "id": "<frame ID>",
  "scenario": "<scenario ID>",
  "tuple": {},
  "dimensionRevision": "<current revision>",
  "constraintRevision": "<current revision>"
}
```

Replace the example tuple with the actual locked tuple. The ID, scenario and both revisions must
match locked full-product records. Frame-map metadata and row/sequence names map to the exact unique
observed reporter name, not a separate asserted case manifest. Plan source-backed product assertions
for every required executable case. A label or encoded identity is not assertion sufficiency.

For the implementer's reported Node tests, plan these two fixed REQUEST shapes only:

```js
t.diagnostic(`oracle-contract/v1 ${JSON.stringify(request)}`)
```

```json
{
  "name": "<exact observed test name>",
  "kind": "type-contract",
  "positive": "positive.mts",
  "negative": "negative.mts"
}
```

```json
{ "name": "<exact observed test name>", "kind": "fast-check", "module": "property.mjs" }
```

Use literal run labels `type-contract:reported` and `fast-check:reported`. Requests do not supply
successful results, compiler exits, actual seeds or counts. Register the frozen positive, negative
and module paths as harness inputs relative to the source root. Request paths are relative to the
emitting test file's directory and realpath-contained there. Plan distinct substantive positive/negative
consumer witnesses importing type-fest against the same approved source boundary. The fixed producer
uses installed TypeScript with strict/noEmit ES2022 NodeNext settings and records actual commands,
exits, diagnostics, compiler and witness hashes. A syntactic type-fest import alone does not establish
meaningful use.

The source-bound property companion exports `property` (a real fast-check property), nonempty string
`domain`, safe-integer `seed` and positive safe-integer requested `numRuns`. Plan its invariant, domain
and sampling scope from the same approved sources, independently of type applicability. The producer
actually calls `fc.check(module.property, {seed, numRuns, endOnFailure:false})` and records actual count,
seed, declared domain, failure, shrink count, counterexample and path. The domain is companion-supplied
scope metadata, not an independently measured domain. Requested `numRuns` is not the actual result count.
Unavailable required dependencies or harness infrastructure are environment failures, not N/A,
passing ordinary wrappers or genuine product RED. Vitest actual case reporting is not this Node
producer capability. There is no arbitrary producer/backend registry or second Delivery executor.

Diagnostic requests are currently name-keyed, not authenticated to their emitting file/test scope.
Do not claim per-test cryptographic provenance, universal malformed-request rejection or proof
independence. Independent review still checks approved-source, witness and invariant relevance.
Resolve any named current-stage criteria through the [selected-profile loader](../roles/loading.md).
These are realization plans only: the author still cannot edit consumer tests/production, issue
receipts or obtain approval in place of the controller.

At a dispatched post-GREEN escape/final scope check, return actual case coverage, source gaps and residual
limits on current locked bytes. Do not create new closure states or alter locked outcomes to fit evidence.
