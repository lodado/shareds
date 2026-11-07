# Stale search response fixture

A skill tool fixture for `frontend-oracle-design`. It fixes one small policy so the chain from source text to a checked
implementation can run end to end. It decides nothing for a real application.

## Fixture policy

The source text the rules cite as S1:

1. Every search request gets a request id that grows by one per issued request. Issuing a request
   makes it the latest one; the list keeps showing what it showed until a response arrives.
2. A response to an older request does not change what the list shows.
3. The latest request's response is shown when it arrives.
4. The environment delivers each response at most once, only after its request, in any order.
   Cancellation, retry, duplicate responses and a response before its request are out of scope; no
   guarantee is claimed for them.

## Files

| File                         | Role                                                                         |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `oracle.md`                  | a card in the earlier format; some model and projection tests read it        |
| `MODEL.bend`                 | reference model (`Search.init/step/observe`) and environment (`Search.next`) |
| `LAWS.bend`                  | laws about the model, including one `exs` witness                            |
| `PROOF.bend`                 | proof; `bend PROOF.bend --verdict` must print `ALL PROOFS CHECK`             |
| `search-reducer.mts`         | the product transition under test                                            |
| `search-reducer.mutants.mts` | three wrong reducers the conformance check must reject                       |
| `search.adapter.mjs`         | observation adapter: reducer state to the model's observation                |

`skills/frontend-oracle-design/scripts/fod.test.mjs` runs the six steps on it (prove, approve, generate, RED, GREEN),
and `oracle-model.test.mjs` and `oracle-projection.test.mjs` run the proof verdict, the space of every trace of up to 4
events, conformance of the reducer, and the rejection of each mutant with its first counterexample. They show the
reducer matches the model on that declared space; they are not a proof about the reducer and not a browser test.
