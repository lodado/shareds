import Base
import ./MODEL.bend as M

# Laws of the Delivery run model. The every-trace law is MODEL.bend's `Del.safe` (every Q_ relation on every
# command the environment allows, in every state a trace reaches): `oracle-model.mjs prove-reach --model MODEL.bend
# --prefix Del --safe safe` proves it with the kernel, including the model's hint (`Del.hint_accepted`) on every
# reached state: Red, Green, Exec and Close are accepted events; Guide only where red and green are both refused,
# Report only where the run is closed. The CLI's printed line is sampled by the replay, not proven here. The laws
# below are the cells and witnesses `prove` checks.

# a spend never lowers the spent count
law spend_monotone:
  for n: M.Spent
  {Nat.is_le(M.Del.spent_rank(n), M.Del.spent_rank(M.Del.bump(n))) == True{} : Bool}

# Witness: a run reaches REVIEW_VERIFIED, so the laws do not hold merely because nothing happens
law verified_reachable:
  exs t: List<M.Msg>
  {M.Del.reviewed(M.Del.at(M.Del.run_all(t, M.Del.init()))) == True{} : Bool}

# Witness: a run with an open hold reaches PARTIAL_VERIFIED
law partial_reachable:
  exs t: List<M.Msg>
  {M.Del.is_partial(M.Del.at(M.Del.run_all(t, M.Del.init()))) == True{} : Bool}

# Witness: a VALID_RED refresh is accepted after a test edit
law refresh_reachable:
  exs t: List<M.Msg>
  {Bool.and(M.Del.is_red(M.Del.at(M.Del.run_all(t, M.Del.init()))), M.Del.took(M.Del.decide(M.Del.run_all(t, M.Del.init()), M.MarkRed{}))) == True{} : Bool}

# Witness: two refreshes spend the harness budget, and the next refresh is refused
law exhausted_reachable:
  exs t: List<M.Msg>
  {M.Del.refused_as(M.Del.decide(M.Del.run_all(t, M.Del.init()), M.MarkRed{}), M.Exhausted{}) == True{} : Bool}

# Witness: NEEDS_DECISION → ORACLE_READY → VALID_RED → NEEDS_DECISION is bounded: the third resume is refused
law resume_exhausted_reachable:
  exs t: List<M.Msg>
  {M.Del.refused_as(M.Del.decide(M.Del.run_all(t, M.Del.init()), M.Resume{}), M.Exhausted{}) == True{} : Bool}
