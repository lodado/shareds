# Reorder fixture

A skill tool fixture for the order-change pattern in `frontend-oracle-design` (`model-patterns.md`, "Collections and
order"). It fixes one small operation so a law proved by induction can be projected onto a reducer with fast-check.
It decides nothing for a real application.

## Fixture policy

A drag moves the item at index `at` one place toward the back; at the last place it does nothing. Dragging never adds,
drops or changes an item.

## Files

| File                 | Role                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------- |
| `MODEL.bend`         | `Board`/`Drag`, `Board.swap_at`, relations `R_length_kept`, `R_items_kept`                     |
| `LAWS.bend`          | both relations hold for every board and every drag                                             |
| `PROOF.bend`         | induction on the list; `bend PROOF.bend --verdict` prints `ALL PROOFS CHECK`                   |
| `board.mjs`          | the product reducer under test, and a reducer that overwrites a neighbour on a board past four |
| `board.adapter.mjs`  | concretize · step · project between model values and the reducer                               |
| `mutant.adapter.mjs` | the adapter for the overwriting reducer                                                        |

`skills/scripts/oracle-projection.test.mjs` proves the laws, refuses a drag that drops or overwrites an item, and runs
`emit-state`: every board of up to three items, exhaustively, passes the overwriting reducer; sampling boards of up to
seven items fails it. The proof covers the model for every length. It is not a proof about the reducer.
