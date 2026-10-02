import Base

# Server-paginated table: the indicator shows the requested page at once; the rows change only when the
# response for the page now requested arrives. A response for an older request is ignored.
type Pg is Data:
  P1{}
  P2{}
  P3{}

type Msg is Data:
  GoTo{pg: Pg}
  Arrive{pg: Pg}

type Grid is Data:
  Grid{page: Pg, rows: Pg}

def Pg.eq(a: Pg, b: Pg) -> Bool:
  match a b:
    case P1{} P1{}:
      True{}
    case P2{} P2{}:
      True{}
    case P3{} P3{}:
      True{}
    case _ _:
      False{}

def Grid.init() -> Grid:
  Grid{P1{}, P1{}}

def Grid.arrive(hit: Bool, q: Pg, page: Pg, rows: Pg) -> Grid:
  match hit:
    case True{}:
      Grid{page, q}
    case False{}:
      Grid{page, rows}

def Grid.step(s: Grid, m: Msg) -> Grid:
  match s m:
    case Grid{page, rows} GoTo{p}:
      Grid{p, rows}
    case Grid{+page, rows} Arrive{+q}:
      Grid.arrive(Pg.eq(q, page), q, page, rows)

def Grid.observe(s: Grid) -> Grid:
  s

# Environment: the user may go to any page at any time; a response may arrive for every page requested
# and not answered since, in any order.
type Out is Data:
  Out{a: Bool, b: Bool, c: Bool}

def Out.set(o: Out, p: Pg, v: Bool) -> Out:
  match o p:
    case Out{a, b, c} P1{}:
      Out{v, b, c}
    case Out{a, b, c} P2{}:
      Out{a, v, c}
    case Out{a, b, c} P3{}:
      Out{a, b, v}

def Env.scan(h: +List<Msg>, o: Out) -> Out:
  match h:
    case Nil{}:
      o
    case Con{GoTo{p}, rest}:
      Env.scan(rest, Out.set(o, p, True{}))
    case Con{Arrive{p}, rest}:
      Env.scan(rest, Out.set(o, p, False{}))

def Env.keep(on: Bool, p: Pg, rest: List<Msg>) -> List<Msg>:
  match on:
    case True{}:
      Arrive{p} <> rest
    case False{}:
      rest

def Env.arrivals(o: Out) -> List<Msg>:
  match o:
    case Out{a, b, c}:
      Env.keep(a, P1{}, Env.keep(b, P2{}, Env.keep(c, P3{}, Nil{})))

def Grid.next(+h: +List<Msg>) -> List<Msg>:
  GoTo{P1{}} <> (GoTo{P2{}} <> (GoTo{P3{}} <> Env.arrivals(Env.scan(h, Out{False{}, False{}, False{}}))))

# Classifiers for the space cross-check: which value of a declared axis, state or event each step shows. They read
# the model; they add no behavior.
type Arrival is Data:
  NoArrival{}
  InOrder{}
  Overtaken{}

type Response is Data:
  NoResponse{}
  Answered{}

type Phase is Data:
  Showing{}
  Waiting{}

type Step is Data:
  Navigate{}
  CurrentReply{}
  StaleReply{}

def Grid.arrivalOf(hit: Bool) -> Arrival:
  match hit:
    case True{}:
      InOrder{}
    case False{}:
      Overtaken{}

def Grid.arrival(s: Grid, m: Msg) -> Arrival:
  match s m:
    case Grid{page, rows} GoTo{p}:
      NoArrival{}
    case Grid{page, rows} Arrive{q}:
      Grid.arrivalOf(Pg.eq(q, page))

def Grid.response(s: Grid, m: Msg) -> Response:
  match m:
    case GoTo{p}:
      NoResponse{}
    case Arrive{q}:
      Answered{}

def Grid.phaseOf(same: Bool) -> Phase:
  match same:
    case True{}:
      Showing{}
    case False{}:
      Waiting{}

def Grid.phase(s: Grid) -> Phase:
  match s:
    case Grid{page, rows}:
      Grid.phaseOf(Pg.eq(page, rows))

def Grid.kindOf(hit: Bool) -> Step:
  match hit:
    case True{}:
      CurrentReply{}
    case False{}:
      StaleReply{}

def Grid.kind(s: Grid, m: Msg) -> Step:
  match s m:
    case Grid{page, rows} GoTo{p}:
      Navigate{}
    case Grid{page, rows} Arrive{q}:
      Grid.kindOf(Pg.eq(q, page))
