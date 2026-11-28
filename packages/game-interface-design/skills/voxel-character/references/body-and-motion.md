# Body and motion

The engine lives in `scripts/vchar/`:

- `parts.py`: voxel parts in a 48 x 40 x 46 grid (x left/right, y back/front with front +y, z up), the materials and
  their six-tone ramps, and the shading pass.
- `rig.py`: re-cuts the body into posable pieces (thigh, shin, foot, upper arm, forearm, hand, shoulder, skirt halves,
  chest, belt), the joints, tools, shield and lantern, and `pose()` with two-bone IK.
- `anims.py`: every action as a list of `(pose, ms, tag)` frames built from one base pose.
- `render.py`: the camera (16 directions, 0.24 squash), projection, and the depth-sorted renderer.
- `frames.py`: one frame as palette codes, with the far-side limbs darkened and an outline.

## Body shape

Change the body in `body_heavy()` and `body_cloth()` in `parts.py` (torso, skirt, belt, shoulders) and in the
`SHARED[...]` boxes in `rig.py` (arm and leg segments, which the rig poses). Keep these when reshaping:

- Torso depth close to its width. In profile the torso must be wider than the painted head, about 20 px.
- One cloth sleeve per arm from shoulder to a leather cuff, then a smaller glove. Separate plates per segment with a
  dark band at each seam read as an inflated tyre man.
- Shading per piece is a gentle gradient (0.4 to 0.8 steps); stronger per-piece gradients make every limb a ring.
- The renderer adds the light on top: upper left of the screen in every view (`LIGHT`, `LIT`, `SHADED`, `DEEP` in
  `vchar/render.py`). Do not paint a lit side into a body part; it would turn with the body.
- Grow the body taller with the spec's `body.zoom`, not wider.

Run `python scripts/check.py` after a shape change: the torso case fails when the profile gets too thin.

## A new tool

1. Author it in `parts.py` like `weapon_axe()`: a vertical haft at x 42-43, y 19-20 from z 0 up, the gripping fist
   at z 10-13, the head above z 33. Add it to `PARTS`.
2. In `rig.py`, register it like `SHARED["weapon_axe"] = _weapon("weapon_axe")`.
3. Add it to the spec's `tools` with a label.

A tool longer than the pick needs a longer head point in the collision sample (`range(0, 45, 2)` in `bake.py`).

## A new action

Write a function in `anims.py` that returns frames from `P(...)`, the base pose with changes: pelvis offset, lean,
twist, foot targets `(x, y, lift, pitch)`, hand targets, where each elbow points (`elbow_lo`, `elbow_hi`; unset = out to the side and back), `rest=True` when a one-handed tool rests on the shoulder, and the weapon mode (`hand` in one hand, `two` in both, anything else slung on the back). Add it to
`ACTIONS`, then to the spec's `actions` with its directions. Check every frame uncropped from both side diagonals:
feet stay planted while they carry weight, and the far arm does not pass through the torso.

## Depth and collision with the painted head

The head is a flat image, so the bake gives it a stand-in volume (`head.blobs`: spheres in the head's rest
coordinates, by default the skull and the chin). Two things use it:

- Ordering: a body pixel nearer than the stand-in surface is copied to the layer drawn over the head. This is what
  makes the near shoulder, the near arm and a pick slung on the near shoulder cover the head. Apply it to every part;
  exempting tools to hide a crossing breaks perspective everywhere else.
- Collision: while posing, a held tool or a hand inside the stand-ins moves the grip out the shortest way. Swings
  then pass beside the head instead of through the face.

When a head image is much wider or longer than the stand-ins (a big hood, hair or a beard to the belt), widen the blobs in
the spec; otherwise its edges are ordered as a flat card.
