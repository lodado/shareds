# Art direction

The other references say how to draw. This one decides what to draw, before the first mesh, and holds
no code: each row ends in a constant the code already has (the camera half-heights, `PALETTE`, the
lighting rows, the builders' sizes).

## Direction sheet

One line per row. A row is a number, a named colour or a rule that a screenshot can confirm or refute.

- **Concept**: one sentence with the place, the one thing that moves and the moment.
- **Reading order**: what the eye finds first, second and third, and the means for each (size in the
  frame, the accent, motion, light). Two things that use the same means compete.
- **Frame**: per camera mode, the half-height in metres and what must be inside it.
- **Scale**: a person and the smallest thing that must read, in low-res pixels per mode.
- **Value plan**: the three to five grey masses of the wide shot, which one is lightest, which
  darkest, and that the stage holds the widest range ([composition](composition.md)).
- **Colour**: five to eight foundation colours (one per material family, plus ground and sky), then
  the accent and the only things allowed to wear it. Two sides that must be told apart, such as
  teams, take one accent each. The ramps and the must-stay-distinct entries of
  [the palette](render-pipeline.md) grow from these, built with the recipe in
  [colour and light](color-and-light.md), not copied from the worked example's palette.
- **Mood**: one row of the harmony table (base hues, accent, shadow tint, light tint) and the colour
  of each time of day.
- **Hero rotation**: the one rotation polished first, and the lower bar the other three must pass
  ([composition](composition.md)).
- **Quiet zones**: two or more areas left empty or one-colour on purpose, so the busy area has
  somewhere to rest.
- **Modules**: the sizes every building repeats (storey height, bay width, door, rail).
- **Detail levels**: mass, part and trim, the size range of each, and which levels a building far
  from the stage keeps.
- **Cutaway**: what stands between the camera and the stage in each rotation, and what it drops to.
- **Light**: the hero time of day and what glows after dark.
- **Motion**: what never stops, what moves on an event, and what holds still under reduced motion.
- **Page**: what sits outside the canvas and which palette entries it borrows.
- **Risks**: two or three ways this subject fails on screen, each added to the screenshot checklist.

Keep a look the user gave. Derive the rows from the subject when they gave none, and label the sheet
as a default they can change. A review reads the sheet back from the code and screenshots and reports
the rows that have no value.

## Size in pixels

The camera is orthographic, so size on screen does not depend on distance.

- One texel is `2 × halfHeight / LOW_RES_HEIGHT` metres.
- A length across the view covers `length / texel` pixels. A box edge along a world axis sits at 45°
  to the view and spans `0.71 × length / texel` pixels sideways.
- A height covers `height × cos(elevation) / texel` pixels: 0.86 of it at 31°.
- A length on the ground running away from the camera covers `length × sin(elevation) / texel`
  pixels: 0.52 of it at 31°.

With antialiasing off, a shape `w` pixels wide covers either ⌊w⌋ or ⌈w⌉ pixels across, depending on
where it sits on the grid. Under one pixel it blinks out in some positions; between one and two it
changes width as it moves. Whatever must read is at least two pixels in the mode it is read in: draw
it larger than life, or leave it out of that mode.

Computed from the worked example's constants (270 px, half-heights 11, 33 and 5.5 m), not measured
on screen: a 1.7 m person is 18 px tall in the follow mode, 6 px in the whole-yard mode and 36 px
close up. The ball's real 0.2 m is 2.5 px in the follow mode and 0.8 px in the whole-yard mode; drawn
at 1.6× it is 3.9 px and 1.3 px. The follow mode is where the ball is read; the whole-yard mode shows
the yard.

## Adjective to decision

A row that only names a feeling cannot be built or checked. Rewrite it until a screenshot could prove
it wrong. The values below illustrate the rewrite; they are not defaults.

- "cosy" → dusk is the default time, every window is emissive at dusk and night, and nothing but the
  bell tower is over two storeys.
- "lively" → twelve or more agents in the wide view, three loops that never stop (flag, smoke, water)
  and one scripted event every 20–40 s.
- "clean" → one accent, worn only by the boats, and no trim level on anything behind the quay.
- "detailed" → every bay of every building carries one part (door, window or awning) and every zone
  holds three props that someone uses.

## Two sheets

The first is read back from the worked example's code. The second was derived for this document and
was not built or tuned: it shows which rows change with the subject, not values to reuse.

Futsal on a floating school yard (built):

- **Concept**: a school futsal match on a floating island, from the walk-out to the handshake line.
- **Reading order**: the ball and the players round it (the follow camera tracks the ball and each
  kit owns a palette entry), then the caged court (floodlit after dark), then the school behind it
  with the scoreboard and the clock.
- **Frame**: follow 11 m, whole yard 33 m aimed 6 m below the grass so the island's underside is in
  frame, close 5.5 m on the ball.
- **Scale**: the sizes computed above.
- **Colour**: 46 entries in eight families; each club kit, each of the four court surfaces and each
  sky keeps an entry of its own. Its value plan, mood, hero rotation and quiet zones are not recorded
  in the references, so those rows are left out.
- **Cutaway**: cage sides facing the camera drop to a 0.6 m kickboard; the school hides its upper
  floors when it stands on the near side.
- **Light**: day, dusk and night; after dark four floodlights, the lamp faces and the windows carry
  the scene.
- **Motion**: live nodes for the flag, the swings, the clock hands, the door and the scoreboard;
  scripted walk-outs, warm-ups, kick-offs, goal celebrations, half-time and the handshake line; a
  crowd whose jump follows its team's excitement and a photographer's flash.
- **Page**: buttons for the surface, the time of day, the rotation and the camera mode; the score as
  page text that matches the board in the world.

The builders that hold its module sizes are not quoted in the references, so those rows are left out.

A fishing harbour at dawn (derived, never run):

- **Concept**: boats unloading at a stone quay in the half hour before sunrise.
- **Reading order**: the working boat under the crane (the accent hull and the crane's swing), then
  the quay and its lamp-lit stalls, then the lighthouse (the tallest mass, with a turning beam).
- **Frame**: follow 9 m holding the boat, the crane and the stalls beside them; whole harbour 28 m
  aimed below the waterline so the quay wall and the water are in frame; close 5 m.
- **Scale**: a 1.7 m person is 22 px in the follow mode and 7 px in the whole-harbour mode; a gull
  drawn at 1.5× (0.6 m) is 9 px and 2.9 px.
- **Value plan**: the lighthouse is the lightest large mass against the darkest sky band; the quay
  and the sheds sit in the middle; the stage, the boat and the crane, holds the near-black of the
  hull and the near-white of the sails.
- **Colour**: foundations of wet stone, timber, sea, dawn sky, net green and rust; the accent is buoy
  orange, on the working boat, its crates and the buoys only. The 33-entry palette is in
  [colour and light](color-and-light.md).
- **Mood**: calm, cool morning (the first row of the harmony table): blue-grey and teal with pale
  rose, shadows blue-violet, light peach; the lamps still glow warm.
- **Hero rotation**: the lighthouse behind the stage with the sun low on the left; the other three
  keep the boat whole and the lighthouse visible above the sheds.
- **Quiet zones**: open water at the far corner of the whole-harbour mode, and the bare quay surface
  between the stalls and the crane.
- **Modules**: storey 2.6 m, bay 2.4 m, door 1 m by 2 m, quay rail 1 m; every shed and stall is a
  whole number of bays.
- **Detail levels**: mass over 2 m, part 0.4–2 m (doors, shutters, crates), trim under 0.4 m (rails,
  ropes, signs); sheds behind the quay keep mass and part only.
- **Cutaway**: the warehouse on the near side drops to its ground-floor wall; masts stay up, because
  the stage reads through them.
- **Light**: dawn is the hero time, with day and night beside it; quay lamps, stall lanterns and the
  lighthouse lamp glow at dawn and at night.
- **Motion**: water, gulls, the lighthouse beam and the flags on the masts never stop; the crane
  lifts a crate and a boat casts off on events; under reduced motion the camera turns at once.
- **Page**: buttons for the time of day, the rotation, the camera mode and the tide; the number of
  crates landed as page text.
- **Risks**: water in one flat colour reads as a floor, so it takes a second ramp step that moves;
  ropes under two pixels flicker in the wide mode, so they are left out of it; the dawn sky and wet
  stone can snap to the same palette entry, so the sky takes an entry of its own.

Both sheets keep the same mechanics: the pipeline, the 31° camera in 90° steps, the texel snap, the
toon ramp, baking and instancing. Every row differs. A new diorama that shares a row's value with the
futsal sheet needs a reason for it on its own sheet.

## Page around the canvas

- The canvas shows the world. Words and numbers a person must read exactly (a score, a clock, labels,
  help) are page text outside the low-res buffer, so they stay sharp at any enlargement. Text that
  belongs to the world, such as a scoreboard or a shop sign, is a texture inside it
  ([scene](scene.md)).
- Page colours are `PALETTE` entries: a dark and a light from the neutral ramp for surface and text,
  and the accent for the one primary action. Text keeps a contrast ratio of at least 4.5:1 on its
  surface.
- One typeface family in two or three sizes. A pixel typeface is for headings, at whole multiples of
  its design size; running text and numbers use a plain one.
- Every view option is a button with its name as text or `aria-label` and its state as
  `aria-pressed`, reachable by keyboard and at least 44 px tall on a touch screen. The headless
  script finds controls by role and name, so a control without a name cannot be checked.
- Controls sit outside the canvas or along one edge of it. Nothing covers the stage in the follow
  mode.
- At phone widths the canvas keeps its aspect ratio and its whole-pixel enlargement, the controls
  wrap below it, and the page never scrolls sideways.
