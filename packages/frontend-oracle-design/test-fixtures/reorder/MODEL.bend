import Base

# A board of item ids. Dragging an item moves it one place toward the back: it swaps with the item after it.
type Board is Data:
  Board{items: List<&2, Nat>}

type Drag is Data:
  Drag{at: Nat}

def Board.len(xs: List<&2, Nat>) -> Nat:
  match xs:
    case Nil{}:
      0n
    case h <> t:
      1n+Board.len(t)

def Board.swap_at(xs: List<&2, Nat>, +n: Nat) -> List<&2, Nat>:
  match xs n:
    case Nil{} n:
      Nil{}
    case +a <> Nil{} n:
      a <> Nil{}
    case +a <> (+b <> +r) 0n:
      b <> (a <> r)
    case +a <> (+b <> +r) 1n+p:
      a <> Board.swap_at(b <> r, p)

def Board.step(s: Board, c: Drag) -> Board:
  match s c:
    case Board{xs} Drag{n}:
      Board{Board.swap_at(xs, n)}

def Board.items(s: Board) -> List<&2, Nat>:
  match s:
    case Board{xs}:
      xs

def Board.R_length_kept(+s: Board, c: Drag, t: Board) -> Bool:
  Nat.is_eq(Board.len(Board.items(t)), Board.len(Board.items(s)))

def Board.hit(b: Bool) -> Nat:
  match b:
    case True{}:
      1n
    case False{}:
      0n

# how many times item x appears
def Board.count(+x: Nat, xs: List<&2, Nat>) -> Nat:
  match xs:
    case Nil{}:
      0n
    case +h <> t:
      Nat.add(Board.hit(Nat.is_eq(x, h)), Board.count(x, t))

# every item of `all` appears as often in t as in s
def Board.covers(all: List<&2, Nat>, +s: List<&2, Nat>, +t: List<&2, Nat>) -> Bool:
  match all:
    case Nil{}:
      True{}
    case +h <> rest:
      Bool.and(Nat.is_eq(Board.count(h, t), Board.count(h, s)), Board.covers(rest, s, t))

# a drag is a permutation: same length, and every item appears as often as before
def Board.R_items_kept(+s: Board, +c: Drag, +t: Board) -> Bool:
  Bool.and(Board.R_length_kept(s, c, t), Board.covers(Board.items(s), Board.items(s), Board.items(t)))
