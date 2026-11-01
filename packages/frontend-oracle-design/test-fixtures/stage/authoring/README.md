# Authoring fixture

A skill tool fixture for authoring a `formal-bend/v1` package in `frontend-oracle-design`: the stage record of
`oracle-stage.mjs` (`begin`, `advance`, `rewind`, `status`, `review-input`, `extend`), the authoring round budget of
`oracle-iterations.mjs`, `oracle-cycle.mjs walk`, and the stage calls of `oracle-lock.mjs create`. It decides nothing
for a real application. The header of `MODEL.bend` lists what each state field abstracts and what is left out.

## Fixture policy

1. The stage part is the stage fixture one directory up: `advance` moves one stage forward or runs CHECKED again in
   place, only the lock enters ORACLE_READY, and `rewind --reason` goes back to a stage at or before the current one.
2. The authoring round rises only on `review-input`, when an input key (the review text or the dispatch attempt)
   recorded in this round changes; a key recorded in an earlier round, or never, is recorded in this round. A round
   past the limit refuses the whole `review-input` as ITERATION_BUDGET_EXHAUSTED and writes nothing.
3. `extend` raises the limit by one with an explicit approval naming that round, or once to at most 5 with a standing
   delegation. Both are refused at ORACLE_READY. No approval names a round past the ceiling
   (ITERATION_CEILING_REACHED).
4. Every rewind and every CHECKED recheck counts. Past the allowance the next one is refused as REWIND_CAP_REACHED;
   an accepted `extend` sets the allowance to the count plus the cap. The same rewind repeated with nothing written
   since is accepted and writes nothing.
5. A walk on a stale record needs `--reason` and then rewinds to DISCOVERING; with every gate passing it ends at
   DRAFTED, or stays at ORACLE_READY.
6. A refused command keeps the stage, the inputs, the budget and the rewind count.

The model's rewind cap is 1 and its round ceiling 5 (`Auth.cap`, `Auth.ceiling`); the CLI's are 10 and 6, and the
conformance replay runs it with `ORACLE_REWIND_CAP=1` and `ORACLE_ROUND_CEILING=5`, which can only lower them.

## Files

- `MODEL.bend`: `Stage`/`Target`/`Inputs`/`Round`/`Limit`/`Up`/`Seen`/`Budget`/`Back`/`Auth`/`Why`/`Last`/`Msg`
  types, `Auth.decide` and `Auth.step` over every state and command, `commands` (every command at any time, so no
  `enabled`), `hint`, `potential`, `rank_lt`, `finish`, `rescue`, and 22 relations; `Auth.safe` is all of them on
  every command plus the state invariants (round within the limit, limit within the ceiling, rewind count within the
  cap, no record means a fresh budget and no rewind, the revision ends, the phase line names an accepted command).
  `Q_ranked` has no exemption: every accepted command or edit keeps the state or raises the rank (review progress,
  limit, rewind count, stage, edits, compared place by place), so no cycle returns to a state. Edits are modelled
  one-way (no revert): restoring the recorded package bytes returns a real record to a judged state without a
  command, which neither the model nor the replay covers.
- `LAWS.bend`: two cell laws (`potential_rises`, `delegation_raises`), five witnesses (ORACLE_READY, an exhausted
  budget, limit 5, REWIND_CAP_REACHED and ITERATION_CEILING_REACHED are reachable), `approval_reopens`,
  `approval_rewinds_again`, and `rewind_cycle_spends`: walking back, walking and locking from ORACLE_READY no longer
  returns to the same state.
- `PROOF.bend`: the witness traces.

`prove-reach --prefix Auth --safe safe` proves `Auth.safe` on all 2,527 states a trace reaches (25,920 states of the
type × 40 commands). `skills/frontend-oracle-design/scripts/oracle-authoring-machine.cases.mjs` checks both proofs,
checks that the stage part gives the stage fixture's stage, inputs and outcome on every reached record (except the
REWIND_CAP_REACHED refusals the stage fixture has no count for), lists the outcomes and equivalent commands of the
reachable graph, and replays 72 model traces on the real CLI, covering all 1,470 (stage, inputs, budget class, rewind
class, command, outcome) items the model reaches and checking `status --brief` after every step.
