import Base
import ./MODEL.bend as M

# Each law: the relation holds for every state and event of the model.

law submit_reviews:
  for s: M.Doc
  for m: M.Msg
  {M.Doc.R_submit_reviews(s, m, M.Doc.step(s, m)) == True{} : Bool}

law approve_publishes:
  for s: M.Doc
  for m: M.Msg
  {M.Doc.R_approve_publishes(s, m, M.Doc.step(s, m)) == True{} : Bool}

law reject_returns:
  for s: M.Doc
  for m: M.Msg
  {M.Doc.R_reject_returns(s, m, M.Doc.step(s, m)) == True{} : Bool}

law archive_archives:
  for s: M.Doc
  for m: M.Msg
  {M.Doc.R_archive_archives(s, m, M.Doc.step(s, m)) == True{} : Bool}

law archive_again_stays:
  for s: M.Doc
  for m: M.Msg
  {M.Doc.R_archive_again_stays(s, m, M.Doc.step(s, m)) == True{} : Bool}

law not_owner_refused:
  for s: M.Doc
  for m: M.Msg
  {M.Doc.R_not_owner_refused(s, m, M.Doc.step(s, m)) == True{} : Bool}

law wrong_phase_refused:
  for s: M.Doc
  for m: M.Msg
  {M.Doc.R_wrong_phase_refused(s, m, M.Doc.step(s, m)) == True{} : Bool}

law refused_keeps:
  for s: M.Doc
  for m: M.Msg
  {M.Doc.R_refused_keeps(s, m, M.Doc.step(s, m)) == True{} : Bool}

law stayed_keeps:
  for s: M.Doc
  for m: M.Msg
  {M.Doc.R_stayed_keeps(s, m, M.Doc.step(s, m)) == True{} : Bool}
