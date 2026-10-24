import Base
import ./MODEL.bend as M

# Each law: the relation holds for every state and event of the model.

law discovering_models:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_discovering_models(s, m, M.Run.step(s, m)) == True{} : Bool}

law modeled_checks:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_modeled_checks(s, m, M.Run.step(s, m)) == True{} : Bool}

law checked_drafts:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_checked_drafts(s, m, M.Run.step(s, m)) == True{} : Bool}

law recheck_judges:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_recheck_judges(s, m, M.Run.step(s, m)) == True{} : Bool}

law lock_locks:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_lock_locks(s, m, M.Run.step(s, m)) == True{} : Bool}

law relock_keeps:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_relock_keeps(s, m, M.Run.step(s, m)) == True{} : Bool}

law rewind_discovers:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_rewind_discovers(s, m, M.Run.step(s, m)) == True{} : Bool}

law rewind_models:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_rewind_models(s, m, M.Run.step(s, m)) == True{} : Bool}

law rewind_checks:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_rewind_checks(s, m, M.Run.step(s, m)) == True{} : Bool}

law rewind_drafts:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_rewind_drafts(s, m, M.Run.step(s, m)) == True{} : Bool}

law lock_only:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_lock_only(s, m, M.Run.step(s, m)) == True{} : Bool}

law skip_refused:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_skip_refused(s, m, M.Run.step(s, m)) == True{} : Bool}

law rewind_back:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_rewind_back(s, m, M.Run.step(s, m)) == True{} : Bool}

law lock_needs_drafted:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_lock_needs_drafted(s, m, M.Run.step(s, m)) == True{} : Bool}

law rewind_needs_reason:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_rewind_needs_reason(s, m, M.Run.step(s, m)) == True{} : Bool}

law advance_stale:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_advance_stale(s, m, M.Run.step(s, m)) == True{} : Bool}

law rewind_stale:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_rewind_stale(s, m, M.Run.step(s, m)) == True{} : Bool}

law lock_stale:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_lock_stale(s, m, M.Run.step(s, m)) == True{} : Bool}

law gate_refuses:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_gate_refuses(s, m, M.Run.step(s, m)) == True{} : Bool}

law refused_keeps:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_refused_keeps(s, m, M.Run.step(s, m)) == True{} : Bool}

law status_reads:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_status_reads(s, m, M.Run.step(s, m)) == True{} : Bool}

law edit_writes_nothing:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_edit_writes_nothing(s, m, M.Run.step(s, m)) == True{} : Bool}

law package_edit_stales:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_package_edit_stales(s, m, M.Run.step(s, m)) == True{} : Bool}

law bend_edit_stales:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_bend_edit_stales(s, m, M.Run.step(s, m)) == True{} : Bool}

law other_edit_keeps:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_other_edit_keeps(s, m, M.Run.step(s, m)) == True{} : Bool}

law advance_never_locks:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_advance_never_locks(s, m, M.Run.step(s, m)) == True{} : Bool}

law ready_only_by_lock:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_ready_only_by_lock(s, m, M.Run.step(s, m)) == True{} : Bool}

law rewind_never_forward:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_rewind_never_forward(s, m, M.Run.step(s, m)) == True{} : Bool}

law advance_one_step:
  for s: M.Run
  for m: M.Msg
  {M.Run.R_advance_one_step(s, m, M.Run.step(s, m)) == True{} : Bool}
