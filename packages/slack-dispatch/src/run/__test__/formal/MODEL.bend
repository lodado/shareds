import Base

# Reference model for one script run. A run is created by POST /runs and decided by the server: the
# request is admitted only when the script is registered, the item's stage allows it, the params match the
# script's input schema and the item has no other active run. Every later event is a fact the server
# observed. Events can arrive twice, late or in the wrong order; the model decides they change nothing.
type Stage is Data:
  Requested{}
  Running{}
  Succeeded{}
  Failed{}
  Rejected{}

# registered/allowed/valid/free: the four admission checks. ok: the claude process exited cleanly.
# valid: its output matched the script's output schema.
type Msg is Data:
  Start{registered: Bool, allowed: Bool, valid: Bool, free: Bool}
  Finish{ok: Bool, valid: Bool}
  Cancel{}

def RunLife.init() -> Stage:
  Requested{}

def RunLife.when(c: Bool, t: Stage, f: Stage) -> Stage:
  match c:
    case True{}:
      t
    case False{}:
      f

def RunLife.all4(a: Bool, b: Bool, c: Bool, d: Bool) -> Bool:
  Bool.and(a, Bool.and(b, Bool.and(c, d)))

def RunLife.step(s: Stage, m: Msg) -> Stage:
  match s m:
    case Requested{} Start{+r, +a, +v, +f}:
      RunLife.when(RunLife.all4(r, a, v, f), Running{}, Rejected{})
    case Running{} Finish{+ok, +v}:
      RunLife.when(Bool.and(ok, v), Succeeded{}, Failed{})
    case Running{} Cancel{}:
      Failed{}
    case Requested{} Cancel{}:
      Rejected{}
    case +s _:
      s

def RunLife.observe(s: Stage) -> Stage:
  s

def RunLife.run(ms: List<Msg>, s: Stage) -> Stage:
  match ms:
    case Nil{}:
      s
    case Con{m, rest}:
      RunLife.run(rest, RunLife.step(s, m))

# Environment: any event at any time, any number of times, including a second Start for a run that
# already started and a Finish before any Start.
def RunLife.next(h: List<Msg>) -> List<Msg>:
  [Start{True{}, True{}, True{}, True{}}, Start{True{}, True{}, True{}, False{}}, Start{True{}, True{}, False{}, True{}}, Start{True{}, True{}, False{}, False{}}, Start{True{}, False{}, True{}, True{}}, Start{True{}, False{}, True{}, False{}}, Start{True{}, False{}, False{}, True{}}, Start{True{}, False{}, False{}, False{}}, Start{False{}, True{}, True{}, True{}}, Start{False{}, True{}, True{}, False{}}, Start{False{}, True{}, False{}, True{}}, Start{False{}, True{}, False{}, False{}}, Start{False{}, False{}, True{}, True{}}, Start{False{}, False{}, True{}, False{}}, Start{False{}, False{}, False{}, True{}}, Start{False{}, False{}, False{}, False{}}, Finish{True{}, True{}}, Finish{True{}, False{}}, Finish{False{}, True{}}, Finish{False{}, False{}}, Cancel{}]

def RunLife.imp(a: Bool, b: Bool) -> Bool:
  Bool.or(Bool.not(a), b)

def RunLife.same(a: Stage, b: Stage) -> Bool:
  match a b:
    case Requested{} Requested{}:
      True{}
    case Running{} Running{}:
      True{}
    case Succeeded{} Succeeded{}:
      True{}
    case Failed{} Failed{}:
      True{}
    case Rejected{} Rejected{}:
      True{}
    case _ _:
      False{}

def RunLife.is_requested(s: Stage) -> Bool:
  RunLife.same(s, Requested{})

def RunLife.is_running(s: Stage) -> Bool:
  RunLife.same(s, Running{})

def RunLife.is_succeeded(s: Stage) -> Bool:
  RunLife.same(s, Succeeded{})

def RunLife.is_failed(s: Stage) -> Bool:
  RunLife.same(s, Failed{})

def RunLife.is_rejected(s: Stage) -> Bool:
  RunLife.same(s, Rejected{})

def RunLife.is_final(+s: Stage) -> Bool:
  Bool.or(RunLife.is_succeeded(s), Bool.or(RunLife.is_failed(s), RunLife.is_rejected(s)))

def RunLife.is_start(m: Msg) -> Bool:
  match m:
    case Start{r, a, v, f}:
      True{}
    case _:
      False{}

def RunLife.is_full_start(m: Msg) -> Bool:
  match m:
    case Start{r, a, v, f}:
      RunLife.all4(r, a, v, f)
    case _:
      False{}

def RunLife.is_good_finish(m: Msg) -> Bool:
  match m:
    case Finish{ok, v}:
      Bool.and(ok, v)
    case _:
      False{}

def RunLife.is_bad_finish(m: Msg) -> Bool:
  match m:
    case Finish{ok, v}:
      Bool.not(Bool.and(ok, v))
    case _:
      False{}

def RunLife.is_cancel(m: Msg) -> Bool:
  match m:
    case Cancel{}:
      True{}
    case _:
      False{}

# R_terminal_absorbs: a decided run ignores every later event
def RunLife.R_terminal_absorbs(+s: Stage, m: Msg, t: Stage) -> Bool:
  RunLife.imp(RunLife.is_final(s), RunLife.same(t, s))

# R_running_entry: a run starts only from Requested, when all four admission checks passed
def RunLife.R_running_entry(+s: Stage, +m: Msg, +t: Stage) -> Bool:
  RunLife.imp(Bool.and(RunLife.is_running(t), Bool.not(RunLife.is_running(s))), Bool.and(RunLife.is_requested(s), RunLife.is_full_start(m)))

# R_rejected_entry: a run is rejected only from Requested, by a start request that failed a check or by a cancel before it started
def RunLife.R_rejected_entry(+s: Stage, +m: Msg, +t: Stage) -> Bool:
  RunLife.imp(Bool.and(RunLife.is_rejected(t), Bool.not(RunLife.is_rejected(s))), Bool.and(RunLife.is_requested(s), Bool.or(Bool.and(RunLife.is_start(m), Bool.not(RunLife.is_full_start(m))), RunLife.is_cancel(m))))

# R_succeeded_entry: a run succeeds only from Running, when the process exited cleanly with valid output
def RunLife.R_succeeded_entry(+s: Stage, +m: Msg, +t: Stage) -> Bool:
  RunLife.imp(Bool.and(RunLife.is_succeeded(t), Bool.not(RunLife.is_succeeded(s))), Bool.and(RunLife.is_running(s), RunLife.is_good_finish(m)))

# R_failed_entry: a run fails only from Running, by a bad finish or a cancel
def RunLife.R_failed_entry(+s: Stage, +m: Msg, +t: Stage) -> Bool:
  RunLife.imp(Bool.and(RunLife.is_failed(t), Bool.not(RunLife.is_failed(s))), Bool.and(RunLife.is_running(s), Bool.or(RunLife.is_bad_finish(m), RunLife.is_cancel(m))))

# R_replay_idempotent: delivering the same event again to the result changes nothing
def RunLife.R_replay_idempotent(s: Stage, +m: Msg, +t: Stage) -> Bool:
  RunLife.same(RunLife.step(t, m), t)

# R_start_runs: an admitted request starts the run
def RunLife.R_start_runs(+s: Stage, +m: Msg, t: Stage) -> Bool:
  RunLife.imp(Bool.and(RunLife.is_requested(s), RunLife.is_full_start(m)), RunLife.is_running(t))

# R_bad_start_rejects: a request that failed a check is rejected, never started
def RunLife.R_bad_start_rejects(+s: Stage, +m: Msg, t: Stage) -> Bool:
  RunLife.imp(Bool.and(RunLife.is_requested(s), Bool.and(RunLife.is_start(m), Bool.not(RunLife.is_full_start(m)))), RunLife.is_rejected(t))

# R_finish_succeeds: a clean exit with valid output completes a running run
def RunLife.R_finish_succeeds(+s: Stage, +m: Msg, t: Stage) -> Bool:
  RunLife.imp(Bool.and(RunLife.is_running(s), RunLife.is_good_finish(m)), RunLife.is_succeeded(t))

# R_cancel_fails: a cancel (timeout, budget) fails a running run
def RunLife.R_cancel_fails(+s: Stage, +m: Msg, t: Stage) -> Bool:
  RunLife.imp(Bool.and(RunLife.is_running(s), RunLife.is_cancel(m)), RunLife.is_failed(t))

# R_bad_finish_fails: a running run whose process failed or whose output was invalid fails
def RunLife.R_bad_finish_fails(+s: Stage, +m: Msg, t: Stage) -> Bool:
  RunLife.imp(Bool.and(RunLife.is_running(s), RunLife.is_bad_finish(m)), RunLife.is_failed(t))

# R_cancel_rejects_unstarted: a cancel before the run started rejects it, so it can never start later
def RunLife.R_cancel_rejects_unstarted(+s: Stage, +m: Msg, t: Stage) -> Bool:
  RunLife.imp(Bool.and(RunLife.is_requested(s), RunLife.is_cancel(m)), RunLife.is_rejected(t))
