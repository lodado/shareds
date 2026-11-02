# Review lap fixture

A skill tool fixture for the Delivery review rounds of `oracle-run.mjs` in `frontend-oracle-design`. It models a Low
run from IMPLEMENTED_GREEN to a review verdict: the round, the packet and receipt of the latest round, the class of
the findings bound to it, the passing runs and the repairs. The Delivery fixture models one packet per GREEN visit
and no rounds; this one models the rounds. The header of `MODEL.bend` lists what each state field abstracts and what
is left out.

## Fixture policy

1. A packet on changed bytes opens round 1, then round 2 once a receipt is bound to round 1; after round 2 it is
   refused (`REVIEW_ROUNDS_CLOSED`). The round type has no third value. A packet on unchanged bytes keeps the round.
2. A claim names the wrong implementation every locked test passes; a note names none and is an improvement proposal
   in every round. Round 1 blocks on every claim. Round 2 blocks only on a claim the packet backs: `previous` when
   round 1 raised a blocking claim, `regression` on a line inside a repair hunk, `security` with critical/high severity. Every other round-2
   claim is an improvement proposal: it is recorded and never blocks.
3. REVIEW_VERIFIED needs the latest packet on the current bytes, made while a passing run on those bytes was in the
   ledger, a receipt bound to it, findings that do not block, and a passing run after GREEN on the current bytes.
4. With no open hold, PARTIAL_VERIFIED is accepted only for a repair after round 2: the round-2 receipt, a passing
   run on the repaired bytes, and the repair recorded as unreviewed with the round-2 blockers. The CLI also refuses a
   repair that changed none of the files a blocker cites (`REVIEW_REPAIR_UNRELATED`); the replay's repairs always
   touch them, so the model leaves that refusal out.
5. A refused command keeps the state; NEEDS_DECISION with a reason is accepted from every state before it.

## Files

- `MODEL.bend`: `Stage`/`Round`/`Lap`/`Basis`/`Find`/`Why`/`Last`/`Msg` types, `Lap.decide` and `Lap.step` over every
  state and command, `enabled`, and 12 relations; `Lap.safe` is all of them on every enabled command plus the
  reached-state shape.
- `LAWS.bend`: three cell laws (`round_two_split`, `note_proposes`, `security_every_round`) and three witnesses (REVIEW_VERIFIED after
  round 2 with a proposal, PARTIAL_VERIFIED after a round-2 repair, and a refused third round are reachable).
- `PROOF.bend`: the witness traces.

`prove-reach --prefix Lap --safe safe` proves `Lap.safe` on all 252 states a trace reaches (3,072 states of the type
× 14 commands). The proof covers the model, not the CLI: `skills/frontend-oracle-design/scripts/oracle-run-machine.cases.mjs`
replays 50 model traces on the real CLI, covering all 617 (stage, round, packet current, receipt bound, blocked,
round-1 claim, command, outcome) items the model reaches, and checks that refusals write nothing and that an
accepted verdict records proposals and the unreviewed repair exactly where the model says, from the ledger alone.
