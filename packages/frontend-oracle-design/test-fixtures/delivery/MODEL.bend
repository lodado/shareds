import Base

# Reference model for the Delivery run of `oracle-run.mjs`: the run state, the facts its guards read, and the
# commands that change them. `decide` gives the outcome of a command (accepted, or refused with the reason the
# CLI reports first); `step` applies an accepted command and keeps the state on a refusal.
#
# State, as the guards see it:
# - at: the run state (references/delivery.protocol.json), with the review packet of this IMPLEMENTED_GREEN visit
#   (none, one with no receipt bound to it, one with a receipt bound to it).
# - red: a VALID_RED was ever recorded, so a GREEN keeps the test bytes it bound.
# - touched: production differs from the init snapshot.
# - run: the latest run (every run is the required `behavior` label): whether it passed, whether the worktree is
#   unchanged since it (fresh), and whether it came after the gate baseline of the current state (since: after the
#   last VALID_RED entry, or the last ORACLE_READY entry when no VALID_RED exists; at IMPLEMENTED_GREEN after the
#   GREEN entry; at NEEDS_DECISION what ORACLE_READY will see after a resume).
# - dirty: test bytes changed since the last VALID_RED binding.
# - spent: the harness spends the ledger shows (limit 2): one per VALID_RED refresh, which binds changed tests. A
#   VALID_RED from ORACLE_READY binds for free.
# - resumes: the policy spends the ledger shows (limit 2): one per resume (NEEDS_DECISION → ORACLE_READY).
# - greened: an IMPLEMENTED_GREEN was ever recorded.
#
# Abstracted away: risk (the fixture is Low: one passing run, no intersect, mutation or blind mapping), lock and
# source drift, milestones, registered harness paths, report and adapter errors, test weakening, the product budget
# (counted from failed runs, refused only at a worker dispatch, which the model leaves out), a test edit back to bytes
# bound before (the ledger counts one binding once; every edit here makes new bytes), the review repair loop after
# GREEN (edits after a GREEN, round-2 packets, closure, review-brief, workers), the findings verdict (always clear),
# and `status` and `guide`, which read the state. Edits are the environment: they happen before any GREEN, at
# ORACLE_READY, VALID_RED or NEEDS_DECISION.

type Packet is Data:
  NoPacket{}
  Unbound{}
  Bound{}

type Phase is Data:
  AtReady{}
  AtRed{}
  AtGreen{packet: Packet}
  AtVerified{}
  AtPartial{}
  AtDecision{}
  AtFail{}

type Run is Data:
  NoRun{}
  Ran{pass: Bool, fresh: Bool, since: Bool}

type Spent is Data:
  Spent0{}
  Spent1{}
  Spent2{}

type Del is Data:
  Del{at: Phase, red: Bool, touched: Bool, run: Run, dirty: Bool, spent: Spent, resumes: Spent, greened: Bool}

# One refusal class per group of error codes; the test maps each code to its class.
type Why is Data:
  NotAllowed{}
  HoldsMismatch{}
  RunMissing{}
  NotRed{}
  NotGreen{}
  ProdTouched{}
  Stale{}
  Flaky{}
  Rerun{}
  PacketMissing{}
  ReceiptMissing{}
  EvidenceStale{}
  Exhausted{}
  WrongState{}
  NoReason{}

type Last is Data:
  Took{}
  Refused{why: Why}

type Target is Data:
  ToVerified{}
  ToPartial{}

type StopAt is Data:
  StopDecision{}
  StopFail{}

# Exec: `exec --label behavior` of a passing or failing reported test. EditProd/EditTest: a production or test file
# changes. MarkRed/MarkGreen/Review/Stop/Resume: `transition --to` VALID_RED, IMPLEMENTED_GREEN,
# REVIEW_VERIFIED|PARTIAL_VERIFIED (holds: a hold is open), NEEDS_DECISION|FAIL (reason: --reason given) and
# ORACLE_READY, each citing the latest run. MakePacket and Attest: the packet and the receipt `close` records for the
# latest packet of this GREEN visit (`review-packet`, `review-receipt`).
type Msg is Data:
  Exec{pass: Bool}
  EditProd{}
  EditTest{}
  MarkRed{}
  MarkGreen{}
  Review{to: Target, holds: Bool}
  MakePacket{}
  Attest{}
  Stop{to: StopAt, reason: Bool}
  Resume{}

def Del.init() -> Del:
  Del{AtReady{}, False{}, False{}, NoRun{}, False{}, Spent0{}, Spent0{}, False{}}

# ---- names shared by the machine and the laws
def Del.imp(a: Bool, b: Bool) -> Bool:
  Bool.or(Bool.not(a), b)

def Del.iff(+a: Bool, +b: Bool) -> Bool:
  Bool.and(Del.imp(a, b), Del.imp(b, a))

def Del.same_bool(+a: Bool, +b: Bool) -> Bool:
  Del.iff(a, b)

def Del.at(s: Del) -> Phase:
  match s:
    case Del{p, r, t, n, d, h, v, g}:
      p

def Del.red(s: Del) -> Bool:
  match s:
    case Del{p, r, t, n, d, h, v, g}:
      r

def Del.touched(s: Del) -> Bool:
  match s:
    case Del{p, r, t, n, d, h, v, g}:
      t

def Del.run(s: Del) -> Run:
  match s:
    case Del{p, r, t, n, d, h, v, g}:
      n

def Del.dirty(s: Del) -> Bool:
  match s:
    case Del{p, r, t, n, d, h, v, g}:
      d

def Del.harness(s: Del) -> Spent:
  match s:
    case Del{p, r, t, n, d, h, v, g}:
      h

def Del.policy(s: Del) -> Spent:
  match s:
    case Del{p, r, t, n, d, h, v, g}:
      v

def Del.greened(s: Del) -> Bool:
  match s:
    case Del{p, r, t, n, d, h, v, g}:
      g

def Del.is_ready(p: Phase) -> Bool:
  match p:
    case AtReady{}:
      True{}
    case _:
      False{}

def Del.is_red(p: Phase) -> Bool:
  match p:
    case AtRed{}:
      True{}
    case _:
      False{}

def Del.is_green(p: Phase) -> Bool:
  match p:
    case AtGreen{k}:
      True{}
    case _:
      False{}

def Del.is_verified(p: Phase) -> Bool:
  match p:
    case AtVerified{}:
      True{}
    case _:
      False{}

def Del.is_partial(p: Phase) -> Bool:
  match p:
    case AtPartial{}:
      True{}
    case _:
      False{}

def Del.is_decision(p: Phase) -> Bool:
  match p:
    case AtDecision{}:
      True{}
    case _:
      False{}

def Del.is_fail(p: Phase) -> Bool:
  match p:
    case AtFail{}:
      True{}
    case _:
      False{}

# REVIEW_VERIFIED, PARTIAL_VERIFIED: the review ends here.
def Del.reviewed(+p: Phase) -> Bool:
  Bool.or(Del.is_verified(p), Del.is_partial(p))

# The run states the delivery protocol orders forward. NEEDS_DECISION → ORACLE_READY is the only edge back.
def Del.rank(p: Phase) -> Nat:
  match p:
    case AtReady{}:
      0n
    case AtRed{}:
      1n
    case AtGreen{k}:
      2n
    case AtVerified{}:
      3n
    case AtPartial{}:
      3n
    case AtDecision{}:
      4n
    case AtFail{}:
      5n

def Del.same_packet(a: Packet, b: Packet) -> Bool:
  match a b:
    case NoPacket{} NoPacket{}:
      True{}
    case Unbound{} Unbound{}:
      True{}
    case Bound{} Bound{}:
      True{}
    case _ _:
      False{}

def Del.same_phase(a: Phase, b: Phase) -> Bool:
  match a b:
    case AtReady{} AtReady{}:
      True{}
    case AtRed{} AtRed{}:
      True{}
    case AtGreen{x} AtGreen{y}:
      Del.same_packet(x, y)
    case AtVerified{} AtVerified{}:
      True{}
    case AtPartial{} AtPartial{}:
      True{}
    case AtDecision{} AtDecision{}:
      True{}
    case AtFail{} AtFail{}:
      True{}
    case _ _:
      False{}

def Del.packet_of(p: Phase) -> Packet:
  match p:
    case AtGreen{k}:
      k
    case _:
      NoPacket{}

def Del.is_bound(k: Packet) -> Bool:
  match k:
    case Bound{}:
      True{}
    case _:
      False{}

def Del.is_unbound(k: Packet) -> Bool:
  match k:
    case Unbound{}:
      True{}
    case _:
      False{}

def Del.same_run(a: Run, b: Run) -> Bool:
  match a b:
    case NoRun{} NoRun{}:
      True{}
    case Ran{+p, +f, +s} Ran{+q, +g, +t}:
      Bool.and(Del.same_bool(p, q), Bool.and(Del.same_bool(f, g), Del.same_bool(s, t)))
    case _ _:
      False{}

def Del.has_run(r: Run) -> Bool:
  match r:
    case NoRun{}:
      False{}
    case Ran{p, f, s}:
      True{}

def Del.passed(r: Run) -> Bool:
  match r:
    case NoRun{}:
      False{}
    case Ran{p, f, s}:
      p

def Del.failed(r: Run) -> Bool:
  match r:
    case NoRun{}:
      False{}
    case Ran{p, f, s}:
      Bool.not(p)

def Del.fresh(r: Run) -> Bool:
  match r:
    case NoRun{}:
      False{}
    case Ran{p, f, s}:
      f

def Del.since(r: Run) -> Bool:
  match r:
    case NoRun{}:
      False{}
    case Ran{p, f, s}:
      s

def Del.spent_rank(n: Spent) -> Nat:
  match n:
    case Spent0{}:
      0n
    case Spent1{}:
      1n
    case Spent2{}:
      2n

def Del.spent(s: Del) -> Nat:
  Del.spent_rank(Del.harness(s))

def Del.resumes(s: Del) -> Nat:
  Del.spent_rank(Del.policy(s))

def Del.is_full(n: Spent) -> Bool:
  match n:
    case Spent2{}:
      True{}
    case _:
      False{}

def Del.same(+a: Del, +b: Del) -> Bool:
  Bool.and(Del.same_phase(Del.at(a), Del.at(b)), Bool.and(Del.same_bool(Del.red(a), Del.red(b)), Bool.and(Del.same_bool(Del.touched(a), Del.touched(b)), Bool.and(Del.same_run(Del.run(a), Del.run(b)), Bool.and(Del.same_bool(Del.dirty(a), Del.dirty(b)), Bool.and(Nat.is_eq(Del.spent(a), Del.spent(b)), Bool.and(Nat.is_eq(Del.resumes(a), Del.resumes(b)), Del.same_bool(Del.greened(a), Del.greened(b)))))))))

def Del.same_why(a: Why, b: Why) -> Bool:
  match a b:
    case NotAllowed{} NotAllowed{}:
      True{}
    case HoldsMismatch{} HoldsMismatch{}:
      True{}
    case RunMissing{} RunMissing{}:
      True{}
    case NotRed{} NotRed{}:
      True{}
    case NotGreen{} NotGreen{}:
      True{}
    case ProdTouched{} ProdTouched{}:
      True{}
    case Stale{} Stale{}:
      True{}
    case Flaky{} Flaky{}:
      True{}
    case Rerun{} Rerun{}:
      True{}
    case PacketMissing{} PacketMissing{}:
      True{}
    case ReceiptMissing{} ReceiptMissing{}:
      True{}
    case EvidenceStale{} EvidenceStale{}:
      True{}
    case Exhausted{} Exhausted{}:
      True{}
    case WrongState{} WrongState{}:
      True{}
    case NoReason{} NoReason{}:
      True{}
    case _ _:
      False{}

def Del.took(o: Last) -> Bool:
  match o:
    case Took{}:
      True{}
    case Refused{w}:
      False{}

def Del.refused_as(o: Last, w: Why) -> Bool:
  match o:
    case Took{}:
      False{}
    case Refused{x}:
      Del.same_why(x, w)

# The protocol edges of the transition commands (references/delivery.protocol.json).
def Del.red_edge(+p: Phase) -> Bool:
  Bool.or(Del.is_ready(p), Del.is_red(p))

def Del.green_edge(+p: Phase) -> Bool:
  Bool.or(Del.is_ready(p), Del.is_red(p))

def Del.stop_edge(+p: Phase, to: StopAt) -> Bool:
  match to:
    case StopDecision{}:
      Bool.not(Bool.or(Del.is_decision(p), Del.is_fail(p)))
    case StopFail{}:
      Bool.not(Del.is_fail(p))

# A REVIEW_VERIFIED claim with a hold open, or a PARTIAL_VERIFIED claim with none, is refused before the state is read.
def Del.holds_mismatch(to: Target, holds: Bool) -> Bool:
  match to:
    case ToVerified{}:
      holds
    case ToPartial{}:
      Bool.not(holds)

# Edits are the environment before any GREEN, in the states where work happens.
def Del.editable(+p: Phase, greened: Bool) -> Bool:
  Bool.and(Bool.not(greened), Bool.or(Del.is_ready(p), Bool.or(Del.is_red(p), Del.is_decision(p))))

# ---- the decision: the first refusal the CLI reports, else Took
def Del.refuse(c: Bool, w: Why, rest: Last) -> Last:
  match c:
    case True{}:
      Refused{w}
    case False{}:
      rest

# A refresh (VALID_RED → VALID_RED) binds changed tests: it needs test bytes changed since the last VALID_RED and a
# harness spend left, then a fresh failing run. A VALID_RED from ORACLE_READY needs production as init left it, then a
# fresh failing run.
def Del.red_guard(refresh: Bool, touched: Bool, dirty: Bool, n: Spent, +r: Run) -> Last:
  match refresh:
    case True{}:
      Del.refuse(Bool.not(dirty), NotAllowed{}, Del.refuse(Del.is_full(n), Exhausted{}, Del.refuse(Bool.not(Del.failed(r)), NotRed{}, Del.refuse(Bool.not(Del.fresh(r)), Stale{}, Took{}))))
    case False{}:
      Del.refuse(touched, ProdTouched{}, Del.refuse(Bool.not(Del.failed(r)), NotRed{}, Del.refuse(Bool.not(Del.fresh(r)), Stale{}, Took{})))

def Del.red_last(+p: Phase, touched: Bool, +r: Run, dirty: Bool, n: Spent) -> Last:
  Del.refuse(Bool.not(Del.red_edge(p)), NotAllowed{}, Del.refuse(Bool.not(Del.has_run(r)), RunMissing{}, Del.red_guard(Del.is_red(p), touched, dirty, n, r)))

# Tests changed after the binding: GREEN asks for a fresh RED to bind them. At VALID_RED that RED is a refresh, so GREEN
# says now when no harness spend is left for it.
def Del.drift_last(p: Phase, n: Spent) -> Last:
  Del.refuse(Bool.and(Del.is_red(p), Del.is_full(n)), Exhausted{}, Refused{EvidenceStale{}})

def Del.bound_tests(drifted: Bool, p: Phase, n: Spent, rest: Last) -> Last:
  match drifted:
    case True{}:
      Del.drift_last(p, n)
    case False{}:
      rest

def Del.green_last(+p: Phase, red: Bool, touched: Bool, +r: Run, dirty: Bool, n: Spent) -> Last:
  Del.refuse(Bool.not(Del.green_edge(p)), NotAllowed{}, Del.refuse(Bool.not(Del.has_run(r)), RunMissing{}, Del.refuse(Bool.not(Del.passed(r)), NotGreen{}, Del.refuse(Bool.not(Del.fresh(r)), Stale{}, Del.bound_tests(Bool.and(red, dirty), p, n, Del.refuse(Bool.and(Del.is_ready(p), touched), ProdTouched{}, Del.refuse(Bool.not(Del.since(r)), Flaky{}, Took{})))))))

def Del.packet_last(k: Packet) -> Last:
  match k:
    case NoPacket{}:
      Refused{PacketMissing{}}
    case Unbound{}:
      Refused{ReceiptMissing{}}
    case Bound{}:
      Took{}

def Del.review_last(+p: Phase, +r: Run, to: Target, holds: Bool) -> Last:
  Del.refuse(Del.holds_mismatch(to, holds), HoldsMismatch{}, Del.refuse(Bool.not(Del.is_green(p)), NotAllowed{}, Del.refuse(Bool.not(Del.has_run(r)), RunMissing{}, Del.refuse(Bool.not(Del.passed(r)), NotGreen{}, Del.refuse(Bool.not(Del.fresh(r)), Stale{}, Del.refuse(Bool.not(Del.since(r)), Rerun{}, Del.packet_last(Del.packet_of(p))))))))

def Del.attest_last(p: Phase) -> Last:
  match p:
    case AtGreen{k}:
      match k:
        case NoPacket{}:
          Refused{PacketMissing{}}
        case _:
          Took{}
    case _:
      Refused{WrongState{}}

# A resume needs the policy spend left, then a run to cite.
def Del.decide(s: Del, m: Msg) -> Last:
  match s:
    case Del{+p, +red, +touched, +r, +dirty, +h, +v, g}:
      match m:
        case Exec{pass}:
          Took{}
        case EditProd{}:
          Took{}
        case EditTest{}:
          Took{}
        case MarkRed{}:
          Del.red_last(p, touched, r, dirty, h)
        case MarkGreen{}:
          Del.green_last(p, red, touched, r, dirty, h)
        case Review{to, holds}:
          Del.review_last(p, r, to, holds)
        case MakePacket{}:
          Del.refuse(Bool.not(Del.is_green(p)), WrongState{}, Took{})
        case Attest{}:
          Del.attest_last(p)
        case Stop{to, reason}:
          Del.refuse(Bool.not(Del.stop_edge(p, to)), NotAllowed{}, Del.refuse(Bool.not(reason), NoReason{}, Took{}))
        case Resume{}:
          Del.refuse(Bool.not(Del.is_decision(p)), NotAllowed{}, Del.refuse(Del.is_full(v), Exhausted{}, Del.refuse(Bool.not(Del.has_run(r)), RunMissing{}, Took{})))

# ---- the effect of an accepted command
def Del.stale(r: Run) -> Run:
  match r:
    case NoRun{}:
      NoRun{}
    case Ran{p, f, s}:
      Ran{p, False{}, s}

# A transition entry is a new gate baseline: the latest run came before it.
def Del.rebased(r: Run) -> Run:
  match r:
    case NoRun{}:
      NoRun{}
    case Ran{p, f, s}:
      Ran{p, f, False{}}

def Del.with_since(r: Run, v: Bool) -> Run:
  match r:
    case NoRun{}:
      NoRun{}
    case Ran{p, f, s}:
      Ran{p, f, v}

# At NEEDS_DECISION `since` is what ORACLE_READY sees after a resume. Without a VALID_RED the resume is the new
# baseline, so nothing before it counts; with one the baseline stays that VALID_RED, which every run after a GREEN
# entry follows.
def Del.decision_since(+p: Phase, red: Bool, +r: Run) -> Run:
  match red:
    case False{}:
      Del.with_since(r, False{})
    case True{}:
      Del.with_since(r, Bool.or(Del.since(r), Bool.or(Del.is_green(p), Del.reviewed(p))))

def Del.exec_since(+p: Phase, red: Bool) -> Bool:
  match p:
    case AtDecision{}:
      red
    case _:
      True{}

def Del.bump(n: Spent) -> Spent:
  match n:
    case Spent0{}:
      Spent1{}
    case Spent1{}:
      Spent2{}
    case Spent2{}:
      Spent2{}

# A refresh spends one harness change; a VALID_RED from ORACLE_READY spends nothing.
def Del.refresh_spend(+p: Phase, n: Spent) -> Spent:
  match p:
    case AtRed{}:
      Del.bump(n)
    case _:
      n

def Del.verdict(to: Target) -> Phase:
  match to:
    case ToVerified{}:
      AtVerified{}
    case ToPartial{}:
      AtPartial{}

def Del.stopped(to: StopAt) -> Phase:
  match to:
    case StopDecision{}:
      AtDecision{}
    case StopFail{}:
      AtFail{}

def Del.stop_run(+p: Phase, red: Bool, +r: Run, to: StopAt) -> Run:
  match to:
    case StopDecision{}:
      Del.decision_since(p, red, r)
    case StopFail{}:
      r

def Del.apply(s: Del, m: Msg) -> Del:
  match s:
    case Del{+p, +red, +touched, +r, +dirty, +h, +v, +g}:
      match m:
        case Exec{pass}:
          Del{p, red, touched, Ran{pass, True{}, Del.exec_since(p, red)}, dirty, h, v, g}
        case EditProd{}:
          Del{p, red, True{}, Del.stale(r), dirty, h, v, g}
        case EditTest{}:
          Del{p, red, touched, Del.stale(r), True{}, h, v, g}
        case MarkRed{}:
          Del{AtRed{}, True{}, touched, Del.rebased(r), False{}, Del.refresh_spend(p, h), v, g}
        case MarkGreen{}:
          Del{AtGreen{NoPacket{}}, red, touched, Del.rebased(r), dirty, h, v, True{}}
        case Review{to, holds}:
          Del{Del.verdict(to), red, touched, r, dirty, h, v, g}
        case MakePacket{}:
          Del{AtGreen{Unbound{}}, red, touched, r, dirty, h, v, g}
        case Attest{}:
          Del{AtGreen{Bound{}}, red, touched, r, dirty, h, v, g}
        case Stop{+to, reason}:
          Del{Del.stopped(to), red, touched, Del.stop_run(p, red, r, to), dirty, h, v, g}
        case Resume{}:
          Del{AtReady{}, red, touched, r, dirty, h, Del.bump(v), g}

def Del.settle(o: Last, s: Del, m: Msg) -> Del:
  match o:
    case Took{}:
      Del.apply(s, m)
    case Refused{w}:
      s

def Del.step(+s: Del, +m: Msg) -> Del:
  Del.settle(Del.decide(s, m), s, m)

def Del.observe(s: Del) -> Del:
  s

def Del.run_all(ms: List<Msg>, s: Del) -> Del:
  match ms:
    case Nil{}:
      s
    case Con{m, rest}:
      Del.run_all(rest, Del.step(s, m))

def Del.commands() -> List<Msg>:
  [Exec{True{}}, Exec{False{}}, MarkRed{}, MarkGreen{}, Review{ToVerified{}, False{}}, Review{ToVerified{}, True{}}, Review{ToPartial{}, False{}}, Review{ToPartial{}, True{}}, MakePacket{}, Attest{}, Stop{StopDecision{}, True{}}, Stop{StopDecision{}, False{}}, Stop{StopFail{}, True{}}, Stop{StopFail{}, False{}}, Resume{}]

def Del.with_edits(e: Bool) -> List<Msg>:
  match e:
    case True{}:
      [EditProd{}, EditTest{}, Exec{True{}}, Exec{False{}}, MarkRed{}, MarkGreen{}, Review{ToVerified{}, False{}}, Review{ToVerified{}, True{}}, Review{ToPartial{}, False{}}, Review{ToPartial{}, True{}}, MakePacket{}, Attest{}, Stop{StopDecision{}, True{}}, Stop{StopDecision{}, False{}}, Stop{StopFail{}, True{}}, Stop{StopFail{}, False{}}, Resume{}]
    case False{}:
      Del.commands()

# Environment: every command at any time; file edits only where `editable` allows them.
def Del.enabled(s: Del) -> List<Msg>:
  match s:
    case Del{+p, r, t, n, d, h, v, g}:
      Del.with_edits(Del.editable(p, g))

def Del.next(h: List<Msg>) -> List<Msg>:
  Del.enabled(Del.run_all(h, Del.init()))

# ---- the phase line: the command `status --brief` names next (deliveryPhaseLine)
type Hint is Data:
  HintRed{}
  HintGreen{}
  HintExec{}
  HintClose{}
  HintGuide{}
  HintReport{}

# The phase's own command (`red`, `green`, `close`) unless its guard refuses it on the state: production touched
# before VALID_RED names `guide`; test bytes changed after VALID_RED name a fresh `red` while a harness spend is left,
# else `guide`; at IMPLEMENTED_GREEN without a fresh passing run after the GREEN entry, `exec`.
def Del.ready_hint(touched: Bool) -> Hint:
  match touched:
    case True{}:
      HintGuide{}
    case False{}:
      HintRed{}

def Del.drift_hint(full: Bool) -> Hint:
  match full:
    case True{}:
      HintGuide{}
    case False{}:
      HintRed{}

def Del.red_hint(dirty: Bool, full: Bool) -> Hint:
  match dirty:
    case True{}:
      Del.drift_hint(full)
    case False{}:
      HintGreen{}

def Del.close_hint(ready: Bool) -> Hint:
  match ready:
    case True{}:
      HintClose{}
    case False{}:
      HintExec{}

def Del.hint(s: Del) -> Hint:
  match s:
    case Del{p, red, touched, +r, dirty, h, v, g}:
      match p:
        case AtReady{}:
          Del.ready_hint(touched)
        case AtRed{}:
          Del.red_hint(dirty, Del.is_full(h))
        case AtGreen{k}:
          Del.close_hint(Bool.and(Del.passed(r), Bool.and(Del.fresh(r), Del.since(r))))
        case _:
          HintReport{}

# The events a command runs in one call: `red` and `green` run the tests (failing, passing) and record the transition.
def Del.after_exec(+s: Del, pass: Bool, m: Msg) -> Bool:
  Del.took(Del.decide(Del.step(s, Exec{pass}), m))

# `close` makes the packet, binds the receipt of a clear review and records REVIEW_VERIFIED (no hold is open).
def Del.close_takes(+s: Del) -> Bool:
  Bool.and(Del.took(Del.decide(s, MakePacket{})), Bool.and(Del.took(Del.decide(Del.step(s, MakePacket{}), Attest{})), Del.took(Del.decide(Del.run_all([MakePacket{}, Attest{}], s), Review{ToVerified{}, False{}}))))

# The named command is accepted there. `guide` reads the state and is named only where neither `red` nor `green`
# would be accepted; `close --check-report` reads it in the closed states.
def Del.hint_accepted_as(h: Hint, +s: Del) -> Bool:
  match h:
    case HintRed{}:
      Del.after_exec(s, False{}, MarkRed{})
    case HintGreen{}:
      Del.after_exec(s, True{}, MarkGreen{})
    case HintExec{}:
      Del.took(Del.decide(s, Exec{True{}}))
    case HintClose{}:
      Del.close_takes(s)
    case HintGuide{}:
      Bool.not(Bool.or(Del.after_exec(s, False{}, MarkRed{}), Del.after_exec(s, True{}, MarkGreen{})))
    case HintReport{}:
      Bool.or(Del.reviewed(Del.at(s)), Bool.or(Del.is_decision(Del.at(s)), Del.is_fail(Del.at(s))))

def Del.hint_accepted(+s: Del) -> Bool:
  Del.hint_accepted_as(Del.hint(s), s)

# ---- vocabulary of the laws
def Del.is_mark_red(m: Msg) -> Bool:
  match m:
    case MarkRed{}:
      True{}
    case _:
      False{}

def Del.is_mark_green(m: Msg) -> Bool:
  match m:
    case MarkGreen{}:
      True{}
    case _:
      False{}

def Del.is_review(m: Msg) -> Bool:
  match m:
    case Review{to, holds}:
      True{}
    case _:
      False{}

def Del.claims_holds(m: Msg) -> Bool:
  match m:
    case Review{to, holds}:
      holds
    case _:
      False{}

def Del.is_resume(m: Msg) -> Bool:
  match m:
    case Resume{}:
      True{}
    case _:
      False{}

def Del.is_packet(m: Msg) -> Bool:
  match m:
    case MakePacket{}:
      True{}
    case _:
      False{}

def Del.is_attest(m: Msg) -> Bool:
  match m:
    case Attest{}:
      True{}
    case _:
      False{}

def Del.is_edit(m: Msg) -> Bool:
  match m:
    case EditProd{}:
      True{}
    case EditTest{}:
      True{}
    case _:
      False{}

def Del.is_exec(m: Msg) -> Bool:
  match m:
    case Exec{pass}:
      True{}
    case _:
      False{}

# The commands that write a transition entry.
def Del.is_transition(+m: Msg) -> Bool:
  match m:
    case MarkRed{}:
      True{}
    case MarkGreen{}:
      True{}
    case Review{to, holds}:
      True{}
    case Stop{to, reason}:
      True{}
    case Resume{}:
      True{}
    case _:
      False{}

def Del.is_fail_stop(m: Msg) -> Bool:
  match m:
    case Stop{to, reason}:
      match to:
        case StopFail{}:
          reason
        case StopDecision{}:
          False{}
    case _:
      False{}

def Del.is_decision_stop(m: Msg) -> Bool:
  match m:
    case Stop{to, reason}:
      match to:
        case StopDecision{}:
          reason
        case StopFail{}:
          False{}
    case _:
      False{}

# A VALID_RED refresh: VALID_RED again from VALID_RED.
def Del.is_refresh(+s: Del, m: Msg) -> Bool:
  Bool.and(Del.is_mark_red(m), Del.is_red(Del.at(s)))

# The back edges: a resume and a VALID_RED refresh.
def Del.back_edge(+s: Del, +m: Msg) -> Bool:
  Bool.or(Del.is_resume(m), Del.is_refresh(s, m))

# A count that never decreases, grows by at most one, and changes only when `by` holds.
def Del.counts_up(+a: Nat, +b: Nat, by: Bool) -> Bool:
  Bool.and(Nat.is_le(a, b), Bool.and(Nat.is_le(b, Nat.add(a, 1n)), Del.imp(Bool.not(Nat.is_eq(a, b)), by)))

# What the back edges consume: one harness spend per refresh, one policy spend per resume.
def Del.credit(+s: Del) -> Nat:
  Nat.add(Nat.sub(2n, Del.spent(s)), Nat.sub(2n, Del.resumes(s)))

# ---- the laws: Q(s, m, t, o) with t = step(s, m) and o = decide(s, m)
# Q_refused_keeps: a refused command changes nothing (frame)
def Del.Q_refused_keeps(+s: Del, m: Msg, +t: Del, +o: Last) -> Bool:
  Del.imp(Bool.not(Del.took(o)), Del.same(s, t))

# Q_fail_absorbs: no command leaves FAIL
def Del.Q_fail_absorbs(+s: Del, m: Msg, +t: Del, o: Last) -> Bool:
  Del.imp(Del.is_fail(Del.at(s)), Del.is_fail(Del.at(t)))

# Q_fail_refuses_transitions: every transition command is refused at FAIL
def Del.Q_fail_refuses_transitions(+s: Del, +m: Msg, t: Del, +o: Last) -> Bool:
  Del.imp(Bool.and(Del.is_fail(Del.at(s)), Del.is_transition(m)), Bool.not(Del.took(o)))

# Q_fail_always_open: from every other state a FAIL with a reason is accepted, so no state deadlocks
def Del.Q_fail_always_open(+s: Del, +m: Msg, +t: Del, +o: Last) -> Bool:
  Del.imp(Bool.and(Bool.not(Del.is_fail(Del.at(s))), Del.is_fail_stop(m)), Bool.and(Del.took(o), Del.is_fail(Del.at(t))))

# Q_decision_open: NEEDS_DECISION with a reason is accepted from every state before it
def Del.Q_decision_open(+s: Del, +m: Msg, +t: Del, +o: Last) -> Bool:
  Del.imp(Bool.and(Del.stop_edge(Del.at(s), StopDecision{}), Del.is_decision_stop(m)), Bool.and(Del.took(o), Del.is_decision(Del.at(t))))

# Q_red_needs_fresh_failure: VALID_RED is recorded only on a failing run with the worktree unchanged since it
def Del.Q_red_needs_fresh_failure(+s: Del, +m: Msg, t: Del, +o: Last) -> Bool:
  Del.imp(Bool.and(Del.took(o), Del.is_mark_red(m)), Bool.and(Del.failed(Del.run(s)), Del.fresh(Del.run(s))))

# Q_red_needs_untouched_production: the first VALID_RED of an ORACLE_READY needs production as init left it
def Del.Q_red_needs_untouched_production(+s: Del, +m: Msg, t: Del, +o: Last) -> Bool:
  Del.imp(Bool.and(Del.took(o), Bool.and(Del.is_mark_red(m), Del.is_ready(Del.at(s)))), Bool.not(Del.touched(s)))

# Q_refresh_needs_change: refreshing VALID_RED needs test bytes changed since the last VALID_RED
def Del.Q_refresh_needs_change(+s: Del, +m: Msg, t: Del, +o: Last) -> Bool:
  Del.imp(Bool.and(Del.took(o), Del.is_refresh(s, m)), Del.dirty(s))

# Q_red_entry: only a VALID_RED transition enters VALID_RED, and it binds the tests
def Del.Q_red_entry(+s: Del, +m: Msg, +t: Del, +o: Last) -> Bool:
  Bool.and(Del.imp(Bool.and(Del.is_red(Del.at(t)), Bool.not(Del.is_red(Del.at(s)))), Del.is_mark_red(m)), Del.imp(Bool.and(Del.took(o), Del.is_mark_red(m)), Bool.and(Bool.not(Del.dirty(t)), Del.red(t))))

# Q_green_needs_fresh_pass: IMPLEMENTED_GREEN needs a passing run, fresh, after the gate baseline
def Del.Q_green_needs_fresh_pass(+s: Del, +m: Msg, t: Del, +o: Last) -> Bool:
  Del.imp(Bool.and(Del.took(o), Del.is_mark_green(m)), Bool.and(Del.passed(Del.run(s)), Bool.and(Del.fresh(Del.run(s)), Del.since(Del.run(s)))))

# Q_green_skip_untouched: skipping VALID_RED needs production as init left it
def Del.Q_green_skip_untouched(+s: Del, +m: Msg, t: Del, +o: Last) -> Bool:
  Del.imp(Bool.and(Del.took(o), Bool.and(Del.is_mark_green(m), Del.is_ready(Del.at(s)))), Bool.not(Del.touched(s)))

# Q_green_keeps_binding: after a VALID_RED, GREEN needs the test bytes that VALID_RED bound
def Del.Q_green_keeps_binding(+s: Del, +m: Msg, t: Del, +o: Last) -> Bool:
  Del.imp(Bool.and(Del.took(o), Bool.and(Del.is_mark_green(m), Del.red(s))), Bool.not(Del.dirty(s)))

# Q_review_needs_receipt: REVIEW_VERIFIED and PARTIAL_VERIFIED need a receipt bound to the current packet and a fresh
# passing rerun after GREEN
def Del.Q_review_needs_receipt(+s: Del, +m: Msg, t: Del, +o: Last) -> Bool:
  Del.imp(Bool.and(Del.took(o), Del.is_review(m)), Bool.and(Del.is_bound(Del.packet_of(Del.at(s))), Bool.and(Del.passed(Del.run(s)), Bool.and(Del.fresh(Del.run(s)), Del.since(Del.run(s))))))

# Q_review_entry: only a review transition enters REVIEW_VERIFIED or PARTIAL_VERIFIED, and PARTIAL exactly when a hold is open
def Del.Q_review_entry(+s: Del, +m: Msg, +t: Del, +o: Last) -> Bool:
  Bool.and(Del.imp(Bool.and(Del.reviewed(Del.at(t)), Bool.not(Del.reviewed(Del.at(s)))), Del.is_review(m)), Del.imp(Bool.and(Del.took(o), Del.is_review(m)), Del.iff(Del.is_partial(Del.at(t)), Del.claims_holds(m))))

# Q_packet_rebinds: a packet or receipt exists only at IMPLEMENTED_GREEN; a new packet has no receipt, a receipt binds the latest
def Del.Q_packet_rebinds(+s: Del, +m: Msg, +t: Del, +o: Last) -> Bool:
  Bool.and(Del.imp(Bool.and(Del.took(o), Bool.or(Del.is_packet(m), Del.is_attest(m))), Del.is_green(Del.at(s))), Bool.and(Del.imp(Bool.and(Del.took(o), Del.is_packet(m)), Del.is_unbound(Del.packet_of(Del.at(t)))), Del.imp(Bool.and(Del.took(o), Del.is_attest(m)), Del.is_bound(Del.packet_of(Del.at(t))))))

# Q_budget_monotone: each spent count never decreases and grows by at most one: the harness count only on an accepted
# VALID_RED refresh, the policy count only on an accepted resume
def Del.Q_budget_monotone(+s: Del, +m: Msg, +t: Del, +o: Last) -> Bool:
  Bool.and(Del.counts_up(Del.spent(s), Del.spent(t), Bool.and(Del.took(o), Del.is_refresh(s, m))), Del.counts_up(Del.resumes(s), Del.resumes(t), Bool.and(Del.took(o), Del.is_resume(m))))

# Q_budget_exhausted: a refresh with changed tests at the harness limit, and a resume at the policy limit, are refused
# as exhausted
def Del.Q_budget_exhausted(+s: Del, +m: Msg, t: Del, +o: Last) -> Bool:
  Bool.and(Del.imp(Bool.and(Del.is_refresh(s, m), Bool.and(Del.dirty(s), Bool.and(Del.has_run(Del.run(s)), Nat.is_eq(Del.spent(s), 2n)))), Del.refused_as(o, Exhausted{})), Del.imp(Bool.and(Del.is_resume(m), Bool.and(Del.is_decision(Del.at(s)), Nat.is_eq(Del.resumes(s), 2n))), Del.refused_as(o, Exhausted{})))

# Q_history_kept: a VALID_RED, a GREEN and a production change, once recorded, stay recorded
def Del.Q_history_kept(+s: Del, m: Msg, +t: Del, o: Last) -> Bool:
  Bool.and(Del.imp(Del.red(s), Del.red(t)), Bool.and(Del.imp(Del.greened(s), Del.greened(t)), Del.imp(Del.touched(s), Del.touched(t))))

# Q_forward: an accepted transition other than a resume either keeps the phase rank (a VALID_RED refresh) or raises it
def Del.Q_forward(+s: Del, +m: Msg, +t: Del, +o: Last) -> Bool:
  Del.imp(Bool.and(Del.took(o), Bool.and(Del.is_transition(m), Bool.and(Bool.not(Del.is_resume(m)), Bool.not(Nat.is_eq(Del.rank(Del.at(s)), Del.rank(Del.at(t))))))), Nat.is_lt(Del.rank(Del.at(s)), Del.rank(Del.at(t))))

# Q_back_edges_bounded: no command raises the credit, and an accepted refresh or resume lowers it, so refreshes and the
# NEEDS_DECISION → ORACLE_READY → VALID_RED cycle are finite
def Del.Q_back_edges_bounded(+s: Del, +m: Msg, +t: Del, +o: Last) -> Bool:
  Bool.and(Nat.is_le(Del.credit(t), Del.credit(s)), Del.imp(Bool.and(Del.took(o), Del.back_edge(s, m)), Nat.is_lt(Del.credit(t), Del.credit(s))))

# Q_back_edges_keep: a resume or a refresh never changes recorded history
def Del.Q_back_edges_keep(+s: Del, +m: Msg, +t: Del, +o: Last) -> Bool:
  Del.imp(Bool.and(Del.took(o), Del.back_edge(s, m)), Bool.and(Del.same_bool(Del.touched(s), Del.touched(t)), Del.same_bool(Del.greened(s), Del.greened(t))))

# Q_resume_only_decision: ORACLE_READY is re-entered only from NEEDS_DECISION
def Del.Q_resume_only_decision(+s: Del, +m: Msg, +t: Del, +o: Last) -> Bool:
  Del.imp(Bool.and(Del.is_ready(Del.at(t)), Bool.not(Del.is_ready(Del.at(s)))), Bool.and(Del.is_resume(m), Del.is_decision(Del.at(s))))

# Q_edits_stale_runs: a file edit makes the latest run stale; a run is fresh when it is recorded
def Del.Q_edits_stale_runs(+s: Del, +m: Msg, +t: Del, o: Last) -> Bool:
  Bool.and(Del.imp(Del.is_edit(m), Bool.not(Del.fresh(Del.run(t)))), Del.imp(Del.is_exec(m), Del.fresh(Del.run(t))))

def Del.cell_with(+s: Del, +m: Msg, +t: Del, +o: Last) -> Bool:
  Bool.and(Del.Q_refused_keeps(s, m, t, o), Bool.and(Del.Q_fail_absorbs(s, m, t, o), Bool.and(Del.Q_fail_refuses_transitions(s, m, t, o), Bool.and(Del.Q_fail_always_open(s, m, t, o), Bool.and(Del.Q_decision_open(s, m, t, o), Bool.and(Del.Q_red_needs_fresh_failure(s, m, t, o), Bool.and(Del.Q_red_needs_untouched_production(s, m, t, o), Bool.and(Del.Q_refresh_needs_change(s, m, t, o), Bool.and(Del.Q_red_entry(s, m, t, o), Bool.and(Del.Q_green_needs_fresh_pass(s, m, t, o), Bool.and(Del.Q_green_skip_untouched(s, m, t, o), Bool.and(Del.Q_green_keeps_binding(s, m, t, o), Bool.and(Del.Q_review_needs_receipt(s, m, t, o), Bool.and(Del.Q_review_entry(s, m, t, o), Bool.and(Del.Q_packet_rebinds(s, m, t, o), Bool.and(Del.Q_budget_monotone(s, m, t, o), Bool.and(Del.Q_budget_exhausted(s, m, t, o), Bool.and(Del.Q_history_kept(s, m, t, o), Bool.and(Del.Q_forward(s, m, t, o), Bool.and(Del.Q_back_edges_bounded(s, m, t, o), Bool.and(Del.Q_back_edges_keep(s, m, t, o), Bool.and(Del.Q_resume_only_decision(s, m, t, o), Del.Q_edits_stale_runs(s, m, t, o)))))))))))))))))))))))

def Del.cell_ok(+s: Del, +m: Msg) -> Bool:
  Del.cell_with(s, m, Del.step(s, m), Del.decide(s, m))

def Del.all_ok(+s: Del, ms: List<Msg>) -> Bool:
  match ms:
    case Nil{}:
      True{}
    case Con{m, rest}:
      Bool.and(Del.cell_ok(s, m), Del.all_ok(s, rest))

# The every-trace safety def: in every state a trace reaches, every law holds for every command the environment
# allows, VALID_RED is recorded whenever the run is at it, and the phase line names a command accepted there.
# `oracle-model.mjs prove-reach --safe safe` proves it.
def Del.safe(+s: Del) -> Bool:
  Bool.and(Del.imp(Del.is_red(Del.at(s)), Del.red(s)), Bool.and(Del.hint_accepted(s), Del.all_ok(s, Del.enabled(s))))
