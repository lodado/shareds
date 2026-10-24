import Base

# Reference model for the cells fixture: one document moves between review phases. Every event from
# anyone gets an outcome kept in the state: it moves the document, keeps it, or is refused with a
# reason. The laws are three-argument relations over (state before, event, state after).
type Phase is Data:
  Draft{}
  InReview{}
  Published{}
  Archived{}

type Why is Data:
  NotOwner{}
  WrongPhase{}

type Last is Data:
  Began{}
  Moved{}
  Stayed{}
  Refused{why: Why}

type Doc is Data:
  Doc{phase: Phase, last: Last}

type Msg is Data:
  Submit{owner: Bool}
  Approve{owner: Bool}
  Reject{owner: Bool}
  Archive{owner: Bool}

def Doc.init() -> Doc:
  Doc{Draft{}, Began{}}

def Doc.refuse(+p: Phase) -> Doc:
  Doc{p, Refused{WrongPhase{}}}

def Doc.decide(+p: Phase, m: Msg) -> Doc:
  match p m:
    case Draft{} Submit{o}:
      Doc{InReview{}, Moved{}}
    case InReview{} Approve{o}:
      Doc{Published{}, Moved{}}
    case InReview{} Reject{o}:
      Doc{Draft{}, Moved{}}
    case Published{} Archive{o}:
      Doc{Archived{}, Moved{}}
    case Archived{} Archive{o}:
      Doc{Archived{}, Stayed{}}
    case _ _:
      Doc.refuse(p)

def Doc.owner(m: Msg) -> Bool:
  match m:
    case Submit{o}:
      o
    case Approve{o}:
      o
    case Reject{o}:
      o
    case Archive{o}:
      o

def Doc.gate(trusted: Bool, +p: Phase, m: Msg) -> Doc:
  match trusted:
    case True{}:
      Doc.decide(p, m)
    case False{}:
      Doc{p, Refused{NotOwner{}}}

def Doc.step(s: Doc, +m: Msg) -> Doc:
  match s:
    case Doc{+p, last}:
      Doc.gate(Doc.owner(m), p, m)

def Doc.observe(s: Doc) -> Doc:
  s

def Doc.run(ms: List<Msg>, s: Doc) -> Doc:
  match ms:
    case Nil{}:
      s
    case Con{m, rest}:
      Doc.run(rest, Doc.step(s, m))

def Doc.next(h: List<Msg>) -> List<Msg>:
  [Submit{True{}}, Submit{False{}}, Approve{True{}}, Approve{False{}}, Reject{True{}}, Reject{False{}}, Archive{True{}}, Archive{False{}}]

# ---- vocabulary of the laws
def Doc.imp(a: Bool, b: Bool) -> Bool:
  Bool.or(Bool.not(a), b)

def Doc.same_phase(a: Phase, b: Phase) -> Bool:
  match a b:
    case Draft{} Draft{}:
      True{}
    case InReview{} InReview{}:
      True{}
    case Published{} Published{}:
      True{}
    case Archived{} Archived{}:
      True{}
    case _ _:
      False{}

def Doc.phase(s: Doc) -> Phase:
  match s:
    case Doc{p, last}:
      p

def Doc.is_phase(s: Doc, +p: Phase) -> Bool:
  Doc.same_phase(Doc.phase(s), p)

def Doc.moved(s: Doc) -> Bool:
  match s:
    case Doc{p, Moved{}}:
      True{}
    case _:
      False{}

def Doc.stayed(s: Doc) -> Bool:
  match s:
    case Doc{p, Stayed{}}:
      True{}
    case _:
      False{}

def Doc.refused(s: Doc) -> Bool:
  match s:
    case Doc{p, Refused{w}}:
      True{}
    case _:
      False{}

def Doc.refused_as(s: Doc, +w: Why) -> Bool:
  match s w:
    case Doc{p, Refused{NotOwner{}}} NotOwner{}:
      True{}
    case Doc{p, Refused{WrongPhase{}}} WrongPhase{}:
      True{}
    case _ _:
      False{}

def Doc.is_submit(m: Msg) -> Bool:
  match m:
    case Submit{o}:
      True{}
    case _:
      False{}

def Doc.is_approve(m: Msg) -> Bool:
  match m:
    case Approve{o}:
      True{}
    case _:
      False{}

def Doc.is_reject(m: Msg) -> Bool:
  match m:
    case Reject{o}:
      True{}
    case _:
      False{}

def Doc.is_archive(m: Msg) -> Bool:
  match m:
    case Archive{o}:
      True{}
    case _:
      False{}

# What each phase takes from the owner. Anything else is the wrong phase.
def Doc.takes(+s: Doc, +m: Msg) -> Bool:
  Bool.or(Bool.and(Doc.is_phase(s, Draft{}), Doc.is_submit(m)), Bool.or(Bool.and(Doc.is_phase(s, InReview{}), Bool.or(Doc.is_approve(m), Doc.is_reject(m))), Bool.and(Bool.or(Doc.is_phase(s, Published{}), Doc.is_phase(s, Archived{})), Doc.is_archive(m))))

# ---- laws, as relations over (state before, event, state after); LAWS.bend states each one
# forward: the owner submitting a draft puts it in review
def Doc.R_submit_reviews(+s: Doc, +m: Msg, +t: Doc) -> Bool:
  Doc.imp(Bool.and(Doc.owner(m), Bool.and(Doc.is_phase(s, Draft{}), Doc.is_submit(m))), Bool.and(Doc.is_phase(t, InReview{}), Doc.moved(t)))

# forward: the owner approving a document in review publishes it
def Doc.R_approve_publishes(+s: Doc, +m: Msg, +t: Doc) -> Bool:
  Doc.imp(Bool.and(Doc.owner(m), Bool.and(Doc.is_phase(s, InReview{}), Doc.is_approve(m))), Bool.and(Doc.is_phase(t, Published{}), Doc.moved(t)))

# forward: the owner rejecting a document in review returns it to draft
def Doc.R_reject_returns(+s: Doc, +m: Msg, +t: Doc) -> Bool:
  Doc.imp(Bool.and(Doc.owner(m), Bool.and(Doc.is_phase(s, InReview{}), Doc.is_reject(m))), Bool.and(Doc.is_phase(t, Draft{}), Doc.moved(t)))

# forward: the owner archiving a published document archives it
def Doc.R_archive_archives(+s: Doc, +m: Msg, +t: Doc) -> Bool:
  Doc.imp(Bool.and(Doc.owner(m), Bool.and(Doc.is_phase(s, Published{}), Doc.is_archive(m))), Bool.and(Doc.is_phase(t, Archived{}), Doc.moved(t)))

# forward: archiving an archived document again is accepted and keeps it
def Doc.R_archive_again_stays(+s: Doc, +m: Msg, +t: Doc) -> Bool:
  Doc.imp(Bool.and(Doc.owner(m), Bool.and(Doc.is_phase(s, Archived{}), Doc.is_archive(m))), Doc.stayed(t))

# refusal: an event from anyone but the owner is refused as not the owner
def Doc.R_not_owner_refused(+s: Doc, +m: Msg, +t: Doc) -> Bool:
  Doc.imp(Bool.not(Doc.owner(m)), Doc.refused_as(t, NotOwner{}))

# refusal: an owner event the phase does not take is refused as the wrong phase
def Doc.R_wrong_phase_refused(+s: Doc, +m: Msg, +t: Doc) -> Bool:
  Doc.imp(Bool.and(Doc.owner(m), Bool.not(Doc.takes(s, m))), Doc.refused_as(t, WrongPhase{}))

# frame: a refused or stayed event keeps the phase
def Doc.R_refused_keeps(+s: Doc, +m: Msg, +t: Doc) -> Bool:
  Doc.imp(Doc.refused(t), Doc.same_phase(Doc.phase(t), Doc.phase(s)))

def Doc.R_stayed_keeps(+s: Doc, +m: Msg, +t: Doc) -> Bool:
  Doc.imp(Doc.stayed(t), Doc.same_phase(Doc.phase(t), Doc.phase(s)))
