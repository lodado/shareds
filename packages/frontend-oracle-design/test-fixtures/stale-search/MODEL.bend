import Base

# Reference model for the stale-search fixture, locked with oracle.md. `oracle-model.mjs` compiles it
# to generate the oracle space: Search.init/step/observe are the expected behavior, Search.next is the
# declared environment. Request ids start at 1n and grow by one per issued request; 0n means "nothing".
type Msg is Data:
  Issue{}
  Respond{id: Nat}

type Search is Data:
  Search{latest: Nat, shown: Nat}

def Search.init() -> Search:
  Search{0n, 0n}

def Search.respond(hit: Bool, id: Nat, latest: Nat, shown: Nat) -> Search:
  match hit:
    case True{}:
      Search{latest, id}
    case False{}:
      Search{latest, shown}

def Search.step(s: Search, m: Msg) -> Search:
  match s m:
    case Search{+latest, shown} Issue{}:
      Search{1n+latest, shown}
    case Search{+latest, shown} Respond{+id}:
      Search.respond(Nat.is_eq(id, latest), id, latest, shown)

def Search.observe(s: Search) -> Nat:
  match s:
    case Search{latest, shown}:
      shown

def Search.run(ms: List<Msg>, s: Search) -> Search:
  match ms:
    case Nil{}:
      s
    case Con{m, rest}:
      Search.run(rest, Search.step(s, m))

# Environment: the user may always issue a request; a response may arrive for any issued request
# that has not answered yet, in any order. No response precedes its request and none repeats.
def Env.issued(h: +List<Msg>, n: Nat) -> Nat:
  match h:
    case Nil{}:
      n
    case Con{Issue{}, rest}:
      Env.issued(rest, 1n+n)
    case Con{Respond{_}, rest}:
      Env.issued(rest, n)

def Env.answered(h: +List<Msg>, +id: Nat) -> Bool:
  match h:
    case Nil{}:
      False{}
    case Con{Issue{}, rest}:
      Env.answered(rest, id)
    case Con{Respond{r}, rest}:
      Bool.or(Nat.is_eq(r, id), Env.answered(rest, id))

def Env.keep(done: Bool, id: Nat, rest: List<Msg>) -> List<Msg>:
  match done:
    case True{}:
      rest
    case False{}:
      Respond{id} <> rest

def Env.pending(+k: Nat, +h: +List<Msg>) -> List<Msg>:
  match k:
    case 0n:
      Nil{}
    case 1n+p:
      Env.keep(Env.answered(h, 1n+p), 1n+p, Env.pending(p, h))

def Search.next(+h: +List<Msg>) -> List<Msg>:
  Issue{} <> Env.pending(Env.issued(h, 0n), h)
