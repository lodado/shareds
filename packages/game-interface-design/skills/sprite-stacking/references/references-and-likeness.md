# References and likeness

Read this before drawing any subject that has a known look: a real vehicle, a ship or mech from a
franchise style, a building type. A stack drawn from memory comes out generic; the 2026-11-24
battleship was a sea warship until real Nightrun panels were checked.

## 1. Look before you draw

- Find at least 5 reference images, open them at full size and write down the design language in
  numbers and named shapes: length to width ratio, cross-section shape, where the mass sits, what
  sticks out, palette (saturation, hue), glow colours. "Long hex-section spine, 6-8:1, 2x2 round
  nozzles on a wider stern block, swept dorsal fin" is usable; "cool sci-fi" is not.
- Image search: open `https://www.google.com/search?q=<query>&udm=2` in a browser and screenshot it.
  A text search engine returns junk for niche subjects.
- Wiki pages (namu.wiki and similar) lazy-load images: a plain fetch returns SVG placeholders.
  Scroll the page in a real browser first, then read `img.currentSrc` and download those.
- Element screenshots of a scrolling page come out misaligned. Download the source images and build
  a contact sheet (thumbnails in a grid with file names) to look at many at once.
- Franchise style: take the design language, not a specific ship, character or logo. Say so.

## 2. Real objects: use a blueprint

- Search `<model> blueprint side top front rear` (getoutlines.com, the-blueprints.com carry free
  4-view outlines). One image with all four views at the same scale is ideal.
- Extract the silhouettes instead of tracing by eye: flood-fill the white background from the image
  border, label the connected components, and the four largest are the views. Crop each, drop
  mirrors and antennas by clamping to the body half-width, then downscale with area averaging and
  threshold at 0.5.
- Scale from a real dimension: blueprint length in px against the real length gives px per metre.
  Pick the voxel size from that (3 cm per voxel gave a 148 x 66 x 37 car).
- Measure positions on the side view and write them down before modelling: axle centres and wheel
  radius, windshield base and top, roof span, belt (window sill) line, B-pillar, intakes. Material
  regions are placed from these numbers, not guessed from normals.
- Leave out badges, emblems, plate text and logos even when the blueprint has them.

## 3. Cute versus realistic

The same subject reads as a toy or as the real thing depending on four levers:

| Lever       | Cute / chunky          | Realistic                                                 |
| ----------- | ---------------------- | --------------------------------------------------------- |
| Resolution  | 15-20 slices, ~32 x 74 | 36-56 slices, ~1 voxel per 3 cm                           |
| Proportions | drawn by eye, boxy     | measured from a blueprint                                 |
| Section     | visual-hull box        | carved curves, tumblehome, wheel wells                    |
| Shading     | 3-4 flat tones         | 6-9 tone ramps, normal lighting, AO, gloss, glass streaks |

Ask which one the user wants when the request does not say; default to the user's earlier pick.
