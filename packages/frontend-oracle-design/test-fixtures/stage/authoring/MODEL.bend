import Base

# Reference model of authoring a formal-bend/v1 package: the stage record of `oracle-stage.mjs` (begin, advance,
# rewind, status, review-input, extend), the authoring round budget of `oracle-iterations.mjs`, the composite
# `oracle-cycle.mjs walk`, and the stage half of `oracle-lock.mjs create` (assertReadyToLock, assertRelockPinned,
# markLocked with no lock file left). `decide` gives the outcome of a command (accepted, or refused with the reason
# the CLI reports first); `step` applies it. The stage part refines `../MODEL.bend`; the test checks that.
#
# State, as the commands read it:
# - at: the recorded stage, or NoRecord before stage.json exists.
# - inputs: the files against the record (as in ../MODEL.bend): as recorded, Bend files or registered sources changed
#   after CHECKED pinned them, or package bytes changed after the record took their digest.
# - budget: the authoring round and limit, whether a standing delegation (delegated-rounds) is recorded, and for one
#   review kind (cold-read) whether its input bytes and its dispatch attempt were recorded in this round, an earlier
#   round, or never. Rounds rise only when an input recorded in this round changes (oracle-iterations.mjs:36-37).
# - back: the rewinds and CHECKED rechecks recorded since the allowance was last set (stage.json `rewinds` minus
#   `rewindAllowance` + cap). The allowance starts at `Auth.cap` and an accepted extend sets it to the count + cap,
#   so `back` falls only on extend. The CLI's cap is 10, the model's is 1, and the conformance traces run the CLI
#   with ORACLE_REWIND_CAP=1 (it can only lower the cap).
# - The round ceiling: no approval names a round past `Auth.ceiling` (ROUND_CEILING 6 in the CLI, 5 here; the
#   conformance traces run the CLI with ORACLE_ROUND_CEILING=5). Round and Limit stop at 5, the model's ceiling.
# - again: the last history entry is a rewind to this stage and the package has not changed since, so the same
#   rewind again is the no-op retry.
#
# Abstracted away: the contract/v1 profile; other review kinds (one kind's text and dispatch keys stand for the
# repair batch they share); review-input without --attempt; legacy records without `iterations` (readStage
# rebuilds round 1 + rewinds); a reused explicit approval document (it names an old round, so it is ITERATION_APPROVAL_REQUIRED here);
# `advance --reason`; walk with a failing gate (walk runs with every gate passing); a missing package; the lock
# file, card lint and sources of the lock; history, dispatch times and output fields; reverting an edit (edits are
# modelled one-way, judged -> Bend edited -> package edited, so restoring the recorded bytes, which in the CLI
# returns a record to a judged state without a command, is not modelled and `Q_ranked` relies on it). Edits are
# the environment and may happen at any time.

type Stage is Data:
  NoRecord{}
  Discovering{}
  Modeled{}
  Checked{}
  Drafted{}
  Ready{}

# What `--to` names: one of the five stages, or a name that is no stage.
type Target is Data:
  ToDiscovering{}
  ToModeled{}
  ToChecked{}
  ToDrafted{}
  ToReady{}
  ToNothing{}

type Inputs is Data:
  Judged{}
  BendEdited{}
  PackageEdited{}

type Round is Data:
  R1{}
  R2{}
  R3{}
  R4{}
  R5{}

type Limit is Data:
  L2{}
  L3{}
  L4{}
  L5{}

# upTo of a standing delegation
type Up is Data:
  Up3{}
  Up4{}
  Up5{}

# when an input key was last recorded, against the current round
type Seen is Data:
  Unseen{}
  ThisRound{}
  EarlierRound{}

type Budget is Data:
  Budget{round: Round, limit: Limit, delegated: Bool, text: Seen, dispatch: Seen}

# rewinds and rechecks since the allowance was last set: B0 up to B<cap>
type Back is Data:
  B0{}
  B1{}

type Auth is Data:
  Auth{at: Stage, inputs: Inputs, budget: Budget, back: Back, again: Bool}

# One refusal reason per error code: STAGE_SKIP, STAGE_LOCK_ONLY, STAGE_REWIND, STAGE_NOT_DRAFTED, USAGE,
# STAGE_STALE, STAGE_GATE, STAGE_MISSING, STAGE_EXISTS, ITERATION_BUDGET_EXHAUSTED, STAGE_LOCKED,
# ITERATION_APPROVAL_REQUIRED, ITERATION_APPROVAL_REUSED, REWIND_CAP_REACHED and ITERATION_CEILING_REACHED.
type Why is Data:
  Skip{}
  LockOnly{}
  Back{}
  NotDrafted{}
  Usage{}
  Stale{}
  Gate{}
  Missing{}
  Exists{}
  Exhausted{}
  Locked{}
  ApprovalRequired{}
  ApprovalReused{}
  RewindCap{}
  Ceiling{}

type Last is Data:
  Took{}
  Refused{why: Why}

type Out is Data:
  Out{last: Last, after: Auth}

type Obs is Data:
  Kept{budget: Budget}
  Over{}

type Part is Data:
  PackageFile{}
  BendFiles{}

# Begin: `begin`. Advance/Rewind: `advance`/`rewind --to` (pass: the gate of that step would pass; reason: --reason
# given). Lock: the stage calls of `oracle-lock.mjs create`. Status: `status`. Edit: a package or Bend file changes.
# Review: `review-input --kind cold-read --attempt` (text: other input bytes than the last recorded ones; attempt: a
# new dispatch id). Approve: `extend` with an approve-one-more-round document naming the right round or not.
# Delegate: `extend` with a delegated-rounds document. Walk: `oracle-cycle.mjs walk` (reason: --reason given).
type Msg is Data:
  Begin{}
  Advance{to: Target, pass: Bool}
  Rewind{to: Target, reason: Bool}
  Lock{}
  Status{}
  Edit{part: Part}
  Review{text: Bool, attempt: Bool}
  Approve{right: Bool}
  Delegate{up: Up}
  Walk{reason: Bool}

def Auth.fresh() -> Budget:
  Budget{R1{}, L2{}, False{}, Unseen{}, Unseen{}}

def Auth.init() -> Auth:
  Auth{NoRecord{}, Judged{}, Auth.fresh(), B0{}, False{}}

# ---- names shared by the machine and the laws
def Auth.imp(a: Bool, b: Bool) -> Bool:
  Bool.or(Bool.not(a), b)

def Auth.iff(+a: Bool, +b: Bool) -> Bool:
  Bool.and(Auth.imp(a, b), Auth.imp(b, a))

def Auth.flag(b: Bool) -> Nat:
  match b:
    case True{}:
      1n
    case False{}:
      0n

def Auth.at(s: Auth) -> Stage:
  match s:
    case Auth{a, i, b, k, g}:
      a

def Auth.inputs(s: Auth) -> Inputs:
  match s:
    case Auth{a, i, b, k, g}:
      i

def Auth.budget(s: Auth) -> Budget:
  match s:
    case Auth{a, i, b, k, g}:
      b

def Auth.back(s: Auth) -> Back:
  match s:
    case Auth{a, i, b, k, g}:
      k

def Auth.again(s: Auth) -> Bool:
  match s:
    case Auth{a, i, b, k, g}:
      g

def Auth.round(b: Budget) -> Round:
  match b:
    case Budget{r, l, d, t, x}:
      r

def Auth.limit(b: Budget) -> Limit:
  match b:
    case Budget{r, l, d, t, x}:
      l

def Auth.delegated(b: Budget) -> Bool:
  match b:
    case Budget{r, l, d, t, x}:
      d

def Auth.text(b: Budget) -> Seen:
  match b:
    case Budget{r, l, d, t, x}:
      t

def Auth.dispatch(b: Budget) -> Seen:
  match b:
    case Budget{r, l, d, t, x}:
      x

def Auth.stage_n(a: Stage) -> Nat:
  match a:
    case NoRecord{}:
      0n
    case Discovering{}:
      1n
    case Modeled{}:
      2n
    case Checked{}:
      3n
    case Drafted{}:
      4n
    case Ready{}:
      5n

def Auth.round_n(r: Round) -> Nat:
  match r:
    case R1{}:
      1n
    case R2{}:
      2n
    case R3{}:
      3n
    case R4{}:
      4n
    case R5{}:
      5n

def Auth.limit_n(l: Limit) -> Nat:
  match l:
    case L2{}:
      2n
    case L3{}:
      3n
    case L4{}:
      4n
    case L5{}:
      5n

def Auth.up_n(u: Up) -> Nat:
  match u:
    case Up3{}:
      3n
    case Up4{}:
      4n
    case Up5{}:
      5n

def Auth.up_limit(u: Up) -> Limit:
  match u:
    case Up3{}:
      L3{}
    case Up4{}:
      L4{}
    case Up5{}:
      L5{}

def Auth.next_round(r: Round) -> Round:
  match r:
    case R1{}:
      R2{}
    case R2{}:
      R3{}
    case R3{}:
      R4{}
    case R4{}:
      R5{}
    case R5{}:
      R5{}

def Auth.next_limit(l: Limit) -> Limit:
  match l:
    case L2{}:
      L3{}
    case L3{}:
      L4{}
    case L4{}:
      L5{}
    case L5{}:
      L5{}

# the limit after round r, when the round has run past the limit (a legacy record)
def Auth.after_round(r: Round) -> Limit:
  match r:
    case R1{}:
      L2{}
    case R2{}:
      L3{}
    case R3{}:
      L4{}
    case R4{}:
      L5{}
    case R5{}:
      L5{}

def Auth.back_n(k: Back) -> Nat:
  match k:
    case B0{}:
      0n
    case B1{}:
      1n

def Auth.next_back(k: Back) -> Back:
  match k:
    case B0{}:
      B1{}
    case B1{}:
      B1{}

# The rewind cap: the rewinds and rechecks an allowance holds (the CLI's REWIND_CAP is 10). `Back` has a value for
# every count up to it.
def Auth.cap() -> Nat:
  1n

# the allowance is used up: the next rewind or recheck is refused as REWIND_CAP_REACHED
def Auth.spent(k: Back) -> Bool:
  Nat.is_le(Auth.cap(), Auth.back_n(k))

def Auth.spent_of(s: Auth) -> Bool:
  Auth.spent(Auth.back(s))

def Auth.is_unseen(x: Seen) -> Bool:
  match x:
    case Unseen{}:
      True{}
    case _:
      False{}

def Auth.is_now(x: Seen) -> Bool:
  match x:
    case ThisRound{}:
      True{}
    case _:
      False{}

def Auth.same_stage(a: Stage, b: Stage) -> Bool:
  Nat.is_eq(Auth.stage_n(a), Auth.stage_n(b))

def Auth.same_inputs(a: Inputs, b: Inputs) -> Bool:
  match a b:
    case Judged{} Judged{}:
      True{}
    case BendEdited{} BendEdited{}:
      True{}
    case PackageEdited{} PackageEdited{}:
      True{}
    case _ _:
      False{}

def Auth.same_seen(a: Seen, b: Seen) -> Bool:
  match a b:
    case Unseen{} Unseen{}:
      True{}
    case ThisRound{} ThisRound{}:
      True{}
    case EarlierRound{} EarlierRound{}:
      True{}
    case _ _:
      False{}

def Auth.same_bool(+a: Bool, +b: Bool) -> Bool:
  Auth.iff(a, b)

def Auth.same_budget(a: Budget, b: Budget) -> Bool:
  match a b:
    case Budget{r, l, +d, t, x} Budget{q, k, +e, u, y}:
      Bool.and(Nat.is_eq(Auth.round_n(r), Auth.round_n(q)), Bool.and(Nat.is_eq(Auth.limit_n(l), Auth.limit_n(k)), Bool.and(Auth.same_bool(d, e), Bool.and(Auth.same_seen(t, u), Auth.same_seen(x, y)))))

def Auth.same(+s: Auth, +t: Auth) -> Bool:
  Bool.and(Auth.same_stage(Auth.at(s), Auth.at(t)), Bool.and(Auth.same_inputs(Auth.inputs(s), Auth.inputs(t)), Bool.and(Auth.same_budget(Auth.budget(s), Auth.budget(t)), Bool.and(Nat.is_eq(Auth.back_n(Auth.back(s)), Auth.back_n(Auth.back(t))), Auth.same_bool(Auth.again(s), Auth.again(t))))))

def Auth.is_at(s: Auth, b: Stage) -> Bool:
  Auth.same_stage(Auth.at(s), b)

def Auth.judged(s: Auth) -> Bool:
  Auth.same_inputs(Auth.inputs(s), Judged{})

# a stage record exists
def Auth.exists(a: Stage) -> Bool:
  Nat.is_le(1n, Auth.stage_n(a))

# MODELED and later hold the package digest
def Auth.recorded(a: Stage) -> Bool:
  Nat.is_le(2n, Auth.stage_n(a))

# CHECKED and later hold the pin of the inputs CHECKED judged
def Auth.pinned(a: Stage) -> Bool:
  Nat.is_le(3n, Auth.stage_n(a))

def Auth.is_ready(a: Stage) -> Bool:
  Nat.is_eq(Auth.stage_n(a), 5n)

def Auth.lockable(a: Stage) -> Bool:
  Nat.is_le(4n, Auth.stage_n(a))

# round past the limit: only a legacy record rebuilt as 1 + rewinds gets here
def Auth.over(+b: Budget) -> Bool:
  Bool.not(Nat.is_le(Auth.round_n(Auth.round(b)), Auth.limit_n(Auth.limit(b))))

# the next round still fits the limit
def Auth.fits(r: Round, l: Limit) -> Bool:
  Nat.is_le(Nat.add(Auth.round_n(r), 1n), Auth.limit_n(l))

def Auth.same_why(a: Why, b: Why) -> Bool:
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
    case Missing{} Missing{}:
      True{}
    case Exists{} Exists{}:
      True{}
    case Exhausted{} Exhausted{}:
      True{}
    case Locked{} Locked{}:
      True{}
    case ApprovalRequired{} ApprovalRequired{}:
      True{}
    case ApprovalReused{} ApprovalReused{}:
      True{}
    case RewindCap{} RewindCap{}:
      True{}
    case Ceiling{} Ceiling{}:
      True{}
    case _ _:
      False{}

def Auth.took(o: Last) -> Bool:
  match o:
    case Took{}:
      True{}
    case Refused{w}:
      False{}

def Auth.refused_as(o: Last, w: Why) -> Bool:
  match o:
    case Took{}:
      False{}
    case Refused{x}:
      Auth.same_why(x, w)

def Auth.names(to: Target, b: Stage) -> Bool:
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

def Auth.target_stage(to: Target) -> Stage:
  match to:
    case ToDiscovering{}:
      Discovering{}
    case ToModeled{}:
      Modeled{}
    case ToChecked{}:
      Checked{}
    case ToDrafted{}:
      Drafted{}
    case ToReady{}:
      Ready{}
    case ToNothing{}:
      NoRecord{}

# The one stage each stage advances to. ORACLE_READY advances to nothing.
def Auth.next_is(a: Stage, to: Target) -> Bool:
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

def Auth.goal(a: Stage) -> Stage:
  match a:
    case NoRecord{}:
      NoRecord{}
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

# CHECKED or DRAFTED whose pinned inputs changed run CHECKED again in place on `advance --to CHECKED`.
def Auth.rechecks(+a: Stage, i: Inputs, to: Target) -> Bool:
  Bool.and(Auth.names(to, Checked{}), Bool.and(Bool.or(Auth.same_stage(a, Checked{}), Auth.same_stage(a, Drafted{})), Bool.not(Auth.same_inputs(i, Judged{}))))

# Before the gate: a package changed after its digest, or Bend inputs changed after the pin DRAFTED needs.
def Auth.forward_stale(+a: Stage, +i: Inputs, to: Target) -> Bool:
  Bool.or(Bool.and(Auth.recorded(a), Auth.same_inputs(i, PackageEdited{})), Bool.and(Auth.names(to, Drafted{}), Auth.same_inputs(i, BendEdited{})))

# A rewind target at or before the current stage, other than ORACLE_READY.
def Auth.may_rewind(+a: Stage, to: Target) -> Bool:
  match to:
    case ToDiscovering{}:
      Nat.is_le(1n, Auth.stage_n(a))
    case ToModeled{}:
      Nat.is_le(2n, Auth.stage_n(a))
    case ToChecked{}:
      Nat.is_le(3n, Auth.stage_n(a))
    case ToDrafted{}:
      Nat.is_le(4n, Auth.stage_n(a))
    case ToReady{}:
      False{}
    case ToNothing{}:
      False{}

# A changed package walks back only to DISCOVERING; CHECKED and DRAFTED resume only on the pinned inputs.
def Auth.rewind_stale(+i: Inputs, +to: Target) -> Bool:
  Bool.or(Bool.and(Bool.not(Auth.names(to, Discovering{})), Auth.same_inputs(i, PackageEdited{})), Bool.and(Bool.or(Auth.names(to, Checked{}), Auth.names(to, Drafted{})), Auth.same_inputs(i, BendEdited{})))

# What `status` reports as stale (the walk and the phase line read it).
def Auth.stale(s: Auth) -> Bool:
  match s:
    case Auth{+a, +i, b, k, g}:
      Bool.or(Bool.and(Auth.recorded(a), Auth.same_inputs(i, PackageEdited{})), Bool.and(Bool.or(Auth.same_stage(a, Checked{}), Auth.same_stage(a, Drafted{})), Auth.same_inputs(i, BendEdited{})))

# ---- the round budget (oracle-iterations.mjs observeIteration, extendIterations)
def Auth.age(x: Seen) -> Seen:
  match x:
    case ThisRound{}:
      EarlierRound{}
    case Unseen{}:
      Unseen{}
    case EarlierRound{}:
      EarlierRound{}

def Auth.next_or_over(fit: Bool, b: Budget) -> Obs:
  match fit:
    case True{}:
      Kept{b}
    case False{}:
      Over{}

# A text key that changed: recorded in this round, it starts the next round (the other key ages); otherwise it is
# recorded in this round.
def Auth.text_seen(changed: Bool, b: Budget) -> Obs:
  match changed:
    case False{}:
      Kept{b}
    case True{}:
      match b:
        case Budget{+r, +l, d, t, x}:
          match t:
            case ThisRound{}:
              Auth.next_or_over(Auth.fits(r, l), Budget{Auth.next_round(r), l, d, ThisRound{}, Auth.age(x)})
            case Unseen{}:
              Kept{Budget{r, l, d, ThisRound{}, x}}
            case EarlierRound{}:
              Kept{Budget{r, l, d, ThisRound{}, x}}

def Auth.dispatch_seen(changed: Bool, b: Budget) -> Obs:
  match changed:
    case False{}:
      Kept{b}
    case True{}:
      match b:
        case Budget{+r, +l, d, t, x}:
          match x:
            case ThisRound{}:
              Auth.next_or_over(Auth.fits(r, l), Budget{Auth.next_round(r), l, d, Auth.age(t), ThisRound{}})
            case Unseen{}:
              Kept{Budget{r, l, d, t, ThisRound{}}}
            case EarlierRound{}:
              Kept{Budget{r, l, d, t, ThisRound{}}}

# An input is changed when its bytes differ from the last recorded ones; a key never recorded always is.
def Auth.text_changed(new: Bool, +b: Budget) -> Bool:
  Bool.or(new, Auth.is_unseen(Auth.text(b)))

def Auth.dispatch_changed(new: Bool, +b: Budget) -> Bool:
  Bool.or(new, Auth.is_unseen(Auth.dispatch(b)))

def Auth.then_dispatch(o: Obs, attempt: Bool) -> Obs:
  match o:
    case Kept{+c}:
      Auth.dispatch_seen(Auth.dispatch_changed(attempt, c), c)
    case Over{}:
      Over{}

# review-input: the text, then the dispatch attempt; either one past the limit refuses the whole command.
def Auth.observe(+b: Budget, text: Bool, attempt: Bool) -> Obs:
  Auth.then_dispatch(Auth.text_seen(Auth.text_changed(text, b), b), attempt)

def Auth.is_over(o: Obs) -> Bool:
  match o:
    case Kept{c}:
      False{}
    case Over{}:
      True{}

def Auth.kept_or(o: Obs, b: Budget) -> Budget:
  match o:
    case Kept{c}:
      c
    case Over{}:
      b

# whether a review-input moves to the next round
def Auth.bumps(+b: Budget, +text: Bool, attempt: Bool) -> Bool:
  Bool.or(Bool.and(text, Auth.is_now(Auth.text(b))), Bool.and(attempt, Bool.and(Auth.is_now(Auth.dispatch(b)), Bool.not(Bool.and(text, Auth.is_now(Auth.text(b)))))))

# The round ceiling: most rounds any approval opens (the CLI's ROUND_CEILING is 6).
def Auth.ceiling() -> Nat:
  5n

def Auth.pick(c: Bool, x: Nat, y: Nat) -> Nat:
  match c:
    case True{}:
      x
    case False{}:
      y

# the round an explicit approval names: max(round, limit) + 1
def Auth.approval_round(b: Budget) -> Nat:
  match b:
    case Budget{+r, +l, d, t, x}:
      Nat.add(Auth.pick(Nat.is_le(Auth.round_n(r), Auth.limit_n(l)), Auth.limit_n(l), Auth.round_n(r)), 1n)

# past the ceiling every explicit approval is refused as ITERATION_CEILING_REACHED
def Auth.at_ceiling(b: Budget) -> Bool:
  Nat.is_lt(Auth.ceiling(), Auth.approval_round(b))

# an explicit approval names round max(round, limit) + 1 and raises the limit to it
def Auth.approved_as(within: Bool, r: Round, l: Limit) -> Limit:
  match within:
    case True{}:
      Auth.next_limit(l)
    case False{}:
      Auth.after_round(r)

def Auth.approved(+r: Round, +l: Limit) -> Limit:
  Auth.approved_as(Nat.is_le(Auth.round_n(r), Auth.limit_n(l)), r, l)

def Auth.approve(b: Budget) -> Budget:
  match b:
    case Budget{+r, +l, d, t, x}:
      Budget{r, Auth.approved(r, l), d, t, x}

def Auth.delegate(b: Budget, u: Up) -> Budget:
  match b:
    case Budget{r, l, d, t, x}:
      Budget{r, Auth.up_limit(u), True{}, t, x}

# ---- the decision: the first refusal the CLI reports, else Took
def Auth.refuse(c: Bool, w: Why, rest: Last) -> Last:
  match c:
    case True{}:
      Refused{w}
    case False{}:
      rest

def Auth.gate_last(pass: Bool) -> Last:
  Auth.refuse(Bool.not(pass), Gate{}, Took{})

# a recheck counts as a rewind: past the allowance it is refused before the package is read
def Auth.recheck_last(recheck: Bool, i: Inputs, pass: Bool, spent: Bool) -> Last:
  match recheck:
    case True{}:
      Auth.refuse(spent, RewindCap{}, Auth.refuse(Auth.same_inputs(i, PackageEdited{}), Stale{}, Auth.gate_last(pass)))
    case False{}:
      Refused{Skip{}}

def Auth.forward_last(next: Bool, +a: Stage, +i: Inputs, +to: Target, pass: Bool, spent: Bool) -> Last:
  match next:
    case True{}:
      Auth.refuse(Auth.forward_stale(a, i, to), Stale{}, Auth.gate_last(pass))
    case False{}:
      Auth.recheck_last(Auth.rechecks(a, i, to), i, pass, spent)

def Auth.advance_last(+a: Stage, +i: Inputs, +b: Budget, k: Back, +to: Target, pass: Bool) -> Last:
  Auth.refuse(Bool.not(Auth.exists(a)), Missing{}, Auth.refuse(Auth.over(b), Exhausted{}, Auth.refuse(Auth.names(to, Ready{}), LockOnly{}, Auth.forward_last(Auth.next_is(a, to), a, i, to, pass, Auth.spent(k)))))

# the same rewind again, with nothing written since, is accepted and writes nothing
def Auth.repeat_or(repeat: Bool, rest: Last) -> Last:
  match repeat:
    case True{}:
      Took{}
    case False{}:
      rest

def Auth.rewind_last(+a: Stage, +i: Inputs, +b: Budget, k: Back, g: Bool, +to: Target, reason: Bool) -> Last:
  Auth.refuse(Bool.not(reason), Usage{}, Auth.refuse(Bool.not(Auth.exists(a)), Missing{}, Auth.refuse(Bool.not(Auth.may_rewind(a, to)), Back{}, Auth.refuse(Auth.rewind_stale(i, to), Stale{}, Auth.repeat_or(Bool.and(g, Auth.names(to, a)), Auth.refuse(Auth.over(b), Exhausted{}, Auth.refuse(Auth.spent(k), RewindCap{}, Took{})))))))

def Auth.lock_last(+a: Stage, +i: Inputs, +b: Budget) -> Last:
  Auth.refuse(Bool.not(Auth.exists(a)), Missing{}, Auth.refuse(Bool.and(Bool.not(Auth.is_ready(a)), Auth.over(b)), Exhausted{}, Auth.refuse(Bool.not(Auth.lockable(a)), NotDrafted{}, Auth.refuse(Bool.not(Auth.same_inputs(i, Judged{})), Stale{}, Took{}))))

def Auth.review_last(+a: Stage, +b: Budget, text: Bool, attempt: Bool) -> Last:
  Auth.refuse(Auth.is_ready(a), Locked{}, Auth.refuse(Auth.over(b), Exhausted{}, Auth.refuse(Auth.is_over(Auth.observe(b, text, attempt)), Exhausted{}, Took{})))

def Auth.extend_open(+a: Stage, rest: Last) -> Last:
  Auth.refuse(Bool.not(Auth.exists(a)), Missing{}, Auth.refuse(Auth.is_ready(a), Locked{}, rest))

def Auth.delegate_last(+b: Budget, u: Up) -> Last:
  Auth.refuse(Auth.delegated(b), ApprovalReused{}, Auth.refuse(Nat.is_le(Auth.up_n(u), Auth.limit_n(Auth.limit(b))), ApprovalRequired{}, Took{}))

def Auth.prim_decide(s: Auth, m: Msg) -> Last:
  match s:
    case Auth{+a, +i, +b, +k, +g}:
      match m:
        case Begin{}:
          Auth.refuse(Auth.exists(a), Exists{}, Took{})
        case Advance{to, pass}:
          Auth.advance_last(a, i, b, k, to, pass)
        case Rewind{to, reason}:
          Auth.rewind_last(a, i, b, k, g, to, reason)
        case Lock{}:
          Auth.lock_last(a, i, b)
        case Status{}:
          Took{}
        case Edit{p}:
          Took{}
        case Review{text, attempt}:
          Auth.review_last(a, b, text, attempt)
        case Approve{right}:
          Auth.extend_open(a, Auth.refuse(Auth.at_ceiling(b), Ceiling{}, Auth.refuse(Bool.not(right), ApprovalRequired{}, Took{})))
        case Delegate{u}:
          Auth.extend_open(a, Auth.delegate_last(b, u))
        case Walk{reason}:
          Took{}

# ---- the effect of an accepted command
def Auth.package_edited(recorded: Bool, i: Inputs) -> Inputs:
  match recorded:
    case True{}:
      PackageEdited{}
    case False{}:
      i

def Auth.bend_on(i: Inputs) -> Inputs:
  match i:
    case Judged{}:
      BendEdited{}
    case BendEdited{}:
      BendEdited{}
    case PackageEdited{}:
      PackageEdited{}

def Auth.bend_edited(pinned: Bool, i: Inputs) -> Inputs:
  match pinned:
    case True{}:
      Auth.bend_on(i)
    case False{}:
      i

def Auth.edited(+a: Stage, i: Inputs, part: Part) -> Inputs:
  match part:
    case PackageFile{}:
      Auth.package_edited(Auth.recorded(a), i)
    case BendFiles{}:
      Auth.bend_edited(Auth.pinned(a), i)

# accepted advance: the next stage, or CHECKED again in place
def Auth.advanced(next: Bool, a: Stage) -> Stage:
  match next:
    case True{}:
      Auth.goal(a)
    case False{}:
      Checked{}

# a recheck (CHECKED again in place) counts like a rewind
def Auth.advanced_back(next: Bool, k: Back) -> Back:
  match next:
    case True{}:
      k
    case False{}:
      Auth.next_back(k)

# review-input on no record begins one first
def Auth.begun(a: Stage) -> Stage:
  match a:
    case NoRecord{}:
      Discovering{}
    case _:
      a

# a package edit changes the bytes a repeated rewind compares, so the next rewind is a new one
def Auth.still_again(g: Bool, part: Part) -> Bool:
  match part:
    case PackageFile{}:
      False{}
    case BendFiles{}:
      g

# an accepted rewind: the no-op repeat keeps everything, another one lands at its target and counts
def Auth.rewound(repeat: Bool, s: Auth, to: Target) -> Auth:
  match repeat:
    case True{}:
      s
    case False{}:
      match s:
        case Auth{a, i, b, k, g}:
          Auth{Auth.target_stage(to), Judged{}, b, Auth.next_back(k), True{}}

def Auth.apply(s: Auth, m: Msg) -> Auth:
  match s:
    case Auth{+a, +i, +b, +k, +g}:
      match m:
        case Begin{}:
          Auth{Discovering{}, Judged{}, Auth.fresh(), B0{}, False{}}
        case Advance{+to, pass}:
          Auth{Auth.advanced(Auth.next_is(a, to), a), Judged{}, b, Auth.advanced_back(Auth.next_is(a, to), k), False{}}
        case Rewind{+to, reason}:
          Auth.rewound(Bool.and(g, Auth.names(to, a)), Auth{a, i, b, k, g}, to)
        case Lock{}:
          Auth{Ready{}, Judged{}, b, k, False{}}
        case Status{}:
          Auth{a, i, b, k, g}
        case Edit{+p}:
          Auth{a, Auth.edited(a, i, p), b, k, Auth.still_again(g, p)}
        case Review{text, attempt}:
          Auth{Auth.begun(a), i, Auth.kept_or(Auth.observe(b, text, attempt), b), k, g}
        case Approve{right}:
          Auth{a, i, Auth.approve(b), B0{}, g}
        case Delegate{u}:
          Auth{a, i, Auth.delegate(b, u), B0{}, g}
        case Walk{reason}:
          Auth{a, i, b, k, g}

def Auth.settle(o: Last, s: Auth, m: Msg) -> Auth:
  match o:
    case Took{}:
      Auth.apply(s, m)
    case Refused{w}:
      s

# the decision is made once and both the outcome and the next state read it
def Auth.settled(+o: Last, s: Auth, m: Msg) -> Out:
  Out{o, Auth.settle(o, s, m)}

def Auth.prim_out(+s: Auth, +m: Msg) -> Out:
  Auth.settled(Auth.prim_decide(s, m), s, m)

# ---- walk: rewind a stale record to DISCOVERING when --reason is given, then advance to DRAFTED; the first refusal
# ends it with the steps before it kept
def Auth.out_last(o: Out) -> Last:
  match o:
    case Out{l, t}:
      l

def Auth.out_after(o: Out) -> Auth:
  match o:
    case Out{l, t}:
      t

# one advance of the walk: DISCOVERING, MODELED and CHECKED take their next stage, DRAFTED and later stop
def Auth.walk_at(a: Stage, +s: Auth) -> Out:
  match a:
    case Discovering{}:
      Auth.prim_out(s, Advance{ToModeled{}, True{}})
    case Modeled{}:
      Auth.prim_out(s, Advance{ToChecked{}, True{}})
    case Checked{}:
      Auth.prim_out(s, Advance{ToDrafted{}, True{}})
    case _:
      Out{Took{}, s}

def Auth.then(o: Out) -> Out:
  match o:
    case Out{l, +t}:
      match l:
        case Took{}:
          Auth.walk_at(Auth.at(t), t)
        case Refused{w}:
          Out{Refused{w}, t}

# at most three advances reach DRAFTED from DISCOVERING
def Auth.walk_after(o: Out) -> Out:
  Auth.then(Auth.then(Auth.then(o)))

def Auth.walk_on(s: Auth) -> Out:
  Auth.walk_after(Out{Took{}, s})

def Auth.walk_stale(stale: Bool, reason: Bool, +s: Auth) -> Out:
  match stale:
    case False{}:
      Auth.walk_on(s)
    case True{}:
      match reason:
        case True{}:
          Auth.walk_after(Auth.prim_out(s, Rewind{ToDiscovering{}, True{}}))
        case False{}:
          Out{Refused{Stale{}}, s}

def Auth.walk_from(here: Bool, reason: Bool, +s: Auth) -> Out:
  match here:
    case True{}:
      Auth.walk_stale(Auth.stale(s), reason, s)
    case False{}:
      Out{Refused{Missing{}}, s}

def Auth.walk(+s: Auth, reason: Bool) -> Out:
  Auth.walk_from(Auth.exists(Auth.at(s)), reason, s)

def Auth.is_walk(m: Msg) -> Bool:
  match m:
    case Walk{r}:
      True{}
    case _:
      False{}

def Auth.walk_reason(m: Msg) -> Bool:
  match m:
    case Walk{r}:
      r
    case _:
      False{}

def Auth.out_as(walk: Bool, +s: Auth, +m: Msg) -> Out:
  match walk:
    case True{}:
      Auth.walk(s, Auth.walk_reason(m))
    case False{}:
      Auth.prim_out(s, m)

def Auth.out(+s: Auth, +m: Msg) -> Out:
  Auth.out_as(Auth.is_walk(m), s, m)

def Auth.decide(+s: Auth, +m: Msg) -> Last:
  Auth.out_last(Auth.out(s, m))

def Auth.step(+s: Auth, +m: Msg) -> Auth:
  Auth.out_after(Auth.out(s, m))

def Auth.run_all(ms: List<Msg>, s: Auth) -> Auth:
  match ms:
    case Nil{}:
      s
    case Con{m, rest}:
      Auth.run_all(rest, Auth.step(s, m))

# Every command and edit, at any time: every value of Msg, so the model has no `enabled` and prove-reach takes them all.
def Auth.commands() -> List<Msg>:
  [Begin{}, Advance{ToDiscovering{}, True{}}, Advance{ToDiscovering{}, False{}}, Advance{ToModeled{}, True{}}, Advance{ToModeled{}, False{}}, Advance{ToChecked{}, True{}}, Advance{ToChecked{}, False{}}, Advance{ToDrafted{}, True{}}, Advance{ToDrafted{}, False{}}, Advance{ToReady{}, True{}}, Advance{ToReady{}, False{}}, Advance{ToNothing{}, True{}}, Advance{ToNothing{}, False{}}, Rewind{ToDiscovering{}, True{}}, Rewind{ToDiscovering{}, False{}}, Rewind{ToModeled{}, True{}}, Rewind{ToModeled{}, False{}}, Rewind{ToChecked{}, True{}}, Rewind{ToChecked{}, False{}}, Rewind{ToDrafted{}, True{}}, Rewind{ToDrafted{}, False{}}, Rewind{ToReady{}, True{}}, Rewind{ToReady{}, False{}}, Rewind{ToNothing{}, True{}}, Rewind{ToNothing{}, False{}}, Lock{}, Status{}, Edit{PackageFile{}}, Edit{BendFiles{}}, Review{True{}, True{}}, Review{True{}, False{}}, Review{False{}, True{}}, Review{False{}, False{}}, Approve{True{}}, Approve{False{}}, Delegate{Up3{}}, Delegate{Up4{}}, Delegate{Up5{}}, Walk{True{}}, Walk{False{}}]

# ---- the phase line: the command `status --brief` names next (stageCommand)
type Hint is Data:
  HintBegin{}
  HintWalk{}
  HintWalkReason{}
  HintLock{}
  HintInit{}
  HintExtend{}
  HintRevise{}

# extend is refused here: the record is locked or the next approval is past the round ceiling
def Auth.final(+s: Auth) -> Bool:
  Bool.or(Auth.is_ready(Auth.at(s)), Auth.at_ceiling(Auth.budget(s)))

# a stale record past the rewind allowance: extend, or where extend is refused (ORACLE_READY, the round ceiling) a
# new revision
def Auth.hint_final(final: Bool) -> Hint:
  match final:
    case True{}:
      HintRevise{}
    case False{}:
      HintExtend{}

def Auth.hint_spent(spent: Bool, final: Bool) -> Hint:
  match spent:
    case False{}:
      HintWalkReason{}
    case True{}:
      Auth.hint_final(final)

def Auth.hint_at(stale: Bool, spent: Bool, final: Bool, a: Stage) -> Hint:
  match stale:
    case True{}:
      Auth.hint_spent(spent, final)
    case False{}:
      match a:
        case NoRecord{}:
          HintBegin{}
        case Drafted{}:
          HintLock{}
        case Ready{}:
          HintInit{}
        case _:
          HintWalk{}

def Auth.hint(+s: Auth) -> Hint:
  Auth.hint_at(Auth.stale(s), Auth.spent_of(s), Auth.final(s), Auth.at(s))

# The named command is accepted there; `init` belongs to the Delivery run and a new revision to a new record.
def Auth.hint_accepted_as(h: Hint, +s: Auth) -> Bool:
  match h:
    case HintBegin{}:
      Auth.took(Auth.decide(s, Begin{}))
    case HintWalk{}:
      Auth.took(Auth.decide(s, Walk{False{}}))
    case HintWalkReason{}:
      Auth.took(Auth.decide(s, Walk{True{}}))
    case HintLock{}:
      Auth.took(Auth.decide(s, Lock{}))
    case HintInit{}:
      Auth.is_ready(Auth.at(s))
    case HintExtend{}:
      Auth.took(Auth.decide(s, Approve{True{}}))
    case HintRevise{}:
      Auth.final(s)

def Auth.hint_accepted(+s: Auth) -> Bool:
  Auth.hint_accepted_as(Auth.hint(s), s)

# ---- vocabulary of the laws
def Auth.is_begin(m: Msg) -> Bool:
  match m:
    case Begin{}:
      True{}
    case _:
      False{}

def Auth.is_advance(m: Msg) -> Bool:
  match m:
    case Advance{to, p}:
      True{}
    case _:
      False{}

def Auth.is_rewind(m: Msg) -> Bool:
  match m:
    case Rewind{to, r}:
      True{}
    case _:
      False{}

def Auth.is_lock(m: Msg) -> Bool:
  match m:
    case Lock{}:
      True{}
    case _:
      False{}

def Auth.is_status(m: Msg) -> Bool:
  match m:
    case Status{}:
      True{}
    case _:
      False{}

def Auth.is_edit(m: Msg) -> Bool:
  match m:
    case Edit{p}:
      True{}
    case _:
      False{}

def Auth.is_review(m: Msg) -> Bool:
  match m:
    case Review{x, y}:
      True{}
    case _:
      False{}

def Auth.is_approve(m: Msg) -> Bool:
  match m:
    case Approve{r}:
      True{}
    case _:
      False{}

def Auth.is_delegate(m: Msg) -> Bool:
  match m:
    case Delegate{u}:
      True{}
    case _:
      False{}

def Auth.is_extend(+m: Msg) -> Bool:
  Bool.or(Auth.is_approve(m), Auth.is_delegate(m))

def Auth.advances_to(m: Msg, b: Stage) -> Bool:
  match m:
    case Advance{to, p}:
      Auth.names(to, b)
    case _:
      False{}

# Rewind{ToDiscovering, True}: the walk back that every recorded stage takes
def Auth.is_walk_back(m: Msg) -> Bool:
  match m:
    case Rewind{to, r}:
      Bool.and(Auth.names(to, Discovering{}), r)
    case _:
      False{}

def Auth.review_text(m: Msg) -> Bool:
  match m:
    case Review{x, y}:
      x
    case _:
      False{}

def Auth.review_attempt(m: Msg) -> Bool:
  match m:
    case Review{x, y}:
      y
    case _:
      False{}

def Auth.delegate_up(m: Msg) -> Nat:
  match m:
    case Delegate{u}:
      Auth.up_n(u)
    case _:
      0n

def Auth.round_of(s: Auth) -> Nat:
  Auth.round_n(Auth.round(Auth.budget(s)))

def Auth.limit_of(s: Auth) -> Nat:
  Auth.limit_n(Auth.limit(Auth.budget(s)))

def Auth.stage_of(s: Auth) -> Nat:
  Auth.stage_n(Auth.at(s))

# review progress: two per round, plus one per key recorded in the current round. It rises on every review-input
# that changes the budget and is at most 2 * limit + 2.
def Auth.potential(b: Budget) -> Nat:
  match b:
    case Budget{r, l, d, t, x}:
      Nat.add(Nat.mul(2n, Auth.round_n(r)), Nat.add(Auth.flag(Auth.is_now(t)), Auth.flag(Auth.is_now(x))))

# Cell law: a review-input that keeps the budget changes nothing; one that changes it raises the potential and the
# round by at most one (any budget of the type, any inputs).
def Auth.potential_after(+b: Budget, o: Obs) -> Bool:
  match o:
    case Kept{+c}:
      Bool.and(Auth.imp(Bool.not(Auth.same_budget(b, c)), Nat.is_lt(Auth.potential(b), Auth.potential(c))), Bool.and(Nat.is_le(Auth.potential(b), Auth.potential(c)), Nat.is_le(Auth.round_n(Auth.round(c)), Nat.add(Auth.round_n(Auth.round(b)), 1n))))
    case Over{}:
      True{}

def Auth.potential_rises(+b: Budget, text: Bool, attempt: Bool) -> Bool:
  Auth.potential_after(b, Auth.observe(b, text, attempt))

# Cell law: an accepted delegation records itself and raises the limit (any budget of the type).
def Auth.delegation_raises(+b: Budget, +u: Up) -> Bool:
  Auth.imp(Auth.took(Auth.delegate_last(b, u)), Bool.and(Auth.delegated(Auth.delegate(b, u)), Nat.is_lt(Auth.limit_n(Auth.limit(b)), Auth.limit_n(Auth.limit(Auth.delegate(b, u))))))

def Auth.back_of(s: Auth) -> Nat:
  Auth.back_n(Auth.back(s))

# edits move the inputs one way: as judged, then Bend files changed, then the package changed
def Auth.inputs_n(i: Inputs) -> Nat:
  match i:
    case Judged{}:
      0n
    case BendEdited{}:
      1n
    case PackageEdited{}:
      2n

# x below y, or equal and the rest decides: one place of a lexicographic comparison
def Auth.below(+x: Nat, +y: Nat, rest: Bool) -> Bool:
  Bool.or(Nat.is_lt(x, y), Bool.and(Nat.is_eq(x, y), rest))

# The ranking, compared place by place: review progress, then the limit, then the rewinds counted, then the stage,
# then the edits, then whether the last rewind can still be repeated as a no-op. Every place is bounded.
def Auth.rank_lt(+s: Auth, +t: Auth) -> Bool:
  Auth.below(Auth.potential(Auth.budget(s)), Auth.potential(Auth.budget(t)), Auth.below(Auth.limit_of(s), Auth.limit_of(t), Auth.below(Auth.back_of(s), Auth.back_of(t), Auth.below(Auth.stage_of(s), Auth.stage_of(t), Auth.below(Auth.inputs_n(Auth.inputs(s)), Auth.inputs_n(Auth.inputs(t)), Nat.is_lt(Auth.flag(Auth.again(t)), Auth.flag(Auth.again(s))))))))

# The back edges: a rewind, CHECKED again in place, and a walk that rewinds a stale record.
def Auth.back_edge(+s: Auth, +m: Msg) -> Bool:
  Bool.or(Auth.is_rewind(m), Bool.or(Bool.and(Auth.advances_to(m, Checked{}), Bool.or(Auth.is_at(s, Checked{}), Auth.is_at(s, Drafted{}))), Bool.and(Auth.walk_reason(m), Auth.stale(s))))

# the walk back that repeats the last rewind to DISCOVERING writes nothing
def Auth.repeats_walk_back(+s: Auth) -> Bool:
  Bool.and(Auth.again(s), Auth.is_at(s, Discovering{}))

# What finishes from any state with no review: begin, walk back, walk with every gate passing, lock.
def Auth.finish(s: Auth) -> Auth:
  Auth.run_all([Begin{}, Rewind{ToDiscovering{}, True{}}, Walk{False{}}, Lock{}], s)

# Past the rewind allowance: one explicit approval of one more round, then the same walk back, walk and lock.
def Auth.rescue(s: Auth) -> Auth:
  Auth.run_all([Approve{True{}}, Rewind{ToDiscovering{}, True{}}, Walk{False{}}, Lock{}], s)

def Auth.lands(+f: Auth) -> Bool:
  Bool.and(Auth.is_ready(Auth.at(f)), Auth.judged(f))

# ---- the laws: Q(s, m, t, o) with t = step(s, m) and o = decide(s, m)
# Q_refused_keeps: a refused command changes nothing (frame); a walk is refused only before its first write
def Auth.Q_refused_keeps(+s: Auth, m: Msg, +t: Auth, +o: Last) -> Bool:
  Auth.imp(Bool.not(Auth.took(o)), Auth.same(s, t))

# Q_status_reads: status is accepted and changes nothing
def Auth.Q_status_reads(+s: Auth, +m: Msg, +t: Auth, +o: Last) -> Bool:
  Auth.imp(Auth.is_status(m), Bool.and(Auth.took(o), Auth.same(s, t)))

# Q_edit_writes_nothing: an edit keeps the stage and the budget
def Auth.Q_edit_writes_nothing(+s: Auth, +m: Msg, +t: Auth, o: Last) -> Bool:
  Auth.imp(Auth.is_edit(m), Bool.and(Auth.same_stage(Auth.at(s), Auth.at(t)), Auth.same_budget(Auth.budget(s), Auth.budget(t))))

# Q_walk_back_open: within the rewind allowance (or repeating the last walk back) every recorded stage walks back to
# DISCOVERING with a reason, on any inputs, keeping the budget
def Auth.Q_walk_back_open(+s: Auth, +m: Msg, +t: Auth, +o: Last) -> Bool:
  Auth.imp(Bool.and(Auth.exists(Auth.at(s)), Bool.and(Auth.is_walk_back(m), Bool.or(Bool.not(Auth.spent_of(s)), Auth.repeats_walk_back(s)))), Bool.and(Auth.took(o), Bool.and(Auth.is_at(t, Discovering{}), Bool.and(Auth.judged(t), Auth.same_budget(Auth.budget(s), Auth.budget(t))))))

# Q_begin_once: begin is accepted only with no record and starts at DISCOVERING with a fresh budget
def Auth.Q_begin_once(+s: Auth, +m: Msg, +t: Auth, +o: Last) -> Bool:
  Auth.imp(Auth.is_begin(m), Bool.and(Auth.imp(Auth.exists(Auth.at(s)), Auth.refused_as(o, Exists{})), Auth.imp(Bool.not(Auth.exists(Auth.at(s))), Bool.and(Auth.took(o), Bool.and(Auth.is_at(t, Discovering{}), Auth.same_budget(Auth.budget(t), Auth.fresh()))))))

# Q_rounds_count_reviews: the round never falls, rises by at most one, and only on review-input
def Auth.Q_rounds_count_reviews(+s: Auth, +m: Msg, +t: Auth, o: Last) -> Bool:
  Bool.and(Nat.is_le(Auth.round_of(s), Auth.round_of(t)), Bool.and(Nat.is_le(Auth.round_of(t), Nat.add(Auth.round_of(s), 1n)), Auth.imp(Bool.not(Nat.is_eq(Auth.round_of(s), Auth.round_of(t))), Auth.is_review(m))))

# Q_limit_monotone: the limit and a recorded delegation never fall, and the limit moves only on extend
def Auth.Q_limit_monotone(+s: Auth, +m: Msg, +t: Auth, o: Last) -> Bool:
  Bool.and(Nat.is_le(Auth.limit_of(s), Auth.limit_of(t)), Bool.and(Auth.imp(Auth.delegated(Auth.budget(s)), Auth.delegated(Auth.budget(t))), Auth.imp(Bool.not(Nat.is_eq(Auth.limit_of(s), Auth.limit_of(t))), Auth.is_extend(m))))

# Q_review_exhausts: review-input on an open record is refused as exhausted exactly when it would move past the limit
def Auth.Q_review_exhausts(+s: Auth, +m: Msg, +t: Auth, +o: Last) -> Bool:
  Auth.imp(Bool.and(Auth.is_review(m), Bool.and(Auth.exists(Auth.at(s)), Bool.not(Auth.is_ready(Auth.at(s))))), Auth.iff(Auth.refused_as(o, Exhausted{}), Bool.and(Auth.bumps(Auth.budget(s), Auth.review_text(m), Auth.review_attempt(m)), Nat.is_eq(Auth.round_of(s), Auth.limit_of(s)))))

# Q_review_round: an accepted review-input moves to the next round exactly when an input of this round changed
def Auth.Q_review_round(+s: Auth, +m: Msg, +t: Auth, +o: Last) -> Bool:
  Auth.imp(Bool.and(Auth.took(o), Auth.is_review(m)), Nat.is_eq(Auth.round_of(t), Nat.add(Auth.round_of(s), Auth.flag(Auth.bumps(Auth.budget(s), Auth.review_text(m), Auth.review_attempt(m))))))

# Q_exhausted_only_review: only review-input is refused as exhausted (advance, rewind and lock never are)
def Auth.Q_exhausted_only_review(s: Auth, +m: Msg, t: Auth, +o: Last) -> Bool:
  Auth.imp(Auth.refused_as(o, Exhausted{}), Auth.is_review(m))

# Q_locked_closed: ORACLE_READY refuses review-input and extend as locked, and every advance
def Auth.Q_locked_closed(+s: Auth, +m: Msg, t: Auth, +o: Last) -> Bool:
  Auth.imp(Auth.is_ready(Auth.at(s)), Bool.and(Auth.imp(Bool.or(Auth.is_review(m), Auth.is_extend(m)), Auth.refused_as(o, Locked{})), Auth.imp(Auth.is_advance(m), Bool.not(Auth.took(o)))))

# Q_delegate_once: a delegation is accepted once, raising the limit to at most 5; a second one is refused as reused
def Auth.Q_delegate_once(+s: Auth, +m: Msg, +t: Auth, +o: Last) -> Bool:
  Bool.and(Auth.imp(Bool.and(Auth.took(o), Auth.is_delegate(m)), Bool.and(Bool.not(Auth.delegated(Auth.budget(s))), Bool.and(Auth.delegated(Auth.budget(t)), Bool.and(Nat.is_lt(Auth.limit_of(s), Auth.limit_of(t)), Nat.is_eq(Auth.limit_of(t), Auth.delegate_up(m)))))), Auth.imp(Bool.and(Auth.is_delegate(m), Bool.and(Auth.exists(Auth.at(s)), Bool.and(Bool.not(Auth.is_ready(Auth.at(s))), Auth.delegated(Auth.budget(s))))), Auth.refused_as(o, ApprovalReused{})))

# Q_approve_one: an accepted explicit approval raises the limit by exactly one round
def Auth.Q_approve_one(+s: Auth, +m: Msg, +t: Auth, +o: Last) -> Bool:
  Auth.imp(Bool.and(Auth.took(o), Auth.is_approve(m)), Nat.is_eq(Auth.limit_of(t), Nat.add(Auth.limit_of(s), 1n)))

# Q_advance_one_step: an accepted advance moves exactly one stage forward, or lands at CHECKED from CHECKED or DRAFTED
def Auth.Q_advance_one_step(+s: Auth, +m: Msg, +t: Auth, +o: Last) -> Bool:
  Auth.imp(Bool.and(Auth.took(o), Auth.is_advance(m)), Bool.or(Nat.is_eq(Auth.stage_of(t), Nat.add(Auth.stage_of(s), 1n)), Bool.and(Auth.is_at(t, Checked{}), Bool.or(Auth.is_at(s, Checked{}), Auth.is_at(s, Drafted{})))))

# Q_ready_only_by_lock: ORACLE_READY is entered only by the lock, from DRAFTED on the inputs CHECKED judged
def Auth.Q_ready_only_by_lock(+s: Auth, +m: Msg, +t: Auth, o: Last) -> Bool:
  Auth.imp(Bool.and(Bool.not(Auth.is_ready(Auth.at(s))), Auth.is_ready(Auth.at(t))), Bool.and(Auth.is_lock(m), Bool.and(Auth.is_at(s, Drafted{}), Auth.judged(s))))

# Q_walk_needs_reason: a walk on a stale record without --reason is refused as stale
def Auth.Q_walk_needs_reason(+s: Auth, +m: Msg, t: Auth, +o: Last) -> Bool:
  Auth.imp(Bool.and(Auth.is_walk(m), Bool.and(Auth.stale(s), Bool.not(Auth.walk_reason(m)))), Auth.refused_as(o, Stale{}))

# Q_walk_lands: with every gate passing, a walk on a record it need not rewind, or may rewind within the allowance,
# ends at DRAFTED or ORACLE_READY with the budget kept
def Auth.Q_walk_lands(+s: Auth, +m: Msg, +t: Auth, +o: Last) -> Bool:
  Auth.imp(Bool.and(Auth.is_walk(m), Bool.and(Auth.exists(Auth.at(s)), Bool.or(Bool.not(Auth.stale(s)), Bool.and(Auth.walk_reason(m), Bool.not(Auth.spent_of(s)))))), Bool.and(Auth.took(o), Bool.and(Bool.or(Auth.is_at(t, Drafted{}), Auth.is_ready(Auth.at(t))), Auth.same_budget(Auth.budget(s), Auth.budget(t)))))

# Q_ranked: every accepted command, edits and back edges included, leaves the state as it was or raises the rank, so
# no cycle of commands and edits returns to a state (the rank of a reached state is bounded)
def Auth.Q_ranked(+s: Auth, m: Msg, +t: Auth, +o: Last) -> Bool:
  Auth.imp(Auth.took(o), Bool.or(Auth.same(s, t), Auth.rank_lt(s, t)))

# Q_back_edges_keep: a back edge keeps the whole budget, and a rewind or a recheck never moves forward
def Auth.Q_back_edges_keep(+s: Auth, +m: Msg, +t: Auth, +o: Last) -> Bool:
  Auth.imp(Bool.and(Auth.took(o), Auth.back_edge(s, m)), Bool.and(Auth.same_budget(Auth.budget(s), Auth.budget(t)), Auth.imp(Bool.not(Auth.is_walk(m)), Nat.is_le(Auth.stage_of(t), Auth.stage_of(s)))))

# Q_back_counts: the rewind count rises by exactly one only on a back edge within the allowance, and falls only on
# an accepted extend, which sets a fresh allowance and raises the limit
def Auth.Q_back_counts(+s: Auth, +m: Msg, +t: Auth, +o: Last) -> Bool:
  Bool.and(Auth.imp(Nat.is_lt(Auth.back_of(s), Auth.back_of(t)), Bool.and(Auth.back_edge(s, m), Bool.and(Bool.not(Auth.spent_of(s)), Nat.is_eq(Auth.back_of(t), Nat.add(Auth.back_of(s), 1n))))), Auth.imp(Nat.is_lt(Auth.back_of(t), Auth.back_of(s)), Bool.and(Auth.took(o), Bool.and(Auth.is_extend(m), Bool.and(Nat.is_eq(Auth.back_of(t), 0n), Nat.is_lt(Auth.limit_of(s), Auth.limit_of(t)))))))

# Q_rewind_capped: REWIND_CAP_REACHED refuses only a back edge past the allowance, and past it every walk back but the
# no-op repeat is refused that way
def Auth.Q_rewind_capped(+s: Auth, +m: Msg, t: Auth, +o: Last) -> Bool:
  Bool.and(Auth.imp(Auth.refused_as(o, RewindCap{}), Bool.and(Auth.back_edge(s, m), Auth.spent_of(s))), Auth.imp(Bool.and(Auth.exists(Auth.at(s)), Bool.and(Auth.is_walk_back(m), Bool.and(Auth.spent_of(s), Bool.not(Auth.repeats_walk_back(s))))), Auth.refused_as(o, RewindCap{})))

# Q_ceiling: an accepted explicit approval never opens a round past the ceiling, and on an open record every
# approval past it is refused as ITERATION_CEILING_REACHED
def Auth.Q_ceiling(+s: Auth, +m: Msg, +t: Auth, +o: Last) -> Bool:
  Bool.and(Auth.imp(Bool.and(Auth.took(o), Auth.is_approve(m)), Bool.and(Nat.is_le(Auth.approval_round(Auth.budget(s)), Auth.ceiling()), Nat.is_le(Auth.limit_of(t), Auth.ceiling()))), Bool.and(Auth.imp(Bool.and(Auth.is_approve(m), Bool.and(Auth.exists(Auth.at(s)), Bool.and(Bool.not(Auth.is_ready(Auth.at(s))), Auth.at_ceiling(Auth.budget(s))))), Auth.refused_as(o, Ceiling{})), Auth.imp(Auth.refused_as(o, Ceiling{}), Auth.is_approve(m))))

def Auth.cell_with(+s: Auth, +m: Msg, +t: Auth, +o: Last) -> Bool:
  Bool.and(Auth.Q_refused_keeps(s, m, t, o), Bool.and(Auth.Q_status_reads(s, m, t, o), Bool.and(Auth.Q_edit_writes_nothing(s, m, t, o), Bool.and(Auth.Q_walk_back_open(s, m, t, o), Bool.and(Auth.Q_begin_once(s, m, t, o), Bool.and(Auth.Q_rounds_count_reviews(s, m, t, o), Bool.and(Auth.Q_limit_monotone(s, m, t, o), Bool.and(Auth.Q_review_exhausts(s, m, t, o), Bool.and(Auth.Q_review_round(s, m, t, o), Bool.and(Auth.Q_exhausted_only_review(s, m, t, o), Bool.and(Auth.Q_locked_closed(s, m, t, o), Bool.and(Auth.Q_delegate_once(s, m, t, o), Bool.and(Auth.Q_approve_one(s, m, t, o), Bool.and(Auth.Q_advance_one_step(s, m, t, o), Bool.and(Auth.Q_ready_only_by_lock(s, m, t, o), Bool.and(Auth.Q_walk_needs_reason(s, m, t, o), Bool.and(Auth.Q_walk_lands(s, m, t, o), Bool.and(Auth.Q_ranked(s, m, t, o), Bool.and(Auth.Q_back_edges_keep(s, m, t, o), Bool.and(Auth.Q_back_counts(s, m, t, o), Bool.and(Auth.Q_rewind_capped(s, m, t, o), Auth.Q_ceiling(s, m, t, o))))))))))))))))))))))

def Auth.cell_out(+s: Auth, +m: Msg, +o: Out) -> Bool:
  Auth.cell_with(s, m, Auth.out_after(o), Auth.out_last(o))

def Auth.cell_ok(+s: Auth, +m: Msg) -> Bool:
  Auth.cell_out(s, m, Auth.out(s, m))

def Auth.all_ok(+s: Auth, ms: List<Msg>) -> Bool:
  match ms:
    case Nil{}:
      True{}
    case Con{m, rest}:
      Bool.and(Auth.cell_ok(s, m), Auth.all_ok(s, rest))

# finish lands at ORACLE_READY on judged inputs with the budget of s
def Auth.finishes(+s: Auth, +f: Auth) -> Bool:
  Bool.and(Auth.is_ready(Auth.at(f)), Bool.and(Auth.judged(f), Auth.same_budget(Auth.budget(s), Auth.budget(f))))

# What ends a revision: begin-rewind-walk-lock reaches ORACLE_READY with the budget kept, or the rewind allowance is
# spent and either extend is refused (`final`: only a new revision goes on) or one explicit approval then
# rewind-walk-lock reaches it.
def Auth.ends(+s: Auth) -> Bool:
  Bool.or(Auth.finishes(s, Auth.finish(s)), Bool.and(Auth.spent_of(s), Bool.or(Auth.final(s), Auth.lands(Auth.rescue(s)))))

# The every-trace safety def: in every state a trace reaches, the round is within the limit, the limit within the
# round ceiling and the rewind count within its allowance, no record means a fresh budget and no rewind, DISCOVERING holds no digest to go stale, the
# revision ends (`ends`), the phase line names an accepted command, and every law holds for every command. `oracle-model.mjs prove-reach --safe safe` proves it.
def Auth.safe(+s: Auth) -> Bool:
  Bool.and(Bool.not(Auth.over(Auth.budget(s))), Bool.and(Nat.is_le(Auth.back_of(s), Auth.cap()), Bool.and(Nat.is_le(Auth.limit_of(s), Auth.ceiling()), Bool.and(Auth.imp(Bool.not(Auth.exists(Auth.at(s))), Bool.and(Auth.judged(s), Bool.and(Auth.same_budget(Auth.budget(s), Auth.fresh()), Bool.and(Nat.is_eq(Auth.back_of(s), 0n), Bool.not(Auth.again(s)))))), Bool.and(Auth.imp(Auth.is_at(s, Discovering{}), Auth.judged(s)), Bool.and(Auth.ends(s), Bool.and(Auth.hint_accepted(s), Auth.all_ok(s, Auth.commands()))))))))
