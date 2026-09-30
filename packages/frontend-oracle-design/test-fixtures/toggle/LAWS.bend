import Base
import ./MODEL.bend as M

# Approved laws for the toggle fixture, stated with the relations the generated tests evaluate.

# P1: a blocked toggle ignores Set
law blocked_keeps:
  for s: M.Toggle
  for c: M.Cmd
  {M.Toggle.R_blocked_keeps(s, c, M.Toggle.step(s, c)) == True{} : Bool}

# P2: a free toggle applies Set
law free_applies:
  for s: M.Toggle
  for c: M.Cmd
  {M.Toggle.R_free_applies(s, c, M.Toggle.step(s, c)) == True{} : Bool}
