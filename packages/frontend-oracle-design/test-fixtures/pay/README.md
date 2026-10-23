# Pay fixture

A skill tool fixture for a safety law over every trace in `frontend-oracle-design`. It fixes one small
payment policy so the trace template of `references/bend-proof.md` is checked by the kernel. It decides
nothing for a real application.

## Fixture policy

1. A second Submit while the request is pending sends nothing new.
2. A Resolve after the order is paid changes nothing.
3. A failed order may be submitted again.
4. However the user clicks and the server answers, an order is charged at most once.

## Files

| File         | Role                                                                                                                                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `MODEL.bend` | `State`/`Msg`/`Pay` types, `Pay.step` over every state and event, `at_most_one`, `run`, `next`                                                                                                               |
| `LAWS.bend`  | `never_double_charge` over every trace, `pending_resolve_pays`, witness `paid_reachable`                                                                                                                     |
| `PROOF.bend` | invariant `inv`, `inv_step`, `inv_safe` and one induction `safe_run`; `weak_is_not_inductive` checks the counterexample to induction of `charges ≤ 1`; `bend PROOF.bend --verdict` prints `ALL PROOFS CHECK` |

`skills/frontend-oracle-design/scripts/oracle-model.test.mjs` proves the laws and checks that a model which
charges again on a duplicate `Resolve` fails at the `inv_step` arm for `Paid` and `Resolve`.
