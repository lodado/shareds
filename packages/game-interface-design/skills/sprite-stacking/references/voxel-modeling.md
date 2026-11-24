# Voxel modelling beyond the 4-view carve

The visual hull (Step 2) keeps a voxel only where every view covers it, so anything that is not a
box seen from the four axes carves wrong. Build the volume `vol[z, y, x, rgba]` directly in numpy
when the subject has:

- chamfered or hexagonal cross-sections (spaceship spines, gun barrels on a round hull),
- fins or wings angled away from the axes (X-fins carve as a filled V),
- parts off the centre line at the same height as a wider part (flanking turrets carve as wide as
  the bridge), recessed nozzles, wheel wells.

A hybrid works well for real objects: carve the hull from blueprint silhouettes at high resolution,
then cut and add parts in the volume (wells, cylinder wheels with spokes, barrels).

## Shape

- Describe each cross-section as a function of length `y`: half-width `a(y)`, `z_low(y)`,
  `z_high(y)` and a corner chamfer `c(y)`; a voxel is inside when
  `|x - cx| <= a - max(0, c - min(z_high - z, z - z_low))`.
- Segmented armour reads as mass: widen the section by 1 voxel for 4 of every ~17 along the spine.
- Wheels: remove body voxels within `radius + 1.6` of the axle for `|x| >= tyre inner - 2`, then add
  a cylinder; recess the gaps between spokes by 2 voxels on the outer face.
- Keep every thin part at least 2 voxels wide (fins, masts, barrels) or it blinks while turning.

## Colour

- **Interior fill (no checker).** A rotated slice samples its rim and the voxels just inside it.
  If interior voxels keep a different colour, side walls show a checker or stripe pattern. After
  colouring the surface, copy each surface colour 3 voxels inward within its slice.
- **Shading.** Normals from the gradient of a blurred occupancy field, ambient occlusion from local
  density, light mostly from above so it survives rotation. Map the shade value onto hand-picked
  hue-shifted ramps (6-9 tones for paint, 5-6 for glass, 4-5 for trim, rubber, chrome).
- **Glass from measured regions.** Deciding glass by normal direction misses shallow windshields.
  Use the measured y/z ranges (windshield base to roof front, belt line up) and keep pillars painted.
- **Project blueprint line art.** Pick the view that faces each surface voxel by its dominant
  normal, sample the blueprint darkness there: a thin line becomes a panel gap (shade 1-2 steps
  darker), a filled dark area becomes trim (louvres, mesh, vents). Remove specks first with a 3x3
  morphological opening, or hatching turns into black noise.
- Blank plate areas; no badge or text.

## Checks

- Render 8 angles and look at them; enlarge 4-6x.
- `views_to_slices.thin_runs(vol)` must report nothing.
- The browser cannot open `file://` from the Aside REPL; serve the folder with
  `python3 -m http.server <port> --bind 127.0.0.1` in the background, check, then stop it.
