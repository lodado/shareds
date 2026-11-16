# Colour and light

How to build the palette and the lighting rows from the direction sheet. No code. The worked example's
`PALETTE` and lighting rows are one answer for one subject: build a new set with the recipe below and do
not copy theirs. The numbers are starting values from general pixel-art practice; the second palette
at the end was checked with a throwaway script (distinct entries, distance, luminance order) and never
rendered.

## Ramps

A ramp is three to five palette entries for one material family, darkest to lightest.

- Shift the hue along the ramp: shadows move toward the cool side (blue, violet) and a little more
  saturated; highlights move toward the warm side (yellow, orange) and lose some saturation. A ramp of
  the same hue at three lightness values reads as plastic.
- Step the luminance clearly: in linear luminance each step is about 0.35–0.55 of the next one up
  (the second palette below measures 0.32–0.74, the two top sky steps being the closest). Closer steps land
  on the same quantized colour or flicker between two.
- The toon ramp splits light into lit, middle and shadow ([render pipeline](render-pipeline.md)), so a
  surface under it uses three entries of its ramp. Keep three distinct entries, not two plus a
  near-duplicate.
- Darks are never pure black: the darkest entry of every ramp is a deep tinted colour (blue-violet or
  red-brown), and the outline, which the post shader derives from the pixel's own fill, inherits it.
- Neutrals (stone, asphalt, concrete) lean to the palette's cool side in shadow and its warm side in
  light, and carry a trace of saturation.

## Saturation budget

- Most of the frame area sits at low to middle saturation; the stage zone is slightly more saturated
  than its surroundings.
- The accent covers about 3–10% of the stage zone's area and appears only on what the sheet allows. A
  second accent only when the subject has two sides to tell apart.
- Saturation falls with distance by about one ramp step ([composition](composition.md)).
- No more than three hue families at high saturation in one frame; the rest are muted versions of them.

## Harmony

Pick one row for the whole palette and write it on the sheet; "colourful" is not a row.

| Mood                | Base hues                      | Accent                 | Shadows tint | Light tint  |
| ------------------- | ------------------------------ | ---------------------- | ------------ | ----------- |
| Calm, cool morning  | blue-grey, teal, pale rose     | one warm orange        | blue-violet  | peach       |
| Warm, cosy evening  | brown, ochre, deep green       | one cool teal or blue  | plum         | amber       |
| Bright, playful day | sky blue, grass green, cream   | one hot red or magenta | blue         | pale yellow |
| Tense, night        | indigo, slate, deep teal       | one lit warm yellow    | indigo       | lamp yellow |
| Faded, nostalgic    | dusty green, sand, washed blue | one brick red          | dusty violet | cream       |
| Fresh, clean        | white, mint, pale grey         | one deep navy          | cool grey    | white       |

Rows are patterns of two or three base hues and one contrast, not recipes; vary them to fit the subject.

## Contrast pairs

Anything the viewer must tell apart gets a different hue and a different value, and its own palette
entry, so the quantizer cannot merge them.

- Teams, a ground and what stands on it, a path and the grass beside it, water and sky.
- Check by converting a screenshot to grayscale: the pair still separates.
- Check by looking up the pair's two palette entries: they are two different entries, and the distance
  between them is larger than the distance between neighbouring steps of one ramp.

## Time of day

Day, dusk and night are rows of values ([scene](scene.md)); decide each row's colour as a unit.

- **Day**: a light of neutral warmth, shadows tinted toward the sky colour, the sky the lightest big
  area.
- **Dusk**: the light turns orange or pink and low; shadows turn violet; the sky holds a gradient of
  three or four entries (deep, violet, rose, pale gold) as bands; windows and lamps start to glow.
- **Night**: the base light drops to a cool, dim blue; the world's darks are tinted indigo, not black;
  the only warm areas are lit windows, lamps and the lit ground below them. A lit area is brighter than
  the daytime stage, which makes the night picture high in contrast.
- Glow is an emissive entry one or two steps lighter than the surface, plus a ring of the next entry
  down on the ground around it. Lamps change intensity, never visibility.
- The hero time of day is the one the sheet names; screenshots, demos and the first view use it.

## A second palette

A fishing harbour at dawn, 33 entries, derived for this document. Checked by script: all entries are
distinct, the closest two are 22.8 apart in RGB, and every ramp rises in luminance; never rendered or
tuned on screen. It shows how the recipe turns out for a subject other than the worked example.

| Family         | Entries, darkest to lightest                      | Use                                      |
| -------------- | ------------------------------------------------- | ---------------------------------------- |
| Wet stone      | `#2b2f45` `#4b5068` `#7d8296` `#b4b3b8`           | quay, walls, steps                       |
| Timber         | `#3a2630` `#5e3b36` `#8a5a42` `#bf8a5a`           | boats, crates, stalls, decking           |
| Sea            | `#12294a` `#1d4a73` `#2f7a9a` `#6fb3bd`           | water, with a moving second step         |
| Dawn sky       | `#3b3560` `#7a5a8c` `#d98a8a` `#f6c48e` `#fde9c0` | sky bands, glow on the water             |
| Net green      | `#25422f` `#3f6b3e` `#6f9a4e` `#b2c46a`           | nets, moss, a few plants                 |
| Rust           | `#4a2020` `#7d3a2a` `#b0583a` `#d98550`           | crane, hulls, chain                      |
| Accent         | `#e8501e` `#ff8a30`                               | the working boat, its crates, buoys only |
| Whites         | `#e9e2d0` `#fff6e0`                               | sails, foam, gulls, lamp glass           |
| Dark           | `#1a1722`                                         | outline floor, deepest shadow            |
| Skin and cloth | `#7a4a3a` `#b0705f` `#dca06e`                     | people                                   |

Read it against the recipe: the stone ramp's darkest entry is a blue-violet (hue 231°) and its lightest
a near-neutral grey with almost no saturation; the sea ramp moves from deep blue (215°) to teal
(188°); the net ramp's highlight shifts to yellow-green (72°). The sky is a five-step band for the
dawn gradient, the only place where bands are wanted. The rust ramp's lightest entry is `#d98550`,
74 RGB units from the accent's `#e8501e`; if the working boat did not stand out on screen, the rust
ramp is the first thing to mute.

Before use, run the same checks on any palette built for a new subject: unique entries, a minimum
distance between any two, rising luminance in each ramp, and a screenshot in grayscale.
