import Base

# Reference model for the stage fixture: the authoring stage record that `oracle-stage.mjs` keeps for a
# formal-bend/v1 package, and the stage half of the lock. The state is the recorded stage, whether the
# files changed since the record took them, and the outcome of the last command. Commands are `advance`,
# `rewind`, the lock and the read-only `status`; file edits are the environment. The laws are
# three-argument relations over (state before, event, state after).
#
# Re-checking CHECKED in place is `advance --to CHECKED` on changed inputs, so it is an outcome of Advance,
# not an event of its own. Left out: the authoring round budget, the contract/v1 stages, `begin`,
# `review-input` and `extend`, a missing record or package, `--reason` on an advance, a repeated rewind
# that writes nothing, files that change while a gate runs, and the lock file and card lint of the lock.
type Stage is Data:
  Discovering{}
  Modeled{}
  Checked{}
  Drafted{}
  Ready{}

# What `--to` names: one of the five stages, or none (a name that is no stage). No `--to` at all is a usage
# error of the command line before the record is read, so it is no event here.
type Target is Data:
  ToDiscovering{}
  ToModeled{}
  ToChecked{}
  ToDrafted{}
  ToReady{}
  ToNothing{}

# The files against the record: as recorded, the Bend files or registered sources changed after CHECKED
# pinned them, or the package bytes changed after the record took their digest (which also moves the pin).
type Inputs is Data:
  Judged{}
  BendEdited{}
  PackageEdited{}

# One refusal reason per error code: STAGE_SKIP, STAGE_LOCK_ONLY, STAGE_REWIND, STAGE_NOT_DRAFTED, USAGE,
# STAGE_STALE and STAGE_GATE.
type Why is Data:
  Skip{}
  LockOnly{}
  Back{}
  NotDrafted{}
  Usage{}
  Stale{}
  Gate{}

type Last is Data:
  Took{}
  Refused{why: Why}

type Run is Data:
  Run{at: Stage, inputs: Inputs, last: Last}

type Part is Data:
  PackageFile{}
  BendFiles{}

# `pass` is whether the gate of that step would pass on these files; `reason` is whether `--reason` is given.
type Msg is Data:
  Advance{to: Target, pass: Bool}
  Rewind{to: Target, reason: Bool}
  Lock{}
  Status{}
  Edit{part: Part}

def Run.init() -> Run:
  Run{Discovering{}, Judged{}, Took{}}

# ---- names shared by the machine and the laws
def Run.imp(a: Bool, b: Bool) -> Bool:
  Bool.or(Bool.not(a), b)

def Run.same_stage(a: Stage, b: Stage) -> Bool:
  match a b:
    case Discovering{} Discovering{}:
      True{}
    case Modeled{} Modeled{}:
      True{}
    case Checked{} Checked{}:
      True{}
    case Drafted{} Drafted{}:
      True{}
    case Ready{} Ready{}:
      True{}
    case _ _:
      False{}

def Run.same_inputs(a: Inputs, b: Inputs) -> Bool:
  match a b:
    case Judged{} Judged{}:
      True{}
    case BendEdited{} BendEdited{}:
      True{}
    case PackageEdited{} PackageEdited{}:
      True{}
    case _ _:
      False{}

def Run.rank(a: Stage) -> Nat:
  match a:
    case Discovering{}:
      0n
    case Modeled{}:
      1n
    case Checked{}:
      2n
    case Drafted{}:
      3n
    case Ready{}:
      4n

def Run.names(to: Target, b: Stage) -> Bool:
  match to b:
    case ToDiscovering{} Discovering{}:
      True{}
    case ToModeled{} Modeled{}:
      True{}
    case ToChecked{} Checked{}:
      True{}
    case ToDrafted{} Drafted{}:
      True{}
    case ToReady{} Ready{}:
      True{}
    case _ _:
      False{}

# The one stage each stage advances to. ORACLE_READY advances to nothing.
def Run.next_is(a: Stage, to: Target) -> Bool:
  match a to:
    case Discovering{} ToModeled{}:
      True{}
    case Modeled{} ToChecked{}:
      True{}
    case Checked{} ToDrafted{}:
      True{}
    case Drafted{} ToReady{}:
      True{}
    case _ _:
      False{}

def Run.goal(a: Stage) -> Stage:
  match a:
    case Discovering{}:
      Modeled{}
    case Modeled{}:
      Checked{}
    case Checked{}:
      Drafted{}
    case Drafted{}:
      Ready{}
    case Ready{}:
      Ready{}

# CHECKED and the stages after it hold the pin of the inputs CHECKED judged.
def Run.pinned(a: Stage) -> Bool:
  Nat.is_le(2n, Run.rank(a))

# DISCOVERING holds no package digest, so nothing it was taken on can change.
def Run.recorded(a: Stage) -> Bool:
  Nat.is_le(1n, Run.rank(a))

# CHECKED or DRAFTED whose pinned inputs changed run CHECKED again in place on `advance --to CHECKED`.
def Run.rechecks(+a: Stage, i: Inputs, to: Target) -> Bool:
  Bool.and(Run.names(to, Checked{}), Bool.and(Bool.or(Run.same_stage(a, Checked{}), Run.same_stage(a, Drafted{})), Bool.not(Run.same_inputs(i, Judged{}))))

# Before the gate: a package changed after its digest, or Bend inputs changed after the pin DRAFTED needs.
def Run.forward_stale(+a: Stage, +i: Inputs, to: Target) -> Bool:
  Bool.or(Bool.and(Run.recorded(a), Run.same_inputs(i, PackageEdited{})), Bool.and(Run.names(to, Drafted{}), Run.same_inputs(i, BendEdited{})))

# ---- the machine
def Run.gated(pass: Bool, a: Stage, i: Inputs, b: Stage) -> Run:
  match pass:
    case True{}:
      Run{b, Judged{}, Took{}}
    case False{}:
      Run{a, i, Refused{Gate{}}}

def Run.judge(stale: Bool, pass: Bool, +a: Stage, +i: Inputs, b: Stage) -> Run:
  match stale:
    case True{}:
      Run{a, i, Refused{Stale{}}}
    case False{}:
      Run.gated(pass, a, i, b)

def Run.recheck(again: Bool, pass: Bool, +a: Stage, +i: Inputs) -> Run:
  match again:
    case True{}:
      Run.judge(Run.same_inputs(i, PackageEdited{}), pass, a, i, Checked{})
    case False{}:
      Run{a, i, Refused{Skip{}}}

def Run.forward(next: Bool, +a: Stage, +i: Inputs, +to: Target, pass: Bool) -> Run:
  match next:
    case True{}:
      Run.judge(Run.forward_stale(a, i, to), pass, a, i, Run.goal(a))
    case False{}:
      Run.recheck(Run.rechecks(a, i, to), pass, a, i)

def Run.advance(lock_only: Bool, +a: Stage, +i: Inputs, +to: Target, pass: Bool) -> Run:
  match lock_only:
    case True{}:
      Run{a, i, Refused{LockOnly{}}}
    case False{}:
      Run.forward(Run.next_is(a, to), a, i, to, pass)

def Run.keep(stale: Bool, a: Stage, i: Inputs, b: Stage) -> Run:
  match stale:
    case True{}:
      Run{a, i, Refused{Stale{}}}
    case False{}:
      Run{b, Judged{}, Took{}}

def Run.back(reached: Bool, stale: Bool, +a: Stage, +i: Inputs, b: Stage) -> Run:
  match reached:
    case True{}:
      Run.keep(stale, a, i, b)
    case False{}:
      Run{a, i, Refused{Back{}}}

# A rewind lands at a stage at or before the current one. DISCOVERING drops the digest and the pin; MODELED
# drops the pin and needs the recorded package; CHECKED and DRAFTED keep the pin and need it unchanged.
def Run.rewind(reason: Bool, +a: Stage, +i: Inputs, to: Target) -> Run:
  match reason:
    case False{}:
      Run{a, i, Refused{Usage{}}}
    case True{}:
      match to:
        case ToDiscovering{}:
          Run{Discovering{}, Judged{}, Took{}}
        case ToModeled{}:
          Run.back(Nat.is_le(1n, Run.rank(a)), Run.same_inputs(i, PackageEdited{}), a, i, Modeled{})
        case ToChecked{}:
          Run.back(Nat.is_le(2n, Run.rank(a)), Bool.not(Run.same_inputs(i, Judged{})), a, i, Checked{})
        case ToDrafted{}:
          Run.back(Nat.is_le(3n, Run.rank(a)), Bool.not(Run.same_inputs(i, Judged{})), a, i, Drafted{})
        case ToReady{}:
          Run{a, i, Refused{Back{}}}
        case ToNothing{}:
          Run{a, i, Refused{Back{}}}

def Run.lock_on(judged: Bool, a: Stage, i: Inputs) -> Run:
  match judged:
    case True{}:
      Run{Ready{}, Judged{}, Took{}}
    case False{}:
      Run{a, i, Refused{Stale{}}}

# The lock takes DRAFTED, and relocks ORACLE_READY, only on the inputs CHECKED judged. This is the lock with
# no lock file left: a relock then measures the pin again.
def Run.lock(drafted: Bool, +a: Stage, +i: Inputs) -> Run:
  match drafted:
    case True{}:
      Run.lock_on(Run.same_inputs(i, Judged{}), a, i)
    case False{}:
      Run{a, i, Refused{NotDrafted{}}}

def Run.bend_on(i: Inputs) -> Inputs:
  match i:
    case Judged{}:
      BendEdited{}
    case BendEdited{}:
      BendEdited{}
    case PackageEdited{}:
      PackageEdited{}

def Run.package_edited(recorded: Bool, i: Inputs) -> Inputs:
  match recorded:
    case True{}:
      PackageEdited{}
    case False{}:
      i

def Run.bend_edited(pinned: Bool, i: Inputs) -> Inputs:
  match pinned:
    case True{}:
      Run.bend_on(i)
    case False{}:
      i

def Run.edited(+a: Stage, +i: Inputs, part: Part) -> Inputs:
  match part:
    case PackageFile{}:
      Run.package_edited(Run.recorded(a), i)
    case BendFiles{}:
      Run.bend_edited(Run.pinned(a), i)

def Run.step(s: Run, m: Msg) -> Run:
  match s m:
    case Run{+a, +i, last} Advance{+to, pass}:
      Run.advance(Run.names(to, Ready{}), a, i, to, pass)
    case Run{+a, +i, last} Rewind{to, reason}:
      Run.rewind(reason, a, i, to)
    case Run{+a, +i, last} Lock{}:
      Run.lock(Nat.is_le(3n, Run.rank(a)), a, i)
    case Run{a, i, last} Status{}:
      Run{a, i, last}
    case Run{+a, +i, last} Edit{part}:
      Run{a, Run.edited(a, i, part), last}

# The stage record, the command's result and `status` show all three fields.
def Run.observe(s: Run) -> Run:
  s

def Run.run(ms: List<Msg>, s: Run) -> Run:
  match ms:
    case Nil{}:
      s
    case Con{m, rest}:
      Run.run(rest, Run.step(s, m))

# Environment: any command and any edit may come next.
def Run.next(h: List<Msg>) -> List<Msg>:
  [Advance{ToDiscovering{}, True{}}, Advance{ToDiscovering{}, False{}}, Advance{ToModeled{}, True{}}, Advance{ToModeled{}, False{}}, Advance{ToChecked{}, True{}}, Advance{ToChecked{}, False{}}, Advance{ToDrafted{}, True{}}, Advance{ToDrafted{}, False{}}, Advance{ToReady{}, True{}}, Advance{ToReady{}, False{}}, Advance{ToNothing{}, True{}}, Advance{ToNothing{}, False{}}, Rewind{ToDiscovering{}, True{}}, Rewind{ToDiscovering{}, False{}}, Rewind{ToModeled{}, True{}}, Rewind{ToModeled{}, False{}}, Rewind{ToChecked{}, True{}}, Rewind{ToChecked{}, False{}}, Rewind{ToDrafted{}, True{}}, Rewind{ToDrafted{}, False{}}, Rewind{ToReady{}, True{}}, Rewind{ToReady{}, False{}}, Rewind{ToNothing{}, True{}}, Rewind{ToNothing{}, False{}}, Lock{}, Status{}, Edit{PackageFile{}}, Edit{BendFiles{}}]

# What `status` reports as stale: a package changed after its digest, or Bend inputs changed after the pin
# while the record is at CHECKED or DRAFTED. After the lock, the lock and the card guard the Bend inputs.
def Run.stale(s: Run) -> Bool:
  match s:
    case Run{+a, +i, last}:
      Bool.or(Bool.and(Run.recorded(a), Run.same_inputs(i, PackageEdited{})), Bool.and(Bool.or(Run.same_stage(a, Checked{}), Run.same_stage(a, Drafted{})), Run.same_inputs(i, BendEdited{})))

# ---- vocabulary of the laws
def Run.at(s: Run) -> Stage:
  match s:
    case Run{a, i, l}:
      a

def Run.inputs(s: Run) -> Inputs:
  match s:
    case Run{a, i, l}:
      i

def Run.last(s: Run) -> Last:
  match s:
    case Run{a, i, l}:
      l

def Run.order(s: Run) -> Nat:
  Run.rank(Run.at(s))

def Run.is_at(s: Run, b: Stage) -> Bool:
  Run.same_stage(Run.at(s), b)

def Run.inputs_are(s: Run, b: Inputs) -> Bool:
  Run.same_inputs(Run.inputs(s), b)

def Run.judged(s: Run) -> Bool:
  Run.inputs_are(s, Judged{})

def Run.same_why(a: Why, b: Why) -> Bool:
  match a b:
    case Skip{} Skip{}:
      True{}
    case LockOnly{} LockOnly{}:
      True{}
    case Back{} Back{}:
      True{}
    case NotDrafted{} NotDrafted{}:
      True{}
    case Usage{} Usage{}:
      True{}
    case Stale{} Stale{}:
      True{}
    case Gate{} Gate{}:
      True{}
    case _ _:
      False{}

def Run.same_last(a: Last, b: Last) -> Bool:
  match a b:
    case Took{} Took{}:
      True{}
    case Refused{x} Refused{y}:
      Run.same_why(x, y)
    case _ _:
      False{}

def Run.same_run(+s: Run, +t: Run) -> Bool:
  Bool.and(Run.same_stage(Run.at(t), Run.at(s)), Bool.and(Run.same_inputs(Run.inputs(t), Run.inputs(s)), Run.same_last(Run.last(t), Run.last(s))))

def Run.took(s: Run) -> Bool:
  match s:
    case Run{a, i, Took{}}:
      True{}
    case _:
      False{}

def Run.refused(s: Run) -> Bool:
  match s:
    case Run{a, i, Refused{w}}:
      True{}
    case _:
      False{}

def Run.refused_as(s: Run, w: Why) -> Bool:
  match s:
    case Run{a, i, Refused{x}}:
      Run.same_why(x, w)
    case _:
      False{}

# accepted, at stage b, on the inputs as recorded
def Run.lands(+t: Run, b: Stage) -> Bool:
  Bool.and(Run.is_at(t, b), Bool.and(Run.took(t), Run.judged(t)))

def Run.is_advance(m: Msg) -> Bool:
  match m:
    case Advance{to, p}:
      True{}
    case Rewind{to, r}:
      False{}
    case Lock{}:
      False{}
    case Status{}:
      False{}
    case Edit{p}:
      False{}

def Run.is_rewind(m: Msg) -> Bool:
  match m:
    case Advance{to, p}:
      False{}
    case Rewind{to, r}:
      True{}
    case Lock{}:
      False{}
    case Status{}:
      False{}
    case Edit{p}:
      False{}

def Run.is_lock(m: Msg) -> Bool:
  match m:
    case Advance{to, p}:
      False{}
    case Rewind{to, r}:
      False{}
    case Lock{}:
      True{}
    case Status{}:
      False{}
    case Edit{p}:
      False{}

def Run.is_status(m: Msg) -> Bool:
  match m:
    case Advance{to, p}:
      False{}
    case Rewind{to, r}:
      False{}
    case Lock{}:
      False{}
    case Status{}:
      True{}
    case Edit{p}:
      False{}

def Run.is_edit(m: Msg) -> Bool:
  match m:
    case Advance{to, p}:
      False{}
    case Rewind{to, r}:
      False{}
    case Lock{}:
      False{}
    case Status{}:
      False{}
    case Edit{p}:
      True{}

# the commands that answer with an outcome; status and edits leave it as it was
def Run.is_command(+m: Msg) -> Bool:
  Bool.or(Run.is_advance(m), Bool.or(Run.is_rewind(m), Run.is_lock(m)))

def Run.advances_to(m: Msg, b: Stage) -> Bool:
  match m:
    case Advance{to, p}:
      Run.names(to, b)
    case Rewind{to, r}:
      False{}
    case Lock{}:
      False{}
    case Status{}:
      False{}
    case Edit{p}:
      False{}

def Run.rewinds_to(m: Msg, b: Stage) -> Bool:
  match m:
    case Advance{to, p}:
      False{}
    case Rewind{to, r}:
      Run.names(to, b)
    case Lock{}:
      False{}
    case Status{}:
      False{}
    case Edit{p}:
      False{}

def Run.passes(m: Msg) -> Bool:
  match m:
    case Advance{to, p}:
      p
    case Rewind{to, r}:
      False{}
    case Lock{}:
      False{}
    case Status{}:
      False{}
    case Edit{p}:
      False{}

def Run.explained(m: Msg) -> Bool:
  match m:
    case Advance{to, p}:
      False{}
    case Rewind{to, r}:
      r
    case Lock{}:
      False{}
    case Status{}:
      False{}
    case Edit{p}:
      False{}

def Run.same_part(a: Part, b: Part) -> Bool:
  match a b:
    case PackageFile{} PackageFile{}:
      True{}
    case BendFiles{} BendFiles{}:
      True{}
    case _ _:
      False{}

def Run.edits(m: Msg, b: Part) -> Bool:
  match m:
    case Advance{to, p}:
      False{}
    case Rewind{to, r}:
      False{}
    case Lock{}:
      False{}
    case Status{}:
      False{}
    case Edit{p}:
      Run.same_part(p, b)

# advance to the stage after the current one
def Run.aims_next(+s: Run, +m: Msg) -> Bool:
  Bool.or(Bool.and(Run.is_at(s, Discovering{}), Run.advances_to(m, Modeled{})), Bool.or(Bool.and(Run.is_at(s, Modeled{}), Run.advances_to(m, Checked{})), Bool.or(Bool.and(Run.is_at(s, Checked{}), Run.advances_to(m, Drafted{})), Bool.and(Run.is_at(s, Drafted{}), Run.advances_to(m, Ready{})))))

# advance to CHECKED from CHECKED or DRAFTED whose inputs changed after CHECKED judged them
def Run.rechecking(+s: Run, m: Msg) -> Bool:
  Bool.and(Run.advances_to(m, Checked{}), Bool.and(Bool.or(Run.is_at(s, Checked{}), Run.is_at(s, Drafted{})), Bool.not(Run.judged(s))))

# an advance that reaches its gate unless the inputs are stale
def Run.steps(+s: Run, +m: Msg) -> Bool:
  Bool.and(Bool.not(Run.advances_to(m, Ready{})), Bool.or(Run.aims_next(s, m), Run.rechecking(s, m)))

def Run.advance_stale(+s: Run, m: Msg) -> Bool:
  Bool.or(Bool.and(Nat.is_le(1n, Run.order(s)), Run.inputs_are(s, PackageEdited{})), Bool.and(Run.advances_to(m, Drafted{}), Run.inputs_are(s, BendEdited{})))

# a rewind target at or before the current stage, other than ORACLE_READY
def Run.may_rewind(+s: Run, +m: Msg) -> Bool:
  Bool.or(Run.rewinds_to(m, Discovering{}), Bool.or(Bool.and(Run.rewinds_to(m, Modeled{}), Nat.is_le(1n, Run.order(s))), Bool.or(Bool.and(Run.rewinds_to(m, Checked{}), Nat.is_le(2n, Run.order(s))), Bool.and(Run.rewinds_to(m, Drafted{}), Nat.is_le(3n, Run.order(s))))))

def Run.rewind_stale(+s: Run, +m: Msg) -> Bool:
  Bool.or(Bool.and(Bool.not(Run.rewinds_to(m, Discovering{})), Run.inputs_are(s, PackageEdited{})), Bool.and(Bool.or(Run.rewinds_to(m, Checked{}), Run.rewinds_to(m, Drafted{})), Run.inputs_are(s, BendEdited{})))

def Run.package_stales(+s: Run, m: Msg) -> Bool:
  Bool.and(Run.edits(m, PackageFile{}), Nat.is_le(1n, Run.order(s)))

def Run.bend_stales(+s: Run, m: Msg) -> Bool:
  Bool.and(Run.edits(m, BendFiles{}), Bool.and(Nat.is_le(2n, Run.order(s)), Run.judged(s)))

# ---- laws, as relations over (state before, event, state after); LAWS.bend states each one
# forward: DISCOVERING advances to MODELED when the package passes validate --stage model
def Run.R_discovering_models(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.is_at(s, Discovering{}), Bool.and(Run.advances_to(m, Modeled{}), Run.passes(m))), Run.lands(t, Modeled{}))

# forward: MODELED advances to CHECKED on the package it recorded when the CHECKED gate passes, and pins what it judged
def Run.R_modeled_checks(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.is_at(s, Modeled{}), Bool.and(Bool.not(Run.inputs_are(s, PackageEdited{})), Bool.and(Run.advances_to(m, Checked{}), Run.passes(m)))), Run.lands(t, Checked{}))

# forward: CHECKED advances to DRAFTED on the inputs it judged when check-card passes
def Run.R_checked_drafts(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.is_at(s, Checked{}), Bool.and(Run.judged(s), Bool.and(Run.advances_to(m, Drafted{}), Run.passes(m)))), Run.lands(t, Drafted{}))

# forward: CHECKED or DRAFTED whose Bend inputs changed after CHECKED judge them again in place and pin the new ones
def Run.R_recheck_judges(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Bool.or(Run.is_at(s, Checked{}), Run.is_at(s, Drafted{})), Bool.and(Run.inputs_are(s, BendEdited{}), Bool.and(Run.advances_to(m, Checked{}), Run.passes(m)))), Run.lands(t, Checked{}))

# forward: the lock moves DRAFTED on the inputs CHECKED judged to ORACLE_READY
def Run.R_lock_locks(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.is_at(s, Drafted{}), Bool.and(Run.judged(s), Run.is_lock(m))), Run.lands(t, Ready{}))

# forward: locking ORACLE_READY again on the inputs it was locked on keeps it
def Run.R_relock_keeps(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.is_at(s, Ready{}), Bool.and(Run.judged(s), Run.is_lock(m))), Run.lands(t, Ready{}))

# forward: a rewind with a reason walks back to DISCOVERING from any stage, even on a changed package
def Run.R_rewind_discovers(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.explained(m), Run.rewinds_to(m, Discovering{})), Run.lands(t, Discovering{}))

# forward: a rewind with a reason walks back to MODELED from MODELED or later on the package it recorded
def Run.R_rewind_models(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.explained(m), Bool.and(Run.rewinds_to(m, Modeled{}), Bool.and(Nat.is_le(1n, Run.order(s)), Bool.not(Run.inputs_are(s, PackageEdited{}))))), Run.lands(t, Modeled{}))

# forward: a rewind with a reason resumes at CHECKED from CHECKED or later on the inputs CHECKED judged
def Run.R_rewind_checks(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.explained(m), Bool.and(Run.rewinds_to(m, Checked{}), Bool.and(Nat.is_le(2n, Run.order(s)), Run.judged(s)))), Run.lands(t, Checked{}))

# forward: a rewind with a reason resumes at DRAFTED from DRAFTED or later on the inputs CHECKED judged
def Run.R_rewind_drafts(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.explained(m), Bool.and(Run.rewinds_to(m, Drafted{}), Bool.and(Nat.is_le(3n, Run.order(s)), Run.judged(s)))), Run.lands(t, Drafted{}))

# refusal: advance never writes ORACLE_READY; asking it to is refused as lock-only
def Run.R_lock_only(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Run.advances_to(m, Ready{}), Run.refused_as(t, LockOnly{}))

# refusal: advance goes to the next stage, or to CHECKED again on changed inputs; any other target is a skip
def Run.R_skip_refused(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.is_advance(m), Bool.and(Bool.not(Run.advances_to(m, Ready{})), Bool.and(Bool.not(Run.aims_next(s, m)), Bool.not(Run.rechecking(s, m))))), Run.refused_as(t, Skip{}))

# refusal: rewind goes back only to DISCOVERING, MODELED, CHECKED or DRAFTED at or before the current stage
def Run.R_rewind_back(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.explained(m), Bool.not(Run.may_rewind(s, m))), Run.refused_as(t, Back{}))

# refusal: the lock needs DRAFTED
def Run.R_lock_needs_drafted(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.is_lock(m), Bool.not(Nat.is_le(3n, Run.order(s)))), Run.refused_as(t, NotDrafted{}))

# refusal: a rewind without a reason is a usage error
def Run.R_rewind_needs_reason(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.is_rewind(m), Bool.not(Run.explained(m))), Run.refused_as(t, Usage{}))

# refusal: an advance on a package changed after its digest, or to DRAFTED on Bend inputs changed after CHECKED, is stale
def Run.R_advance_stale(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.steps(s, m), Run.advance_stale(s, m)), Run.refused_as(t, Stale{}))

# refusal: a changed package walks back only to DISCOVERING, and CHECKED or DRAFTED resume only on the judged inputs
def Run.R_rewind_stale(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.explained(m), Bool.and(Run.may_rewind(s, m), Run.rewind_stale(s, m))), Run.refused_as(t, Stale{}))

# refusal: the lock refuses DRAFTED or ORACLE_READY whose package or Bend inputs changed after CHECKED
def Run.R_lock_stale(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.is_lock(m), Bool.and(Nat.is_le(3n, Run.order(s)), Bool.not(Run.judged(s)))), Run.refused_as(t, Stale{}))

# refusal: a gate that fails refuses the step
def Run.R_gate_refuses(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.steps(s, m), Bool.and(Bool.not(Run.advance_stale(s, m)), Bool.not(Run.passes(m)))), Run.refused_as(t, Gate{}))

# frame: a refused command keeps the stage and the inputs
def Run.R_refused_keeps(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.is_command(m), Run.refused(t)), Bool.and(Run.same_stage(Run.at(t), Run.at(s)), Run.same_inputs(Run.inputs(t), Run.inputs(s))))

# frame: status changes nothing
def Run.R_status_reads(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Run.is_status(m), Run.same_run(s, t))

# frame: an edit writes no record, so the stage and the last outcome stay
def Run.R_edit_writes_nothing(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Run.is_edit(m), Bool.and(Run.same_stage(Run.at(t), Run.at(s)), Run.same_last(Run.last(t), Run.last(s))))

# environment: a package edit after the record took its digest makes the record stale
def Run.R_package_edit_stales(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Run.package_stales(s, m), Run.inputs_are(t, PackageEdited{}))

# environment: a Bend edit after CHECKED pinned the judged inputs makes the pin stale
def Run.R_bend_edit_stales(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Run.bend_stales(s, m), Run.inputs_are(t, BendEdited{}))

# environment: any other edit leaves the inputs as they were (nothing recorded yet, or already stale)
def Run.R_other_edit_keeps(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.is_edit(m), Bool.and(Bool.not(Run.package_stales(s, m)), Bool.not(Run.bend_stales(s, m)))), Run.same_inputs(Run.inputs(t), Run.inputs(s)))

# safety: no advance enters ORACLE_READY
def Run.R_advance_never_locks(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Run.is_advance(m), Bool.not(Run.is_at(s, Ready{}))), Bool.not(Run.is_at(t, Ready{})))

# safety: ORACLE_READY is entered only from DRAFTED, by the lock, on the inputs CHECKED judged
def Run.R_ready_only_by_lock(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Bool.and(Bool.not(Run.is_at(s, Ready{})), Run.is_at(t, Ready{})), Bool.and(Run.is_lock(m), Bool.and(Run.is_at(s, Drafted{}), Run.judged(s))))

# safety: a rewind never moves forward
def Run.R_rewind_never_forward(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Run.is_rewind(m), Nat.is_le(Run.order(t), Run.order(s)))

# safety: an advance moves at most one stage forward, and back only to CHECKED
def Run.R_advance_one_step(+s: Run, +m: Msg, +t: Run) -> Bool:
  Run.imp(Run.is_advance(m), Bool.and(Nat.is_le(Run.order(t), 1n+Run.order(s)), Run.imp(Bool.not(Nat.is_le(Run.order(s), Run.order(t))), Run.is_at(t, Checked{}))))
