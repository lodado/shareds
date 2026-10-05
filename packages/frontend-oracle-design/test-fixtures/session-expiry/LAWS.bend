import Base
import ./MODEL.bend as M

# Approved laws of the session-expiry fixture, stated as the relations the projection evaluates.

# P1: an expired session never issues a payment request on submit
law expired_blocks:
  for s: M.Session
  for c: M.Cmd
  {M.Session.R_expired_blocks(s, c, M.Session.step(s, c)) == True{} : Bool}

# P2: a live session issues the payment request on submit
law live_sends:
  for s: M.Session
  for c: M.Cmd
  {M.Session.R_live_sends(s, c, M.Session.step(s, c)) == True{} : Bool}
