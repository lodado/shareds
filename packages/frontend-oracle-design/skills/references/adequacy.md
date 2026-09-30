# Oracle space adequacy — Terms, world model and checks

A card can pass every row and still miss the user's goal: its coordinates may lump together two
situations the goal judges differently, or its rows may be weaker than the goal. This check catches
both, inside a declared world. It runs only on the Bend path (eligibility in
[`bend-cross-verification.md`](bend-cross-verification.md) §1); Low, Design-only's scope and cards
without these sections are unchanged. A card without `## Adequacy` reports adequacy as not evaluated —
never as proven.

The check reasons about a finite world that someone wrote down. It cannot find a phenomenon the world
leaves out, and it does not prove anything about the product: product behavior is still judged by
VALID_RED, GREEN and conformance.

## `## Terms` — the dictionary

One row per term the card or the world uses. The same word in two bounded contexts is two rows (a
screen's "delete", a trash move and a server purge are three terms). Terms can stand alone on any card;
with `## Adequacy`, every world field has exactly one term.

```markdown
| Term | Context | Name                  | Category   | Field     | Observed via                        | Definition                    | Not                             | Source | Status    |
| ---- | ------- | --------------------- | ---------- | --------- | ----------------------------------- | ----------------------------- | ------------------------------- | ------ | --------- |
| T3   | server  | commit                | observable | committed | API: GET /documents/1 → new version | the server applied the change | request sent; server accepted   | S1     | confirmed |
| T4   | editor  | Saved acknowledgement | observable | ack       | UI: the "Saved" toast               | the editor sees "Saved"       | request sent; response received | S1     | confirmed |
```

- `Category`: `controllable` (the test sets it), `observable` (the product exposes it; `Observed via`
  names the path), `hidden` (the product exposes no path), `concept` (no field; `Field` is `—`).
- One field per meaning: two terms on one field (`terms-field-conflated`) merge meanings such as sent,
  accepted, committed and shown. Split the field instead.
- `Not` names the neighbouring meaning the term must not be confused with. A `confirmed` term cites an
  approved, non-implementation source; an undecided meaning is `open` and goes to Open questions.
- A row of the card that uses `success`, `complete`, `save`, `delete`, `cancel`, `same`, `latest`,
  `permission` or `change` (or 성공·완료·저장·삭제·취소·동일·같은·최신·권한·변경) needs a term whose
  name carries that word (`adequacy-vague-term`).

## `## Adequacy` — what the card claims about the world

```markdown
- World: S2 Save
- Coordinates: start held
- Observations: committed ack reload
- Rows: O1 O2 O3 O4
- Rows outside the world: none
```

Four tables follow, told apart by their first header cell. `A*`, `G*` and each listed `O*` name defs
`<Prefix>.<ID>(w) -> Bool` in the world file; the tool composes validity from the Assumption table and
the card predicate from `Rows`, so nothing outside those tables can enter either.

| Table        | Columns                          | Rule                                                                                        |
| ------------ | -------------------------------- | ------------------------------------------------------------------------------------------- |
| `Assumption` | Assumption · Source · Falsifier  | an environment fact with its source and the observation that would show it false            |
| `Goal`       | Goal · Kind · Cites              | from the source text: `Cites` names an `S*` directly; `safety` or `witness`                 |
| `Example`    | Example · Goal · World · Verdict | an approved judgment, e.g. `start !held committed ack reload` → `violates`                  |
| `Hazard`     | Hazard · Disposition             | each of the six hazards once: `modeled: <fields>`, `n/a: S<n> <reason>` or `question: Q<n>` |

Coordinates are controllable fields and Observations are observable fields — plain field lists, not
functions, so the answer cannot be smuggled into them. Every `O*` row is in `Rows` or in
`Rows outside the world` with a reason. Moving a guarantee into the Assumption table changes the
card's meaning and goes through the existing approval and revision path.

## World model authoring

The model analyst writes this from the source text alone, before seeing the card's rows.

- One record type, `type <Prefix> is Data:` with one constructor `<Prefix>{field: Type, ...}`. Each
  field is `Bool` or a type whose constructors take no fields. Fields with an infinite domain (`Nat`,
  lists) make every check unknown.
- Every fact the source talks about is a field, including outcomes the source forbids: a commit
  after a revocation, a "Saved" toast without a commit, a reload showing an old version. A world that
  allows only correct outcomes can never produce a counterexample.
- `<Prefix>.A<n>(w) -> Bool` states an environment fact the product cannot change, with a source and
  a falsifier. A duty of the product is a goal, never an assumption.
- `<Prefix>.G<n>(w) -> Bool` states a goal from the source text. `safety`: every world the card allows
  satisfies it. `witness`: some world the card allows reaches it (the normal path is possible).
- No foreign or `@unsafe` code; every imported file is a registered `repo:` source.
- Return the Bend file, the Assumption and Goal rows with sources, one candidate Terms row per field
  (with its category), boundary examples, and the questions the source leaves open.

## The checks

`scripts/oracle-adequacy.mjs check --card <oracle.md>` enumerates every world (at most 8192), writes
each conclusion as a law with its proof, and has `bend --verdict` re-check the whole file. A
conclusion the kernel does not accept is `unknown`, whatever the search found.

| Check               | Claim                                               | Refuted means — action                                                                           |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `world-nonempty`    | some world satisfies the assumptions                | the assumptions contradict each other and every law would pass vacuously — fix them              |
| `card-satisfiable`  | some valid world satisfies every row                | the rows contradict each other                                                                   |
| `goal-falsifiable`  | some valid world violates the safety goal           | the assumptions swallow the goal or the goal is vacuous                                          |
| `card-implies-goal` | every valid world the rows allow satisfies the goal | a counterexample world: the rows pass and the goal fails — strengthen the rows                   |
| `goal-witness`      | some valid world the rows allow reaches the goal    | the rows forbid the normal path — safety alone passes                                            |
| `sufficiency`       | the goal is a function of Coordinates·Observations  | two worlds alike on both, judged differently — add the differing field; hidden → OBSERVATION_GAP |
| `card-observable`   | the rows are a function of Coordinates·Observations | the rows depend on something the test cannot set or read                                         |
| `example`           | each approved example keeps its verdict             | the goal definition changed an approved judgment                                                 |
| `open-terms`        | no def depends on a field whose term is `open`      | a judgment rests on an undecided meaning                                                         |

`card-implies-goal` and `sufficiency` fail for different reasons. The first is a weak card: add or
strengthen rows. The second is a blind card: rows alone cannot fix it without forbidding normal
behavior, so add a coordinate or an observation. A hidden differing field is never read from a test
double: register a real product path for it in Terms or record an Open question.

The result has `status` (`proven`, `refuted`, `unknown`, `not-run`) and, per check, an
`evidenceKind`: `kernel-proof-finite` (every world, proven by the kernel), `kernel-witness` (a
concrete world or pair), `kernel-computation` (one evaluated example) or `enumeration` (open-terms).
`minimalPairs` lists pairs of valid worlds that differ in one field and get opposite verdicts — show
them in the Human review brief as plain situations; approved pairs become `Example` rows. The exit
code is 0 only for `proven`.

A card with `## Adequacy` needs `--required-label bend-adequacy:reported` at `init`; its node-test run
asserts that the check reports `proven` for the locked card and world. The lock covers the card (Terms
included) and the world file with its imports, so a changed definition invalidates the evidence even
when a law's text is unchanged.

## Model analyst — two independent readings

Independence lives in the world model and the goals, not in the proofs: the kernel re-checks proofs
whoever writes them, and the tool generates them. Dispatch one read-only analyst with only the file
from `oracle-adequacy.mjs model-input --card <oracle.md> --output <file>`: the Outcome Brief, the
source text, the hazards and the authoring rules above — no rows, Case space, Terms, product code or
tests. The Controller writes the card as usual, translates its rows into `<Prefix>.O<n>` defs over
the analyst's record, and runs the check.

- The Controller does not edit the analyst's world, assumptions or goals. A disagreement is an Open
  question; re-dispatch the analyst with the user's answer.
- Record the counterexamples of the first comparison in the journal; they measure what the second
  reading found.
- Without delegation, record the limitation and run sequentially. The result states
  `independence.evidence: self-reported`: host receipts do not cover the analyst before the lock yet.

## Oracle refinement loop

1. Reproduce the counterexample from the check output (a world or a pair of worlds).
2. Compare it with the source text and the terms.
3. Classify it: a missing coordinate, observation, row or goal; a wrong assumption; a model error.
   A model or checker error is not a product defect.
4. Record it in the journal or as an Open question.
5. Propose the change with its meaning change, the new world count and the checks it affects.
6. A change of meaning goes through the existing approval and a new revision.
7. Re-run on the new revision and keep the counterexample as an `Example` row.

Never narrow the space to make a check pass (Oracle Gaming): dropping a field from Observations,
moving a goal into an assumption or deleting a row changes the card's meaning. The lock catches the
edit and the checks report the reopened gap. A phenomenon outside the world is not forced into the
nearest field; it reopens the problem definition.

## Law patterns

Useful shapes for goals and rows; none is required.

| Pattern          | Claim shape                                            |
| ---------------- | ------------------------------------------------------ |
| Invariant        | every allowed world satisfies P                        |
| Preservation     | P before an operation implies P after it               |
| Idempotence      | applying the operation twice observes the same as once |
| Non-interference | changing A leaves B's projection unchanged             |
| Round-trip       | decode after encode returns the value                  |
| Referential      | every reference points at an existing target           |
| Ordering         | the operation keeps the order relation                 |
| Determinism      | the same input gives the same observation              |
| Commutativity    | two operations in either order observe the same        |
| Monotonicity     | progress never goes back                               |

When a counterexample appears, check in this order before calling it a product defect: implementation,
formal model, projection (Coordinates·Observations), missing assumption, ambiguous source, wrong goal,
missing axis. Map the outcome to the existing taxonomy: a policy or meaning gap is `POLICY_GAP` or
`NEEDS_DECISION`, a missing distinction is `DIMENSION_MISSING` in the escape record, a tool failure
is `FAIL`.

## Guarantees and limits

- Proven: the stated claims over every world of the declared record that the assumptions allow,
  re-checked by the Bend kernel.
- Not proven: that the world, the goals or the terms mean what the source means (human review, helped
  by minimal pairs and examples); anything about the product; progress ("eventually"); phenomena the
  world leaves out; case-space `impossible` or `independent` claims.
- Unknown, never a pass: an infinite field, more than 8192 worlds, a kernel timeout or rejection.
