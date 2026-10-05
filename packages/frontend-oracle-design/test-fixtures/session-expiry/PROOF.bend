import Base
import ./MODEL.bend as M
import ./LAWS.bend as Laws

# Case split over every state and command — the kernel re-checks each case.
def Laws.expired_blocks(s, c):
  match s c:
    case M.Session{True{}, True{}} M.Submit{}:
      {==}
    case M.Session{True{}, True{}} M.Expire{}:
      {==}
    case M.Session{True{}, False{}} M.Submit{}:
      {==}
    case M.Session{True{}, False{}} M.Expire{}:
      {==}
    case M.Session{False{}, True{}} M.Submit{}:
      {==}
    case M.Session{False{}, True{}} M.Expire{}:
      {==}
    case M.Session{False{}, False{}} M.Submit{}:
      {==}
    case M.Session{False{}, False{}} M.Expire{}:
      {==}

def Laws.live_sends(s, c):
  match s c:
    case M.Session{True{}, True{}} M.Submit{}:
      {==}
    case M.Session{True{}, True{}} M.Expire{}:
      {==}
    case M.Session{True{}, False{}} M.Submit{}:
      {==}
    case M.Session{True{}, False{}} M.Expire{}:
      {==}
    case M.Session{False{}, True{}} M.Submit{}:
      {==}
    case M.Session{False{}, True{}} M.Expire{}:
      {==}
    case M.Session{False{}, False{}} M.Submit{}:
      {==}
    case M.Session{False{}, False{}} M.Expire{}:
      {==}
