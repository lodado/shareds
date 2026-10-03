# Oracle Card — Case space: confirm the axes, prove and test only the possible cases

The space is the Bend world (end states) plus the behavior model (event orders). The user confirms its axes
before any Bend is written; the tools enumerate what the assumptions and the environment allow; the kernel
proves the goals over those possible cases; the generated tests run exactly those cases on the product. The
raw product of the axes is never run and never the claim. A card projected from a model package carries the
result as a generated `## Case space` (`- Coverage: model`). A legacy card written by hand declares dimensions
and dispositions machine-generated frames instead — [`case-space-frames.md`](case-space-frames.md).

## Space discovery — before any Bend

Do not write `World.bend`, a state machine or a law from the request. Run this interview first, in the
user's language. It is not Draft approval: confirmed axes do not replace Draft confirmation or authorize a
lock, test edits or production work.

1. **Propose the axes.** Start from the seven input families below and add the request's own. Give each
   axis one line: what it means, its candidate values, its role and why a correct and a wrong result differ
   on it. Each axis names its source ID and exact location — an approved requirement, or an investigation
   `file:line`; code, test and browser observations are investigation evidence, not approved policy. Label
   an inferred axis `Assumption` and a missing fact `Unknown`; Unknown is not excluded. Ask which axis is
   missing for judging right and wrong and which is unnecessary; `yes` accepts the proposal.
2. **Ask counterexamples.** Find two situations the confirmed axes cannot tell apart, one correct and one a
   bug, and ask one at a time with a recommendation:

   ```text
   Case A — <axis>=<value>, <axis>=<value> → correct
   Case B — <axis>=<value>, <axis>=<value> → bug: <what the user loses>
   The axes above are identical. Tell them apart? Then I add <axis> (<role>): <how the test sets or reads it>.
   ```

3. **Repeat** until no such pair comes easily. An axis that changes product policy is the user's to confirm,
   never the agent's.
4. **Classify each axis.** `controllable`: the test sets it to build the situation. `observable`: read from
   the product. `hidden`: real, but no test reads it. `derived`: computed from other axes, so the product
   never stores it as state. A hidden axis that decides correct versus bug is a SUFFICIENCY FAILURE: show the
   two worlds and the hidden value, and recommend promoting it to an observable or adding a substitute signal.
5. **Freeze the record.** Save the confirmed axes and every question and answer verbatim as
   `.ai/oracles/<id>/sources/space-discovery.md`, register it as an approved source and name it in the
   package's `spaceDiscovery`; the lock covers it. Keep the confirmed axes in it as a `## Case space` table
   (and the flow's states as a `## State Model` when it has them): once the Bend files exist,
   `oracle-discovery.mjs cross-check --package <pkg>` compares that declaration with the Bend space
   ([`discovery.md`](../discovery.md)), and each candidate comes back here — a `new-axis` or a `cross-term` as an
   A/B question, a `silent-decision` as a policy question. Card lint fails `cross-check-undecided` — so the
   card cannot be locked — until each candidate is resolved in the model or the record, or decided in
   `discoveryDecisions` with its source. An answer that states product behavior is also quoted as
   an `R*`. Only then write Terms, World, Assumptions and Goals and run the adequacy checks. Each kernel
   counterexample (`sufficiency`, a minimal pair) comes back here in the same A/B form.

These questions decide the model, so they go out before the Draft — the one exception to carrying questions
on the Draft. A run where the user cannot answer ends `NEEDS_DECISION` with the first question; never
confirm axes on the user's behalf. If investigation later changes the axes, print only the added/removed
dimensions, the reason, the possible-case count delta and the changed residual risk.

## Holds — a question that blocks only part of the scope

A policy question found while modelling that the user has not answered does not stop the run when the rest can
be modelled without it. Record it in the package: `holds: [{ id: "H1", question, blocks: [the rows, terms, goals
or behaviours it keeps out], status: "open" }]`. The model, laws, card and tests cover only what no hold blocks,
and no test or production code is written for the blocked part. A discovery candidate that waits on the answer
is decided `held` (`hold: H1`). While a hold is open the run ends `PARTIAL_VERIFIED`, never `REVIEW_VERIFIED`
(`HOLDS_OPEN`). Ask every open hold in one batch once the model work is done (the A/B form above); the answer
becomes `status: resolved` with the `answer` and an approved authoritative `S*`, each `held` candidate is then
promoted, scoped out or rejected, and a new revision adds the blocked rows. A question that leaves nothing to
model — the axes themselves — still stops the run.

## Family taxonomy — imported, not invented

Eight families, merged from catalogs the industry already paid for. The first seven are input families: the
test drives them.

| Family      | Typical dimensions                                                                          | Provenance                   |
| ----------- | ------------------------------------------------------------------------------------------- | ---------------------------- |
| Data        | volume (0/1/page/boundary/max), staleness                                                   | SFDIPOT Data, bva value axis |
| Value       | per-field input classes (min−1/min/format/unicode)                                          | bva value boundaries         |
| Async       | per-operation states (pending/success/error subtype)                                        | bva state axis, SFDIPOT Time |
| Order       | per-operation-pair interleavings (sequential/inverted/duplicate/late-after-cancel)          | bva time·order axis          |
| Entry       | fresh/refresh/back-forward/deep-link                                                        | SFDIPOT Operations           |
| Environment | viewport boundaries, theme, reduced-motion, StrictMode                                      | SFDIPOT Platform, ISO 25010  |
| Platform    | browser·OS — **derive choices from the repo's `browserslist`·`engines`, never from recall** | SFDIPOT Platform             |
| Inherited   | still-effective prior `P*` (owned by the interaction sweep — reference, do not duplicate)   | escaped-bug retro            |

A version-2 model package decides every input family at the model stage, in one of three ways:

- **mapped** — a `controllable` term names the family (`terms[].family`). An observable term tagged with a
  family observes it but does not map it (`package-family-observation-only`).
- **`modeled: behavior`** — the behavior model's events drive it: the temporal families Order and Async, or
  any family whose values are event fields.
- **`excluded: <reason citing an S*>`** — the source text allows leaving it out. A model file is not such a
  source, and "the model did not produce it" is not a reason.

Inherited needs a disposition before the card is projected. The audit lists each family as `mapped` (with
its axes), `excluded` or `undispositioned`; the projection never writes an exclusion the author did not, and
an undispositioned family fails `family-undispositioned`. A family `oracle-dimensions.mjs` mined from a
touched file cannot be excluded silently: `oracle-verify.mjs card --path <file>` fails
`dimension-candidate-undeclared` unless the family declares a dimension or its exclusion reason cites that
file.

Choices come from [`bva.md`](../bva.md): value boundaries become Value choices, state boundaries
become Async choices, time·order boundaries become Order choices, count boundaries become Data
choices. Only real boundaries of approved policy — the bva rule against mechanical 0/1 padding
applies unchanged. Do not add assertion criteria (accessibility, visual quality, success invariants)
as though they were independent input dimensions.

## Possible cases only

- Assumptions (each with a source, an owner and a falsifier) remove impossible worlds; the environment
  `next(history)` removes impossible event orders. A removal is a claim with a falsifier, never a way to
  shrink the space; an unknown combination stays in.
- The kernel proves the goals over the possible worlds (adequacy) and the laws over the model. The model
  enumerates every possible case; the generated tests run a minimum of them on the product — equivalence
  partitioning and boundary values, not the space. `emit-trace` runs the fewest traces that take every event
  class, every event × state-field class pair and every observed class (a class is one value of a small
  domain, or low, low+1, mid, high-1 or high of a wide one; `closed` for a finite model, `capped` at the bound
  otherwise; a configuration is the model state, the allowed events and the events allowed one step later,
  so a `next(history)` that differs only deeper is merged — keep the environment a function of the model
  state), the joint cases that run each world value the test sets with every behavior value
  (`emit-trace --package`), and fast-check beyond it. A defect that needs three classes at once is the
  sample's to find.
- The projection states the counts and the cover. A world several assumptions reject is excluded once in the
  total.

The projected section has one row per driven axis; an observation is not a dimension. A family driven by the
behavior model (`modeled: behavior`) lists the event type:

```markdown
## Case space

- Coverage: model
- Possible cases: 96 of 384 worlds (288 excluded: A1 288); 26 traces of up to 5 events; transition cover closed: every event from all 8 configurations (50 cases past the bound)

| Family | Dimension       | Choices                      |
| ------ | --------------- | ---------------------------- |
| Order  | arrival         | OldFirst, NewFirst, OldEarly |
| Async  | Async:event.Msg | Issue, Respond               |
| Entry  | —               | excluded: one search box S1  |
```

Card lint regenerates it from the package like the rest of the generated region. `oracle-frames.mjs`
generates no frames for `Coverage: model`, and a hand-written card that declares it fails
`case-space-coverage-model`.

## What this section does not claim

The possible cases ⊂ the declared space is machine-checked. Declared space ⊂ reality is not checkable — do
not report Case space coverage as evidence against defect classes outside the declared axes. The
exploration phase and `I*` invariants judge those, and every escape feeds the family taxonomy or the
runtime question bank via the escaped-bug retro. Record each escape as one line of
`.ai/oracles/<id>/escapes.jsonl` with `kind` either `mis-disposition` (an existing cell, frame, exclusion
or `Touches` claim was judged wrong — name it) or `undeclared-dimension` (name the family, dimension, and
choices to add). The full record — `class`, `detected_after`, `should_have_been_caught_by`, `correction` —
is defined once in [`retro-metrics.md`](retro-metrics.md). The ratio between the two kinds is the standing
verdict on this section: `undeclared-dimension` escapes grow the taxonomy, while a run of
`mis-disposition` escapes means dispositions have gone mechanical — narrow the exclusions before adding
process.
