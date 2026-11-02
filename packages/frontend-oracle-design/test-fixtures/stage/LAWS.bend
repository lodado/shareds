import Base
import ./MODEL.bend as M

# Laws of the authoring graph model. The every-trace law is MODEL.bend's `Graph.safe` (the state invariants, the
# rank following NEXT FOR YOU lowers, and every Q relation on every command, in every state a trace reaches):
# `oracle-model.mjs prove-reach --model MODEL.bend --prefix Graph --safe safe` proves it with the kernel. The laws
# below are the cells and traces `prove` checks.

# a step records the run of the same issues by counting, for every record and verdict
law run_counts:
  for s: M.Seen
  for f: Bool
  {M.Graph.run_counts(s, f) == True{} : Bool}

# a save adds at most one round, only to a review step asks for, and none to a return saved for its input
law save_rounds:
  for r: M.Rev
  for w: Bool
  {M.Graph.save_rounds(r, w) == True{} : Bool}

# the Formal label names the first failing node of package, model, card
law first_failing:
  for p: M.Health
  for m: M.Health
  for k: M.Health
  {M.Graph.first_failing(p, m, k) == True{} : Bool}

# the Contract label names the first failing node of confirmation, card, and never the model
law first_failing_contract:
  for q: M.Health
  for k: M.Health
  {M.Graph.first_failing_contract(q, k) == True{} : Bool}

# Witness: a Formal package reaches the lock, so the laws do not hold merely because nothing happens
law formal_locks:
  exs t: List<M.Msg>
  {M.Graph.is_locked(M.Graph.run_all(t, M.Graph.init())) == True{} : Bool}

# Witness: a Contract card reaches the lock after its cold-read and the user's approval
law contract_locks:
  exs t: List<M.Msg>
  {M.Graph.locked_as(M.Graph.run_all(t, M.Graph.init()), 1n) == True{} : Bool}

# The model issues coming back on a third edited state stop the step
law stop_on_third:
  {M.Graph.stops(M.Graph.run_all([M.Start{M.Formal{}}, M.Edit{M.BendFiles{}, M.Breaks{}}, M.Step{}, M.Edit{M.BendFiles{}, M.Keeps{}}, M.Step{}, M.Edit{M.BendFiles{}, M.Keeps{}}, M.Step{}], M.Graph.init())) == True{} : Bool}

# ... and on the second they do not
law no_stop_on_second:
  {M.Graph.stops(M.Graph.run_all([M.Start{M.Formal{}}, M.Edit{M.BendFiles{}, M.Breaks{}}, M.Step{}, M.Edit{M.BendFiles{}, M.Keeps{}}, M.Step{}], M.Graph.init())) == False{} : Bool}

# After two card review rounds a changed card asks for no third: the next is the lock
law no_third_round:
  {M.Graph.hint_is(M.Graph.run_all([M.Start{M.Formal{}}, M.Step{}, M.Save{}, M.Edit{M.CardText{}, M.Keeps{}}, M.Step{}, M.Save{}, M.Edit{M.CardText{}, M.Keeps{}}, M.Step{}], M.Graph.init()), 1n) == True{} : Bool}

# A return saved again for the same input is the same round
law same_input_one_round:
  {M.Graph.rounds(M.Graph.rev_c(M.Graph.run_all([M.Start{M.Formal{}}, M.Step{}, M.Save{}, M.Save{}, M.Step{}], M.Graph.init()))) == 1n : Nat}

# An edit of the Bend files changes the projected card the card review reads, never the model analyst's input
law bend_edit_asks_card_reviews:
  {M.Graph.asks_card_only(M.Graph.run_all([M.Start{M.Formal{}}, M.Step{}, M.Save{}, M.Edit{M.BendFiles{}, M.Keeps{}}, M.Step{}], M.Graph.init())) == True{} : Bool}
