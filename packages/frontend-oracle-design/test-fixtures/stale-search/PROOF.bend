import Base
import ./MODEL.bend as M
import ./LAWS.bend as Laws

law nat_eq_refl:
  for n: Nat
  {Nat.is_eq(n, n) == True{} : Bool}

def nat_eq_refl(n):
  match n:
    case 0n:
      {==}
    case 1n+p:
      nat_eq_refl(p)

def bool_clash(b: Bool) -> Type:
  match b:
    case False{}:
      Empty
    case True{}:
      Unit

def false_is_not_true(e: {False{} == True{} : Bool}) -> Empty:
  %Equal.sym(Bool, False{}, True{}, e) : bool_clash(_)
  Unit{}

law lt_not_eq:
  for a: Nat
  for b: Nat
  for h: {Nat.is_lt(a, b) == True{} : Bool}
  {Nat.is_eq(a, b) == False{} : Bool}

def lt_not_eq(a, b, h):
  match a b:
    case 0n 0n:
      Empty.absurd({True{} == False{} : Bool}, false_is_not_true(h))
    case 0n 1n+bp:
      {==}
    case 1n+ap 0n:
      Empty.absurd({False{} == False{} : Bool}, false_is_not_true(h))
    case 1n+ap 1n+bp:
      lt_not_eq(ap, bp, h)

def Laws.stale_ignored(latest, shown, id, h):
  %Equal.sym(Bool, Nat.is_eq(id, latest), False{}, lt_not_eq(id, latest, h)) : {M.Search.respond(_, id, latest, shown) == M.Search{latest, shown} : M.Search}
  {==}

def Laws.latest_applied(latest, shown):
  %Equal.sym(Bool, Nat.is_eq(latest, latest), True{}, nat_eq_refl(latest)) : {M.Search.respond(_, latest, latest, shown) == M.Search{latest, latest} : M.Search}
  {==}

def Laws.issue_advances(latest, shown):
  {==}

def Laws.latest_reachable():
  ([M.Issue{}, M.Respond{1n}], {==})
