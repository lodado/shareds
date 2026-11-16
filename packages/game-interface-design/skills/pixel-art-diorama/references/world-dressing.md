# World dressing

What stands where, in the order that keeps a scene readable: masses first, detail last. The sizes,
colours and counts come from the [direction sheet](art-direction.md).

## Block out

With the real pipeline, camera and light already running, build these as plain boxes in flat palette
colours before any detail:

1. Ground and edge: where the world ends and what the edge looks like from 31°. A floating island
   needs a deep underside; a harbour needs water past the quay.
2. Landmark: the one mass that names the place.
3. Stage: where the moving thing lives. Flat, clear and lit.
4. Supporting masses: what frames the stage and gives the landmark something to be bigger than.
5. One box the size of a person on the stage, and the hero time's light.

Shoot the wide mode from all four rotations and every other mode once, then answer from the images:

- Is the stage whole in every rotation once the cutaway has dropped the near walls? A mass that still
  hides it is moved, lowered or added to the cutaway.
- From the rotations where the landmark stands behind the stage, does it break the skyline? From the
  ones where it stands in front, does the cutaway leave enough of it to still name the place?
- With the image shrunk to half its size, are ground, stage and landmark still three separate shapes?
- Does the wide mode hold the world's edge, and does the follow mode hold the stage with what frames
  it?
- Is the person-sized box as many pixels tall as the sheet says?

Fix a "no" by moving or resizing boxes now. After dressing, the same fix moves every prop that stands
on them.

## Four tiers

Fill them in this order, and finish each tier across the whole world before starting the next, so the
scene is never detailed in one corner and bare in another.

1. **Landmark** (one, at most two): all three detail levels, and the only unique shapes.
2. **Structures**: the buildings and fixed equipment that frame the stage, built from the sheet's
   modules. Mass and part levels everywhere; trim only on faces toward the stage.
3. **Props**: things somebody uses. Each prop names its user and stands where that user would leave
   it: a bench faces the pitch, a bin stands by the gate, crates stack beside the crane.
4. **Life**: agents with a task, loops that never stop, and one or two small stories, such as a
   photographer waiting for a goal.

The worked example sorted into the tiers: the school with its clock, scoreboard, flag and a door on a
hinge; the cage, the bleachers, four floodlight pylons and the goals; benches, swings and trees; two
teams and staff on scripted sequences, a crowd that jumps with its team's excitement and a
photographer whose flash fires in a celebration.

The harbour of the second sheet, derived and never run: the lighthouse; a warehouse, a crane, market
stalls and the quay wall; crates, nets, barrels, lanterns and bollards; fishers unloading, a buyer
walking the stalls, gulls, and a cat that waits by the fish crates.

## Placement

- Density falls with distance from the stage. Props cluster where people would gather (the stage's
  edge, gates, doors, paths) and thin out toward the world's edge. The stage floor stays clear, so
  agents and the thing that moves read against it.
- Props come in groups of use, not a scatter: a bench with a bin and a lamp, a stall with crates and
  an awning. An area left empty on purpose is a decision; write it on the sheet.
- One module in two or three variants (a height, a colour from the same ramp, a missing piece),
  placed with the seeded RNG and a minimum spacing. The same seed then gives the same world, and
  screenshots stay comparable.
- Everything placed on walkable ground is written into the nav grid as blocked cells before agents
  plan a path, or they walk through it ([simulation](simulation.md)).
- A prop mounted on a wall that the cutaway hides belongs to that wall's group. Otherwise it hangs in
  the air when the wall drops ([camera](camera.md)).
- Check each prop's size in pixels ([art direction](art-direction.md)): under two pixels in the mode
  it is read in, draw it larger than life or leave it out.

## What dressing costs

Count this before building, against the budget of [draw calls](draw-calls.md).

- A static prop in a colour its group already uses adds no draw call: `bakeStatic` leaves one mesh
  per material, shadow flags and attribute set in each static group. A new colour is a new material
  and a new bucket, so one more call, two when it casts a shadow.
- A prop that moves is a live node and keeps its own calls: one per material inside it, twice with
  shadows. List every live thing on the sheet's Motion row and count them.
- Many copies of one moving thing (a crowd, gulls, a row of flags) are one `InstancedMesh`, not many
  live nodes.
- The cheapest life changes no geometry: an emissive material that follows the time of day (windows,
  lamps), a texture redrawn when its state changes (a board), a rotation on one pivot (clock hands,
  a swing).
