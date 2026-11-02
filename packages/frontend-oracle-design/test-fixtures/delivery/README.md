# Delivery fixture

A skill tool fixture for the Delivery run of `oracle-run.mjs` in `frontend-oracle-design`. It models the run state
from `init` to a closed state, the facts its guards read and the commands that change them, so `prove` and
`prove-reach` run on a finite state machine and the real CLI can be compared with it. It decides nothing for a real
application. The header of `MODEL.bend` lists what each state field abstracts and what is left out.

## Fixture policy

1. FAIL keeps every transition refused; FAIL with a reason and NEEDS_DECISION with a reason are accepted from every
   state before them, so every reached state can still stop. That is all the proof says about progress: 276
   non-FAIL states cannot reach a reviewed state (ORACLE_READY or NEEDS_DECISION with production touched, which
   VALID_RED and GREEN refuse and the model cannot revert, and VALID_RED with test edits on an exhausted budget).
2. VALID_RED needs a failing reported run on the current bytes and no production change since init; a VALID_RED
   refresh also needs a harness spend after the last one, so refreshes are bounded by the budget.
3. Harness spends before the first VALID_RED are free; a repeat spend on the same test bytes is a duplicate; the third
   counted spend is BUDGET_EXHAUSTED. No command lowers the spent count.
4. `init --reason` amends only at ORACLE_READY before any VALID_RED.
5. REVIEW_VERIFIED and PARTIAL_VERIFIED need a fresh passing run and a reviewer receipt bound to the current packet.
6. A refused command keeps the state. On the CLI, the replay below also checks that it writes nothing and that the
   ledger alone gives back the run state and spent count after every accepted command that writes it.
7. The phase line (`Del.hint`) names the phase's own command unless its guard refuses it on the state: production
   touched before VALID_RED names `guide`, test bytes changed after VALID_RED a fresh `red` after a harness spend
   and `guide` before one, IMPLEMENTED_GREEN without a fresh passing run after the GREEN entry `exec`.

## Files

- `MODEL.bend`: `Phase`/`Run`/`Harness`/`Del`/`Why`/`Last`/`Msg` types, `Del.decide` and `Del.step` over every state
  and command, `enabled`, `hint`, the refresh `credit`, and 25 relations; `Del.safe` is all of them on every enabled
  command plus `hint_accepted`: the events of the named command (`red` = a failing run then VALID_RED, `green` = a
  passing run then GREEN, `exec` = a run, `close` = packet, receipt of a clear review, REVIEW_VERIFIED) are
  accepted, `guide` is named only where neither `red` nor `green` is, and `close --check-report` only when closed.
- `LAWS.bend`: one cell law (`spend_monotone`), four witnesses (REVIEW_VERIFIED, PARTIAL_VERIFIED, a refresh and an
  exhausted budget are reachable) and `red_cycle_returns`, which records that NEEDS_DECISION → ORACLE_READY →
  VALID_RED → NEEDS_DECISION returns to the same state with no budget spent.
- `PROOF.bend`: the witness traces.

`prove-reach --prefix Del --safe safe` proves `Del.safe` on all 1,295 states a trace reaches (15,552 states of the
type × 19 commands). That is a proof about the model's hint, not the CLI's line: `NEXT_COMMANDS` in
`skills/frontend-oracle-design/scripts/oracle-run-machine.cases.mjs` maps each printed command to the model events
above, and the replay of 31 model traces on the real CLI, covering all 364 (run state, VALID_RED recorded, command,
outcome) items the model reaches, checks after every step that `status --brief` names the model's hint and, once per
visited model state, that the model accepts the table's events. The same file checks both proofs and counts the
progress above over the reachable graph.
