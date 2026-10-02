import Base

type Entry is Data:
  Fresh{}
  Reload{}
  BackForward{}
  DeepLink{}

type PageParam is Data:
  Valid{}
  Invalid{}
  OutOfRange{}

type Volume is Data:
  Empty{}
  One{}
  Full{}
  FullPlusOne{}

type Pager is Data:
  Pager{entry: Entry, pageParam: PageParam, volume: Volume, landsOnRequested: Bool}

def Pager.isFresh(e: Entry) -> Bool:
  match e:
    case Fresh{}:
      True{}
    case Reload{}:
      False{}
    case BackForward{}:
      False{}
    case DeepLink{}:
      False{}

def Pager.isValid(p: PageParam) -> Bool:
  match p:
    case Valid{}:
      True{}
    case Invalid{}:
      False{}
    case OutOfRange{}:
      False{}

# A1: a fresh entry carries no page parameter, so it always lands on the default first page
def Pager.A1(w: Pager) -> Bool:
  match w:
    case Pager{e, p, v, l}:
      Bool.or(Bool.not(Pager.isFresh(e)), Pager.isValid(p))

# G1: a valid page parameter lands on the page it names
def Pager.G1(w: Pager) -> Bool:
  match w:
    case Pager{e, p, v, l}:
      Bool.or(Bool.not(Pager.isValid(p)), l)
