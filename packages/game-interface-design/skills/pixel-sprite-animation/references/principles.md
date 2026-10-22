# Why a few pixels can move hard

Read when every lint rule passes and the animation still feels stiff. Each idea names the fix it implies.

## Perception

- **Apparent motion**: the eye joins separate images into motion when the step between them is small
  enough. A large step reads as a teleport. A smear frame is the pixel-art stand-in for a camera's
  motion blur: temporal anti-aliasing for the frame that jumps.
- **Closure**: viewers complete shapes from very few pixels, so silhouette carries the pose. If the
  solid-black row of the contact sheet does not read, no amount of shading will.
- **Peak shift**: an exaggerated feature triggers a stronger response than the real one. On a 32-px
  sprite one pixel is about 3% of the body; exaggeration is required, not optional.
- **0.1 second**: a response inside about 0.1 s feels immediate. Keep the player's anticipation within
  about 100 ms (6 ticks at 60 fps); give enemies a long, readable wind-up instead.
- **Color is relative**: the same color changes with its neighbors, so design ramps as relations, not
  single swatches.
- **Hue shift**: light ramps lean warm, shadows lean cool, instead of only changing value.
- **Aerial perspective**: distant layers lose contrast and drift toward the sky color; use it for
  parallax depth behind the sprite.
- **Dim light**: in dark scenes blues look relatively brighter, which is why night palettes lean teal.

## Animation principles at pixel scale

- **Pose to pose**: key poses first (tag `key`), breakdowns after. A key must read alone at 1×.
- **Timing**: vary frame durations; hold anticipation and contact, pass the swing fast.
- **Anticipation → action → follow-through**: in fighting-game terms, startup → active → recovery.
- **Squash and stretch**: keep volume; 1–2 px is already large at 32 px. The `scale` op gives a rough
  first pass (wider and shorter, or narrower and taller, on the same ground line); fix its edges by hand.
- **Arcs**: tips of blades, heads and feet travel on curves; check the onion-skin row.
- **Overlapping action**: capes, hair and props lag the body by 1–2 frames and settle late.
- **Slow in / slow out**: spacing tightens near holds; pixel steps make this a choice of which frames
  to keep, not an easing curve.
- **Secondary action, exaggeration, staging, appeal**: one clear idea per pose, readable on a phone.

## Pixel-specific devices

- **Smear**: stretch the shape, repeat it as afterimages, or draw an arc band along the weapon's path.
  Usually one frame on the way to contact; a jump may add take-off and arrival smears. Never after
  contact.
- **Impact frame**: 1–2 frames of flat white or inverted silhouette at contact; counts as a flash.
- **Sub-pixel motion**: move less than a pixel by shifting edge colors (breathing idles, blinking).
- **Selective outline (sel-out)**: color the outline with the darker shade of the area it bounds so the
  lit side reads softer; list those shades in `outlineAlt`.
