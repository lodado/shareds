import Base
import ./MODEL.bend as M

# Laws of the authoring model. The every-trace law is MODEL.bend's `Auth.safe` (every Q_ relation on every command
# the environment allows, in every state a trace reaches, plus the state invariants): `oracle-model.mjs prove-reach
# --model MODEL.bend --prefix Auth --safe safe` proves it with the kernel. The laws below are the cells and witnesses
# `prove` checks.

# review-input never lowers the review potential, raises it whenever it changes the budget, and adds at most a round
law potential_rises:
  for b: M.Budget
  for x: Bool
  for y: Bool
  {M.Auth.potential_rises(b, x, y) == True{} : Bool}

# an accepted standing delegation records itself and raises the limit
law delegation_raises:
  for b: M.Budget
  for u: M.Up
  {M.Auth.delegation_raises(b, u) == True{} : Bool}

# Witness: a package reaches ORACLE_READY, so the laws do not hold merely because nothing happens
law ready_reachable:
  exs t: List<M.Msg>
  {M.Auth.is_ready(M.Auth.at(M.Auth.run_all(t, M.Auth.init()))) == True{} : Bool}

# Witness: the authoring budget runs out, and the next review-input that changes an input of this round is refused
law exhausted_reachable:
  exs t: List<M.Msg>
  {M.Auth.refused_as(M.Auth.decide(M.Auth.run_all(t, M.Auth.init()), M.Review{True{}, True{}}), M.Exhausted{}) == True{} : Bool}

# Witness: a standing delegation reaches limit 5
law limit_five_reachable:
  exs t: List<M.Msg>
  {Nat.is_eq(M.Auth.limit_of(M.Auth.run_all(t, M.Auth.init())), 5n) == True{} : Bool}

# After the budget runs out, an explicit approval opens one more round
law approval_reopens:
  {M.Auth.took(M.Auth.decide(M.Auth.run_all([M.Review{True{}, True{}}, M.Review{True{}, True{}}, M.Approve{True{}}], M.Auth.init()), M.Review{True{}, True{}})) == True{} : Bool}

# Witness: the rewind allowance runs out, and the next walk back is refused as REWIND_CAP_REACHED
law rewind_cap_reachable:
  exs t: List<M.Msg>
  {M.Auth.refused_as(M.Auth.decide(M.Auth.run_all(t, M.Auth.init()), M.Rewind{M.ToDiscovering{}, True{}}), M.RewindCap{}) == True{} : Bool}

# Witness: the limit reaches the round ceiling, and the next explicit approval is refused as ITERATION_CEILING_REACHED
law ceiling_reachable:
  exs t: List<M.Msg>
  {M.Auth.refused_as(M.Auth.decide(M.Auth.run_all(t, M.Auth.init()), M.Approve{True{}}), M.Ceiling{}) == True{} : Bool}

# Past the rewind allowance, an explicit approval of one more round allows the next walk back
law approval_rewinds_again:
  {M.Auth.took(M.Auth.decide(M.Auth.run_all([M.Begin{}, M.Walk{False{}}, M.Rewind{M.ToDiscovering{}, True{}}, M.Walk{False{}}, M.Approve{True{}}], M.Auth.init()), M.Rewind{M.ToDiscovering{}, True{}})) == True{} : Bool}

# From ORACLE_READY, walk back, walk and lock no longer return to the same state: the rewind count rose (0.121.0
# recorded this cycle as a finding with no bound)
law rewind_cycle_spends:
  {M.Auth.same(M.Auth.run_all([M.Rewind{M.ToDiscovering{}, True{}}, M.Walk{False{}}, M.Lock{}], M.Auth.run_all([M.Begin{}, M.Walk{False{}}, M.Lock{}], M.Auth.init())), M.Auth.run_all([M.Begin{}, M.Walk{False{}}, M.Lock{}], M.Auth.init())) == False{} : Bool}
