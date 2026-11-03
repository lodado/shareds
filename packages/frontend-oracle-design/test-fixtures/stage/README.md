# Stage fixture

A skill tool fixture for authoring in `frontend-oracle-design`: the authoring graph `oracle-step.mjs` evaluates
(`oracle-stage.mjs` `evaluateGraph`, `recordCheck`, `briefStatus`) and the lock that judges it (`oracle-lock.mjs
create`), for both profiles. It decides nothing for a real application. The header of `MODEL.bend` lists what each
state field abstracts and what is left out.

## Fixture policy

1. No record says where the authoring is. Each step evaluates the deterministic nodes in the profile's order (Formal:
   package, model, card; Contract: confirmation, card) on the files as they are, up to the first failing one, and
   records one check. Its label is that node's (DISCOVERING, MODELED, CHECKED) or DRAFTED.
2. A step names the reviews before the first failing node (Formal: the model analyst after the package, the card
   reviews after the card; Contract: cold-read first) that have no return saved for their current input and fewer
   than 2 rounds; a step that stops names none. A review with 2 rounds and no return for its current input (a repair
   no reviewer read) stops the step (NEEDS_DECISION, exit 1, and a save after it saves nothing); a round-2 return with a blocker and a third saved return stop it
   the same way and are left out of the model. A round is a saved return for a new input digest; a return saved
   again for the same input adds none. The conditional source-aware review is left out: step names it until its first
   return is saved, then counts it like a card review.
3. An edit changes only the node its part owns and takes the saved return away from the reviews whose input the part
   feeds; a package or Bend edit also leaves the card projection out of date (it records the digest of both) until
   the next step projects it, so it feeds the card review too, while the model analyst reads the sources only.
4. The lock is accepted exactly when every deterministic node passes on the bytes it reads (a stale projection fails
   the card) and every review has a return saved for its current input. `--check` changes nothing in the oracle directory and fails exactly when the lock
   would be refused.
5. The same issue list on a third distinct file state among the recent checks where the same node fails stops the
   step (NEEDS_DECISION), even with another list of that node between them; fewer do not, and a pass or another
   failing node starts the count again.
6. A locked oracle stays locked until a byte its profile reads changes; then only a new revision goes on.

## Files

- `MODEL.bend`: `Graph` (Blank, FormalAt, ContractAt, Locked, Drifted) over `Health`/`Rev`/`Run`/`Seen`, `Msg`
  (Start, Step, Check, Save, Lock, Edit of a part), `Graph.step`, `hint` (the phase line's next), `label`, `enabled`
  (one edit between two checks), `policy` and `rank`, and 9 relations: `Q_lock_judges`, `Q_lock_only`,
  `Q_check_reads`, `Q_next_first`, `Q_edit_local`, `Q_rounds`, `Q_stop_third`, `Q_refused_keeps`,
  `Q_locked_stays`. `Graph.safe` is all of them on every command plus the state invariants (a check of these files
  has a run exactly when a node fails; a Formal check with the package and the model passing has the card projected)
  and `ranked`: the move the next names (step, save the returns asked for, fix the part of the first failing node,
  lock) lowers the rank (three per failing node and per review round left, plus one while the last check is not of
  these files), so following NEXT FOR YOU never returns to a state.
- `LAWS.bend`: four cell laws (`run_counts`, `save_rounds`, `first_failing`, `first_failing_contract`), two
  witnesses (a Formal package and a Contract card reach the lock), and six traces: the stop on the third edited
  state and not the second, no third card review round (a card changed after round 2 stops the step) and no lock of
  it, one round for a return saved twice, and a Bend edit that asks for the card review again and not the model
  analyst.
- `PROOF.bend`: the witness traces.

`oracle-model.mjs prove --dir test-fixtures/stage` generates the cell arms and checks the laws in a temporary copy.
`prove-reach --model MODEL.bend --prefix Graph --safe safe` proves `Graph.safe` on all 728 states a trace reaches
(4,204 states of the type × 18 events). `skills/frontend-oracle-design/scripts/oracle-stage-machine.test.mjs` runs
both, and `oracle-authoring-machine.cases.mjs` replays 16 model traces (440 events covering all 275 (view, event,
exit, view after) items the model reaches) on the real `oracle-step.mjs` and `oracle-lock.mjs`, a stale-search
package for Formal and the toggle card for Contract, checking after every event the exit status, the label, the review
rounds, the run of the same issues and the phase line's next against the model.
