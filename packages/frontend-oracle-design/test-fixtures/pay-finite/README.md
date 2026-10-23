# Pay-finite fixture

A skill tool fixture for `oracle-model.mjs prove-reach` in `frontend-oracle-design`. It is the pay fixture
with its charge count in finite classes (`NoCharge`, `OneCharge`, `ManyCharges`), so every state and event
type is finite. It decides nothing for a real application.

## Fixture policy

1. A second Submit while the request is pending sends nothing new.
2. A Resolve after the order is paid changes nothing.
3. A failed order may be submitted again.
4. However the user clicks and the server answers, an order is charged at most once.

## Files

- `MODEL.bend`: `State`/`Msg`/`Charges`/`Pay` types, `Pay.step` over every state and event, `under_two`,
  `at_most_one`, `run`, `next`.
- `LAWS.bend`: `never_double_charge` over every trace, the cell law `pending_resolve_pays` over the finite
  `Charges`, and the witness `paid_reachable`.
- `PROOF.bend`: the pay invariant in finite classes with one induction `safe_run`, and the witness. `prove`
  generates the cell proof of `pending_resolve_pays`.

`prove-reach --model MODEL.bend --prefix Pay --safe at_most_one` certifies the same safety def over every
trace with no invariant written: 4 of the 12 states are reached. `skills/frontend-oracle-design/scripts/oracle-model.test.mjs`
checks that, that a model which charges again on a duplicate `Resolve` gets the shortest counterexample
`Submit · Resolve · Resolve`, and that the pay fixture, whose charges are a `Nat`, is `NOT_FINITE`.
