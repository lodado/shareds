import Base
import ./MODEL.bend as M
import ./LAWS.bend as Laws

def eq_refl(+n: Nat) -> {Nat.is_eq(n, n) == True{} : Bool}:
  match n:
    case 0n:
      {==}
    case 1n+p:
      eq_refl(p)

def length_kept(xs: List<&2, Nat>, +n: Nat) -> {Nat.is_eq(M.Board.len(M.Board.swap_at(xs, n)), M.Board.len(xs)) == True{} : Bool}:
  match xs n:
    case Nil{} n:
      {==}
    case +a <> Nil{} n:
      {==}
    case +a <> (+b <> +r) 0n:
      eq_refl(M.Board.len(r))
    case +a <> (+b <> +r) 1n+p:
      length_kept(b <> r, p)

def Laws.length_kept(s, c):
  match s c:
    case M.Board{xs} M.Drag{n}:
      length_kept(xs, n)

def and_true(p: Bool, q: Bool, ep: {p == True{} : Bool}, eq: {q == True{} : Bool}) -> {Bool.and(p, q) == True{} : Bool}:
  match p q:
    case True{} True{}:
      {==}
    case True{} False{}:
      eq
    case False{} True{}:
      ep
    case False{} False{}:
      ep

def swap_hits(p: Bool, q: Bool, c: Nat) -> {Nat.is_eq(Nat.add(M.Board.hit(p), Nat.add(M.Board.hit(q), c)), Nat.add(M.Board.hit(q), Nat.add(M.Board.hit(p), c))) == True{} : Bool}:
  match p q:
    case True{} True{}:
      eq_refl(1n+(1n+c))
    case True{} False{}:
      eq_refl(1n+c)
    case False{} True{}:
      eq_refl(1n+c)
    case False{} False{}:
      eq_refl(c)

def hit_cong(p: Bool, u: Nat, v: Nat, e: {Nat.is_eq(u, v) == True{} : Bool}) -> {Nat.is_eq(Nat.add(M.Board.hit(p), u), Nat.add(M.Board.hit(p), v)) == True{} : Bool}:
  match p:
    case True{}:
      e
    case False{}:
      e

def count_kept(+x: Nat, xs: List<&2, Nat>, +n: Nat) -> {Nat.is_eq(M.Board.count(x, M.Board.swap_at(xs, n)), M.Board.count(x, xs)) == True{} : Bool}:
  match xs n:
    case Nil{} n:
      {==}
    case +a <> Nil{} n:
      eq_refl(M.Board.count(x, a <> Nil{}))
    case +a <> (+b <> +r) 0n:
      swap_hits(Nat.is_eq(x, b), Nat.is_eq(x, a), M.Board.count(x, r))
    case +a <> (+b <> +r) 1n+p:
      hit_cong(Nat.is_eq(x, a), M.Board.count(x, M.Board.swap_at(b <> r, p)), M.Board.count(x, b <> r), count_kept(x, b <> r, p))

def covers_swap(all: List<&2, Nat>, +s: List<&2, Nat>, +n: Nat) -> {M.Board.covers(all, s, M.Board.swap_at(s, n)) == True{} : Bool}:
  match all:
    case Nil{}:
      {==}
    case +h <> +rest:
      and_true(Nat.is_eq(M.Board.count(h, M.Board.swap_at(s, n)), M.Board.count(h, s)), M.Board.covers(rest, s, M.Board.swap_at(s, n)), count_kept(h, s, n), covers_swap(rest, s, n))

def Laws.items_kept(s, c):
  match s c:
    case M.Board{+xs} M.Drag{+n}:
      and_true(Nat.is_eq(M.Board.len(M.Board.swap_at(xs, n)), M.Board.len(xs)), M.Board.covers(xs, xs, M.Board.swap_at(xs, n)), length_kept(xs, n), covers_swap(xs, xs, n))
