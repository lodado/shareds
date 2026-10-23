import Base
import ./MODEL.bend as M
import ./LAWS.bend as Laws

# Proof candidate for the pay-finite fixture. never_double_charge is proven by hand with the pay invariant;
# `oracle-model.mjs prove-reach --safe at_most_one` certifies the same def over every trace with no invariant
# written. `prove` generates the cell proof of pending_resolve_pays, a law over a finite type.

def bool_clash(b: Bool) -> Type:
  match b:
    case False{}:
      Empty
    case True{}:
      Unit

def false_is_not_true(e: {False{} == True{} : Bool}) -> Empty:
  %Equal.sym(Bool, False{}, True{}, e) : bool_clash(_)
  Unit{}

def none(c: M.Charges) -> Bool:
  match c:
    case M.NoCharge{}:
      True{}
    case M.OneCharge{}:
      False{}
    case M.ManyCharges{}:
      False{}

def one(c: M.Charges) -> Bool:
  match c:
    case M.NoCharge{}:
      False{}
    case M.OneCharge{}:
      True{}
    case M.ManyCharges{}:
      False{}

# Invariant: an order is charged once when it is paid and never otherwise.
def inv(s: M.Pay) -> Bool:
  match s:
    case M.Pay{M.Idle{}, c}:
      none(c)
    case M.Pay{M.Pending{}, c}:
      none(c)
    case M.Pay{M.Paid{}, c}:
      one(c)
    case M.Pay{M.Errored{}, c}:
      none(c)

def pays_once(c: M.Charges, h: {none(c) == True{} : Bool}) -> {one(M.Pay.more(c)) == True{} : Bool}:
  match c:
    case M.NoCharge{}:
      {==}
    case M.OneCharge{}:
      Empty.absurd({one(M.Pay.more(M.OneCharge{})) == True{} : Bool}, false_is_not_true(h))
    case M.ManyCharges{}:
      Empty.absurd({one(M.Pay.more(M.ManyCharges{})) == True{} : Bool}, false_is_not_true(h))

def inv_step(s: M.Pay, m: M.Msg, h: {inv(s) == True{} : Bool}) -> {inv(M.Pay.step(s, m)) == True{} : Bool}:
  match s m:
    case M.Pay{M.Idle{}, c} M.Submit{}:
      h
    case M.Pay{M.Idle{}, c} M.Resolve{}:
      h
    case M.Pay{M.Idle{}, c} M.Reject{}:
      h
    case M.Pay{M.Pending{}, c} M.Submit{}:
      h
    case M.Pay{M.Pending{}, c} M.Resolve{}:
      pays_once(c, h)
    case M.Pay{M.Pending{}, c} M.Reject{}:
      h
    case M.Pay{M.Paid{}, c} M.Submit{}:
      h
    case M.Pay{M.Paid{}, c} M.Resolve{}:
      h
    case M.Pay{M.Paid{}, c} M.Reject{}:
      h
    case M.Pay{M.Errored{}, c} M.Submit{}:
      h
    case M.Pay{M.Errored{}, c} M.Resolve{}:
      h
    case M.Pay{M.Errored{}, c} M.Reject{}:
      h

def none_safe(c: M.Charges, h: {none(c) == True{} : Bool}) -> {M.Pay.under_two(c) == True{} : Bool}:
  match c:
    case M.NoCharge{}:
      {==}
    case M.OneCharge{}:
      {==}
    case M.ManyCharges{}:
      Empty.absurd({M.Pay.under_two(M.ManyCharges{}) == True{} : Bool}, false_is_not_true(h))

def one_safe(c: M.Charges, h: {one(c) == True{} : Bool}) -> {M.Pay.under_two(c) == True{} : Bool}:
  match c:
    case M.NoCharge{}:
      {==}
    case M.OneCharge{}:
      {==}
    case M.ManyCharges{}:
      Empty.absurd({M.Pay.under_two(M.ManyCharges{}) == True{} : Bool}, false_is_not_true(h))

def inv_safe(s: M.Pay, h: {inv(s) == True{} : Bool}) -> {M.Pay.at_most_one(s) == True{} : Bool}:
  match s:
    case M.Pay{M.Idle{}, c}:
      none_safe(c, h)
    case M.Pay{M.Pending{}, c}:
      none_safe(c, h)
    case M.Pay{M.Paid{}, c}:
      one_safe(c, h)
    case M.Pay{M.Errored{}, c}:
      none_safe(c, h)

def safe_run(t: List<M.Msg>, +s: M.Pay, h: {inv(s) == True{} : Bool}) -> {M.Pay.at_most_one(M.Pay.run(t, s)) == True{} : Bool}:
  match t:
    case Nil{}:
      inv_safe(s, h)
    case Con{+m, rest}:
      safe_run(rest, M.Pay.step(s, m), inv_step(s, m, h))

def Laws.never_double_charge(t):
  safe_run(t, M.Pay.init(), {==})

def Laws.paid_reachable():
  ([M.Submit{}, M.Resolve{}], {==})
