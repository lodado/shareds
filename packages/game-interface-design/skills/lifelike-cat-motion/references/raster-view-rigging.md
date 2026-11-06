# Moving an approved raster view

For a view whose still is approved and must not change (a front view, a back view cut from a drawing), the
limbs move by transforming cut layers, never by redrawing. Drive them from the skeleton in
[limb-rig-and-gait](limb-rig-and-gait.md); this file is how the cut art follows it without gaps, doubled lines
or a changed rest pose.

## Rest is the still

Before any motion: compose the cut layers at rest and compare them with the still. The cut script prints the
pixel difference; the page, loaded with a rest flag, must match the earlier version exactly. A cut that only
looks right in motion hides a drawn-over outline or a fitted position. Fix the cut, not the motion.

## What is cut

Per foot, three kinds of layer, composed on an offscreen canvas at the still's own scale and drawn to the
screen at the display scale (so the cuts stay on whole pixels):

- the foot: everything below the junction J (where the leg's outline meets the body's), clipped just above J's ink;
- the walls: the two side lines of the leg, running up past J, faded out as their own anti-aliased edge;
- the tips: where a wall's line ends on the body, which may slide along J.

The body keeps J drawn across every opening, so it is whole wherever a foot is lifted away.

## Driving a foot

The skeleton gives the foot's path; convert it once to screen offsets:

```js
// px: pixels per cm, stride in pixels over the stroke 2 * L.half
const f = CatSkeleton.foot(L, u, gait, K)
const reach = (f.x - L.center) * -px // how far the foot is from the middle of its stroke, along the walk
const lift = (f.y + L.height) * px // how high the foot is off the floor
const offset = [reach * dir[0], reach * dir[1]] // dir: the walking direction on this view's screen
```

- `K` scales the stride; the floor scrolls by `K` times the gait's speed so planted feet stay on the floor.
- A view along the walking axis (the back view) foreshortens the stroke. Halve the stride there (`AWAY_K = 0.5`)
  in both the leg offsets and the floor scroll, and keep the diagonal pairs together in the trot. A full stride
  reads as crawling.
- The planted foot moves against the walking direction. Keep that sign even when a lean looks "backwards" at a
  glance: flipping it makes the feet slide on the floor. Look for a slide in the frames before changing it.

## Hind legs: fixed junction, lean below it

The leg's top is the junction with the body and does not move; only the sole goes the step. That is a shear
about the pivot (the middle of the leg's two tips), applied below the pivot row only, plus a vertical fold as
the foot lifts against the body's bob:

```js
const [ox, oy] = offset                       // the sole's step, in still pixels
const lean = ox / m.length                       // m.length: pivot to the sole, measured on the layer
const fold = clamp(1 + (oy - bob - lift) / m.length, 0.6, 1.25)
const [px, py] = [Math.round(m.pivot[0]), Math.round(m.pivot[1])]   // whole pixels
for (const [im, [x, y], clip] of [[foot, ...], [walls, ...]]) {
  for (const [top, shear] of [[true, false], [false, true]]) {      // two half-plane passes
    c.save(); c.clip(clip); c.beginPath()
    c.rect(-FAR, top ? -FAR : py - 1, 2 * FAR, top ? FAR + py : FAR)  // overlap one row at the join
    c.clip()
    if (shear) { c.translate(px, py); c.transform(1, 0, lean, fold, 0, 0); c.translate(-px, -py) }
    c.drawImage(im, x, y); c.restore()
  }
}
// the tips are drawn at the junction, which has not moved
```

Failures this form avoids:

- rotating the foot about its image corner: a wedge of background opens at the junction. Use the junction's
  middle as pivot, and a shear, which moves nothing at the pivot;
- shearing the part above the pivot too: its ink moves the other way and the wall shows twice. Leave it as drawn;
- a hairline seam where the two passes meet: whole-pixel pivot and a one-row overlap;
- sliding tips along J while the walls stay put: the line ends detach. Keep the junction fixed.

The shear angle stays small by design (about 8° for the hind legs); a viewer asking for a larger lean is asking
for a larger step, so change `K`, not the shear formula.

## A lobe of the outline: warp it as one piece

When a paw is one lobe of the body's outline (the near front paw seen from behind: a hook where the chest line
turns down, a wall, a rounded sole), cutting it at a junction leaves part of the same curve on the body, and a
moving paw with a still curve looks wrong. Do not cut it; carry the composed picture through a smooth field
that is zero where the body must stay and the whole step at the sole:

```js
const ramp = (k) => {
  const q = clamp(k, 0, 1)
  return q * q * (3 - 2 * q)
}
function warpPaw([ox, oy]) {
  // PAW: region, hook row, sole row, left taper [x0, x1]
  const { x0, x1, y0, y1, hook, sole, left, rows, cols } = PAW
  snapshot.drawImage(backCanvas, x0 - bx, y0 - by, w, h, 0, 0, w, h)
  c.clearRect(left[0], y0, x1 - left[0], h)
  for (let y = y0; y < y1; y += rows) {
    const g = ramp((y + rows / 2 - hook) / (sole - hook))
    for (let x = left[0]; x < x1; x += x < left[1] ? cols : x1 - x) {
      // narrow tiles only where the field varies in x
      const wide = x < left[1] ? cols : x1 - x
      const k = g * ramp((x + wide / 2 - left[0]) / (left[1] - left[0]))
      c.drawImage(snapshot, x - x0 - ox * k, y - y0 - oy * k, wide, rows, x, y, wide, rows) // read backwards
    }
  }
}
```

- The field is read backwards (each pixel takes what lay where it came from), so there is no gap and no doubled
  line, and the one-pixel rows with 3-pixel columns leave no scalloped edge (4-pixel columns and 2-pixel rows do).
- Start the ramp well above the hook, up the chest line (about 80 px above for a 180 px paw), so the line bends
  smoothly instead of kinking at the hook; the region's top and right edges lie where the field is already ~0.
- Use it only for a lobe attached to the outline and keep the step small. Stretching a leg's outline to fake a
  stride is the "octopus" failure: legs stay rigid cut parts (the shear above), and only a lobe flexes.
- Cost is a few thousand `drawImage` calls per frame; keep the region tight and measure.

## Checking it

- Same-scale stills over a cycle, in the walk and the run, cropped and enlarged 2–3× around each foot. Look for
  a gap at a junction, a doubled wall, specks, a kink where a lobe meets the body.
- Mark the ink that never moves across a cycle in one colour and the ink that does in another: a curve that
  belongs to a moving foot but stays still shows at once.
- Rest pixel difference zero; the planted foot's position fixed on the floor between touchdown and lift-off.
- Say what only motion can show (smoothness, the feel of the step) is unverified until the user has watched it.
