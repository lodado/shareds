# Baking direction sprites (removing layer terraces)

A live stack lifts each slice by 1 px, so every sloped surface (hood, roof, nose) shows contour
bands and every wall shows the slice rims. Shading cannot remove that; it is the method. When the
user sees the layers ("층이 보여"), bake.

Check first that the bands are not the viewer's own `Light` toggle: it shades per slice and adds
horizontal stripes. Turn it off before judging.

## The bake

`scripts/bake_sprites.py` reads a slice strip, smooths it into an iso-surface, and ray-marches it
from an orthographic camera at the stack's pitch (`elevation = asin(squash)`), one frame per
direction:

```bash
uv run --with pillow --with numpy python scripts/bake_sprites.py slices.png \
  --slices 37 --dirs 32 --relight --out sheet.png
```

- Supersamples 2x, averages, then snaps every pixel back onto the strip's own colours, so frames
  stay crisp pixel art. One outline is drawn around the finished frame.
- `--relight` shades with a sun fixed in the world: highlights stay put while the object turns,
  which reads as a real object. Without it the strip's baked colours are used as they are.
- Writes `sheet.json` with frame size, column count and degrees per frame. Frame `k` is turned by
  `k * 360 / dirs`; at `k = 0` the slice front (+y) points away from the camera.
- For a model with material ids (paint, glass, trim...), relight per material ramp instead of
  multiplying colours: save the volume with a material id per voxel, map the baked shade onto that
  material's ramp, and keep the outline and palette snap.
- The bake is a true projection: depth is scaled by `squash` and height by `cos(asin(squash))`. The
  live stack lifts a whole pixel per slice, so at the same `squash` a baked frame is shorter than
  the live stack. `--squash 0.6` gives the height-to-depth ratio of the live default (0.75 with
  `spacing = 1`); go to 0.5 when a character's face has to read.
- The baker and the live stack disagree on left and right: a baked frame is the mirror image of the
  live stack at the same heading. Use one renderer per game. To match the live stack, mirror every
  slice left to right before baking; the frames then run the other way round the circle, so check
  which frame matches which heading before binding it.
- The smoothing needs volume to work with. A 28-slice character lost its legs and face; the same
  design at 46 slices kept them. Below about 40 slices, export the directions from the live stack
  (the viewer's 16-direction export) instead.
- `--relight` leaves bright specks on small faceted plates. Leave it off for armour and other
  surfaces made of many short faces.
- For an object built from swappable parts, compose the volume first and bake each loadout
  ([modular-parts.md](modular-parts.md)).

Trade-off: rotation snaps to `360 / dirs` degrees. 32 directions (11.25°) is enough for cars; use
64 for the player's own vehicle or slow turns.

## Runtime tips

- **Mirror half the frames.** A left-right symmetric object needs 0-180° only; flip the rest. Only
  with a sun on the camera axis, or the mirrored shadow side is wrong.
- **Bake layers, not colours.** Albedo, normal and emissive sheets let the game relight for day,
  dusk and night and glow headlights without rebaking.
- **Palette swap.** Store paint as ramp indices and swap the ramp to recolour one sheet.
- **Split wheels.** Wheels as their own sprites give rolling frames and steering angles without a
  combinatorial sheet.
- **Separate shadow.** Draw the shadow as its own sprite on the ground so jumps and suspension
  travel read as height.
- **Hysteresis.** Switch direction frames only after the heading passes the boundary by 1-2°, or
  the frame flickers at the edge.
- **Float positions, integer blit.** Keep motion in floats, round once when drawing, scale by whole
  numbers only.
- **Mix.** Live stack or 64 directions for the hero object; 16 baked directions for background
  props. A live stack costs one draw per slice.
- **Roll and pitch.** For cornering, offset slices by height (stack) or bake a tilted set.
- **One game palette.** Snap every asset to it so separately made objects belong together.
- **Selective outline.** Outline with the body's darkest tone instead of pure black and lighten the
  top edge; it looks less like a toy.
