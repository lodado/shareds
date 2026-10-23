import Base

# stale-search with the environment inside the model state. `open` holds the issued request ids that
# have not been answered yet, newest first; `observe` reads only `shown`, and `next` is derived from
# the state instead of re-reading the history.
type Msg is Data:
  Issue{}
  Respond{id: Nat}

type Search is Data:
  Search{latest: Nat, shown: Nat, open: List<&2, Nat>}

def Search.init() -> Search:
  Search{0n, 0n, Nil{}}

def Search.pick(hit: Bool, id: Nat, shown: Nat) -> Nat:
  match hit:
    case True{}:
      id
    case False{}:
      shown

def Search.keep(hit: Bool, h: Nat, rest: List<&2, Nat>) -> List<&2, Nat>:
  match hit:
    case True{}:
      rest
    case False{}:
      h <> rest

def Search.drop(xs: List<&2, Nat>, +id: Nat) -> List<&2, Nat>:
  match xs:
    case Nil{}:
      Nil{}
    case +h <> t:
      Search.keep(Nat.is_eq(h, id), h, Search.drop(t, id))

def Search.step(s: Search, m: Msg) -> Search:
  match s m:
    case Search{+latest, shown, open} Issue{}:
      Search{1n+latest, shown, (1n+latest) <> open}
    case Search{+latest, shown, open} Respond{+id}:
      Search{latest, Search.pick(Nat.is_eq(id, latest), id, shown), Search.drop(open, id)}

def Search.observe(s: Search) -> Nat:
  match s:
    case Search{latest, shown, open}:
      shown

def Search.ok(s: Search) -> Bool:
  match s:
    case Search{latest, shown, open}:
      Nat.is_le(shown, latest)

def Search.run(ms: List<Msg>, s: Search) -> Search:
  match ms:
    case Nil{}:
      s
    case Con{m, rest}:
      Search.run(rest, Search.step(s, m))

def Search.responses(xs: List<&2, Nat>) -> List<Msg>:
  match xs:
    case Nil{}:
      Nil{}
    case h <> t:
      Respond{h} <> Search.responses(t)

def Search.enabled(s: Search) -> List<Msg>:
  match s:
    case Search{latest, shown, open}:
      Issue{} <> Search.responses(open)

def Search.next(h: List<Msg>) -> List<Msg>:
  Search.enabled(Search.run(h, Search.init()))
