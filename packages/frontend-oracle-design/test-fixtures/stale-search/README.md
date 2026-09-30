# Stale search response fixture

A skill tool fixture for the Bend formal model path of `frontend-oracle-design`. It fixes one small
policy so the chain from source text to a checked implementation can run end to end. It decides
nothing for a real application.

## Fixture policy

The source text the card cites as S1:

1. Every search request gets a request id that grows by one per issued request. Issuing a request
   makes it the latest one; the list keeps showing what it showed until a response arrives.
2. A response to an older request does not change what the list shows.
3. The latest request's response is shown when it arrives.
4. The environment delivers each response at most once, only after its request, in any order.
   Cancellation, retry, duplicate responses and a response before its request are out of scope; no
   guarantee is claimed for them.

## Files

| File                         | Role                                                                         | Locked     |
| ---------------------------- | ---------------------------------------------------------------------------- | ---------- |
| `oracle.md`                  | Oracle card: policies P1–P3, rows O1–O4, `## Formal Model`                   | card bytes |
| `MODEL.bend`                 | reference model (`Search.init/step/observe`) and environment (`Search.next`) | S2         |
| `LAWS.bend`                  | approved laws about the model, including one `exs` witness                   | S3         |
| `PROOF.bend`                 | proof candidate; `bend PROOF.bend --verdict` must print `ALL PROOFS CHECK`   | no         |
| `search-reducer.mts`         | the product transition under test                                            | no         |
| `search-reducer.mutants.mts` | three wrong reducers the conformance check must reject                       | no         |
| `search.adapter.mjs`         | observation adapter: reducer state to the model's observation                | no         |

`skills/scripts/oracle-model.test.mjs` runs the chain: the proof verdict, the space of every trace of
up to 4 events (10 cases, each prefix observed), conformance of the reducer, and the rejection of each
mutant with its first counterexample. It shows the reducer matches the model on that declared space;
it is not a proof about the reducer and not a browser test.

## Model-first path (added with oracle-package v1)

The same fixture also runs the model-first chain of `bend-cross-verification.md` §2 without changing
the legacy card above. The package is the input; the card is projected from it.

| File                        | Role                                                                                              | Locked |
| --------------------------- | ------------------------------------------------------------------------------------------------- | ------ |
| `oracle.package.json`       | model package: sources, reading, world terms, goals, contract by model symbol, behavior, law rows | S5     |
| `oracle.package.draft.json` | the first draft: `oldShown` hidden and an end-state-only stale row — kept as the refuted record   | no     |
| `World.bend`                | adequacy world `Race` (one attempt, two requests), goals G1–G5, contract predicates by symbol     | S4     |
| `oracle.model-first.md`     | card projected by `oracle-package.mjs project-card`; only User Confirmation is hand-written       | card   |
| `world.adapter.mjs`         | world adapter: drives the reducer per coordinate setting and reads both observations              | no     |

The goals were written in the same context as the contract (`author: controller`), so every adequacy
result on this package is reported as `independence.evidence: none` and `goalAudit.claim:
self-consistency` — it shows the card agrees with its model, not that the model is faithful to the text.
The approval in `oracle.model-first.md` is a synthetic fixture approval, like the legacy card's.
`skills/scripts/oracle-package.test.mjs` runs the chain: the draft refuted by a hidden observation, the
refined package proven, the flicker mutant passing the draft and failing the refined world, the projected
card linted and locked with the package, a ledger-bound RED on the wrong reducer, VALID_RED, GREEN on the
fix, and `IMPLEMENTED_GREEN` refused because this fixture has no type-fest contract.

## Discovery-driven closure (added with oracle-discovery v1)

`skills/references/discovery.md` attacks the declared space instead of trusting it. The fixture runs
`oracle-discovery.mjs close` on both packages: the draft is refuted and expanded, and the refined package
closes with bounds.

| File                               | Role                                                                                                 | Locked |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ |
| `Metamorphic.bend`                 | metamorphic relation MR1: appending an issued request never changes what the list shows              | S6     |
| `WorldV1.bend`                     | the space v1 world, kept for the draft package                                                       | no     |
| `world.v1.adapter.mjs`             | the space v1 world adapter, kept for the draft package                                               | no     |
| `discovery/runtime-anomalies.json` | synthetic incidents: INC-184 (a stale overwrite inside the space) and INC-201 (a duplicate response) | no     |
| `discovery/*.input.md`             | the exact inputs of the current AI operator runs (`oracle-discovery.mjs ai-input`)                   | no     |
| `discovery/*.output.json`          | the outputs the fresh-context agents wrote from those inputs alone                                   | no     |
| `discovery/round1/` … `round6/`    | earlier runs, stale since the space or an input changed; their findings are carried until decided    | no     |

How the space grew — every step is a recorded candidate, decision and axis origin in `oracle.package.json`:

- **Space v1** (the draft): the closure finds a hidden observation (C-fee4ce433a), an end-state-only row
  (C-3ac744e3e6) and a surviving mutant that empties the shown results (F5, C-069764844d).
- **Space v2**: `oldShown` and `itemsIntact` became observations and the stale row holds at every step. F2
  (`!==` becomes `<`) is decided equivalent: the environment never delivers an id above the latest. The
  reducer accepts a response before any request (id 0), which is out of scope (C-3effbeff60).
- **Space v3**, from two AI rounds: both agents in both rounds found that no world lets the list already
  show results when the latest response lands, and that no response is ever empty. The world gained
  `arrival=OldEarly`, `oldEmpty` and `newEmpty`, `itemsIntact` is judged after every event, and O3 keeps
  what the list showed instead of "nothing". The faults F6–F9 were added as evidence: F6 (only the previous
  request counts as stale) dies to trace conformance, which is why the third-request findings are decided
  `covered` by O4; F7 (append) dies only at `OldEarly`, and F8 and F9 (empty responses) only where a
  response is empty.
- **Space v4**, from AI round 3: most findings were already rejected by a row (the four in-world worlds
  mechanically, the rest by the trace space), but the explorer found that no check reached a two-digit
  request id. The world gained `longSession` (the attempt's requests are 9 and 10); F11 (ids compared as
  text, so `'9'` sorts after `'10'`) dies only there, and F10 (a stale response clears the list) dies in the
  world and the trace space alike.
- **Space v5**, from AI round 4: results kept from an answered request while a late response for a middle
  request arrives need five events (Issue, Respond 1, Issue, Issue, Respond 2). At bound 4 only fast-check
  sampling caught the mutant F12 (a late response ignored only when nothing or the latest is shown), so the
  Formal Model space now runs to 5 events and F12 dies to trace conformance. Findings outside the reducer —
  errors, timeouts, the id a response carries, loading states, counts and labels — are out of scope through
  the Open question Q2; a remount that restarts the ids is out of scope through Q1.
- **Rounds 5 and 6**: the explorer found nothing new. The critic had guessed what the fields mean, so its
  input gained each axis's term definition; with them it found that T9 misdescribed the long session —
  requests 9 and 10 cross from one digit to two, which is what exposes a text comparison. T9 was
  corrected, a term (T10) now defines the "change" O2 speaks of, and the source sentence that only
  introduces the policy list is decided as not a requirement.
- **Round 7** ran both operators on the corrected space. Neither found a new axis: every finding was a case
  the trace space already judges (a third request, a lost or held response) or a layer outside the reducer
  (Q1, Q2). The closure is `CLOSED_WITH_BOUNDS`; `oracle-discovery.mjs close --runtime
discovery/runtime-anomalies.json` prints the levels and the residual-risk list.

Every decision, approval and incident here is synthetic: the decisions were written by the same
controller that wrote the package, so they show the mechanics and carry no independence. The AI runs are
real runs of fresh-context agents on the recorded inputs, and they remain samples.
