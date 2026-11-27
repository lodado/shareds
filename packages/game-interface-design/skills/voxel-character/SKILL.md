---
name: voxel-character
description: 'Build a rigged 3D pixel-art character (3D 픽셀 캐릭터, 복셀 캐릭터, 파츠 조립 캐릭터): a voxel body that walks, works and turns through eight directions, with painted head images in any art style whose faces, hats, coat colours, tools and shields swap in a browser workshop page. The painted heads get a depth and a collision volume so near arms and tools cover them and swings never pass through a face. Use for a character or a cast built from swappable parts, a character workshop or dress-up page, or fixing such a character when its head looks too big, ignores perspective or gets pierced by a tool. Not for a rigid prop or vehicle that only turns (sprite-stacking) or hand-drawn frame animation (pixel-sprite-animation).'
allowed-tools:
  - Bash
---

# Voxel character

A character in two halves. The body is voxels: a rig with two-bone IK poses it, and every frame is rendered from the
real 3D pose, so it turns and animates without drawing. The head is a painted image, one per view, because a face
drawn by hand (or by an image generator) reads far better at 20 px than any voxel face. The bake pins the painted head
to the voxel neck, gives it an invisible depth volume so nearer body pixels cover it, and pushes held tools out of
that volume. A workshop page then combines faces, headwear, coats, tools, shields and actions in the browser.

Scripts need Python 3 with Pillow and NumPy (`uv run --with pillow --with numpy python ...`). Paths below are
relative to this skill's folder; work in a project folder of your own, never inside the skill.

## 1. Write the spec

Copy [scripts/example/character.json](scripts/example/character.json) into the work folder and edit it:

- `title`, `ui`: page title and button labels. Write them in the user's language.
- `tools`: label and voxel part per tool (`weapon_pick`, `weapon_axe`, `weapon_mattock`). `shield`: offer a shield.
- `actions`: label, source animation (`idle`, `walk`, `mine`, `attack`, `chop`, `block`, `hurt`, `gather`) and
  directions (even numbers 0-14; 8 faces the camera, 12 faces right). Work actions read best from the four side
  diagonals `[12, 10, 4, 6]`.
- `coats`: one swap per entry, a six-tone ramp from dark to light, or `null` for the baked coat colour.
- `ramps`: recolour a body material for every variant, with as many tones as the built-in ramp (six; `iron` has seven): `coat` (torso and sleeves), `leather` (boots, belt, cuffs,
  gloves), `trouser`, `shirt` (collar), `bronze` (buckle, belt lantern), and `wood`, `steel`, `iron` for tools and shield.
- `faces`, `hats`: imported head strips from step 3, each with a label.
- `head.neck`: voxels of neck between collar and chin. 0 suits a stocky build or a beard that covers it; a
  beardless face needs about 6, or it sits on the collar with no neck. Set `ramps.skin` to the faces' skin tone.

A new body shape, tool or action is code: see [references/body-and-motion.md](references/body-and-motion.md).

## 2. Generate the head sheets

```bash
python scripts/heads.py layout layout.png
```

`layout.png` holds five plain heads in the angles and sizes the import expects: front, front three-quarter facing
right, right profile, back three-quarter facing right, back. Give it to the host's image generation tool as a
composition reference with one sheet per face or hat. The prompts, the style line for each look and what to reject
are in [references/heads.md](references/heads.md). Generate one sheet at a time and look at every sheet before
importing it: five whole heads in a row with gaps, the same person in all five, nothing cropped.

Faces are bare heads (hair, no hat). A hat sheet shows the hat on a flat magenta head, which the import deletes.

## 3. Import

```bash
python scripts/heads.py import face-a.png heads/face-a.png
python scripts/heads.py import helmet.png heads/helmet.png --hat
python scripts/heads.py import crown.png heads/crown.png --hat --sit-on-hair  # the hair shows through
```

The import finds the five heads, pins each one by its centre and a brim line half the front view's width below the
crown, scales a fifth of the sheet to 40.2 game px times `--scale` (0.78), quantizes to the body palette plus the
sheet's own 24 colours, and mirrors the right-facing views into the left ones. Pass `--brim` when a tall topknot or
spiky hair puts the crown far above the skull.

## 4. Bake

```bash
python scripts/bake.py character.json workshop.html
```

A bake of three tools, two shield states and four actions takes about 35 s and writes one self-contained page. The
crop is the union of every frame and every head, so nothing touches the edge.

## 5. Look before reporting

Run `python scripts/check.py` after changing any script. Then open the page in a real browser and look at enlarged
renders, not the page thumbnail:

- The exact combination the user named or screenshotted, in the pose and direction they showed.
- Both profiles (directions 4 and 12) and both back diagonals: near shoulder and a pick on the near shoulder cover
  the head, the torso is wider than the head, no tool crosses a face.
- Every frame of each work action uncropped, laid out in sequence, at 3x. A pick head cut off in a contact sheet is
  usually the sheet's crop, not the bake.
- 320 px width with no horizontal scroll, and no console errors.

Report which of these ran. Playback timing and foot slide need the page playing, not stills; say so when only stills
were checked.

## Numbers that hold

| Setting           | Value                                        | Why                                                                                              |
| ----------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Neck              | 6 voxels for a beardless face                | Below 6 the collar hides it; 0 leaves the chin on the collar.                                    |
| Head scale        | 0.78                                         | 0.86 reads as a big head; 0.70 blurs eyes and mouth into a smear.                                |
| Body zoom         | `[1.0, 1.25]` across, up                     | A taller body fixes a top-heavy look; a uniform zoom widens the shoulders into a bodybuilder.    |
| Torso depth       | about the torso width                        | A shallow torso is narrower than the head in profile, so the head reads as nearer than the body. |
| Brim line         | 0.5 x front width below the crown            | Splits face and hat; a hat replaces the hair above it.                                           |
| Head depth volume | skull r 8 at z 34.5, chin r 6 at y 8.5, z 27 | Ordering and collision use it; set `head.blobs` for a very different head shape.                 |
| Collision margin  | 1 voxel                                      | Tools stop just outside the head volume.                                                         |

## Lessons

Fix the cause where it cannot recur, add a case to `scripts/check.py` built from the real mistake that fails before
the fix, then add a row here. Delete a row once code makes the mistake impossible.

| Date       | Mistake                                                                                | Rule                                                                                     | Enforced by                  |
| ---------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------- |
| 2026-11-27 | Swapping a helmet changed the face under it                                            | A hat keeps only pixels above the brim; faces and hats are separate layers               | `check.py` hat case          |
| 2026-11-27 | A wide straw brim kept a band of the generator's bald head under it                    | Generate hats on a magenta head; the import deletes it and keeps what hangs from the hat | `check.py` magenta-head case |
| 2026-11-27 | Head crops cut from a full-body sprite came out wedge-shaped at some angles            | Generate whole bare heads, never crop them from a body sprite                            | Prompt in heads.md           |
| 2026-11-27 | A swung tool passed through the lower face                                             | Push the grip out of the head volume while posing                                        | `check.py` collision case    |
| 2026-11-27 | Drawing the head over everything hid the near shoulder and a slung pick behind it      | Order every body pixel against the head depth; no part is exempt                         | `check.py` covering case     |
| 2026-11-27 | Exempting tools from depth ordering to hide a tool crossing the face broke perspective | Fix crossings with collision or the pose, never by skipping ordering                     | `check.py` covering case     |
| 2026-11-27 | A beardless face sat on the collar with no neck                                        | Raise the head on `head.neck` and draw a skin neck under it                              | `check.py` neck case         |
| 2026-11-27 | A shallow torso made the head look nearer than the body in profile                     | Torso depth close to its width                                                           | `check.py` torso case        |
| 2026-11-27 | A uniform 1.4x body zoom widened the shoulders                                         | Grow the body taller, not wider                                                          | Spec default                 |
| 2026-11-27 | Armour-style plate bands on every limb read as an inflated tyre man                    | Cloth parts: one sleeve per arm, a cuff, no per-segment gradient bands                   | Parts in body-and-motion.md  |
| 2026-11-27 | Anchors read by eye per sheet drifted between faces                                    | Find heads and anchors from the sheet itself                                             | `check.py` centring case     |
