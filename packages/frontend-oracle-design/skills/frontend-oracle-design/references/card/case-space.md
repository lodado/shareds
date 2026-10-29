# Oracle Card — Case space: confirm the axes, prove and test only the possible cases

The space is the Bend world (end states) plus the behavior model (event orders). The user confirms its axes
before any Bend is written, with the one `yes` to the first response's provisional Draft; the tools enumerate what the assumptions and the environment allow; the kernel
proves the goals over those possible cases; the generated tests run exactly those cases on the product. The
raw product of the axes is never run and never the claim. A card projected from a model package carries the
result as a generated `## Case space` (`- Coverage: model`). A legacy card written by hand declares dimensions
and dispositions machine-generated frames instead — [`case-space-frames.md`](case-space-frames.md).

## Space discovery: before any Bend

The canonical interview is [roles/space-discovery.md](../roles/space-discovery.md), node
`role-space-discovery`. Read it with its dependencies before proposing or confirming axes.
Intake-only discovery loads that scoped node, not this authoring wrapper or `card-format`.
Confirmed axes never replace Draft confirmation or authorize a lock, test edits or production work.

## Family taxonomy — imported, not invented

Read [roles/case-space-inputs.md](../roles/case-space-inputs.md), node `role-case-space-inputs`,
for the eight-family taxonomy and its seven driven input families. Model-package dispositions and holds are
canonical in [the Formal author procedure](../roles/author-formal.md#model-package-input-dispositions). The card
wrapper consumes those decisions after projection; it does not redefine the model-stage rules.

Choices come from [`bva.md`](../bva.md): value boundaries become Value choices, state boundaries
become Async choices, time·order boundaries become Order choices and count boundaries become Data
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
