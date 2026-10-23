import Base
import ./MODEL.bend as M

# Approved laws for one script run. Each law is a relation of MODEL.bend that holds for every stage and
# every event. PROOF.bend proves them; they state the reference model, not the TS code.

# a decided run ignores every later event
law terminal_absorbs:
  for s: M.Stage
  for m: M.Msg
  {M.RunLife.R_terminal_absorbs(s, m, M.RunLife.step(s, m)) == True{} : Bool}

# a run starts only from Requested, when all four admission checks passed
law running_entry:
  for s: M.Stage
  for m: M.Msg
  {M.RunLife.R_running_entry(s, m, M.RunLife.step(s, m)) == True{} : Bool}

# a run is rejected only from Requested, by a start request that failed a check or by a cancel before it started
law rejected_entry:
  for s: M.Stage
  for m: M.Msg
  {M.RunLife.R_rejected_entry(s, m, M.RunLife.step(s, m)) == True{} : Bool}

# a run succeeds only from Running, when the process exited cleanly with valid output
law succeeded_entry:
  for s: M.Stage
  for m: M.Msg
  {M.RunLife.R_succeeded_entry(s, m, M.RunLife.step(s, m)) == True{} : Bool}

# a run fails only from Running, by a bad finish or a cancel
law failed_entry:
  for s: M.Stage
  for m: M.Msg
  {M.RunLife.R_failed_entry(s, m, M.RunLife.step(s, m)) == True{} : Bool}

# delivering the same event again to the result changes nothing
law replay_idempotent:
  for s: M.Stage
  for m: M.Msg
  {M.RunLife.R_replay_idempotent(s, m, M.RunLife.step(s, m)) == True{} : Bool}

# an admitted request starts the run
law start_runs:
  for s: M.Stage
  for m: M.Msg
  {M.RunLife.R_start_runs(s, m, M.RunLife.step(s, m)) == True{} : Bool}

# a request that failed a check is rejected, never started
law bad_start_rejects:
  for s: M.Stage
  for m: M.Msg
  {M.RunLife.R_bad_start_rejects(s, m, M.RunLife.step(s, m)) == True{} : Bool}

# a clean exit with valid output completes a running run
law finish_succeeds:
  for s: M.Stage
  for m: M.Msg
  {M.RunLife.R_finish_succeeds(s, m, M.RunLife.step(s, m)) == True{} : Bool}

# a cancel (timeout, budget) fails a running run
law cancel_fails:
  for s: M.Stage
  for m: M.Msg
  {M.RunLife.R_cancel_fails(s, m, M.RunLife.step(s, m)) == True{} : Bool}

# a running run whose process failed or whose output was invalid fails
law bad_finish_fails:
  for s: M.Stage
  for m: M.Msg
  {M.RunLife.R_bad_finish_fails(s, m, M.RunLife.step(s, m)) == True{} : Bool}

# a cancel before the run started rejects it, so it can never start later
law cancel_rejects_unstarted:
  for s: M.Stage
  for m: M.Msg
  {M.RunLife.R_cancel_rejects_unstarted(s, m, M.RunLife.step(s, m)) == True{} : Bool}

# Witness: some trace from the initial stage ends Succeeded, so the laws above do not hold merely because nothing happens
law succeeded_reachable:
  exs t: List<M.Msg>
  {M.RunLife.run(t, M.RunLife.init()) == M.Succeeded{} : M.Stage}
