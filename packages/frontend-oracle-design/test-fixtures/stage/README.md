# Stage fixture

A skill tool fixture for the authoring stage record of `oracle-stage.mjs` in `frontend-oracle-design`. It models
the stages a `formal-bend/v1` package moves through and the stage half of the lock, so `prove` and `laws` run on a
finite state machine and the real stage commands can be compared with it. It decides nothing for a real application.

## Fixture policy

1. `advance` moves one stage forward (DISCOVERING, MODELED, CHECKED, DRAFTED) when that step's gate passes; only
   the lock enters ORACLE_READY, from DRAFTED.
2. CHECKED or DRAFTED whose Bend inputs changed after CHECKED judged them run CHECKED again in place on
   `advance --to CHECKED`.
3. `rewind` with a reason goes back to a stage at or before the current one; without a reason it is a usage error.
4. A package changed after the record took its digest, or Bend inputs changed after the pin a step needs, make the
   step stale.
5. A refused command keeps the stage and the inputs; `status` and file edits write no record.
6. A name after `--to` that is no stage is a skip. No `--to` at all is a usage error before the record is read, so
   the model has no event for it.

## Files

- `MODEL.bend`: `Stage`/`Target`/`Inputs`/`Why`/`Last`/`Run`/`Part`/`Msg` types, `Run.step` over every state and
  event, `init`, `next`, `observe`, `stale`, and 29 relations: forward, refusal, frame, environment and safety.
- `LAWS.bend`: one cell law per relation: it holds for every state and event of the model.
- `PROOF.bend`: imports `./LAWS.bend` and defines no law.

The proof is generated: `oracle-model.mjs prove --dir test-fixtures/stage` generates the cell arms of the 29 laws,
one case per state and event (120 × 28 = 3,360 each), and checks them in a temporary copy. It writes nothing here.

`skills/frontend-oracle-design/scripts/oracle-stage-machine.test.mjs` checks that proof, that `laws` with every
relation pins all 3,360 cells, and that every event from each of the 12 stage-and-inputs pairs a trace reaches ends
where the model says when it runs the real `oracle-stage.mjs` commands.
