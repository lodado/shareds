# Pixel craft

The small-scale rules that make a low-res image look drawn instead of downscaled. No code. The numbers
are starting values from general pixel-art practice, not measured in this skill.

## Clusters and banding

- A pixel belongs to a cluster of at least three or four of its own colour. A lone pixel in a flat area
  is noise: remove it, or make it a deliberate highlight (below).
- Dither is for dark midtones only ([render pipeline](render-pipeline.md)). A bright or flat surface
  that shows a dither pattern means a ramp step is too close to the next one.
- Banding: a long gradient that steps in parallel bands of equal width looks mechanical. Break the
  band edges with a notch every few pixels, or cover the surface with a texture of its own.
- Pillow shading, where every surface is brightest in the middle and darkest at the edge, is a mistake:
  one light direction for the whole scene, and each face takes one ramp step from it.
- Outlines are one pixel and come from depth. A flat floor with outline stripes, or an outline on a
  small far prop, is noise; fix the threshold rather than painting over it ([pitfalls](pitfalls.md)).

## One density

Everything on screen has the same pixel size: one texture pixel is one screen pixel at the mode the
surface is read in.

- Author floor and wall textures at the resolution of the frame, not larger. A 512 px texture on a
  court that covers 80 low-res pixels shimmers and averages into mush.
- Text drawn into the scene (a board, a sign) is on the same grid, at whole multiples of its design
  size ([scene](scene.md)).
- No smooth gradients, no rotated or fractional-scale sprites: a rotated bitmap mixes pixel sizes.
  Rotate pieces by building them from boxes in the scene instead.
- A texture that repeats shows its tiles at 31°: break the pattern with a second variant used on a few
  tiles, or a worn patch.

## Materials

A material is a ramp plus a pattern of a few pixels, nothing more.

| Material        | Pattern                                                                 |
| --------------- | ----------------------------------------------------------------------- |
| Rubber, paint   | flat, with one lighter edge on the lit side and one worn patch          |
| Stone, concrete | two ramp steps in irregular patches, a few darker joint lines           |
| Timber          | long runs of two steps along the grain, one dark knot per few metres    |
| Grass           | the base step with short vertical flecks of the lighter and darker step |
| Metal           | a high-value single pixel at each corner (a glint) and a dark core      |
| Glass, water    | a dark body, a one-pixel highlight, a lighter band that moves           |
| Cloth, canvas   | flat with a fold line in the next step down                             |

Highlights are single pixels placed on corners and on the lit edge of round things, one or two per
object. More than that is noise.

## Grounding

The cheapest richness adds no geometry.

- A contact shadow under everything that stands on the ground: a dark one-ramp-step patch a little
  larger than the foot, even where the real shadow map misses it.
- Ground wear and variation: paths, worn patches, puddles, tufts, leaves, chalk, tyre marks, each as a
  patch of the next ramp step over the base. Two or three kinds, not all.
- The edge of the world gets a transition: a skirt of soil, foam, a kerb, grass overhang. A hard line
  between ground and background looks pasted.
- Light accents on the ground under lamps and windows at dusk and night ([colour and
  light](color-and-light.md)).

## Thin things

At 270 px, anything thinner than two pixels flickers or disappears depending on where it sits on the
grid.

- Fences, wire, ropes, rails, antennas: draw them two pixels or more at the mode they are read in, which
  usually means thicker than life, or leave them out of the wide mode.
- A wire cage is a few posts and one rail per side, with a darker ramp step suggesting the mesh, not a
  grid of wires.
- Letters need a height of five pixels or more for a capital, so a sign is a few big letters, or a
  symbol, not a sentence.
- Check each thin thing in all four rotations: a rail that is two pixels in one and one in another
  is a rotation-dependent flicker.
