import Base
import ./MODEL.bend as M

# Approved laws for the slack-dispatch item state machine. Each law is a relation of MODEL.bend that holds for every stage and
# every event. PROOF.bend proves them; they state the reference model, not the TS code.

# a finished item ignores every later event
law finished_absorbs:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_finished_absorbs(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# a refused event never changes the stage (structural: it follows from how next_stage is built)
law refused_keeps:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_refused_keeps(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# an accepted event that stays does not change the stage (structural, like refused_keeps)
law stayed_keeps:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_stayed_keeps(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# every move is a legal edge (the real law) and lands where the outcome says (structural)
law moved_is_legal:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_moved_is_legal(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# a sender that is not the owner is refused as not the owner, before anything else
law untrusted_refused:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_untrusted_refused(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# an event to a finished item from the owner is refused as finished
law finished_refused:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_finished_refused(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# an event the stage does not take is refused as the wrong stage
law wrong_stage_refused:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_wrong_stage_refused(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# a stale card or plan is refused as stale
law stale_refused:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_stale_refused(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# a merge or retry whose conditions are not met is refused as such
law gate_refused:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_gate_refused(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# Implementing is entered only from Planned by the owner approving the latest plan card
law implement_entry:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_implement_entry(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# Planning is entered only by a sure triage, an assign approval, a revise request or a retry
law planning_entry:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_planning_entry(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# Planned is entered only from Planning by a current plan
law planned_entry:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_planned_entry(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# Notified is entered only from Ingested when routing is not sure
law notified_entry:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_notified_entry(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# Skipped is entered only from Ingested when the thread is already handled
law skip_entry:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_skip_entry(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# PrOpen is entered only from Implementing by a successful build
law pr_open_entry:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_pr_open_entry(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# Merged is entered only from PrOpen by the owner with CI green and review applied
law merge_entry:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_merge_entry(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# Declined is entered only from an open stage by the owner rejecting
law declined_entry:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_declined_entry(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# Failed is entered only by an abort or a failed build of an Implementing item
law fail_entry:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_fail_entry(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# delivering the same event again to the result changes nothing
law replay_idempotent:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_replay_idempotent(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# triage that finds the thread handled skips an Ingested item
law triage_handled_skips:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_triage_handled_skips(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# triage with a sure route starts planning
law triage_confident_plans:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_triage_confident_plans(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# triage with an unsure route asks the owner
law triage_unsure_notifies:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_triage_unsure_notifies(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# the owner approving the latest assign card moves Notified to Planning
law assign_advances:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_assign_advances(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# the owner approving the latest plan card moves Planned to Implementing
law plan_advances:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_plan_advances(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# the owner asking for a change moves Planned to Planning
law revise_replans:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_revise_replans(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# the owner asking for a change while Planning is accepted and restarts the plan
law revise_restarts:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_revise_restarts(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# a current plan moves Planning to Planned
law plan_ready_returns:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_plan_ready_returns(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# a successful build moves Implementing to PrOpen
law build_ok_opens_pr:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_build_ok_opens_pr(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# a failed build moves Implementing to Failed
law build_failed_fails:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_build_failed_fails(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# the owner rejecting an open item declines it
law reject_declines:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_reject_declines(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# a ready merge request from the owner merges a PrOpen item
law merge_when_ready:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_merge_when_ready(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# an abort fails every item that can still fail
law abort_fails:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_abort_fails(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# the owner retrying a Failed item within budget moves it to Planning
law retry_restarts:
  for a: M.Stage
  for m: M.Msg
  {M.Dispatch.Q_retry_restarts(a, m, M.Dispatch.next_stage(a, M.Dispatch.decide(a, m)), M.Dispatch.decide(a, m)) == True{} : Bool}

# Witness: some trace from the initial stage ends Merged, so the laws above do not hold merely because nothing happens
law merged_reachable:
  exs t: List<M.Msg>
  {M.Dispatch.stage_of(M.Dispatch.run(t, M.Dispatch.init())) == M.Merged{} : M.Stage}
