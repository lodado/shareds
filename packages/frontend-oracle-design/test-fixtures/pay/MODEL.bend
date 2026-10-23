import Base

# Reference model for the pay fixture: one payment order. A second click while the request is
# pending sends nothing new, a duplicate completion after payment changes nothing, and a failed
# attempt may be retried. `charges` counts server-side charges, which the contract observes.
type State is Data:
  Idle{}
  Pending{}
  Paid{}
  Errored{}

type Msg is Data:
  Submit{}
  Resolve{}
  Reject{}

type Pay is Data:
  Pay{state: State, charges: Nat}

def Pay.init() -> Pay:
  Pay{Idle{}, 0n}

def Pay.step(s: Pay, m: Msg) -> Pay:
  match s m:
    case Pay{Idle{}, c} Submit{}:
      Pay{Pending{}, c}
    case Pay{Idle{}, c} Resolve{}:
      Pay{Idle{}, c}
    case Pay{Idle{}, c} Reject{}:
      Pay{Idle{}, c}
    case Pay{Pending{}, c} Submit{}:
      Pay{Pending{}, c}
    case Pay{Pending{}, c} Resolve{}:
      Pay{Paid{}, 1n+c}
    case Pay{Pending{}, c} Reject{}:
      Pay{Errored{}, c}
    case Pay{Paid{}, c} Submit{}:
      Pay{Paid{}, c}
    case Pay{Paid{}, c} Resolve{}:
      Pay{Paid{}, c}
    case Pay{Paid{}, c} Reject{}:
      Pay{Paid{}, c}
    case Pay{Errored{}, c} Submit{}:
      Pay{Pending{}, c}
    case Pay{Errored{}, c} Resolve{}:
      Pay{Errored{}, c}
    case Pay{Errored{}, c} Reject{}:
      Pay{Errored{}, c}

def Pay.observe(s: Pay) -> Pay:
  s

def Pay.at_most_one(s: Pay) -> Bool:
  match s:
    case Pay{st, c}:
      Nat.is_le(c, 1n)

def Pay.run(ms: List<Msg>, s: Pay) -> Pay:
  match ms:
    case Nil{}:
      s
    case Con{m, rest}:
      Pay.run(rest, Pay.step(s, m))

# Environment: the user may click and the server may answer at any time, in any order, any number of times.
def Pay.next(h: List<Msg>) -> List<Msg>:
  [Submit{}, Resolve{}, Reject{}]
