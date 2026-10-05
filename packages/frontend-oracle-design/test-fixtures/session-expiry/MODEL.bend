import Base

# Reference model for the session-expiry fixture. Time is an event: `Expire` is the moment the
# session window ends; the duration lives only in the adapter. `sent` is the payment request the last
# command issued, so the request count is part of the observed state.
type Session is Data:
  Session{expired: Bool, sent: Bool}

type Cmd is Data:
  Submit{}
  Expire{}

def Session.imp(a: Bool, b: Bool) -> Bool:
  Bool.or(Bool.not(a), b)

def Session.expired(s: Session) -> Bool:
  match s:
    case Session{e, x}:
      e

def Session.sent(s: Session) -> Bool:
  match s:
    case Session{e, x}:
      x

def Session.is_submit(c: Cmd) -> Bool:
  match c:
    case Submit{}:
      True{}
    case Expire{}:
      False{}

def Session.step(s: Session, m: Cmd) -> Session:
  match s m:
    case Session{+e, x} Submit{}:
      Session{e, Bool.not(e)}
    case Session{e, x} Expire{}:
      Session{True{}, False{}}

# R_expired_blocks (P1): a submit after the session expired issues no payment request
def Session.R_expired_blocks(+s: Session, +c: Cmd, t: Session) -> Bool:
  Session.imp(Bool.and(Session.expired(s), Session.is_submit(c)), Bool.not(Session.sent(t)))

# R_live_sends (P2): a submit inside the window issues exactly one payment request
def Session.R_live_sends(+s: Session, +c: Cmd, t: Session) -> Bool:
  Session.imp(Bool.and(Bool.not(Session.expired(s)), Session.is_submit(c)), Session.sent(t))
