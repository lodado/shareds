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

| Pair                          | Disposition                                                   |
| ----------------------------- | ------------------------------------------------------------- |
| P19 × P13 (inherited remount) | needs-decision: does virtualizer init move scroll on remount? |
| P22 × P19                     | covered(O20)                                                  |
| P20 × P23                     | impossible: both derived reads, no mutual write               |
| P4                            | impossible: static copy, no shared surface                    |
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
time. A retro that cannot name one is naming a new dimension; add the dimension.

## Worked counterexample

A revision replaced list rendering with row virtualization and declared "P13 (filter remount)
inherited without semantic change" — no sweep. The virtualizer's mount-time `scrollTo(0)` fired on
every filter remount; the defect shipped and was found by the user. The sweep line
`P19(virtualization) × P13(inherited remount)` forces the question at card time, before the library
is even installed. Same revision, same mechanism: three later fix attempts each broke a different
locked contract (checkbox responsiveness, GET accounting) — interactions that pairs
`scheduling × request-count` and `P19 × filter debounce` would have surfaced as questions instead
of implement-and-revert round trips.
