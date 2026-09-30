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
