# Cells fixture

A skill tool fixture for cell laws in `frontend-oracle-design`. It fixes one small review policy so
`oracle-model.mjs laws` and `prove` run on a model whose states and events are all finite. It decides
nothing for a real application.

## Fixture policy

1. The owner submitting a draft puts it in review.
2. The owner approving a document in review publishes it; rejecting it returns it to draft.
3. The owner archiving a published document archives it; archiving an archived document again is accepted and
   keeps it.
4. An event from anyone but the owner is refused as not the owner.
5. An owner event the phase does not take is refused as the wrong phase.
6. A refused or stayed event keeps the phase.

## Files

| File         | Role                                                                                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MODEL.bend` | `Phase`/`Why`/`Last`/`Doc`/`Msg` types, `Doc.step` over every state and event, `init`, `next`, `observe`, and nine relations: five forward, two refusal, two frame |
| `LAWS.bend`  | one law per relation: it holds for every state and event of the model                                                                                              |
| `PROOF.bend` | imports `./LAWS.bend` and defines no law                                                                                                                           |

Every law is a three-argument relation over the state before, the event and the state after. A relation sees only
states, so the outcome of the last event is kept in the state's `last` field: `Moved`, `Stayed` or
`Refused{why}`.

The proof is generated. `oracle-model.mjs prove --dir test-fixtures/cells` generates the cell arms of the nine
laws `PROOF.bend` leaves undefined, one case per state and event (160 each), checks them in a temporary copy and
prints one JSON line with `status: "proven"` and `cells.temporaryCopy: true`. It writes nothing here.

`laws` with all nine relations pins all 160 cells. Without the two frame relations the remaining seven leave 140
cells free: a refused or stayed event may then land in any phase, while the model's own step keeps it.
