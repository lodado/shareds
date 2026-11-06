# Trace format and check

`scripts/check-trace.mjs` reads JSON: an array of events, or `{ "events": [...] }`. `t` is seconds on the model
clock and never goes backwards.

## Events

- `{ "t", "type": "state", "name", "kind" }`: entering a behavior; `kind` is `idle`, `social`, `play`,
  `defense` or `move` ([catalog](behavior-catalog.md)).
- `{ "t", "type": "signal", "name", "cause" }`: a body-language change. Names the check reads: `tailFlick`,
  `tailLash`, `earsSide`, `earsFlat`, `skinRipple`, `headToHand` (warnings); `wiggle`; `halfBlink`,
  `eyesNarrow`, `eyesOpen`; `earsTurn` and `headTurn` with `cause` `call`, `noise` or `self`.
- `{ "t", "type": "stimulus", "name" }`: an input — `stroke` (with `zone`), `poke`, `noise`, `call`,
  `slowBlink`, `toy`.
- `{ "t", "type": "contact", "foot", "gait" }`: a foot touching down; `foot` is `LH`, `LF`, `RH` or `RF`, `gait`
  is `walk` or `trot`.
- `{ "t", "type": "mood", "valence", "arousal", "energy", "tolerance" }`: samples, for example every 0.25 s.

A state lasts until the next state event or the end of the trace.

## Rules

- `swat-warning`: every `swat` has a warning signal between 4 s and 0.4 s before it.
- `pounce-anticipation`: every `pounce` directly follows a `crouch` that lasted at least 0.3 s and contained a
  `wiggle`.
- `blink-reply`: every `blinkReply` holds at least one `halfBlink` and then an `eyesNarrow` that lasts at least
  0.6 s (until `eyesOpen` or the state's end).
- `startle-latency`: every `startle` has a `poke` or `noise` stimulus at most 0.12 s before it and lasts at
  least 0.3 s.
- `mood-continuity`: between two mood samples with no stimulus in the gap, valence and arousal change at most
  1.5 per second.
- `gait-footfalls`: back-to-back `walk` contacts (under 2 s apart) follow LH → LF → RH → RF; every `trot`
  contact has its diagonal partner (LH with RF, RH with LF) within 0.06 s.
- `idle-variety`: no three back-to-back `idle` states share a name; any other state in between breaks the run,
  so sitting again after each stroke is not repetition.
- `attention-chain`: every `headTurn` caused by `call` or `noise` has an `earsTurn` with the same cause
  0.03–0.4 s before it.

## Output

The script prints `{ ok, events, rules: [{ id, checked, failures }], notExercised }` and exits 0 when no rule
fails, 1 when one does, 2 for unreadable input. A rule with `checked: 0` passes vacuously and is listed in
`notExercised`: drive a scenario that exercises it before reporting the check as passed.
