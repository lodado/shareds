import Base

# Analyst world for the stale-search fixture (model-first path, oracle.package.json S4). Written from the
# fixture policy text (README.md, S1) alone: one attempt issues request 1 and then request 2 — the first two
# requests of the session, or the ninth and tenth; response 1 arrives before request 2 is issued or after
# it, and either response may carry no results. The record holds the facts the policy talks about, including
# outcomes it forbids — an older result shown after the newer request was issued, a final list that is not
# the newer result, results that are not the shown response's.
# It deliberately does not import MODEL.bend: the behavior model is the contract author's reading.
# Space v3 added OldEarly, oldEmpty and newEmpty, space v4 longSession — each from a discovery round
# (oracle.package.json axisOrigins).

type Arrival is Data:
  OldFirst{}
  NewFirst{}
  OldEarly{}

type Shown is Data:
  NoneShown{}
  OldShown{}
  NewShown{}

type Race is Data:
  Race{arrival: Arrival, newAnswers: Bool, oldEmpty: Bool, newEmpty: Bool, longSession: Bool, final: Shown, oldShown: Bool, itemsIntact: Bool}

def Race.imp(a: Bool, b: Bool) -> Bool:
  Bool.or(Bool.not(a), b)

def Race.isNone(s: Shown) -> Bool:
  match s:
    case NoneShown{}:
      True{}
    case OldShown{}:
      False{}
    case NewShown{}:
      False{}

def Race.isOld(s: Shown) -> Bool:
  match s:
    case NoneShown{}:
      False{}
    case OldShown{}:
      True{}
    case NewShown{}:
      False{}

def Race.isNew(s: Shown) -> Bool:
  match s:
    case NoneShown{}:
      False{}
    case OldShown{}:
      False{}
    case NewShown{}:
      True{}

# response 1 arrived before request 2 was issued: it was the latest request's response then
def Race.isEarly(a: Arrival) -> Bool:
  match a:
    case OldFirst{}:
      False{}
    case NewFirst{}:
      False{}
    case OldEarly{}:
      True{}

# what the list showed when request 2 was issued: request 1's results when they had arrived, else nothing
def Race.kept(a: Arrival, f: Shown) -> Bool:
  match a:
    case OldFirst{}:
      Race.isNone(f)
    case NewFirst{}:
      Race.isNone(f)
    case OldEarly{}:
      Race.isOld(f)

# G1 (S1 item 2): a response to request 1 that arrives after request 2 was issued never changes what the
# list shows — not at the end and not on the way there; request 1's results stay only when they arrived
# before request 2 was issued (S1 item 1 keeps them)
def Race.G1(w: Race) -> Bool:
  match w:
    case Race{a, n, oe, ne, ls, f, o, i}:
      Bool.and(Bool.not(o), Race.imp(Race.isOld(f), Race.isEarly(a)))

# G2 (S1 item 3): when the newer request answers, its response is what the list ends with — also when it
# carries no results
def Race.G2(w: Race) -> Bool:
  match w:
    case Race{a, n, oe, ne, ls, f, o, i}:
      Race.imp(n, Race.isNew(f))

# G3 (S1 items 1 and 3): the normal path is possible — the newer answer is shown and nothing older was
def Race.G3(w: Race) -> Bool:
  match w:
    case Race{a, n, oe, ne, ls, f, o, i}:
      Bool.and(n, Bool.and(Race.isNew(f), Bool.not(o)))

# G4 (S1 items 1 and 2): without the newer answer the list keeps showing what it showed when request 2 was
# issued — request 1's results when they had arrived, else nothing
def Race.G4(w: Race) -> Bool:
  match w:
    case Race{a, n, oe, ne, ls, f, o, i}:
      Race.imp(Bool.not(n), Race.kept(a, f))

# G5 (S1 item 3): after every event the list displays exactly the results of the response it shows, and
# none when it shows none — added when the mutant that empties the items (F5) survived space v1, and judged
# after every event since space v3
def Race.G5(w: Race) -> Bool:
  match w:
    case Race{a, n, oe, ne, ls, f, o, i}:
      i

# Contract predicates, named by model symbol; the Oracle card gives them row IDs when it is projected.

# the newer request's response is what the list ends with
def Race.latestShown(w: Race) -> Bool:
  match w:
    case Race{a, n, oe, ne, ls, f, o, i}:
      Race.imp(n, Race.isNew(f))

# a response to request 1 that arrives after request 2 is issued is never shown, at any step
def Race.staleNeverShown(w: Race) -> Bool:
  match w:
    case Race{a, n, oe, ne, ls, f, o, i}:
      Bool.and(Bool.not(o), Race.imp(Race.isOld(f), Race.isEarly(a)))

# without the newer answer the list keeps showing what it showed when request 2 was issued
def Race.unansweredKeeps(w: Race) -> Bool:
  match w:
    case Race{a, n, oe, ne, ls, f, o, i}:
      Race.imp(Bool.not(n), Race.kept(a, f))

# after every event the list displays exactly the results of the response it shows, and none when it shows none
def Race.itemsShown(w: Race) -> Bool:
  match w:
    case Race{a, n, oe, ne, ls, f, o, i}:
      i
