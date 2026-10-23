import Base
import ./MODEL.bend as M
import ./LAWS.bend as Laws

# Proof candidate for the pay fixture. A safety law over every trace is proven by one induction on
# the trace (safe_run) from an invariant that every step keeps (inv_step) and that implies the law (inv_safe).

def bool_clash(b: Bool) -> Type:
  match b:
    case False{}:
      Empty
    case True{}:
      Unit

def false_is_not_true(e: {False{} == True{} : Bool}) -> Empty:
  %Equal.sym(Bool, False{}, True{}, e) : bool_clash(_)
  Unit{}

# Invariant: an order is charged once when it is paid and never otherwise.
def inv(s: M.Pay) -> Bool:
  match s:
    case M.Pay{M.Idle{}, c}:
      Nat.is_eq(c, 0n)
    case M.Pay{M.Pending{}, c}:
      Nat.is_eq(c, 0n)
    case M.Pay{M.Paid{}, c}:
      Nat.is_eq(c, 1n)
    case M.Pay{M.Errored{}, c}:
      Nat.is_eq(c, 0n)

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
      h
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

def eq0_le1(c: Nat, h: {Nat.is_eq(c, 0n) == True{} : Bool}) -> {Nat.is_le(c, 1n) == True{} : Bool}:
  match c:
    case 0n:
      {==}
    case 1n+p:
      Empty.absurd({Nat.is_le(1n+p, 1n) == True{} : Bool}, false_is_not_true(h))

def eq0_le0(p: Nat, h: {Nat.is_eq(p, 0n) == True{} : Bool}) -> {Nat.is_le(1n+p, 1n) == True{} : Bool}:
  match p:
    case 0n:
      {==}
    case 1n+q:
      Empty.absurd({Nat.is_le(2n+q, 1n) == True{} : Bool}, false_is_not_true(h))

def eq1_le1(c: Nat, h: {Nat.is_eq(c, 1n) == True{} : Bool}) -> {Nat.is_le(c, 1n) == True{} : Bool}:
  match c:
    case 0n:
      {==}
    case 1n+p:
      eq0_le0(p, h)

def inv_safe(s: M.Pay, h: {inv(s) == True{} : Bool}) -> {M.Pay.at_most_one(s) == True{} : Bool}:
  match s:
    case M.Pay{M.Idle{}, c}:
      eq0_le1(c, h)
    case M.Pay{M.Pending{}, c}:
      eq0_le1(c, h)
    case M.Pay{M.Paid{}, c}:
      eq1_le1(c, h)
    case M.Pay{M.Errored{}, c}:
      eq0_le1(c, h)

def safe_run(t: List<M.Msg>, +s: M.Pay, h: {inv(s) == True{} : Bool}) -> {M.Pay.at_most_one(M.Pay.run(t, s)) == True{} : Bool}:
  match t:
    case Nil{}:
      inv_safe(s, h)
    case Con{+m, rest}:
      safe_run(rest, M.Pay.step(s, m), inv_step(s, m, h))

def Laws.never_double_charge(t):
  safe_run(t, M.Pay.init(), {==})

def Laws.pending_resolve_pays(c):
  {==}

def Laws.paid_reachable():
  ([M.Submit{}, M.Resolve{}], {==})

# A weaker candidate is not inductive: the kernel checks a concrete counterexample to induction.
def inv0(s: M.Pay) -> Bool:
  match s:
    case M.Pay{st, c}:
      Nat.is_le(c, 1n)

law weak_is_not_inductive:
  exs s: M.Pay
  {Bool.and(inv0(s), Bool.not(inv0(M.Pay.step(s, M.Resolve{})))) == True{} : Bool}

def weak_is_not_inductive():
  (M.Pay{M.Pending{}, 1n}, {==})
