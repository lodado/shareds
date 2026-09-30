import Base
import ./MODEL.bend as M

# Approved laws for the stale-search fixture (card: oracle.md, policies P1-P3). Locked with the card;
# PROOF.bend proves them. They state facts about the reference model, not about search-reducer.ts.

# P2: a response to an older request leaves the state unchanged
law stale_ignored:
  for latest: Nat
  for shown: Nat
  for id: Nat
  for h: {Nat.is_lt(id, latest) == True{} : Bool}
  {M.Search.step(M.Search{latest, shown}, M.Respond{id}) == M.Search{latest, shown} : M.Search}

# P3: the latest request's response is shown
law latest_applied:
  for latest: Nat
  for shown: Nat
  {M.Search.step(M.Search{latest, shown}, M.Respond{latest}) == M.Search{latest, latest} : M.Search}

# P1: issuing a request makes it the latest and keeps what is shown
law issue_advances:
  for latest: Nat
  for shown: Nat
  {M.Search.step(M.Search{latest, shown}, M.Issue{}) == M.Search{1n+latest, shown} : M.Search}

# P3 witness: from the initial state, some trace shows the latest result — the laws above do not
# hold only because nothing ever happens
law latest_reachable:
  exs t: List<M.Msg>
  {M.Search.run(t, M.Search.init()) == M.Search{1n, 1n} : M.Search}
