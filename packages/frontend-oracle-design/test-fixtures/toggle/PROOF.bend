import Base
import ./MODEL.bend as M
import ./LAWS.bend as Laws

# Case split over every state and command — the kernel re-checks each case.
def Laws.blocked_keeps(s, c):
  match s c:
    case M.Toggle{True{}, True{}, True{}} M.Set{True{}}:
      {==}
    case M.Toggle{True{}, True{}, True{}} M.Load{True{}}:
      {==}
    case M.Toggle{True{}, True{}, True{}} M.Disable{True{}}:
      {==}
    case M.Toggle{True{}, True{}, True{}} M.Set{False{}}:
      {==}
    case M.Toggle{True{}, True{}, True{}} M.Load{False{}}:
      {==}
    case M.Toggle{True{}, True{}, True{}} M.Disable{False{}}:
      {==}
    case M.Toggle{True{}, True{}, False{}} M.Set{True{}}:
      {==}
    case M.Toggle{True{}, True{}, False{}} M.Load{True{}}:
      {==}
    case M.Toggle{True{}, True{}, False{}} M.Disable{True{}}:
      {==}
    case M.Toggle{True{}, True{}, False{}} M.Set{False{}}:
      {==}
    case M.Toggle{True{}, True{}, False{}} M.Load{False{}}:
      {==}
    case M.Toggle{True{}, True{}, False{}} M.Disable{False{}}:
      {==}
    case M.Toggle{True{}, False{}, True{}} M.Set{True{}}:
      {==}
    case M.Toggle{True{}, False{}, True{}} M.Load{True{}}:
      {==}
    case M.Toggle{True{}, False{}, True{}} M.Disable{True{}}:
      {==}
    case M.Toggle{True{}, False{}, True{}} M.Set{False{}}:
      {==}
    case M.Toggle{True{}, False{}, True{}} M.Load{False{}}:
      {==}
    case M.Toggle{True{}, False{}, True{}} M.Disable{False{}}:
      {==}
    case M.Toggle{True{}, False{}, False{}} M.Set{True{}}:
      {==}
    case M.Toggle{True{}, False{}, False{}} M.Load{True{}}:
      {==}
    case M.Toggle{True{}, False{}, False{}} M.Disable{True{}}:
      {==}
    case M.Toggle{True{}, False{}, False{}} M.Set{False{}}:
      {==}
    case M.Toggle{True{}, False{}, False{}} M.Load{False{}}:
      {==}
    case M.Toggle{True{}, False{}, False{}} M.Disable{False{}}:
      {==}
    case M.Toggle{False{}, True{}, True{}} M.Set{True{}}:
      {==}
    case M.Toggle{False{}, True{}, True{}} M.Load{True{}}:
      {==}
    case M.Toggle{False{}, True{}, True{}} M.Disable{True{}}:
      {==}
    case M.Toggle{False{}, True{}, True{}} M.Set{False{}}:
      {==}
    case M.Toggle{False{}, True{}, True{}} M.Load{False{}}:
      {==}
    case M.Toggle{False{}, True{}, True{}} M.Disable{False{}}:
      {==}
    case M.Toggle{False{}, True{}, False{}} M.Set{True{}}:
      {==}
    case M.Toggle{False{}, True{}, False{}} M.Load{True{}}:
      {==}
    case M.Toggle{False{}, True{}, False{}} M.Disable{True{}}:
      {==}
    case M.Toggle{False{}, True{}, False{}} M.Set{False{}}:
      {==}
    case M.Toggle{False{}, True{}, False{}} M.Load{False{}}:
      {==}
    case M.Toggle{False{}, True{}, False{}} M.Disable{False{}}:
      {==}
    case M.Toggle{False{}, False{}, True{}} M.Set{True{}}:
      {==}
    case M.Toggle{False{}, False{}, True{}} M.Load{True{}}:
      {==}
    case M.Toggle{False{}, False{}, True{}} M.Disable{True{}}:
      {==}
    case M.Toggle{False{}, False{}, True{}} M.Set{False{}}:
      {==}
    case M.Toggle{False{}, False{}, True{}} M.Load{False{}}:
      {==}
    case M.Toggle{False{}, False{}, True{}} M.Disable{False{}}:
      {==}
    case M.Toggle{False{}, False{}, False{}} M.Set{True{}}:
      {==}
    case M.Toggle{False{}, False{}, False{}} M.Load{True{}}:
      {==}
    case M.Toggle{False{}, False{}, False{}} M.Disable{True{}}:
      {==}
    case M.Toggle{False{}, False{}, False{}} M.Set{False{}}:
      {==}
    case M.Toggle{False{}, False{}, False{}} M.Load{False{}}:
      {==}
    case M.Toggle{False{}, False{}, False{}} M.Disable{False{}}:
      {==}

def Laws.free_applies(s, c):
  match s c:
    case M.Toggle{True{}, True{}, True{}} M.Set{True{}}:
      {==}
    case M.Toggle{True{}, True{}, True{}} M.Load{True{}}:
      {==}
    case M.Toggle{True{}, True{}, True{}} M.Disable{True{}}:
      {==}
    case M.Toggle{True{}, True{}, True{}} M.Set{False{}}:
      {==}
    case M.Toggle{True{}, True{}, True{}} M.Load{False{}}:
      {==}
    case M.Toggle{True{}, True{}, True{}} M.Disable{False{}}:
      {==}
    case M.Toggle{True{}, True{}, False{}} M.Set{True{}}:
      {==}
    case M.Toggle{True{}, True{}, False{}} M.Load{True{}}:
      {==}
    case M.Toggle{True{}, True{}, False{}} M.Disable{True{}}:
      {==}
    case M.Toggle{True{}, True{}, False{}} M.Set{False{}}:
      {==}
    case M.Toggle{True{}, True{}, False{}} M.Load{False{}}:
      {==}
    case M.Toggle{True{}, True{}, False{}} M.Disable{False{}}:
      {==}
    case M.Toggle{True{}, False{}, True{}} M.Set{True{}}:
      {==}
    case M.Toggle{True{}, False{}, True{}} M.Load{True{}}:
      {==}
    case M.Toggle{True{}, False{}, True{}} M.Disable{True{}}:
      {==}
    case M.Toggle{True{}, False{}, True{}} M.Set{False{}}:
      {==}
    case M.Toggle{True{}, False{}, True{}} M.Load{False{}}:
      {==}
    case M.Toggle{True{}, False{}, True{}} M.Disable{False{}}:
      {==}
    case M.Toggle{True{}, False{}, False{}} M.Set{True{}}:
      {==}
    case M.Toggle{True{}, False{}, False{}} M.Load{True{}}:
      {==}
    case M.Toggle{True{}, False{}, False{}} M.Disable{True{}}:
      {==}
    case M.Toggle{True{}, False{}, False{}} M.Set{False{}}:
      {==}
    case M.Toggle{True{}, False{}, False{}} M.Load{False{}}:
      {==}
    case M.Toggle{True{}, False{}, False{}} M.Disable{False{}}:
      {==}
    case M.Toggle{False{}, True{}, True{}} M.Set{True{}}:
      {==}
    case M.Toggle{False{}, True{}, True{}} M.Load{True{}}:
      {==}
    case M.Toggle{False{}, True{}, True{}} M.Disable{True{}}:
      {==}
    case M.Toggle{False{}, True{}, True{}} M.Set{False{}}:
      {==}
    case M.Toggle{False{}, True{}, True{}} M.Load{False{}}:
      {==}
    case M.Toggle{False{}, True{}, True{}} M.Disable{False{}}:
      {==}
    case M.Toggle{False{}, True{}, False{}} M.Set{True{}}:
      {==}
    case M.Toggle{False{}, True{}, False{}} M.Load{True{}}:
      {==}
    case M.Toggle{False{}, True{}, False{}} M.Disable{True{}}:
      {==}
    case M.Toggle{False{}, True{}, False{}} M.Set{False{}}:
      {==}
    case M.Toggle{False{}, True{}, False{}} M.Load{False{}}:
      {==}
    case M.Toggle{False{}, True{}, False{}} M.Disable{False{}}:
      {==}
    case M.Toggle{False{}, False{}, True{}} M.Set{True{}}:
      {==}
    case M.Toggle{False{}, False{}, True{}} M.Load{True{}}:
      {==}
    case M.Toggle{False{}, False{}, True{}} M.Disable{True{}}:
      {==}
    case M.Toggle{False{}, False{}, True{}} M.Set{False{}}:
      {==}
    case M.Toggle{False{}, False{}, True{}} M.Load{False{}}:
      {==}
    case M.Toggle{False{}, False{}, True{}} M.Disable{False{}}:
      {==}
    case M.Toggle{False{}, False{}, False{}} M.Set{True{}}:
      {==}
    case M.Toggle{False{}, False{}, False{}} M.Load{True{}}:
      {==}
    case M.Toggle{False{}, False{}, False{}} M.Disable{True{}}:
      {==}
    case M.Toggle{False{}, False{}, False{}} M.Set{False{}}:
      {==}
    case M.Toggle{False{}, False{}, False{}} M.Load{False{}}:
      {==}
    case M.Toggle{False{}, False{}, False{}} M.Disable{False{}}:
      {==}
