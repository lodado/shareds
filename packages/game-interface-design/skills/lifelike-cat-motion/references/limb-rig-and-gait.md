# Limb rig and gait solver

One shared cat skeleton drives every view and skin. Drawing each leg's motion by hand per part ends in feet that
only translate and joint angles that read wrong in a run, so build the bones first, draw over them second.

## The chain

Each limb is four bones from the hip (shoulder): upper bone, lower bone, metatarsus (metacarpus), digits. The
body frame is x forward, y up, z toward the cat's left, in cm, the floor at y 0. Angles are degrees.

```js
// the four bone directions from the joints' interior angles; s = +1 hind (knee forward), -1 fore (elbow back)
const chain = (ref, s, a) => {
  const upper = ref - s * a.hip // ref: the pelvis (shoulder blade) direction
  const lower = upper + 180 + s * a.knee
  const meta = lower + 180 - s * a.ankle
  return [upper, lower, meta, meta + 180 + s * a.mtp]
}
```

The forelimb is the hind limb mirrored front to back. Hind numbers below were measured on adult cats walking on
a treadmill; the forelimb has none, so mark its numbers as assumed in the report and keep them easy to change.

|                                                   | hind (measured)            | fore (assumed)     |
| ------------------------------------------------- | -------------------------- | ------------------ |
| bone lengths (cm)                                 | 11.2, 12.32, 8.4, 3.36     | 11, 12, 6.2, 3.1   |
| angles at paw contact: hip, knee, ankle, toe base | 92.2, 115.0, 115.1, 154.1  | 100, 110, 125, 155 |
| angles at lift-off                                | 135.2, 118.4, 139.3, 155.0 | 70, 125, 140, 155  |
| toe ahead of / behind the hip (cm)                | +11.55 / −14.39            | same               |
| hip height standing (cm)                          | 28.3                       | 24                 |
| swing lift (cm), foot trail in swing (°)          | 4, −25                     | 4, −35             |

Fit the bone lengths so the contact and lift-off angles put the toe where the reach numbers say; a test checks
this within 1° and 0.1 cm. The toe-base joint stays at the mean of its two measured angles. The metatarsus
pitch at rest is the mean of its pitch at contact and at lift-off.

## Foot path, then bones

Per foot, in the limb's frame, at its own phase `u` (0–1) with stride scale `K` (0 stands, 1 is the measured
stride):

```js
function foot(L, u, g, K) {
  const x0 = L.center,
    y0 = -L.height // center: middle of reach; half: half the stroke
  if (u < g.stance) {
    // planted: slides back at the body's speed, flat on the floor
    const k = u / g.stance
    return {
      planted: true,
      x: x0 + K * L.half * (1 - 2 * k),
      y: y0,
      pitch: L.rest + K * (lerp(L.pitch.contact, L.pitch.liftoff, k) - L.rest),
    }
  }
  const k = (u - g.stance) / (1 - g.stance),
    e = smooth(k),
    arc = Math.sin(Math.PI * k)
  return {
    planted: false,
    x: x0 + K * L.half * (2 * e - 1),
    y: y0 + K * L.lift * arc, // swing: ease, arc up
    pitch: L.rest + K * (lerp(L.pitch.liftoff, L.pitch.contact, e) + L.tuck * arc - L.rest),
  }
}
```

Then two-bone IK reaches the ankle: the foot hangs off the lower bone at the pitch the path gives, the upper
and lower bones meet it with the knee (elbow) on the side `s`. Clamp the reach so the chain never over-extends,
and report `reached` so a test can fail on it.

## Gaits and the body's speed

- `stance` (share of a cycle a foot is planted): walk 0.62, trot 0.45; blend with `w` (0 walk, 1 trot).
- Landing offsets as a share of a cycle: LH 0, LF 0.25→0.5, RH 0.5, RF 0.75→1. At `w = 0` that is the lateral
  sequence, at `w = 1` diagonal pairs land together.
- The body moves `2 * half * K / stance` per cycle, so a planted foot never slips. On screen, scale by the
  stride in pixels over `2 * half`, and scroll the floor by that speed times `K`: the floor's motion, not the
  cat's, is what keeps planted feet still.
- A trotting cat steps faster: raise the cycle rate along with `w` (about double from walk to trot) and shorten
  the pixel stride slightly (about 46 → 42) rather than stretching it.

## Tests the solver must pass

They are pure and synchronous, so they sit beside the solver and run in a fresh realm:

- Bone lengths stay constant in every frame, gait and `K`.
- A planted foot is at floor height and fixed in the world for its whole stance (check the runs between the
  first and last of three cycles).
- A swinging foot stays above the floor.
- Every joint stays bent between 20° and 178° with every foot in reach, and turns at most 2° between frames
  1/480 of a cycle apart.
- With `K = 0` the pose is identical in every frame.
- Touchdown order in the walk is LH, LF, RH, RF a quarter cycle apart; in the trot LF lands with RH and RF with
  LH; a foot is planted for the gait's `stance` share.

## Viewing the bones

Show the bones over the art before trusting the numbers: a viewer with a "bones" toggle, the planted feet
marked, a still at chosen phases for each view. A skin drawn as tubes over the bones (the same widths for the
four bones, one outline under all of them so no line crosses a joint) is enough to judge proportions; it is a
check, not the final art.
