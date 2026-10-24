import Base

# Reference model for the pay-finite fixture: the pay fixture with its charge count in finite classes, so
# every type is finite and prove-reach can certify the safety def over every trace. A second click while
# the request is pending sends nothing new, a duplicate completion after payment changes nothing, and a
# failed attempt may be retried.
type State is Data:
  Idle{}
  Pending{}
  Paid{}
  Errored{}

type Msg is Data:
  Submit{}
  Resolve{}
  Reject{}

# A saturated counter: no charge, one charge, or more than one
type Charges is Data:
  NoCharge{}
  OneCharge{}
  ManyCharges{}

type Pay is Data:
  Pay{state: State, charges: Charges}

def Pay.more(c: Charges) -> Charges:
  match c:
    case NoCharge{}:
      OneCharge{}
    case OneCharge{}:
      ManyCharges{}
    case ManyCharges{}:
      ManyCharges{}

def Pay.init() -> Pay:
  Pay{Idle{}, NoCharge{}}

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
      Pay{Paid{}, Pay.more(c)}
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

def Pay.under_two(c: Charges) -> Bool:
  match c:
    case NoCharge{}:
      True{}
    case OneCharge{}:
      True{}
    case ManyCharges{}:
      False{}

def Pay.at_most_one(s: Pay) -> Bool:
  match s:
    case Pay{st, c}:
      Pay.under_two(c)

def Pay.run(ms: List<Msg>, s: Pay) -> Pay:
  match ms:
    case Nil{}:
      s
    case Con{m, rest}:
      Pay.run(rest, Pay.step(s, m))

# Environment: the user may click and the server may answer at any time, in any order, any number of times.
def Pay.next(h: List<Msg>) -> List<Msg>:
  [Submit{}, Resolve{}, Reject{}]
