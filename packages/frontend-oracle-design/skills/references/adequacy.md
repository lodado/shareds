# Oracle space adequacy — Terms, world model and checks

Bend closes the defined problem space mathematically, fast-check attacks the real implementation and
the edges of that space, and the counterexamples they find widen the problem space itself.

A card can pass every row and still miss the user's goal: its coordinates may lump together two
situations the goal judges differently, or its rows may be weaker than the goal. This check catches
both, inside a declared world. It is mandatory for every Oracle risk and lane, including Low and Design-only. Every card must carry
`## Terms` and `## Adequacy`, with a locked finite world, goals and checks. A missing section is a
contract failure (`FAIL`), never “not evaluated” or proven by omission. Design-only performs the
design, model and proof/adequacy checks; product test execution remains Delivery.

The check reasons about a finite world that someone wrote down. It cannot find a phenomenon the world
leaves out, and it does not prove anything about the product: product behavior is still judged by
VALID_RED, GREEN and conformance.

## `## Terms` — the dictionary

One row per term the card or the world uses. The same word in two bounded contexts is two rows (a
screen's "delete", a trash move and a server purge are three terms). Terms can stand alone on any card;
with `## Adequacy`, every world field has exactly one term.

```markdown
| Term | Context | Name                   | Category     | Field     | Path                                                 | Definition                    | Not                           | Source | Status    |
| ---- | ------- | ---------------------- | ------------ | --------- | ---------------------------------------------------- | ----------------------------- | ----------------------------- | ------ | --------- |
| T2   | editor  | commit-time permission | controllable | held      | test: the server revokes after its check, pre-commit | still holds it at the commit  | permission at submit          | S1     | confirmed |
| T3   | server  | commit                 | observable   | committed | API: GET /documents/1 → new version                  | the server applied the change | request sent; server accepted | S1     | confirmed |
```

- `Category`: `controllable` (the test sets it), `observable` (the product exposes it), `hidden` (the
  product exposes no path), `concept` (no field; `Field` is `—`).
- `Path` says how the test realizes the term: for a controllable term how the test sets it, for an
  observable term the product path that reads it; hidden and concept terms have `—` (`terms-path`).
  A coordinate whose Path does not match its meaning goes untested while its tests pass — "permission
  missing at commit" built by revoking before the request never reaches the gap between the server's
  check and its commit. The adapter builds each coordinate exactly as its Path says. Cards from
  0.65.0 name this column `Observed via`; it is read as `Path`.
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

| Table        | Columns                                 | Rule                                                                                 |
| ------------ | --------------------------------------- | ------------------------------------------------------------------------------------ |
| `Assumption` | Assumption · Source · Owner · Falsifier | an environment fact, who guarantees it, and the observation that would show it false |
| `Goal`       | Goal · Kind · Cites                     | from the source text: `Cites` names an `S*` directly; `safety` or `witness`          |
| `Example`    | Example · Goal · World · Verdict        | an approved judgment, e.g. `start !held committed ack reload` → `violates`           |
| `Hazard`     | Hazard · Disposition                    | each hazard once: `modeled: <fields>`, `n/a: S<n> <reason>` or `question: Q<n>`      |

An assumption states only what the product cannot change. `Owner` names who guarantees it outside the
product (a server team and its API contract, the browser, the OS, the user) or `harness` when the test
cannot build the excluded setting; a product duty is a goal (`adequacy-assumption-owner`). Whether a
reload reads the server or a client cache is decided by the product, so "a reload never shows an
uncommitted version" is a goal with a row, not an assumption — written as an assumption it silently
removes every world that violates it. A `harness` assumption does not shrink the claim: the worlds it
excludes are reported as untested outside the space.

The hazards are `permission-change`, `concurrent-change`, `display-vs-commit`, `effect-count`,
`identity-reference`, `feature-composition`, `carry-over` (state or an indicator from an earlier
attempt remains in the next: a stale toast, error or selection — a one-attempt world cannot see it)
and `order-timing` (the result depends on what happens first: a toast before the commit, a late
response — a record world compares end states only, so model the order in a trace model or scope it
out). The lint requires a disposition for each.

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
- `<Prefix>.A<n>(w) -> Bool` states an environment fact the product cannot change, with a source, an
  owner outside the product and a falsifier. A duty of the product is a goal, never an assumption.
- Keep every qualifier of the source text — while, unless, within, except, only if. A qualifier the
  goals or rows drop makes the card promise more or less than the source; an undefined qualifier is an
  `open` term and an Open question.
- `<Prefix>.G<n>(w) -> Bool` states a goal from the source text. `safety`: every world the card allows
  satisfies it. `witness`: some world the card allows reaches it (the normal path is possible).
- No foreign or `@unsafe` code; every imported file is a registered `repo:` source.
- Return the Bend file, the Assumption and Goal rows with sources, one candidate Terms row per field
  (with its category), boundary examples, and the questions the source leaves open.

## The checks

`scripts/oracle-adequacy.mjs check --card <oracle.md>` enumerates every world (at most 8192), writes
each conclusion as a law with its proof, and has `bend --verdict` re-check the whole file. A
conclusion the kernel does not accept is `unknown`, whatever the search found.

Always pass `--out .ai/oracles/<id>/formal/` (run evidence; the world file itself lives in the code's
`__test__/formal/`, bend-cross-verification.md §4 placement): the tool keeps `ADEQUACY.bend` (every conclusion as a law
with its proof, importing the world file by relative path, headed by the `inputDigest`) and
`ADEQUACY.json` (the full result). Anyone can re-check the conclusions later with
`bend ADEQUACY.bend --verdict` in that directory; cite both files in the journal and the review
packet. They are evidence, not sources — the lock covers the card and the world, and a changed input
changes the `inputDigest`.

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

## World conformance

`scripts/oracle-adequacy.mjs conform --card <oracle.md> --adapter <world-adapter.mjs>` runs the product
on every coordinate setting the assumptions allow. The adapter lives in the same `__test__/formal/`,
is written by the AI and reviewed like the conformance adapter (bend-cross-verification.md §4). It exports `run(coordinates) →
observations`, reading each observation through the product path its term names; a setting the
product cannot build throws. For each setting the tool finds the valid worlds with those coordinates
and observations and judges the rows with the compiled defs. No such world is `model-gap`: the product
did something the world calls impossible, which reopens the problem definition. With
`card-implies-goal` proven, passing every setting means the goals hold too — only while the assumptions
hold and the observation paths are faithful. Report it as `conformance: tested`, never proven.

## Finding problems outside the space

No tool finds an axis nobody wrote down; outside information comes from outside the model. Point these
sources at the four edges of the space and treat what they find as candidates:

- Assumptions: `check` reports `sensitivity`. Per assumption, the worlds the rows allow once it is
  dropped and the goals only it supports. A supported goal means its falsifier needs a test or a
  monitor; opened worlds with no broken goal need a human look — a harmful one is a missing goal.
- Observations: the conformance `residue` (product fields that vary under one observation).
- Vocabulary and range: `outside-space` replays, `model-gap` settings, and fast-check beyond the bound.
- Another reading: the model analyst above, and the AI explorer below.
- History: `escapes.jsonl` records whose world model also missed the phenomenon.

### AI explorer

Extend the existing reverse-impossible review; do not add a subagent. For a card with `## Adequacy`,
hand the reviewer only `oracle-adequacy.mjs explore-input --card <oracle.md> --output <file>`: the
source text, the Outcome Brief, the rows, Terms and Adequacy, the sensitivity and the declared
out-of-world list, with a JSON schema. Unlike the model analyst, the explorer sees the card — its job
is to break it. It returns candidates where every row passes and the user is still harmed:
`in-world` (a world literal over the existing fields), `new-fact` (a fact the world lacks, its
category and the product path that would show it) or `qualifier` (source words such as "while the
retention conditions hold" that the rows dropped). Run
`oracle-adequacy.mjs triage --card <oracle.md> --candidates <json>`:

| Verdict                | Meaning                                                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assumption-challenge` | an assumption excludes the world — the source calls it harmful: a goal and a row (the assumption was a product duty); the source is silent: a policy question; Owner `harness`: untested, listed outside |
| `covered`              | a row already rejects the world                                                                                                                                                                          |
| `goal-gap`             | the rows allow it and every goal holds — a candidate goal if the source calls it harmful                                                                                                                 |
| `contradiction`        | the rows allow a goal violation — re-run the check                                                                                                                                                       |
| `candidate-axis`       | a new fact, with a draft Open question                                                                                                                                                                   |
| `dropped-qualifier`    | restate the rows' scope with the source words and define them in Terms                                                                                                                                   |
| `invalid`              | missing fields or sources, or an existing field posed as new                                                                                                                                             |

Nothing enters the space automatically. A candidate passes the promotion gate (not expressible with
existing axes, not an implementation detail, recurring elsewhere, meaningful to the user, observable)
and the user's approval, then lands in a new revision; it is closed when its original counterexample
replays inside the new space and is judged. Record the explorer's raw output and the triage in the
journal.

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
- Discovery raises the odds of finding what the world leaves out; it never makes the world complete.
