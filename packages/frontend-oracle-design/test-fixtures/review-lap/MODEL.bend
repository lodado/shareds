import Base

# Reference model for the Delivery review lap of `oracle-run.mjs`, from IMPLEMENTED_GREEN to a review verdict: the
# review round, the packet and receipt of the latest round, the class of the findings bound to it, and the review
# transitions. `decide` gives the outcome of a command (accepted, or refused with the reason the CLI reports first);
# `step` applies an accepted command and keeps the state on a refusal. The Delivery fixture models the run with one
# packet per GREEN visit and no rounds; this one starts at IMPLEMENTED_GREEN and models the rounds.
#
# State, as the guards see it:
# - at: IMPLEMENTED_GREEN, REVIEW_VERIFIED, PARTIAL_VERIFIED or NEEDS_DECISION.
# - round: the latest recorded review round (none, 1, 2). The type has no third value: the bound is the type, and the
#   laws say which command is refused instead of opening one.
# - current: the worktree is the revision of the latest round's packet.
# - bound: a reviewer receipt is bound to the latest round's packet.
# - blocked: the findings of that receipt block under its round's rule (round 1: any claim; round 2: a claim backed
#   as previous, regression or security; a note never). noted: they hold an improvement proposal.
# - prior: the round-1 findings the round-2 packet carries hold a blocking claim, so a round-2 `previous` claim can
#   cite it.
# - ran: a passing run came after the GREEN entry. fresh: the latest run is on the current bytes.
# - witnessed: the latest round's packet was made while a passing run on its bytes was in the ledger, which the
#   verifier needs before it reads the findings.
#
# Abstracted away: risk (Low: one reviewer, one passing run, no mutation or blind mapping), holds (none is open),
# lock and source drift, evidence rows, the closure, failing runs, budgets, and which line a finding cites: a
# finding states its class and whether the packet backs it, and the test turns that into a cited id, a line inside
# or outside a repair hunk, or a severity. Edits are the environment and happen only at IMPLEMENTED_GREEN.

type Stage is Data:
  AtGreen{}
  AtVerified{}
  AtPartial{}
  AtDecision{}

type Round is Data:
  R0{}
  R1{}
  R2{}

type Lap is Data:
  Lap{at: Stage, round: Round, current: Bool, bound: Bool, blocked: Bool, noted: Bool, prior: Bool, ran: Bool, fresh: Bool, witnessed: Bool}

# The class a round-2 finding claims: previous (cites a round-1 claim), regression (inside: the cited line lies in a
# repair hunk), security (backed: severity critical/high with a category), or none.
type Basis is Data:
  Previous{}
  Regression{inside: Bool}
  Security{backed: Bool}
  Plain{}

# A claim names the wrong implementation every locked test passes; a note names none, so it is a proposal in every
# round and never blocks.
type Find is Data:
  Clear{}
  Claim{kind: Basis}
  Note{}

type Target is Data:
  ToVerified{}
  ToPartial{}

# One refusal class per error code; the test maps each code to its class.
type Why is Data:
  WrongState{}
  PacketMissing{}
  Followup{}
  Closed{}
  NoHold{}
  NotAllowed{}
  Stale{}
  Rerun{}
  PacketStale{}
  ReceiptMissing{}
  Unwitnessed{}
  Blocking{}

type Last is Data:
  Took{}
  Refused{why: Why}

# Exec: a passing reported run of the required label. Edit: a repair changes a production file. Packet:
# `review-packet` (from round 1 on, with the latest round's findings). Attest: `review-receipt` binding findings to
# the latest packet. Review: `transition --to` REVIEW_VERIFIED or PARTIAL_VERIFIED citing the latest run, the latest
# packet and the latest findings. Stop: NEEDS_DECISION with a reason.
type Msg is Data:
  Exec{}
  Edit{}
  Packet{}
  Attest{find: Find}
  Review{to: Target}
  Stop{}

def Lap.init() -> Lap:
  Lap{AtGreen{}, R0{}, False{}, False{}, False{}, False{}, False{}, False{}, True{}, False{}}

# ---- names shared by the machine and the laws
def Lap.imp(a: Bool, b: Bool) -> Bool:
  Bool.or(Bool.not(a), b)

def Lap.iff(+a: Bool, +b: Bool) -> Bool:
  Bool.and(Lap.imp(a, b), Lap.imp(b, a))

def Lap.at(s: Lap) -> Stage:
  match s:
    case Lap{a, r, c, b, k, n, p, u, f, w}:
      a

def Lap.round(s: Lap) -> Round:
  match s:
    case Lap{a, r, c, b, k, n, p, u, f, w}:
      r

def Lap.current(s: Lap) -> Bool:
  match s:
    case Lap{a, r, c, b, k, n, p, u, f, w}:
      c

def Lap.bound(s: Lap) -> Bool:
  match s:
    case Lap{a, r, c, b, k, n, p, u, f, w}:
      b

def Lap.blocked(s: Lap) -> Bool:
  match s:
    case Lap{a, r, c, b, k, n, p, u, f, w}:
      k

def Lap.noted(s: Lap) -> Bool:
  match s:
    case Lap{a, r, c, b, k, n, p, u, f, w}:
      n

def Lap.prior(s: Lap) -> Bool:
  match s:
    case Lap{a, r, c, b, k, n, p, u, f, w}:
      p

def Lap.ran(s: Lap) -> Bool:
  match s:
    case Lap{a, r, c, b, k, n, p, u, f, w}:
      u

def Lap.fresh(s: Lap) -> Bool:
  match s:
    case Lap{a, r, c, b, k, n, p, u, f, w}:
      f

def Lap.witnessed(s: Lap) -> Bool:
  match s:
    case Lap{a, r, c, b, k, n, p, u, f, w}:
      w

def Lap.is_green(a: Stage) -> Bool:
  match a:
    case AtGreen{}:
      True{}
    case _:
      False{}

def Lap.is_verified(a: Stage) -> Bool:
  match a:
    case AtVerified{}:
      True{}
    case _:
      False{}

def Lap.is_partial(a: Stage) -> Bool:
  match a:
    case AtPartial{}:
      True{}
    case _:
      False{}

def Lap.is_decision(a: Stage) -> Bool:
  match a:
    case AtDecision{}:
      True{}
    case _:
      False{}

def Lap.rank(r: Round) -> Nat:
  match r:
    case R0{}:
      0n
    case R1{}:
      1n
    case R2{}:
      2n

def Lap.is_r0(r: Round) -> Bool:
  Nat.is_eq(Lap.rank(r), 0n)

def Lap.is_r2(r: Round) -> Bool:
  Nat.is_eq(Lap.rank(r), 2n)

def Lap.same_stage(a: Stage, b: Stage) -> Bool:
  match a b:
    case AtGreen{} AtGreen{}:
      True{}
    case AtVerified{} AtVerified{}:
      True{}
    case AtPartial{} AtPartial{}:
      True{}
    case AtDecision{} AtDecision{}:
      True{}
    case _ _:
      False{}

# Every field but noted.
def Lap.same_but_noted(+a: Lap, +b: Lap) -> Bool:
  Bool.and(Lap.same_stage(Lap.at(a), Lap.at(b)), Bool.and(Nat.is_eq(Lap.rank(Lap.round(a)), Lap.rank(Lap.round(b))), Bool.and(Lap.iff(Lap.current(a), Lap.current(b)), Bool.and(Lap.iff(Lap.bound(a), Lap.bound(b)), Bool.and(Lap.iff(Lap.blocked(a), Lap.blocked(b)), Bool.and(Lap.iff(Lap.prior(a), Lap.prior(b)), Bool.and(Lap.iff(Lap.ran(a), Lap.ran(b)), Bool.and(Lap.iff(Lap.fresh(a), Lap.fresh(b)), Lap.iff(Lap.witnessed(a), Lap.witnessed(b))))))))))

def Lap.same(+a: Lap, +b: Lap) -> Bool:
  Bool.and(Lap.same_but_noted(a, b), Lap.iff(Lap.noted(a), Lap.noted(b)))

def Lap.same_why(a: Why, b: Why) -> Bool:
  match a b:
    case WrongState{} WrongState{}:
      True{}
    case PacketMissing{} PacketMissing{}:
      True{}
    case Followup{} Followup{}:
      True{}
    case Closed{} Closed{}:
      True{}
    case NoHold{} NoHold{}:
      True{}
    case NotAllowed{} NotAllowed{}:
      True{}
    case Stale{} Stale{}:
      True{}
    case Rerun{} Rerun{}:
      True{}
    case PacketStale{} PacketStale{}:
      True{}
    case ReceiptMissing{} ReceiptMissing{}:
      True{}
    case Unwitnessed{} Unwitnessed{}:
      True{}
    case Blocking{} Blocking{}:
      True{}
    case _ _:
      False{}

def Lap.took(o: Last) -> Bool:
  match o:
    case Took{}:
      True{}
    case Refused{w}:
      False{}

def Lap.refused_as(o: Last, w: Why) -> Bool:
  match o:
    case Took{}:
      False{}
    case Refused{x}:
      Lap.same_why(x, w)

# ---- finding classes
# The packet backs a round-2 claim: a previous claim when round 1 raised one, a regression inside a repair hunk, a
# security claim with its severity and category. Nothing else blocks in round 2.
def Lap.backed(k: Basis, prior: Bool) -> Bool:
  match k:
    case Previous{}:
      prior
    case Regression{inside}:
      inside
    case Security{backed}:
      backed
    case Plain{}:
      False{}

def Lap.is_claim(f: Find) -> Bool:
  match f:
    case Claim{k}:
      True{}
    case _:
      False{}

def Lap.claim_blocks(r: Round, k: Basis, prior: Bool) -> Bool:
  match r:
    case R0{}:
      True{}
    case R1{}:
      True{}
    case R2{}:
      Lap.backed(k, prior)

# Round 1 blocks on every claim; round 2 only on a backed class; a note never.
def Lap.blocks(+r: Round, f: Find, prior: Bool) -> Bool:
  match f:
    case Claim{k}:
      Lap.claim_blocks(r, k, prior)
    case _:
      False{}

# A note, and a round-2 claim the packet does not back, is an improvement proposal.
def Lap.proposes(+r: Round, f: Find, prior: Bool) -> Bool:
  match f:
    case Clear{}:
      False{}
    case Claim{k}:
      Bool.and(Lap.is_r2(r), Bool.not(Lap.backed(k, prior)))
    case Note{}:
      True{}

def Lap.is_security_backed(f: Find) -> Bool:
  match f:
    case Claim{k}:
      match k:
        case Security{backed}:
          backed
        case _:
          False{}
    case _:
      False{}

# ---- the decision: the first refusal the CLI reports, else Took
def Lap.refuse(c: Bool, w: Why, rest: Last) -> Last:
  match c:
    case True{}:
      Refused{w}
    case False{}:
      rest

# The repair after the last round: round 2 is recorded and the worktree moved since its packet.
def Lap.after_last(+r: Round, c: Bool) -> Bool:
  Bool.and(Lap.is_r2(r), Bool.not(c))

# A packet on changed bytes: round 1 opens, round 2 opens only after a bound round-1 receipt, nothing opens after it.
def Lap.packet_moved(r: Round, b: Bool) -> Last:
  match r:
    case R0{}:
      Took{}
    case R1{}:
      Lap.refuse(Bool.not(b), Followup{}, Took{})
    case R2{}:
      Refused{Closed{}}

def Lap.packet_last(r: Round, c: Bool, b: Bool) -> Last:
  match c:
    case True{}:
      Took{}
    case False{}:
      Lap.packet_moved(r, b)

def Lap.is_to_partial(t: Target) -> Bool:
  match t:
    case ToPartial{}:
      True{}
    case ToVerified{}:
      False{}

# Without a hold, PARTIAL_VERIFIED closes only the repair after the last round; REVIEW_VERIFIED needs the latest
# packet on the current bytes and findings that do not block.
def Lap.review_last(+s: Lap, +t: Target) -> Last:
  Lap.refuse(Bool.and(Lap.is_to_partial(t), Bool.not(Lap.after_last(Lap.round(s), Lap.current(s)))), NoHold{}, Lap.refuse(Bool.not(Lap.is_green(Lap.at(s))), NotAllowed{}, Lap.refuse(Bool.not(Lap.fresh(s)), Stale{}, Lap.refuse(Bool.not(Lap.ran(s)), Rerun{}, Lap.refuse(Lap.is_r0(Lap.round(s)), PacketMissing{}, Lap.refuse(Bool.and(Bool.not(Lap.is_to_partial(t)), Bool.not(Lap.current(s))), PacketStale{}, Lap.refuse(Bool.not(Lap.bound(s)), ReceiptMissing{}, Lap.refuse(Bool.not(Lap.witnessed(s)), Unwitnessed{}, Lap.refuse(Bool.and(Bool.not(Lap.is_to_partial(t)), Lap.blocked(s)), Blocking{}, Took{})))))))))

def Lap.decide(+s: Lap, m: Msg) -> Last:
  match m:
    case Exec{}:
      Took{}
    case Edit{}:
      Took{}
    case Packet{}:
      Lap.refuse(Bool.not(Lap.is_green(Lap.at(s))), WrongState{}, Lap.packet_last(Lap.round(s), Lap.current(s), Lap.bound(s)))
    case Attest{f}:
      Lap.refuse(Bool.not(Lap.is_green(Lap.at(s))), WrongState{}, Lap.refuse(Lap.is_r0(Lap.round(s)), PacketMissing{}, Took{}))
    case Review{t}:
      Lap.review_last(s, t)
    case Stop{}:
      Lap.refuse(Lap.is_decision(Lap.at(s)), NotAllowed{}, Took{})

# ---- the effect of an accepted command
def Lap.next_round(r: Round) -> Round:
  match r:
    case R0{}:
      R1{}
    case R1{}:
      R2{}
    case R2{}:
      R2{}

def Lap.verdict(t: Target) -> Stage:
  match t:
    case ToVerified{}:
      AtVerified{}
    case ToPartial{}:
      AtPartial{}

# A packet on unchanged bytes re-emits the recorded round; on changed bytes it opens the next round, unbound, and
# the round-2 packet carries whether the round-1 findings raised a claim.
def Lap.packeted(+s: Lap) -> Lap:
  match s:
    case Lap{+a, +r, +c, +b, +k, +n, +p, +u, +f, +w}:
      match c:
        case True{}:
          Lap{a, r, c, b, k, n, p, u, f, w}
        case False{}:
          Lap{a, Lap.next_round(r), True{}, False{}, False{}, False{}, Bool.and(Lap.is_r2(Lap.next_round(r)), k), u, f, f}

def Lap.apply(+s: Lap, m: Msg) -> Lap:
  match s:
    case Lap{+a, +r, +c, +b, +k, +n, +p, +u, +f, +w}:
      match m:
        case Exec{}:
          Lap{a, r, c, b, k, n, p, True{}, True{}, w}
        case Edit{}:
          Lap{a, r, False{}, b, k, n, p, u, False{}, w}
        case Packet{}:
          Lap.packeted(Lap{a, r, c, b, k, n, p, u, f, w})
        case Attest{+x}:
          Lap{a, r, c, True{}, Lap.blocks(r, x, p), Lap.proposes(r, x, p), p, u, f, w}
        case Review{t}:
          Lap{Lap.verdict(t), r, c, b, k, n, p, u, f, w}
        case Stop{}:
          Lap{AtDecision{}, r, c, b, k, n, p, u, f, w}

def Lap.settle(o: Last, s: Lap, m: Msg) -> Lap:
  match o:
    case Took{}:
      Lap.apply(s, m)
    case Refused{w}:
      s

def Lap.step(+s: Lap, +m: Msg) -> Lap:
  Lap.settle(Lap.decide(s, m), s, m)

def Lap.run_all(ms: List<Msg>, s: Lap) -> Lap:
  match ms:
    case Nil{}:
      s
    case Con{m, rest}:
      Lap.run_all(rest, Lap.step(s, m))

def Lap.verdicts() -> List<Msg>:
  [Packet{}, Attest{Clear{}}, Attest{Claim{Previous{}}}, Attest{Claim{Regression{True{}}}}, Attest{Claim{Regression{False{}}}}, Attest{Claim{Security{True{}}}}, Attest{Claim{Security{False{}}}}, Attest{Claim{Plain{}}}, Attest{Note{}}, Review{ToVerified{}}, Review{ToPartial{}}, Stop{}]

def Lap.enabled_at(a: Stage) -> List<Msg>:
  match a:
    case AtGreen{}:
      Con{Exec{}, Con{Edit{}, Lap.verdicts()}}
    case _:
      Lap.verdicts()

# Environment: runs and edits only at IMPLEMENTED_GREEN; every other command at any time.
def Lap.enabled(s: Lap) -> List<Msg>:
  Lap.enabled_at(Lap.at(s))

# ---- vocabulary of the laws
def Lap.is_packet(m: Msg) -> Bool:
  match m:
    case Packet{}:
      True{}
    case _:
      False{}

def Lap.find_of(m: Msg) -> Find:
  match m:
    case Attest{f}:
      f
    case _:
      Clear{}

def Lap.is_attest(m: Msg) -> Bool:
  match m:
    case Attest{f}:
      True{}
    case _:
      False{}

def Lap.target_of(m: Msg) -> Target:
  match m:
    case Review{t}:
      t
    case _:
      ToVerified{}

def Lap.is_review(m: Msg) -> Bool:
  match m:
    case Review{t}:
      True{}
    case _:
      False{}

def Lap.is_stop(m: Msg) -> Bool:
  match m:
    case Stop{}:
      True{}
    case _:
      False{}

def Lap.is_verify(+m: Msg) -> Bool:
  Bool.and(Lap.is_review(m), Bool.not(Lap.is_to_partial(Lap.target_of(m))))

def Lap.is_partial_review(+m: Msg) -> Bool:
  Bool.and(Lap.is_review(m), Lap.is_to_partial(Lap.target_of(m)))

# ---- the laws: Q(s, m, t, o) with t = step(s, m) and o = decide(s, m)
# Q_refused_keeps: a refused command changes nothing (frame)
def Lap.Q_refused_keeps(+s: Lap, m: Msg, +t: Lap, +o: Last) -> Bool:
  Lap.imp(Bool.not(Lap.took(o)), Lap.same(s, t))

# Q_round_steps: only an accepted packet changes the round, by one
def Lap.Q_round_steps(+s: Lap, +m: Msg, +t: Lap, +o: Last) -> Bool:
  Bool.or(Nat.is_eq(Lap.rank(Lap.round(s)), Lap.rank(Lap.round(t))), Bool.and(Bool.and(Lap.took(o), Lap.is_packet(m)), Nat.is_eq(Nat.add(Lap.rank(Lap.round(s)), 1n), Lap.rank(Lap.round(t)))))

# Q_no_third_round: a packet on changed bytes after round 2 is refused as closed
def Lap.Q_no_third_round(+s: Lap, +m: Msg, t: Lap, +o: Last) -> Bool:
  Lap.imp(Bool.and(Lap.is_packet(m), Bool.and(Lap.is_green(Lap.at(s)), Lap.after_last(Lap.round(s), Lap.current(s)))), Lap.refused_as(o, Closed{}))

# Q_current_only_by_packet: only an accepted packet makes the worktree the latest packet's revision again
def Lap.Q_current_only_by_packet(+s: Lap, +m: Msg, +t: Lap, +o: Last) -> Bool:
  Lap.imp(Bool.and(Bool.not(Lap.current(s)), Lap.current(t)), Bool.and(Lap.took(o), Lap.is_packet(m)))

# Q_proposal_inert: a note, or a round-2 claim the packet does not back, ends exactly where a clear finding ends,
# except that it is noted as an improvement proposal; once accepted it never blocks
def Lap.Q_proposal_inert(+s: Lap, +m: Msg, +t: Lap, +o: Last) -> Bool:
  Lap.imp(Bool.and(Lap.is_attest(m), Lap.proposes(Lap.round(s), Lap.find_of(m), Lap.prior(s))), Bool.and(Lap.same_but_noted(t, Lap.step(s, Attest{Clear{}})), Lap.imp(Lap.took(o), Bool.not(Lap.blocked(t)))))

# Q_attest_classes: an accepted attest blocks exactly on its round's rule and notes exactly the proposals
def Lap.Q_attest_classes(+s: Lap, +m: Msg, +t: Lap, +o: Last) -> Bool:
  Lap.imp(Bool.and(Lap.took(o), Lap.is_attest(m)), Bool.and(Lap.iff(Lap.blocked(t), Lap.blocks(Lap.round(s), Lap.find_of(m), Lap.prior(s))), Lap.iff(Lap.noted(t), Lap.proposes(Lap.round(s), Lap.find_of(m), Lap.prior(s)))))

# Q_security_blocks: a backed security finding blocks in every round
def Lap.Q_security_blocks(+s: Lap, +m: Msg, +t: Lap, +o: Last) -> Bool:
  Lap.imp(Bool.and(Lap.took(o), Bool.and(Lap.is_attest(m), Lap.is_security_backed(Lap.find_of(m)))), Lap.blocked(t))

# Q_verified_fresh_clear: REVIEW_VERIFIED needs the latest packet on the current bytes and witnessed by a passing
# run, a receipt bound to it, findings that do not block, and a passing run after GREEN on the current bytes
def Lap.Q_verified_fresh_clear(+s: Lap, +m: Msg, t: Lap, +o: Last) -> Bool:
  Lap.imp(Bool.and(Lap.took(o), Lap.is_verify(m)), Bool.and(Lap.current(s), Bool.and(Lap.bound(s), Bool.and(Lap.witnessed(s), Bool.and(Bool.not(Lap.blocked(s)), Bool.and(Lap.ran(s), Lap.fresh(s)))))))

# Q_partial_unreviewed: with no hold, PARTIAL_VERIFIED is accepted only for the repair after round 2, with a receipt
# on the witnessed round-2 packet and a passing run on the repaired bytes
def Lap.Q_partial_unreviewed(+s: Lap, +m: Msg, t: Lap, +o: Last) -> Bool:
  Lap.imp(Bool.and(Lap.took(o), Lap.is_partial_review(m)), Bool.and(Lap.after_last(Lap.round(s), Lap.current(s)), Bool.and(Lap.bound(s), Bool.and(Lap.witnessed(s), Bool.and(Lap.ran(s), Lap.fresh(s))))))

# Q_review_entry: only a review transition enters REVIEW_VERIFIED or PARTIAL_VERIFIED
def Lap.Q_review_entry(+s: Lap, +m: Msg, +t: Lap, o: Last) -> Bool:
  Bool.and(Lap.imp(Bool.and(Lap.is_verified(Lap.at(t)), Bool.not(Lap.is_verified(Lap.at(s)))), Lap.is_verify(m)), Lap.imp(Bool.and(Lap.is_partial(Lap.at(t)), Bool.not(Lap.is_partial(Lap.at(s)))), Lap.is_partial_review(m)))

# Q_closed_refuses: after the lap closes, no packet, receipt or review is accepted
def Lap.Q_closed_refuses(+s: Lap, +m: Msg, t: Lap, +o: Last) -> Bool:
  Lap.imp(Bool.and(Bool.not(Lap.is_green(Lap.at(s))), Bool.or(Lap.is_packet(m), Bool.or(Lap.is_attest(m), Lap.is_review(m)))), Bool.not(Lap.took(o)))

# Q_stop_open: NEEDS_DECISION with a reason is accepted from every state before it, so the lap never deadlocks
def Lap.Q_stop_open(+s: Lap, +m: Msg, +t: Lap, +o: Last) -> Bool:
  Lap.imp(Bool.and(Lap.is_stop(m), Bool.not(Lap.is_decision(Lap.at(s)))), Bool.and(Lap.took(o), Lap.is_decision(Lap.at(t))))

def Lap.cell_with(+s: Lap, +m: Msg, +t: Lap, +o: Last) -> Bool:
  Bool.and(Lap.Q_refused_keeps(s, m, t, o), Bool.and(Lap.Q_round_steps(s, m, t, o), Bool.and(Lap.Q_no_third_round(s, m, t, o), Bool.and(Lap.Q_current_only_by_packet(s, m, t, o), Bool.and(Lap.Q_proposal_inert(s, m, t, o), Bool.and(Lap.Q_attest_classes(s, m, t, o), Bool.and(Lap.Q_security_blocks(s, m, t, o), Bool.and(Lap.Q_verified_fresh_clear(s, m, t, o), Bool.and(Lap.Q_partial_unreviewed(s, m, t, o), Bool.and(Lap.Q_review_entry(s, m, t, o), Bool.and(Lap.Q_closed_refuses(s, m, t, o), Lap.Q_stop_open(s, m, t, o))))))))))))

def Lap.cell_ok(+s: Lap, +m: Msg) -> Bool:
  Lap.cell_with(s, m, Lap.step(s, m), Lap.decide(s, m))

def Lap.all_ok(+s: Lap, ms: List<Msg>) -> Bool:
  match ms:
    case Nil{}:
      True{}
    case Con{m, rest}:
      Bool.and(Lap.cell_ok(s, m), Lap.all_ok(s, rest))

# Reached-state facts: a recorded round has a packet, so only round 0 has no current packet and nothing noted; prior
# is set only by the round-2 packet.
def Lap.shape(+s: Lap) -> Bool:
  Bool.and(Lap.imp(Lap.is_r0(Lap.round(s)), Bool.and(Bool.not(Lap.current(s)), Bool.and(Bool.not(Lap.bound(s)), Bool.not(Lap.noted(s))))), Lap.imp(Lap.prior(s), Lap.is_r2(Lap.round(s))))

# The every-trace safety def: in every state a trace reaches, every law holds for every command the environment
# allows. `oracle-model.mjs prove-reach --safe safe` proves it.
def Lap.safe(+s: Lap) -> Bool:
  Bool.and(Lap.shape(s), Lap.all_ok(s, Lap.enabled(s)))
