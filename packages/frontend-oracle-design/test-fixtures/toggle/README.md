# Toggle fixture

A skill tool fixture for the state mode of Formal Oracle Projection in `frontend-oracle-design`. It
fixes one small policy so a proven Bend relation can be projected onto a TypeScript reducer. It
decides nothing for a real application.

## Fixture policy

1. While the toggle is disabled or loading, a Set command leaves `checked` unchanged.
2. Otherwise a Set command sets `checked` to the requested value.

## Files

| File                 | Role                                                                               |
| -------------------- | ---------------------------------------------------------------------------------- |
| `MODEL.bend`         | `Toggle`/`Cmd` types, `Toggle.step`, relations `R_blocked_keeps`, `R_free_applies` |
| `LAWS.bend`          | the relations hold for every state and command of the model                        |
| `PROOF.bend`         | case split; `bend PROOF.bend --verdict` prints `ALL PROOFS CHECK`                  |
| `toggle.mts`         | the product reducer under test (`revision` is outside the projection)              |
| `toggle.mutants.mts` | a reducer that blocks only when disabled and loading both hold                     |
| `toggle.adapter.mjs` | concretize · step · project between model values and the reducer                   |

`skills/scripts/oracle-model.test.mjs` generates the oracle test with `oracle-model.mjs emit state` and
runs it: the reducer passes on all 48 state·command pairs, and the mutant fails on
`checked=false, disabled=true, loading=false, Set{next:true}`, both exhaustively and when sampled by
fast-check. It shows the reducer agrees with the proven relations on that domain; it is not a proof
about the reducer.
