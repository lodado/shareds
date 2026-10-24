import Base
import ./MODEL.bend as M

# P1: however the user clicks and however the server answers, an order is charged at most once
law never_double_charge:
  for t: List<M.Msg>
  {M.Pay.at_most_one(M.Pay.run(t, M.Pay.init())) == True{} : Bool}

# P1: a pending order that the server confirms is paid, with one more charge
law pending_resolve_pays:
  for c: M.Charges
  {M.Pay.step(M.Pay{M.Pending{}, c}, M.Resolve{}) == M.Pay{M.Paid{}, M.Pay.more(c)} : M.Pay}

# P1 witness: some trace from the initial state ends paid with one charge
law paid_reachable:
  exs t: List<M.Msg>
  {M.Pay.run(t, M.Pay.init()) == M.Pay{M.Paid{}, M.OneCharge{}} : M.Pay}
