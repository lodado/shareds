# Sprite spec v1

One JSON file per animation. The complete passing example is
[knight slash](../examples/knight-slash/sprite.json): a `rows` base frame, then frames that only state
what changes.

## Top level

- `version: 1`, `name` (`a-z0-9-`), `canvas: [w, h]` (≤ 256).
- `palette`: single-character keys → `"#rrggbb"`; `"."` is always transparent (`null`). Space is reserved.
- `actor`: `player` | `enemy` | `neutral` (required: it selects the startup or telegraph budget).
- `kind`: `action` (phase order and startup gates) | `cycle` | `idle` | `effect`; `loop` defaults to
  true for `cycle`/`idle`.
- Optional: `maxColors` (16), `baseline` (row of grounded feet; enables `H7`), `outline` +
  `outlineAlt` (sel-out shades; `outline` enables `H6`), `scale` (preview integer scale, 4), `fps`
  (60), `parts`, `sources`, `feel`, `waivers`, `volumeRef` (frame id that `M6` measures area against),
  `rootMotion`, `thresholds` (`gap`, `keyIoU`, `volume`, `identity`, `startupMs`, `telegraphMs`,
  `contactMs`; any override needs `thresholds.reason`, lint `T0`).
- `sources`: `[{ name, author, license, url, prompt?, seed? }]` for imported, generated or third-party
  frames; `prompt` (string) and `seed` (string or number) record a generator run and appear in
  `credits.txt`. A frame's effective sources are its own `source`, its `base` chain's sources, and the
  `source` of each part it places (parts accept `source`); `L1`, `L2` and `credits.txt` use them, so
  editing imported pixels keeps their credit.
- `rootMotion`: `{ dx?, dy?, liftPx?, curve?, frames?, note? }` (numbers for the first three, strings
  for the rest), the travel the engine applies to the root instead of the sprite drawing it. It is
  copied into `feel.json`.

## Frames

`{ id, phase, ms, tags?, source?, rows | base, layers?, ops?, patch? }`

- `phase`: `anticipation`, `travel`, `smear`, `impact`, `follow-through`, `recovery`, `hold`, `idle`,
  `cycle`, `effect`. In an `action`: anticipation → travel/smear (airborne or lunging frames, take-off
  and arrival smears) → impact → follow-through/hold → recovery → hold.
- `tags`: `key`, `squash`, `stretch`, `airborne`, `flash`, `fx`, `blank`.
- Each frame has a body and an effect overlay. Composition order: start empty or from `base` (an
  earlier frame's body; its effects are not inherited) → `rows` (full canvas grid; not together with
  `base`) → body `layers` → `ops` → body `patch` → `fx` layers → `fx` patches.
- `layers`: `{ part, at, rot?, flip?, fx? }`. The part's `pivot` lands on `at`, and `flip` (`x`/`y`)
  then clockwise `rot` (0/90/180/270) turn the part around that pivot. Part `"."` pixels are skipped;
  `outline: false` on a part exempts thin props from the outline check.
- `ops` run after body layers, so keep their rects clear of pixels a layer just placed. They never
  touch effects:
  - `{ op: "move", rect: [x, y, w, h], by: [dx, dy] }` clears the rect, then pastes its opaque pixels
    shifted (like moving a selection over the layer below); `copy` keeps the source.
  - `{ op: "scale", rect, size: [w, h], anchor?: "bottom" | "center" | "top" }` resamples the rect
    (nearest neighbor) to `size`, centered horizontally on the rect and aligned to its bottom edge by
    default. A rough squash/stretch pass: expect lopsided edges and clean them with `patch`.
  - `{ op: "flip", rect, axis: "x" | "y" }` mirrors the rect in place.
  - `{ op: "recolor", rect?, from, to }` swaps one key inside the rect (whole canvas when omitted);
    `to: "."` deletes it. Give props their own keys so a recolor can lift them off cleanly.
  - `{ op: "erase", rect }` clears the rect.
  - Pixels pasted outside the canvas are dropped and counted (lint `H4` names the layer, op or patch).
- `patch`: `[{ at: [x, y], rows, fx? }]`; space keeps the pixel, `"."` erases, a key paints.
- `fx: true` on a layer or patch marks a pure effect (spark, dust, smear arc, impact flash shape). It
  draws on top after every op, and body rules (`H5`, `H6`, `H7`, `M4`, `M5`, `M6`, `M10`) ignore it;
  `H1`/`H2` still count its colors.

Find coordinates with `show <spec> <frameId>` (rulers mark every 5 and 10) and body bounds per frame
with `show <spec> --bbox`. `show <spec> <frameId> --diff` compares the frame's body with its `base`
frame's body (effects are not compared) and prints the change as one body patch on that base; a frame
without `base` has nothing to compare. `show <spec> <frameId> --rows` prints the composed body as a
`rows` array, for promoting a derived frame to a key frame.

`attach <spec> <png> --as base|frame|part` merges a user's file into the spec in place (the previous
file stays as `<spec>.bak`): `base` writes `rows` into frame `--at <id>` (dropping its `base`; its layers,
ops and patches still apply) or a new first frame, `frame` inserts a placeholder frame (`hold`, 100 ms)
after `--after <id>`, `part` adds `parts.<id>` with the pivot at center-bottom (`--id` defaults to the
file name). Pixels snap to the palette; a worst color error of 24 or more is refused unless
`--palette-extend` adds the missing colors within `maxColors`. The source entry is created or updated
from `--source` (default `file-<id>`), `--license`, `--author`, `--url`, and the frame or part carries
it. `--dry-run` reports size, upscale, colors and snap error without writing. `base` and `frame` files
must match the canvas; a larger sheet goes through `import --grid`.

## Diff, not redraw

Boring and correct — the wind-up leans back by moving the upper body and pulling the sword further:

```json
{
  "id": "windup",
  "phase": "anticipation",
  "ms": 50,
  "tags": ["squash"],
  "base": "ready",
  "ops": [
    { "op": "move", "rect": [0, 0, 22, 24], "by": [-1, 1] },
    { "op": "move", "rect": [0, 0, 13, 13], "by": [-1, 0] }
  ]
}
```

Squash and stretch the same 12×10 body resting on row 30, then fix the edges with a patch:

```json
{ "op": "scale", "rect": [10, 21, 12, 10], "size": [15, 8] },
{ "op": "scale", "rect": [10, 21, 12, 10], "size": [10, 12], "anchor": "bottom" }
```

Redrawing all 32 rows for the same change invites drift: a different helmet or palette in one frame
reads as another character (lint `M10` compares color histograms between neighbors).

## Feel and waivers

```json
"feel": {
  "hitstop": { "ms": 83, "scope": "presentation" },
  "shake": { "px": 2, "ms": 120 },
  "flash": { "frames": 1 },
  "knockbackPx": 6,
  "reduced": { "hitstopMs": 50, "shakePx": 0, "flashFrames": 0 }
},
"waivers": [{ "rule": "M4", "frame": "dash→arrive", "reason": "the dash is a deliberate blink" }]
```

`hitstop.ms` and `shake.ms` are milliseconds, `shake.px` whole pixels, `flash.frames` logic ticks.
`knockbackPx` is for the engine to push the target that was hit. `reduced` accepts only `hitstopMs`,
`shakePx` and `flashFrames`, each a whole number from 0 up to its full value (`hitstop.ms`, `shake.px`,
`flash.frames`; a missing full effect counts as 0). Waivers apply to warnings only, need a reason, and
must match a warning that still fires.

## Contrast: what the gates reject

```json
{
  "actor": "player",
  "kind": "action",
  "frames": [
    { "id": "stand", "phase": "hold", "ms": 100, "rows": ["…"] },
    { "id": "hit", "phase": "impact", "ms": 100, "rows": ["…"] },
    { "id": "back", "phase": "hold", "ms": 100, "base": "stand" }
  ],
  "feel": { "shake": { "px": 1.5, "ms": 100 } }
}
```

```text
ERROR  M1 every frame lasts 100 ms → hold key poses longer and pass fast frames quickly
ERROR  M2 [hit] no anticipation before the first impact → add a wind-up pose before contact
ERROR  F3 shake 1.5 px is not a whole pixel → round shake to whole pixels at the sprite scale
ERROR  F4 hitstop/shake/flash without a reduced-effect alternative → add feel.reduced that keeps the hit readable
```
