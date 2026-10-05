# Contract finite Space

`oracle.md` owns the finite Space in the hand-written card syntax of the shared
[frames procedure](../card/case-space-frames.md): the eight-family taxonomy of
[input families](../roles/case-space-inputs.md), the Pre-plan test-space briefing, Strength,
`Touches`, `[error]` `E*` frames, `PATH*`/`EMPTY`, the 50-frame `case-space-too-wide` cap and the frame
disposition grammar. This file adds only the Contract differences; it does not restate those rules.

- Default coverage is t-way: `- Strength: 2`, High writes `3` (`case-space-strength`). Reports state
  `Coverage: t-way <Strength>`, never full-product counts.
- `- Coverage: full-product` is an explicit opt-in when the approved request requires every Cartesian
  tuple. Then the raw Cartesian candidate cap is **100000**, checked before exclusions, over-cap scope
  needs an approved rescope (never truncation or a hidden switch to t-way), every tuple ID gets one
  source-backed disposition and Reject missing, duplicate, extra, stale or revision-mismatched IDs.
- `Coverage: model` is Formal-only.

Before Draft, mine touched files: `scripts/oracle-dimensions.mjs --path <file>` proposes family
dimensions; `scripts/oracle-verify.mjs card --oracle <card> --path <file>` fails
`dimension-candidate-undeclared` until the family declares a dimension or its exclusion reason cites
that file. Every family is declared or excluded with a reason (`family-undispositioned`).

Unknown combinations remain included until decided. `needs-decision` and `needs-evidence` are unresolved
and block lock. Impossible/excluded cases require approved constraints and a falsifiable witness/reason,
not an agent's convenience. Every required executable case has source-approved expected outcomes and a
real realization plan. Async/Order behavior is carried by finite paths and the `sequence` evidence test,
not only static combinations. Declared-space completeness never equals reality or source completeness.
