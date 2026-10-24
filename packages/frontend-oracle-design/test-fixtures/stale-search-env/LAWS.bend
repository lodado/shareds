import Base
import ./MODEL.bend as M

# The list never shows a result newer than the latest request, after any sequence of events
law shown_le_latest:
  for t: List<M.Msg>
  {M.Search.ok(M.Search.run(t, M.Search.init())) == True{} : Bool}
