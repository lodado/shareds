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
| `World.bend`                | adequacy world `Race` (one attempt, two requests), goals G1–G4, contract predicates by symbol     | S4     |
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
