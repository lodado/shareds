# Oracle Card — Case space and machine-generated frames

Free-recall enumeration is measurably incomplete; a machine walking a declared space is complete
relative to that space. The card **declares** the space (dimensions × choices — this is where the
BVA axes become raw material), `scripts/oracle-frames.mjs` **generates** the judgment frames
deterministically, and the author only fills dispositions. An undispositioned frame fails lint —
the same silence-to-cell move as the interaction sweep, one level deeper.

Completeness stays conditional: it is mechanical **inside** the declared space only. A dimension
never declared produces no frames forever. The correction stack for that is fixed here: the family
taxonomy below is imported, every family demands a disposition, derivable families come from repo
config, and what still escapes is owned by `I*` invariants, the exploration phase, and the
escaped-bug retro — never claimed as covered.

## Family taxonomy — imported, not invented

Eight families, merged from catalogs the industry already paid for. When writing a card, every
family appears in `## Case space` either instantiated as dimensions or excluded with a reason —
a missing family fails lint (`family-undispositioned`). "Did not think of it" is impossible;
"excluded: reason" is the only way to skip, and it is auditable.

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

Choices come from [`bva.md`](../bva.md): value boundaries become Value choices, state boundaries
become Async choices, time·order boundaries become Order choices, count boundaries become Data
choices. Only real boundaries of approved policy — the bva rule against mechanical 0/1 padding
applies unchanged.

## Card section — declaring the space

```markdown
## Case space

- Strength: 2

| Family      | Dimension    | Choices                                |
| ----------- | ------------ | -------------------------------------- |
| Data        | rows         | 0, 1, pageSize, pageSize+1, max        |
| Value       | keyword      | empty, min, unicode [error]            |
| Async       | list request | success, http-5xx [error]              |
| Order       | filter/page  | sequential, inverted                   |
| Entry       | entry        | fresh, refresh, back-forward           |
| Environment | viewport     | 320, desktop                           |
| Platform    | —            | excluded: single-engine scope per S1   |
| Inherited   | —            | excluded: first revision, no prior P\* |
```

- `Strength: 2` is the default; High risk writes `3`. The generator and lint both read it.
- A choice suffixed `[error]` is excluded from combination and emits one standalone `E*` frame —
  the category-partition error annotation. Everything else joins t-way combination.
- An excluded family writes `—` as the dimension and `excluded: <reason>` as its choices.

### Touches — optional fourth column that scopes the combination

Without it, every combinable dimension pair is an obligation and the residue frames force
copy-pasted independence claims. With it, the author states the interaction claim **once per
dimension** and the machine expands it:

```markdown
| Family      | Dimension | Choices          | Touches                                          |
| ----------- | --------- | ---------------- | ------------------------------------------------ |
| Data        | rows      | 0, 1, max        | P1, I1                                           |
| Value       | keyword   | empty, min       | P1                                               |
| Environment | viewport  | 320, desktop     | I1                                               |
| Platform    | browser   | chromium, webkit | independent: engine cannot alter the policy (S2) |
```

- `Touches` cites the decided `P*`/`I*` the dimension can affect. Combination obligations exist
  only between dimensions whose citations directly intersect (`rows × keyword` via P1,
  `rows × viewport` via I1 — `keyword × viewport` produces no frames; that doubt belongs to the
  sweep as a question, not to twenty residue frames). Strength 3 combines only mutually sharing
  cliques.
- `independent: <reason>` excludes the dimension from combination; each choice still emits a
  1-way frame. A cited dimension with no partner is 1-way too. **A 1-way dimension maps to
  harness configuration** — Playwright projects, the journey matrix — not to per-row test cases.
- A cited id that is not a decided policy or invariant fails `touches-unknown`; a combinable
  dimension (two or more non-error choices) with neither citations nor `independent:` fails
  `touches-missing` once any dimension adopts the column. A card without the column keeps the
  all-pairs behavior unchanged.
- The claim is the audit unit: an escaped webkit-only defect falsifies the one recorded
  `independent:` line, not a guess about twenty dispositions.

## Generated frames — run, then disposition

```bash
node <skill-dir>/scripts/oracle-frames.mjs --oracle .ai/oracles/<id>/oracle.md
```

The generator emits, deterministically for the same card bytes:

- `F*` — t-way covering frames over the combinable choices
- `E*` — one frame per `[error]` choice
- `PATH*` — every simple path of the `## State Model` transition table from its initial state
- `EMPTY <state> × <event>` — every undefined state×event cell

Every emitted ID gets a row in `## Frame dispositions`, with the sweep's three dispositions plus
one that only `F*` frames may carry, under the same promotion rule — only `needs-decision` becomes
a grill question, and one surviving to lock means `NEEDS_DECISION`:

```markdown
## Frame dispositions

| Frame                | Disposition                                                 |
| -------------------- | ----------------------------------------------------------- |
| F1                   | covered(O5)                                                 |
| F2                   | needs-decision: back-forward while the request is pending?  |
| F3                   | independent(O5): row count never reaches the pending policy |
| E1                   | covered(O9)                                                 |
| PATH1                | covered(O1, O5)                                             |
| EMPTY pending × SORT | needs-decision: sort while fetching — cancel or queue?      |
```

Lint (`oracle-verify.mjs card`, active when `## Case space` exists):

- every generated ID has a disposition — `frame-undispositioned`
- no disposition cites an ID the generator did not emit — `frame-unknown`
- disposition enum and `covered()`·`independent()` row citations are checked like the sweep.
  `covered(O5)` on an `F*` frame is an execution claim: O5's test actually runs under that
  frame's choice combination — as an `it.each` row over the frames the fixture can control, or a
  dedicated case. When the choices cannot change the row's outcome, write
  `independent(O5): <mechanism>` instead; it is a claim of independence, audited as such, never
  counted as coverage. `independent()` without a reason, on a non-`F*` frame, or `covered()` with
  a reason fails `frame-disposition`.
- every taxonomy family appears — `family-undispositioned`
- more than 50 combinable frames — `case-space-too-wide`: not a budget to fill but a design
  disqualification line; split the dimension or narrow the scope, mirroring bva's 30
  `@ts-expect-error` rule

A frame does not create a test by itself. `F*`·`E*` dispositions map to existing rows or promote
questions — a `covered()` `F*` frame parameterizes the row's existing test, it does not add an
owner; `PATH*` frames become the Delivery path-test enumeration ($test maps each path to one test,
and that path test doubles as the evidence for every row it traverses — assertion ownership stays
single, so a row covered by a path gets no standalone test); `EMPTY` cells resolve to impossible
or a policy question, per the State Model rule that already owns them.

Three of these are machine-checked at `oracle-verify.mjs evidence`, not only promised in prose:
every generated `PATH*` needs an `evidence.json` `paths.<id>` entry of `{ kind: "test", name }`
whose name is in the run (`EVIDENCE_MISSING_PATH`·`EVIDENCE_UNKNOWN_PATH`), an `Order`
dimension with two or more combinable choices needs `evidence.json` `sequence` naming the
sequence test (`SEQUENCE_EVIDENCE_MISSING`), and every `covered()` `F*` frame needs an
`evidence.json` `frames.<id>` entry naming the case that actually runs that combination
(`EVIDENCE_MISSING_FRAME`·`EVIDENCE_UNKNOWN_FRAME`) — `independent()`·`impossible`·
`needs-decision` frames are exempt. `oracle-verify.mjs evidence-scaffold` emits both
keys when the card declares them, and the `VALID_RED` transition freezes them alongside the row
mapping — swapping a `PATH*` or `sequence` name for another passing test after RED is
`HARNESS_BUDGET_REQUIRED`·`EVIDENCE_STALE`, the same gate the row mapping already had.

## What this section does not claim

Frames ⊂ declared space is machine-checked. Declared space ⊂ reality is not checkable — do not
report Case space coverage as evidence against defect classes outside the declared dimensions.
The exploration phase and `I*` invariants judge those, and every escape feeds the family taxonomy
or the runtime question bank via the escaped-bug retro. Record each escape as one line of
`.ai/oracles/<id>/escapes.jsonl` with `kind` either `mis-disposition` (an existing cell, frame,
or `Touches` claim was judged wrong — name it) or `undeclared-dimension` (name the family,
dimension, and choices to add). The full record — `class`, `detected_after`,
`should_have_been_caught_by`, `correction` — is defined once in
[`retro-metrics.md`](retro-metrics.md). The ratio between the two kinds is the standing verdict on this
section: `undeclared-dimension` escapes grow the taxonomy, while a run of `mis-disposition`
escapes means dispositions have gone mechanical — narrow the `Touches` citations before adding
process.
