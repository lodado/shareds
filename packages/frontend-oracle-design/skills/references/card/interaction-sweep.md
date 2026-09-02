# Oracle Card — Interaction sweep

Single-axis BVA and free-recall grill questions structurally miss cross-condition defects: most
real failures trigger only when two or more conditions interact, and a question nobody thought to
ask leaves no trace. The sweep converts "did the author think of this interaction?" — unauditable —
into "cell (i,j) has a disposition" — machine-checkable. An unasked question is invisible; an empty
cell fails lint.

The sweep produces **dispositions, never tests**. It is a judgment cross product, not a test cross
product; only `needs-decision` cells promote to grill questions, and only user-answered questions
become rows. The prohibition on inventing states·transitions·policies stands — a sweep finding is a
`POLICY_GAP` candidate routed through `NEEDS_DECISION`, not a policy.

## When to run

After the contract rows are drafted and before the Draft Oracle is shown (the cold-read gate reads
the sweep too). Required whenever the revision inherits policies from a previous revision, or two or
more decided policies share state, DOM, scroll, cache, timing, or async lifecycle. Otherwise record
a one-line N/A with the reason in `journal.md` — silence is not a valid skip.

## Generating the space — derived, not chosen

- **Rows of the table**: every pair `new/changed P* × counterpart`.
- **Counterparts**: every inherited P\* still in effect from prior revisions, plus each runtime
  dimension below whose premise exists in this card.
- Pairwise (2-way) by default. For High risk, extend a pair to 3-way when two counterparts already
  share the same state or surface.
- A policy with no interaction partner still gets one single-policy line so coverage stays
  checkable: `| P4 | impossible: static copy, no shared surface |`.
- Do not pad with meaningless pairs — mirror bva.md: only pairs that share an actual surface
  (state, DOM, scroll, cache, request, timing). "No shared surface" is itself the `impossible`
  reason.

## Card section format

```markdown
## Interaction sweep

| Pair                                                 | Disposition                                                                      |
| ---------------------------------------------------- | -------------------------------------------------------------------------------- |
| P3 (new list window) × P1 (inherited filter remount) | needs-decision: does a fresh list mount move scroll on remount?                  |
| P3 × P2 (inherited list semantics)                   | covered(O5)                                                                      |
| P3 × StrictMode                                      | needs-decision: does the append timer's cleanup survive a double-invoked effect? |
| P4                                                   | impossible: static copy, no shared surface                                       |
```

Exactly three dispositions:

- `covered(O*/D*)` — an existing row owns the interaction's expected outcome. The cited row must
  exist on the card.
- `impossible: <reason>` — the pair cannot interact. The reason names the mechanism (no shared
  state·DOM·scroll·cache·timing), never a likelihood guess.
- `needs-decision: <question>` — the interaction changes the outcome and no row owns it. Promote to
  a grill question or red card; never resolve it with a default. A `needs-decision` cell that
  survives to lock time means the card ends `NEEDS_DECISION`, not `ORACLE_READY` — resolve it to
  `covered` or `impossible` via the user's answer first.

Rules:

- An empty disposition and a decided policy absent from every pair are both lint failures
  (`oracle-verify.mjs card`: `sweep-cell-empty`, `sweep-policy-missing`). Section presence is
  procedure-owned; once present, structure is machine-checked like State Model.
- The Delta claim "inherited without semantic change" is valid only when each inherited policy it
  names appears in the sweep. Inheritance declared without a sweep is exactly where remount×init
  defects hide.
- When several cells resolve to the same tangled transition policy, that is the trigger to add the
  `## State Model` section instead of more prose rows.

## Deviation sweep — STPA unsafe-action types

The pair sweep asks how two known policies interact. The deviation sweep asks how **each single
policy fails to hold** — the four unsafe-control-action types of STPA, applied mechanically to
every decided `P*`. The judgment space is `P* × 4 types`, derived from the card bytes alone, so
completeness is lintable the same way as pairs.

| Type token                   | The question it generates for a policy                           |
| ---------------------------- | ---------------------------------------------------------------- |
| `not-provided`               | the behavior the policy mandates does not happen — what results? |
| `unsafe-provided`            | the behavior happens in a context where it causes harm — which?  |
| `wrong-timing-order`         | it happens too early, too late, or out of order — what breaks?   |
| `stopped-early-applied-long` | it stops before finishing, or keeps running after it should stop |

```markdown
## Deviations

| Policy | Type                       | Disposition                                                 |
| ------ | -------------------------- | ----------------------------------------------------------- |
| P1     | not-provided               | covered(O3)                                                 |
| P1     | unsafe-provided            | needs-decision: applying it during teardown touches scroll? |
| P1     | wrong-timing-order         | covered(O7)                                                 |
| P1     | stopped-early-applied-long | needs-decision: does cleanup restore the paired state?      |
| P4     | not-provided               | covered(D1)                                                 |
| P4     | unsafe-provided            | impossible: static copy, no context sensitivity             |
| P4     | wrong-timing-order         | impossible: no timing surface                               |
| P4     | stopped-early-applied-long | impossible: no duration                                     |
```

Rules:

- Every decided `P*` carries **all four** type rows; a missing type and an empty·non-enum
  disposition are lint failures (`oracle-verify.mjs card`: `deviation-type-missing`,
  `deviation-disposition`, `deviation-policy-unknown`). Static policies resolve most types with a
  one-line `impossible:` naming the absent surface — that line is the auditable record.
- A fully static policy may compress the three surface types into one shorthand row
  `| P4 | static | impossible: <reason naming the absent timing·context·duration surface> |` —
  it closes `unsafe-provided`·`wrong-timing-order`·`stopped-early-applied-long` together.
  `not-provided` is never closed by the shorthand: even a static copy row answers what happens
  when the copy is missing.
- The dispositions are the same three as pairs, with the same promotion rule: only
  `needs-decision` becomes a grill question, and one surviving to lock means `NEEDS_DECISION`.
- Timer·subscription·pending policies almost never close `stopped-early-applied-long` as
  impossible — StrictMode re-invocation and unmount are standing counterexamples.

## Runtime dimensions — question bank

Add the dimension as a counterpart **when its premise exists in the card**; otherwise it generates
no pairs. Same premise discipline as the seven auto-added TCs.

| Premise on the card                                  | Dimension — the question a pair must answer                                                                                                   |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| effect·timer·subscription                            | StrictMode double-invoke: does cleanup restore every paired state, and does an effect watching state — not the event handler — own the timer? |
| Suspense boundary·key remount                        | mount-time side effects of libraries (virtualizer scroll reset, observers, focus): what does a fresh init do to scroll·focus·selection?       |
| measured layout (ResizeObserver·getComputedStyle)    | the initial default → first measured value transition fires as a "change": is any anchoring·scroll·animation keyed on that event?             |
| render scheduling (transition·deferred) near request | intermediate render values can each spawn a query: does the request-count contract still hold under the new scheduling?                       |
| list + refresh·navigation                            | browser scroll restoration·bfcache versus the card's reset policy: who wins on reload and on back/forward?                                    |

Growth rule: every defect found after lock — user report, exploration phase, review — appends one
entry here via the escaped-bug retro: name the cell or question that would have caught it at card
time. A retro that cannot name one is naming a new dimension; add the dimension. The same retro
writes the `escapes.jsonl` line defined in [`case-space.md`](case-space.md), so the
mis-disposition versus undeclared-dimension ratio stays greppable across oracles.

## Worked counterexample

A revision replaced list rendering with a windowed list and declared the inherited filter-remount
policy "inherited without semantic change" — no sweep. The list library's mount-time `scrollTo(0)`
fired on every filter remount; the defect shipped and was found by the user. The sweep line
`new list window × inherited filter remount` forces that question at card time, before the library
is even installed. Same revision, same mechanism: later fix attempts each broke a different locked
contract — interactions the pairs `scheduling × request-count contract` and
`new list window × inherited input debounce` would have surfaced as questions instead of
implement-and-revert round trips.
