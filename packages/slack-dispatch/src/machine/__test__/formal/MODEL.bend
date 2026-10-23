import Base

# Reference model for the slack-dispatch item state machine. One item is one Slack thread in one repo; a
# request that names several repos becomes several items, and items never share state. Every event the
# outside world can send is an input here: untrusted senders, a card pressed twice, a button for a stage the
# item already left, a card or plan that a newer one replaced. The model never ignores one silently. Each
# event gets an outcome: it moves the item, it is accepted without moving it, or it is refused with a reason.
type Card is Data:
  Assign{}
  Plan{}

type Stage is Data:
  Ingested{}
  Notified{}
  Planning{}
  Planned{}
  Implementing{}
  PrOpen{}
  Merged{}
  Skipped{}
  Declined{}
  Failed{}

# owner: the sender is the configured owner. card: which DM card the button belongs to. fresh: that card is
# the latest one sent for the item. current: the plan answers the latest instruction. handled: someone else
# already took the thread. confident: routing picked one repo by rule. ci/review: merge gate inputs the system
# observed (Visual QA already passed before the PR was opened). allowed: retries are left in the budget.
type Msg is Data:
  Triage{handled: Bool, confident: Bool}
  Approve{owner: Bool, card: Card, fresh: Bool}
  Reject{owner: Bool}
  Revise{owner: Bool}
  PlanReady{current: Bool}
  Built{ok: Bool}
  Merge{owner: Bool, ci: Bool, review: Bool}
  Retry{owner: Bool, allowed: Bool}
  Abort{}

# Refusal reasons, in the order they are checked: NotOwner, Finished, WrongStage, Stale, GateNotMet.
type Reason is Data:
  NotOwner{}
  Finished{}
  WrongStage{}
  Stale{}
  GateNotMet{}

type Out is Data:
  GoTo{to: Stage}
  Stay{}
  Refuse{why: Reason}

# What the contract observes: the stage and how the last event ended.
type Last is Data:
  Began{}
  Moved{}
  Stayed{}
  Refused{why: Reason}

type ItemState is Data:
  Item{stage: Stage, last: Last}

def Dispatch.init() -> ItemState:
  Item{Ingested{}, Began{}}

def Dispatch.pick(c: Bool, t: Out, f: Out) -> Out:
  match c:
    case True{}:
      t
    case False{}:
      f

def Dispatch.all2(a: Bool, b: Bool) -> Bool:
  Bool.and(a, b)

# A human event from anyone but the owner is refused before the stage is even looked at.
def Dispatch.owner_gate(o: Bool, ok: Out) -> Out:
  match o:
    case True{}:
      ok
    case False{}:
      Refuse{NotOwner{}}

# An event the stage does not take: a finished item says so, every other stage is the wrong stage.
def Dispatch.refuse_stage(+s: Stage) -> Out:
  match s:
    case Merged{}:
      Refuse{Finished{}}
    case Skipped{}:
      Refuse{Finished{}}
    case Declined{}:
      Refuse{Finished{}}
    case _:
      Refuse{WrongStage{}}

def Dispatch.d_triage(+s: Stage, h: Bool, c: Bool) -> Out:
  match s:
    case Ingested{}:
      Dispatch.pick(h, GoTo{Skipped{}}, Dispatch.pick(c, GoTo{Planning{}}, GoTo{Notified{}}))
    case _:
      Dispatch.refuse_stage(s)

def Dispatch.d_approve(+s: Stage, card: Card, f: Bool) -> Out:
  match s card:
    case Notified{} Assign{}:
      Dispatch.pick(f, GoTo{Planning{}}, Refuse{Stale{}})
    case Planned{} Plan{}:
      Dispatch.pick(f, GoTo{Implementing{}}, Refuse{Stale{}})
    case _ _:
      Dispatch.refuse_stage(s)

def Dispatch.d_reject(+s: Stage) -> Out:
  match s:
    case Notified{}:
      GoTo{Declined{}}
    case Planning{}:
      GoTo{Declined{}}
    case Planned{}:
      GoTo{Declined{}}
    case Implementing{}:
      GoTo{Declined{}}
    case PrOpen{}:
      GoTo{Declined{}}
    case _:
      Dispatch.refuse_stage(s)

def Dispatch.d_revise(+s: Stage) -> Out:
  match s:
    case Planned{}:
      GoTo{Planning{}}
    case Planning{}:
      Stay{}
    case _:
      Dispatch.refuse_stage(s)

def Dispatch.d_plan_ready(+s: Stage, cur: Bool) -> Out:
  match s:
    case Planning{}:
      Dispatch.pick(cur, GoTo{Planned{}}, Refuse{Stale{}})
    case _:
      Dispatch.refuse_stage(s)

def Dispatch.d_built(+s: Stage, ok: Bool) -> Out:
  match s:
    case Implementing{}:
      Dispatch.pick(ok, GoTo{PrOpen{}}, GoTo{Failed{}})
    case _:
      Dispatch.refuse_stage(s)

def Dispatch.d_merge(+s: Stage, ready: Bool) -> Out:
  match s:
    case PrOpen{}:
      Dispatch.pick(ready, GoTo{Merged{}}, Refuse{GateNotMet{}})
    case _:
      Dispatch.refuse_stage(s)

def Dispatch.d_retry(+s: Stage, allowed: Bool) -> Out:
  match s:
    case Failed{}:
      Dispatch.pick(allowed, GoTo{Planning{}}, Refuse{GateNotMet{}})
    case _:
      Dispatch.refuse_stage(s)

def Dispatch.d_abort(+s: Stage) -> Out:
  match s:
    case Ingested{}:
      GoTo{Failed{}}
    case Notified{}:
      GoTo{Failed{}}
    case Planning{}:
      GoTo{Failed{}}
    case Planned{}:
      GoTo{Failed{}}
    case Implementing{}:
      GoTo{Failed{}}
    case PrOpen{}:
      GoTo{Failed{}}
    case _:
      Dispatch.refuse_stage(s)

def Dispatch.decide(+s: Stage, m: Msg) -> Out:
  match m:
    case Triage{h, c}:
      Dispatch.d_triage(s, h, c)
    case Approve{o, card, f}:
      Dispatch.owner_gate(o, Dispatch.d_approve(s, card, f))
    case Reject{o}:
      Dispatch.owner_gate(o, Dispatch.d_reject(s))
    case Revise{o}:
      Dispatch.owner_gate(o, Dispatch.d_revise(s))
    case PlanReady{cur}:
      Dispatch.d_plan_ready(s, cur)
    case Built{ok}:
      Dispatch.d_built(s, ok)
    case Merge{o, c, r}:
      Dispatch.owner_gate(o, Dispatch.d_merge(s, Dispatch.all2(c, r)))
    case Retry{o, al}:
      Dispatch.owner_gate(o, Dispatch.d_retry(s, al))
    case Abort{}:
      Dispatch.d_abort(s)

def Dispatch.next_stage(+s: Stage, o: Out) -> Stage:
  match o:
    case GoTo{t}:
      t
    case Stay{}:
      s
    case Refuse{w}:
      s

def Dispatch.last_of(o: Out) -> Last:
  match o:
    case GoTo{t}:
      Moved{}
    case Stay{}:
      Stayed{}
    case Refuse{w}:
      Refused{w}

def Dispatch.settle(+s: Stage, +o: Out) -> ItemState:
  Item{Dispatch.next_stage(s, o), Dispatch.last_of(o)}

def Dispatch.step(st: ItemState, m: Msg) -> ItemState:
  match st:
    case Item{+s, last}:
      Dispatch.settle(s, Dispatch.decide(s, m))

def Dispatch.observe(st: ItemState) -> ItemState:
  st

def Dispatch.stage_of(st: ItemState) -> Stage:
  match st:
    case Item{s, last}:
      s

def Dispatch.run(ms: List<Msg>, st: ItemState) -> ItemState:
  match ms:
    case Nil{}:
      st
    case Con{m, rest}:
      Dispatch.run(rest, Dispatch.step(st, m))

# Environment: every event may arrive at any time, in any order, any number of times, from anyone. The model,
# not the environment, decides what each one does.
def Dispatch.next(h: List<Msg>) -> List<Msg>:
  [Triage{True{}, True{}}, Triage{True{}, False{}}, Triage{False{}, True{}}, Triage{False{}, False{}}, Approve{True{}, Assign{}, True{}}, Approve{True{}, Assign{}, False{}}, Approve{True{}, Plan{}, True{}}, Approve{True{}, Plan{}, False{}}, Approve{False{}, Assign{}, True{}}, Approve{False{}, Assign{}, False{}}, Approve{False{}, Plan{}, True{}}, Approve{False{}, Plan{}, False{}}, Reject{True{}}, Reject{False{}}, Revise{True{}}, Revise{False{}}, PlanReady{True{}}, PlanReady{False{}}, Built{True{}}, Built{False{}}, Merge{True{}, True{}, True{}}, Merge{True{}, True{}, False{}}, Merge{True{}, False{}, True{}}, Merge{True{}, False{}, False{}}, Merge{False{}, True{}, True{}}, Merge{False{}, True{}, False{}}, Merge{False{}, False{}, True{}}, Merge{False{}, False{}, False{}}, Retry{True{}, True{}}, Retry{True{}, False{}}, Retry{False{}, True{}}, Retry{False{}, False{}}, Abort{}]

# ---- vocabulary of the laws
def Dispatch.imp(a: Bool, b: Bool) -> Bool:
  Bool.or(Bool.not(a), b)

def Dispatch.same(a: Stage, b: Stage) -> Bool:
  match a b:
    case Ingested{} Ingested{}:
      True{}
    case Notified{} Notified{}:
      True{}
    case Planning{} Planning{}:
      True{}
    case Planned{} Planned{}:
      True{}
    case Implementing{} Implementing{}:
      True{}
    case PrOpen{} PrOpen{}:
      True{}
    case Merged{} Merged{}:
      True{}
    case Skipped{} Skipped{}:
      True{}
    case Declined{} Declined{}:
      True{}
    case Failed{} Failed{}:
      True{}
    case _ _:
      False{}

def Dispatch.is_ingested(s: Stage) -> Bool:
  Dispatch.same(s, Ingested{})

def Dispatch.is_notified(s: Stage) -> Bool:
  Dispatch.same(s, Notified{})

def Dispatch.is_planning(s: Stage) -> Bool:
  Dispatch.same(s, Planning{})

def Dispatch.is_planned(s: Stage) -> Bool:
  Dispatch.same(s, Planned{})

def Dispatch.is_impl(s: Stage) -> Bool:
  Dispatch.same(s, Implementing{})

def Dispatch.is_propen(s: Stage) -> Bool:
  Dispatch.same(s, PrOpen{})

def Dispatch.is_merged(s: Stage) -> Bool:
  Dispatch.same(s, Merged{})

def Dispatch.is_skipped(s: Stage) -> Bool:
  Dispatch.same(s, Skipped{})

def Dispatch.is_declined(s: Stage) -> Bool:
  Dispatch.same(s, Declined{})

def Dispatch.is_failed(s: Stage) -> Bool:
  Dispatch.same(s, Failed{})

def Dispatch.is_final(+s: Stage) -> Bool:
  Bool.or(Dispatch.is_merged(s), Bool.or(Dispatch.is_skipped(s), Dispatch.is_declined(s)))

# Stages where the owner may still call the item off.
def Dispatch.is_cancellable(+s: Stage) -> Bool:
  Bool.or(Dispatch.is_notified(s), Bool.or(Dispatch.is_planning(s), Bool.or(Dispatch.is_planned(s), Bool.or(Dispatch.is_impl(s), Dispatch.is_propen(s)))))

def Dispatch.is_abortable(+s: Stage) -> Bool:
  Bool.or(Dispatch.is_ingested(s), Dispatch.is_cancellable(s))

# The legal edges of the graph: every move must be one of these.
def Dispatch.legal_edge(a: Stage, b: Stage) -> Bool:
  match a b:
    case Ingested{} Skipped{}:
      True{}
    case Ingested{} Planning{}:
      True{}
    case Ingested{} Notified{}:
      True{}
    case Ingested{} Failed{}:
      True{}
    case Notified{} Planning{}:
      True{}
    case Notified{} Declined{}:
      True{}
    case Notified{} Failed{}:
      True{}
    case Planning{} Planned{}:
      True{}
    case Planning{} Declined{}:
      True{}
    case Planning{} Failed{}:
      True{}
    case Planned{} Implementing{}:
      True{}
    case Planned{} Planning{}:
      True{}
    case Planned{} Declined{}:
      True{}
    case Planned{} Failed{}:
      True{}
    case Implementing{} PrOpen{}:
      True{}
    case Implementing{} Failed{}:
      True{}
    case Implementing{} Declined{}:
      True{}
    case PrOpen{} Merged{}:
      True{}
    case PrOpen{} Declined{}:
      True{}
    case PrOpen{} Failed{}:
      True{}
    case Failed{} Planning{}:
      True{}
    case _ _:
      False{}

# What each stage takes at all, whoever sends it. Anything else is the wrong stage.
def Dispatch.applicable(+a: Stage, m: Msg) -> Bool:
  match m:
    case Triage{h, c}:
      Dispatch.is_ingested(a)
    case Approve{o, Assign{}, f}:
      Dispatch.is_notified(a)
    case Approve{o, Plan{}, f}:
      Dispatch.is_planned(a)
    case Reject{o}:
      Dispatch.is_cancellable(a)
    case Revise{o}:
      Bool.or(Dispatch.is_planned(a), Dispatch.is_planning(a))
    case PlanReady{cur}:
      Dispatch.is_planning(a)
    case Built{ok}:
      Dispatch.is_impl(a)
    case Merge{o, c, r}:
      Dispatch.is_propen(a)
    case Retry{o, al}:
      Dispatch.is_failed(a)
    case Abort{}:
      Dispatch.is_abortable(a)

# A human event from a sender that is not the owner.
def Dispatch.untrusted(m: Msg) -> Bool:
  match m:
    case Triage{h, c}:
      False{}
    case Approve{o, c, f}:
      Bool.not(o)
    case Reject{o}:
      Bool.not(o)
    case Revise{o}:
      Bool.not(o)
    case PlanReady{cur}:
      False{}
    case Built{ok}:
      False{}
    case Merge{o, c, r}:
      Bool.not(o)
    case Retry{o, al}:
      Bool.not(o)
    case Abort{}:
      False{}

def Dispatch.is_stale(m: Msg) -> Bool:
  match m:
    case Approve{o, c, f}:
      Bool.not(f)
    case PlanReady{cur}:
      Bool.not(cur)
    case _:
      False{}

def Dispatch.gate_fails(m: Msg) -> Bool:
  match m:
    case Merge{o, c, r}:
      Bool.not(Bool.and(c, r))
    case Retry{o, al}:
      Bool.not(al)
    case _:
      False{}

def Dispatch.is_assign_approval(m: Msg) -> Bool:
  match m:
    case Approve{o, Assign{}, f}:
      Bool.and(o, f)
    case _:
      False{}

def Dispatch.is_plan_approval(m: Msg) -> Bool:
  match m:
    case Approve{o, Plan{}, f}:
      Bool.and(o, f)
    case _:
      False{}

def Dispatch.is_owner_reject(m: Msg) -> Bool:
  match m:
    case Reject{o}:
      o
    case _:
      False{}

def Dispatch.is_owner_revise(m: Msg) -> Bool:
  match m:
    case Revise{o}:
      o
    case _:
      False{}

def Dispatch.is_current_plan_ready(m: Msg) -> Bool:
  match m:
    case PlanReady{cur}:
      cur
    case _:
      False{}

def Dispatch.is_handled_triage(m: Msg) -> Bool:
  match m:
    case Triage{h, c}:
      h
    case _:
      False{}

def Dispatch.is_confident_triage(m: Msg) -> Bool:
  match m:
    case Triage{h, c}:
      Bool.and(Bool.not(h), c)
    case _:
      False{}

def Dispatch.is_unsure_triage(m: Msg) -> Bool:
  match m:
    case Triage{h, c}:
      Bool.and(Bool.not(h), Bool.not(c))
    case _:
      False{}

def Dispatch.is_ok_build(m: Msg) -> Bool:
  match m:
    case Built{ok}:
      ok
    case _:
      False{}

def Dispatch.is_failed_build(m: Msg) -> Bool:
  match m:
    case Built{ok}:
      Bool.not(ok)
    case _:
      False{}

def Dispatch.is_full_gate(m: Msg) -> Bool:
  match m:
    case Merge{o, c, r}:
      Bool.and(o, Bool.and(c, r))
    case _:
      False{}

def Dispatch.is_allowed_retry(m: Msg) -> Bool:
  match m:
    case Retry{o, al}:
      Bool.and(o, al)
    case _:
      False{}

def Dispatch.is_abort(m: Msg) -> Bool:
  match m:
    case Abort{}:
      True{}
    case _:
      False{}

def Dispatch.is_move(o: Out) -> Bool:
  match o:
    case GoTo{t}:
      True{}
    case _:
      False{}

def Dispatch.is_stay(o: Out) -> Bool:
  match o:
    case Stay{}:
      True{}
    case _:
      False{}

def Dispatch.is_refused(o: Out) -> Bool:
  match o:
    case Refuse{w}:
      True{}
    case _:
      False{}

def Dispatch.moved_to(o: Out, b: Stage) -> Bool:
  match o:
    case GoTo{t}:
      Dispatch.same(t, b)
    case _:
      False{}

def Dispatch.refused_not_owner(o: Out) -> Bool:
  match o:
    case Refuse{NotOwner{}}:
      True{}
    case _:
      False{}

def Dispatch.refused_finished(o: Out) -> Bool:
  match o:
    case Refuse{Finished{}}:
      True{}
    case _:
      False{}

def Dispatch.refused_wrong_stage(o: Out) -> Bool:
  match o:
    case Refuse{WrongStage{}}:
      True{}
    case _:
      False{}

def Dispatch.refused_stale(o: Out) -> Bool:
  match o:
    case Refuse{Stale{}}:
      True{}
    case _:
      False{}

def Dispatch.refused_gate(o: Out) -> Bool:
  match o:
    case Refuse{GateNotMet{}}:
      True{}
    case _:
      False{}

# ---- laws, as relations over (stage before, event, stage after, outcome); LAWS.bend states each one
# Q_finished_absorbs: a finished item ignores every later event
def Dispatch.Q_finished_absorbs(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Dispatch.is_final(a), Dispatch.same(b, a))

# Q_refused_keeps: a refused event never changes the stage (structural: next_stage is built from the outcome, so this holds by construction)
def Dispatch.Q_refused_keeps(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Dispatch.is_refused(o), Dispatch.same(b, a))

# Q_stayed_keeps: an accepted event that stays does not change the stage (structural, like Q_refused_keeps)
def Dispatch.Q_stayed_keeps(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Dispatch.is_stay(o), Dispatch.same(b, a))

# Q_moved_is_legal: every move is a legal edge and lands where the outcome says (the legal-edge half is the real law; landing is structural)
def Dispatch.Q_moved_is_legal(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Dispatch.is_move(o), Bool.and(Dispatch.legal_edge(a, b), Dispatch.moved_to(o, b)))

# Q_untrusted_refused: a sender that is not the owner is refused as not the owner, before anything else
def Dispatch.Q_untrusted_refused(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Dispatch.untrusted(m), Dispatch.refused_not_owner(o))

# Q_finished_refused: an event to a finished item from the owner is refused as finished
def Dispatch.Q_finished_refused(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_final(a), Bool.not(Dispatch.untrusted(m))), Dispatch.refused_finished(o))

# Q_wrong_stage_refused: an event the stage does not take is refused as the wrong stage
def Dispatch.Q_wrong_stage_refused(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Bool.not(Dispatch.untrusted(m)), Bool.and(Bool.not(Dispatch.is_final(a)), Bool.not(Dispatch.applicable(a, m)))), Dispatch.refused_wrong_stage(o))

# Q_stale_refused: a stale card or plan is refused as stale
def Dispatch.Q_stale_refused(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Bool.not(Dispatch.untrusted(m)), Bool.and(Dispatch.applicable(a, m), Dispatch.is_stale(m))), Dispatch.refused_stale(o))

# Q_gate_refused: a merge or retry whose conditions are not met is refused as such
def Dispatch.Q_gate_refused(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Bool.not(Dispatch.untrusted(m)), Bool.and(Dispatch.applicable(a, m), Dispatch.gate_fails(m))), Dispatch.refused_gate(o))

# Q_implement_entry: Implementing is entered only from Planned by the owner approving the latest plan card
def Dispatch.Q_implement_entry(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_impl(b), Bool.not(Dispatch.is_impl(a))), Bool.and(Dispatch.is_planned(a), Dispatch.is_plan_approval(m)))

# Q_planning_entry: Planning is entered only by a sure triage, an assign approval, a revise request or a retry
def Dispatch.Q_planning_entry(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_planning(b), Bool.not(Dispatch.is_planning(a))), Bool.or(Bool.and(Dispatch.is_ingested(a), Dispatch.is_confident_triage(m)), Bool.or(Bool.and(Dispatch.is_notified(a), Dispatch.is_assign_approval(m)), Bool.or(Bool.and(Dispatch.is_planned(a), Dispatch.is_owner_revise(m)), Bool.and(Dispatch.is_failed(a), Dispatch.is_allowed_retry(m))))))

# Q_planned_entry: Planned is entered only from Planning by a current plan
def Dispatch.Q_planned_entry(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_planned(b), Bool.not(Dispatch.is_planned(a))), Bool.and(Dispatch.is_planning(a), Dispatch.is_current_plan_ready(m)))

# Q_notified_entry: Notified is entered only from Ingested when routing is not sure
def Dispatch.Q_notified_entry(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_notified(b), Bool.not(Dispatch.is_notified(a))), Bool.and(Dispatch.is_ingested(a), Dispatch.is_unsure_triage(m)))

# Q_skip_entry: Skipped is entered only from Ingested when the thread is already handled
def Dispatch.Q_skip_entry(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_skipped(b), Bool.not(Dispatch.is_skipped(a))), Bool.and(Dispatch.is_ingested(a), Dispatch.is_handled_triage(m)))

# Q_pr_open_entry: PrOpen is entered only from Implementing by a successful build
def Dispatch.Q_pr_open_entry(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_propen(b), Bool.not(Dispatch.is_propen(a))), Bool.and(Dispatch.is_impl(a), Dispatch.is_ok_build(m)))

# Q_merge_entry: Merged is entered only from PrOpen by the owner with CI green and review applied
def Dispatch.Q_merge_entry(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_merged(b), Bool.not(Dispatch.is_merged(a))), Bool.and(Dispatch.is_propen(a), Dispatch.is_full_gate(m)))

# Q_declined_entry: Declined is entered only from an open stage by the owner rejecting
def Dispatch.Q_declined_entry(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_declined(b), Bool.not(Dispatch.is_declined(a))), Bool.and(Dispatch.is_cancellable(a), Dispatch.is_owner_reject(m)))

# Q_fail_entry: Failed is entered only by an abort or a failed build of an Implementing item
def Dispatch.Q_fail_entry(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_failed(b), Bool.not(Dispatch.is_failed(a))), Bool.or(Bool.and(Dispatch.is_abortable(a), Dispatch.is_abort(m)), Bool.and(Dispatch.is_impl(a), Dispatch.is_failed_build(m))))

# Q_replay_idempotent: delivering the same event again to the result changes nothing
def Dispatch.Q_replay_idempotent(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.same(Dispatch.next_stage(b, Dispatch.decide(b, m)), b)

# Q_triage_handled_skips: triage that finds the thread handled skips an Ingested item
def Dispatch.Q_triage_handled_skips(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_ingested(a), Dispatch.is_handled_triage(m)), Dispatch.is_skipped(b))

# Q_triage_confident_plans: triage with a sure route starts planning
def Dispatch.Q_triage_confident_plans(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_ingested(a), Dispatch.is_confident_triage(m)), Dispatch.is_planning(b))

# Q_triage_unsure_notifies: triage with an unsure route asks the owner
def Dispatch.Q_triage_unsure_notifies(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_ingested(a), Dispatch.is_unsure_triage(m)), Dispatch.is_notified(b))

# Q_assign_advances: the owner approving the latest assign card moves Notified to Planning
def Dispatch.Q_assign_advances(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_notified(a), Dispatch.is_assign_approval(m)), Dispatch.is_planning(b))

# Q_plan_advances: the owner approving the latest plan card moves Planned to Implementing
def Dispatch.Q_plan_advances(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_planned(a), Dispatch.is_plan_approval(m)), Dispatch.is_impl(b))

# Q_revise_replans: the owner asking for a change moves Planned to Planning
def Dispatch.Q_revise_replans(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_planned(a), Dispatch.is_owner_revise(m)), Dispatch.is_planning(b))

# Q_revise_restarts: the owner asking for a change while Planning is accepted and restarts the plan
def Dispatch.Q_revise_restarts(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_planning(a), Dispatch.is_owner_revise(m)), Dispatch.is_stay(o))

# Q_plan_ready_returns: a current plan moves Planning to Planned
def Dispatch.Q_plan_ready_returns(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_planning(a), Dispatch.is_current_plan_ready(m)), Dispatch.is_planned(b))

# Q_build_ok_opens_pr: a successful build moves Implementing to PrOpen
def Dispatch.Q_build_ok_opens_pr(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_impl(a), Dispatch.is_ok_build(m)), Dispatch.is_propen(b))

# Q_build_failed_fails: a failed build moves Implementing to Failed
def Dispatch.Q_build_failed_fails(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_impl(a), Dispatch.is_failed_build(m)), Dispatch.is_failed(b))

# Q_reject_declines: the owner rejecting an open item declines it
def Dispatch.Q_reject_declines(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_cancellable(a), Dispatch.is_owner_reject(m)), Dispatch.is_declined(b))

# Q_merge_when_ready: a ready merge request from the owner merges a PrOpen item
def Dispatch.Q_merge_when_ready(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_propen(a), Dispatch.is_full_gate(m)), Dispatch.is_merged(b))

# Q_abort_fails: an abort fails every item that can still fail
def Dispatch.Q_abort_fails(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_abortable(a), Dispatch.is_abort(m)), Dispatch.is_failed(b))

# Q_retry_restarts: the owner retrying a Failed item within budget moves it to Planning
def Dispatch.Q_retry_restarts(+a: Stage, +m: Msg, +b: Stage, +o: Out) -> Bool:
  Dispatch.imp(Bool.and(Dispatch.is_failed(a), Dispatch.is_allowed_retry(m)), Dispatch.is_planning(b))


