import Base
import ./MODEL.bend as M

# Laws of the Delivery run model. The every-trace law is MODEL.bend's `Del.safe` (every Q_ relation on every
# command the environment allows, in every state a trace reaches): `oracle-model.mjs prove-reach --model MODEL.bend
# --prefix Del --safe safe` proves it with the kernel. The laws below are the cells and witnesses `prove` checks.

# the phase line names a legal command in every run state
law hint_legal:
  for p: M.Phase
  {M.Del.hint_legal(p) == True{} : Bool}

# a harness spend never lowers the spent count
law spend_monotone:
  for f: Bool
  for h: M.Harness
  {Nat.is_le(M.Del.spent_rank(M.Del.spent_of(h)), M.Del.spent_rank(M.Del.spent_of(M.Del.spend(f, h)))) == True{} : Bool}

# Witness: a run reaches REVIEW_VERIFIED, so the laws do not hold merely because nothing happens
law verified_reachable:
  exs t: List<M.Msg>
  {M.Del.reviewed(M.Del.at(M.Del.run_all(t, M.Del.init()))) == True{} : Bool}

# Witness: a run with an open hold reaches PARTIAL_VERIFIED
law partial_reachable:
  exs t: List<M.Msg>
  {M.Del.is_partial(M.Del.at(M.Del.run_all(t, M.Del.init()))) == True{} : Bool}

# Witness: a VALID_RED refresh is accepted after a harness spend
law refresh_reachable:
  exs t: List<M.Msg>
  {Bool.and(M.Del.is_red(M.Del.at(M.Del.run_all(t, M.Del.init()))), M.Del.took(M.Del.decide(M.Del.run_all(t, M.Del.init()), M.MarkRed{}))) == True{} : Bool}

# Witness: the harness budget runs out, and the next counted spend is refused
law exhausted_reachable:
  exs t: List<M.Msg>
  {M.Del.refused_as(M.Del.decide(M.Del.run_all(t, M.Del.init()), M.Spend{}), M.Exhausted{}) == True{} : Bool}

# Finding: NEEDS_DECISION → ORACLE_READY → VALID_RED → NEEDS_DECISION returns to the same state with no budget spent,
# so this cycle is not bounded by the model (only the ledger grows)
law red_cycle_returns:
  {M.Del.same(M.Del.run_all([M.Stop{M.StopDecision{}, True{}}, M.Resume{}, M.MarkRed{}], M.Del.run_all([M.Exec{False{}}, M.MarkRed{}], M.Del.init())), M.Del.run_all([M.Exec{False{}}, M.MarkRed{}], M.Del.init())) == True{} : Bool}
