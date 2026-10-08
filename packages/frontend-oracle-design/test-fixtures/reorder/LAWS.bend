import Base
import ./MODEL.bend as M

law length_kept:
  for s: M.Board
  for c: M.Drag
  {M.Board.R_length_kept(s, c, M.Board.step(s, c)) == True{} : Bool}

law items_kept:
  for s: M.Board
  for c: M.Drag
  {M.Board.R_items_kept(s, c, M.Board.step(s, c)) == True{} : Bool}
