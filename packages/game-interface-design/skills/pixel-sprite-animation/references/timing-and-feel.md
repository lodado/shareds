# Timing templates and hit feel

Starting values at 60 fps (one tick ≈ 16.7 ms). Tune by playtest; the lint budgets are the hard part.

## Templates

- **Player light attack** (startup ≤ 100 ms): anticipation 2 × 50 → smear 33 → impact 50 (+ hitstop
  50–100) → follow-through 66 → recovery 83 → hold 100.
- **Player heavy attack**: anticipation 2–3 frames that may exceed 100 ms only with a
  `thresholds.startupMs` override and a `thresholds.reason` (charged input, armor); impact hold longer.
- **Enemy attack** (telegraph ≥ 300 ms): wind-up 2–3 frames totaling 300–600 ms → smear 33 → impact
  66 → long recovery (the punish window). Give the wind-up a cue the player learns: a palette shift on
  the weapon or body, an eye glint, or a `!` above the head drawn as an `fx` item. The hit flash belongs
  to the target being hit (the player's hurt sheet), and hitstop stays `presentation` unless both
  actors' logic pauses.
- **Jump attack / slam**: crouch anticipation `squash` 50–300 (enemies ≥ 300 total) → take-off smear 33
  → rise and apex `travel` (`airborne`) 66–100 each → fall `travel` or arrival smear 33 → impact `squash`
  50–66 → follow-through 66 → recovery 83 → hold. Only the crouch counts toward startup or telegraph;
  rise and fall are reported as `travelMs`. For a player, travel plus smear before contact over 250 ms
  is lint `M11`: shorten the flight, or waive it for a deliberate lunge.
- **Jump**: crouch `squash` 50–66 → launch `stretch` 33 (`airborne`) → rise/peak/fall `airborne`
  66–100 each → land `squash` 50 → settle 83.
- **Squash and stretch**: rough the shape with the `scale` op (bottom anchor keeps the feet on the
  ground line), then clean the edges with `patch`; area stays within 25%.
- **Hit reaction**: 1 flash frame (white silhouette) or palette swap → knockback pose 66 → recover 100.
- **Idle breath** (`kind: idle`, loops): 4–6 frames of 120–200 ms, 1 px or sub-pixel moves, uneven holds.
- **Run cycle** (`kind: cycle`): 6–8 frames, even timing is fine; contact and passing poses carry it.

Bake squash, hops and recoil into the frames while the body's lift stays under about a third of the
canvas height. Long horizontal travel and higher arcs belong to the engine's root motion: keep the body
in place and record the distance, lift, curve and frames in the spec's `rootMotion`, which `feel.json`
carries to the engine.

## Hit feel

The planning skill owns game-level feedback policy:
[game feel](../../reference-driven-game-design/references/game-feel.md). Sprite-level numbers:

- **Hitstop**: freeze attacker and target 2–12 ticks (33–200 ms) scaled by hit weight; light 3–5,
  heavy 6–10 ticks. Declare `scope`: `presentation` (only drawing pauses) or `simulation` (rules pause,
  which changes fairness and input windows). Default to `presentation`, enemy hits included, unless
  both actors' logic really pauses.
- **Shake**: offsets that decay over the shake time, in whole pixels at sprite scale; sub-pixel shake
  shimmers.
- **Flash**: at most 3 flashes in any second. A flash-tagged contact frame and `feel.flash` at the
  same moment count once.
- **Knockback**: `knockbackPx` is how far the engine pushes the target that was hit; this sprite does
  not move by it.
- **Juice as a stack**: impact frame, hitstop, shake, particles, knockback and sound together. Draw
  sparks, dust and smear arcs as `fx: true` items so they stay out of the body checks.
- **Reduced effects**: `feel.reduced` (`hitstopMs`, `shakePx`, `flashFrames`) keeps the hit readable
  without shake or flashes: each value is a whole number from 0 up to its full counterpart, so a
  reduced variant can only tone the hit down. Pair it with a palette swap or an outline pulse.
- **Responsiveness beats fidelity**: buffer input during recovery and allow cancels; the animation must
  not make the player wait for frames.

`build` writes `feel.json` and `preview-feel.gif` so the hit can be judged before engine work.
`feel.json` holds hitstop and shake in milliseconds plus ticks, the flash in ticks, phase ranges,
`startupMs` (anticipation only), `travelMs`, `timeToContactMs` (everything before the first impact)
and the first active frame. The preview turns the sprite white for the flash ticks (a timing marker,
not the target's real flash), then shows the hitstop freeze and a decaying whole-pixel shake. It is
not in-game feel; report in-engine feel as `NOT_RUN` until it is played.
