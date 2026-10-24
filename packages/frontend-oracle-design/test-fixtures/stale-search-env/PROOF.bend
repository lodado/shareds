import Base
import ./MODEL.bend as M
import ./LAWS.bend as Laws

def bool_clash(b: Bool) -> Type:
  match b:
    case False{}:
      Empty
    case True{}:
      Unit

def false_is_not_true(e: {False{} == True{} : Bool}) -> Empty:
  %Equal.sym(Bool, False{}, True{}, e) : bool_clash(_)
  Unit{}

def le_succ(a: Nat, b: Nat, h: {Nat.is_le(a, b) == True{} : Bool}) -> {Nat.is_le(a, 1n+b) == True{} : Bool}:
  match a b:
    case 0n b:
      {==}
    case 1n+p 0n:
      Empty.absurd({Nat.is_le(1n+p, 1n) == True{} : Bool}, false_is_not_true(h))
    case 1n+p 1n+q:
      le_succ(p, q, h)

def eq_le(a: Nat, b: Nat, e: {Nat.is_eq(a, b) == True{} : Bool}) -> {Nat.is_le(a, b) == True{} : Bool}:
  match a b:
    case 0n 0n:
      {==}
    case 0n 1n+q:
      {==}
    case 1n+p 0n:
      Empty.absurd({Nat.is_le(1n+p, 0n) == True{} : Bool}, false_is_not_true(e))
    case 1n+p 1n+q:
      eq_le(p, q, e)

# A computed Bool is split by passing it together with the equation that names it.
def respond_ok(b: Bool, +id: Nat, +latest: Nat, shown: Nat, e: {Nat.is_eq(id, latest) == b : Bool}, h: {Nat.is_le(shown, latest) == True{} : Bool}) -> {Nat.is_le(M.Search.pick(b, id, shown), latest) == True{} : Bool}:
  match b:
    case True{}:
      eq_le(id, latest, e)
    case False{}:
      h

def inv_step(s: M.Search, m: M.Msg, h: {M.Search.ok(s) == True{} : Bool}) -> {M.Search.ok(M.Search.step(s, m)) == True{} : Bool}:
  match s m:
    case M.Search{+latest, +shown, open} M.Issue{}:
      le_succ(shown, latest, h)
    case M.Search{+latest, +shown, open} M.Respond{+id}:
      respond_ok(Nat.is_eq(id, latest), id, latest, shown, {==}, h)

def safe_run(t: List<M.Msg>, +s: M.Search, h: {M.Search.ok(s) == True{} : Bool}) -> {M.Search.ok(M.Search.run(t, s)) == True{} : Bool}:
  match t:
    case Nil{}:
      h
    case Con{+m, rest}:
      safe_run(rest, M.Search.step(s, m), inv_step(s, m, h))

def Laws.shown_le_latest(t):
  safe_run(t, M.Search.init(), {==})
