import Base

# Revision 1 of the analyst world, kept as the record the draft package (oracle.package.draft.json) was
# checked against; the current world is World.bend. Written from the
# fixture policy text (README.md, S1) alone: one attempt issues request 1 and then request 2 before any
# response arrives. The record holds the facts the policy talks about, including outcomes it forbids —
# an older result shown after the newer request was issued, or a final list that is not the newer result.
# It deliberately does not import MODEL.bend: the behavior model is the contract author's reading.

type Arrival is Data:
  OldFirst{}
  NewFirst{}

type Shown is Data:
  NoneShown{}
  OldShown{}
  NewShown{}

type Race is Data:
  Race{arrival: Arrival, newAnswers: Bool, final: Shown, oldShown: Bool}

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

# G1 (S1 item 2): once request 2 is issued, the list never shows request 1's results — not at the end
# and not on the way there
def Race.G1(w: Race) -> Bool:
  match w:
    case Race{a, n, f, o}:
      Bool.and(Bool.not(o), Bool.not(Race.isOld(f)))

# G2 (S1 item 3): when the newer request answers, its results are what the list ends with
def Race.G2(w: Race) -> Bool:
  match w:
    case Race{a, n, f, o}:
      Race.imp(n, Race.isNew(f))

# G3 (S1 items 1 and 3): the normal path is possible — the newer answer is shown and nothing older was
def Race.G3(w: Race) -> Bool:
  match w:
    case Race{a, n, f, o}:
      Bool.and(n, Bool.and(Race.isNew(f), Bool.not(o)))

# G4 (S1 items 1 and 2): without the newer answer the list keeps what it showed before the attempt —
# nothing, since the attempt starts from an empty list
def Race.G4(w: Race) -> Bool:
  match w:
    case Race{a, n, f, o}:
      Race.imp(Bool.not(n), Race.isNone(f))

# Contract predicates, named by model symbol; the Oracle card gives them row IDs when it is projected.

# the newer request's response is what the list ends with
def Race.latestShown(w: Race) -> Bool:
  match w:
    case Race{a, n, f, o}:
      Race.imp(n, Race.isNew(f))

# first draft: the list does not end with the older result (an end-state reading of item 2)
def Race.staleNeverFinal(w: Race) -> Bool:
  match w:
    case Race{a, n, f, o}:
      Bool.not(Race.isOld(f))

# refined: the older result is never shown after request 2 is issued, at any step
def Race.staleNeverShown(w: Race) -> Bool:
  match w:
    case Race{a, n, f, o}:
      Bool.and(Bool.not(o), Bool.not(Race.isOld(f)))

# without the newer answer the list keeps showing nothing
def Race.unansweredKeeps(w: Race) -> Bool:
  match w:
    case Race{a, n, f, o}:
      Race.imp(Bool.not(n), Race.isNone(f))
