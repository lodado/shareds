import Base
import ./MODEL.bend as M

# Laws of the Delivery review lap model. The every-trace law is MODEL.bend's `Lap.safe` (every Q_ relation on every
# command the environment allows, in every state a trace reaches): `oracle-model.mjs prove-reach --model MODEL.bend
# --prefix Lap --safe safe` proves it with the kernel. The laws below are the cells and witnesses `prove` checks.

# round 2 blocks on a finding exactly when the packet backs it; the rest are proposals, never both
law round_two_split:
  for f: M.Find
  for p: Bool
  {M.Lap.iff(M.Lap.blocks(M.R2{}, f, p), Bool.and(M.Lap.is_claim(f), Bool.not(M.Lap.proposes(M.R2{}, f, p)))) == True{} : Bool}

# a note (no wrong implementation the locked tests pass) never blocks and is a proposal in every round
law note_proposes:
  for r: M.Round
  for p: Bool
  {Bool.and(Bool.not(M.Lap.blocks(r, M.Note{}, p)), M.Lap.proposes(r, M.Note{}, p)) == True{} : Bool}

# a backed security finding blocks in every round
law security_every_round:
  for r: M.Round
  for p: Bool
  {M.Lap.blocks(r, M.Claim{M.Security{True{}}}, p) == True{} : Bool}

# Witness: REVIEW_VERIFIED is reached after round 2 with an improvement proposal recorded
law verified_with_proposal:
  exs t: List<M.Msg>
  {Bool.and(M.Lap.is_verified(M.Lap.at(M.Lap.run_all(t, M.Lap.init()))), M.Lap.noted(M.Lap.run_all(t, M.Lap.init()))) == True{} : Bool}

# Witness: a repair after round 2 closes as PARTIAL_VERIFIED
law partial_after_round_two:
  exs t: List<M.Msg>
  {M.Lap.is_partial(M.Lap.at(M.Lap.run_all(t, M.Lap.init()))) == True{} : Bool}

# Witness: a packet after a round-2 repair is refused, so the third round is a reached refusal, not an absent edge
law third_round_refused:
  exs t: List<M.Msg>
  {M.Lap.refused_as(M.Lap.decide(M.Lap.run_all(t, M.Lap.init()), M.Packet{}), M.Closed{}) == True{} : Bool}
