# Modular parts: one base, many loadouts

Read this when the object is assembled from swappable pieces: a character with headwear, hair and
weapons, a vehicle with turrets or cargo, a building with roof variants. Each piece is authored once
and a loadout is a list of piece names.

## 1. The contract: one grid, ordered slots

- **One grid for every part.** Every part uses the same `(sliceWidth, sliceHeight, count)` and the
  same pivot as the base, and is mostly empty. Parts then need no offsets and no alignment code, and
  they turn together because they are one stack.
- **Slots in a fixed order.** A later slot replaces the voxels it covers. Order them from the inside
  out, for example `body → head → hair → beard → headwear → off-hand → main-hand`. Name a part
  `<slot>_<variant>` so the slot can be read from the name.
- **Size the grid for the largest loadout first.** Leave room for the tallest headwear and the widest
  held item on both sides. Growing the grid later means re-authoring every part.
- **Sockets in numbers.** Write down where things attach before drawing: neck height, crown height,
  each hand's centre `(x, y, z)`, the back. Author a part against the sockets, never against another
  part's shape.

## 2. Authoring rules

- **Store materials, not colours.** Keep each part as a volume of material ids (`mat[z, y, x]`) and
  shade after composing ([voxel-modeling.md](voxel-modeling.md)). Colour depends on what ends up
  above and beside a voxel, which a part cannot know alone.
- **Every part is complete on its own.** What a covering part hides must still exist under it: the
  skull under a helmet, the jaw under a beard. Otherwise taking the cover off leaves a hole.
- **A covering part is a solid block with holes cut in it.** A closed helmet is a filled shape with
  a face opening, so it hides any hair variant without a mask per combination. A part that should
  let the layer below show (an open cap) is simply smaller.
- **A part never reads another part while it is authored** (no "only where there is skin"). Let the
  slot order do the clipping. A part that depends on another cannot be swapped.
- **What moves with a part belongs to it.** The fist that grips a weapon and the strap of a shield
  travel with the item, replacing the base's empty hand.
- **Thin pieces stay 2 voxels wide**, and `views_to_slices.thin_runs` is run on each composed
  loadout, not on each part: a piece can be sound alone and thin once another part clips it.

## 3. Compose

```python
def compose(parts):  # parts sorted by slot order
    out = np.zeros_like(parts[0])
    for part in parts:
        out[part > 0] = part[part > 0]
    return out
```

Compose at one of two moments:

| When       | How                                                                                      | Gives                                                | Costs                                |
| ---------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------ |
| Build time | compose the material volumes, shade once, write one strip per loadout                    | shadows and occlusion that fall across parts         | one strip per loadout                |
| Equip time | shade each part alone, ship one strip per part, draw them over each other into one strip | files grow with the number of parts, not of loadouts | no shadow from one part onto another |

- Shade so both paths agree: compute the height gradient per part, not across the whole volume, and
  fill hidden voxels from the nearest visible voxel of the same slice.
- Measure the gap before choosing: build one loadout both ways and count the visible voxels whose
  colour differs. One six-part character differed in 1.3% of them, which the eye did not find.
- At equip time, merge the part strips once into an offscreen strip and render that as a normal
  stack. Drawing each part as its own stack every frame multiplies the draw calls for no gain: parts
  that share a grid are one object.

## 4. Direction sprites

Baked direction frames cannot be layered part by part, because which part hides which changes with
the angle. Compose the volume first, then bake each loadout ([baking.md](baking.md)).

The sheet count is `loadouts × directions`. When that grows too large, keep the live stack with the
equip-time merge, or bake a loadout when it is first equipped and cache the sheet.

## 5. Not covered

This method was exercised on static loadouts. Two cases need more than it gives:

- **A part that moves on its own** (a swung weapon, a turret, a door) cannot share the grid. Give it
  its own strip with the pivot at the grip or hinge and place it at the owner's socket each frame.
- **Animated bases** (a walk cycle) need each part in every frame, or rigid parts that follow a
  socket whose per-frame offset is recorded with the base.

## Checks

- [ ] The base renders with every optional slot empty and shows no hole.
- [ ] Each covering part is rendered over each variant it can cover, at 8 angles: nothing pokes
      through.
- [ ] `thin_runs` reports nothing for every loadout, and every strip is `count` slices wide.
- [ ] A one-sided item (shield, sidearm) sits on the intended side in the renderer the game uses;
      the baker and the live stack disagree unless the slices are mirrored ([baking.md](baking.md)).
- [ ] A gallery of every part alone and a sheet of the loadouts were looked at.
