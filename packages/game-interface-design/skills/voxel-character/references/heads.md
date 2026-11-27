# Head sheets

The painted head carries the character: its style, age, mood and readability all come from the sheet. The body only
has to stay out of its way.

## Prompt

Send `layout.png` as a composition reference (layout, head size and angle only), and this brief with the two slots
filled. Keep the rest verbatim.

```
Pixel art head sheet for a game: exactly five complete bare heads of ONE character in one horizontal row, no hat,
no body, no shoulders, no weapons, no text. Views in this order: front, front three-quarter facing right, right
profile, back three-quarter facing right, back. Copy the reference's layout exactly: same five positions, same head
size, same height on the canvas. Every head is whole and round, with the full hair outline visible, never
cropped or cut diagonally, and the same face in all five views. Clear empty space between the heads.
[STYLE] [CHARACTER] Transparent or flat white background.
```

`[STYLE]`: one line naming the art style, the line weight and the shading, for example `Crisp 16-bit pixel art
with bold dark outlines, 3-tone hue-shifted shading, warm highlights.` Use one style line for every sheet of a cast.

`[CHARACTER]`: hair (cut, colour, length), eyes, facial hair, one distinguishing mark. Hair or facial hair that
reaches the chest is fine; widen `head.blobs` if it hangs well past the chin (see body-and-motion.md).

Headwear uses the same brief with `one hat worn on a plain head painted flat pure magenta (#FF00FF), no face, no
hair, no outline on the head` in place of `bare heads ... no hat`, and the hat described in `[CHARACTER]`. The import
sees the magenta head, deletes it, pins the hat where it meets the head, and keeps everything that hangs from the hat:
a wide brim, a hood's sides, a veil. Keep magenta and purple out of the hat itself. A hat sheet without the magenta head falls back to keeping only what is above the
brim line, which leaves a band of the generator's head under a wide brim.

## Reject and regenerate when

- Fewer or more than five heads, heads touching, or a head cut by the canvas edge.
- The three-quarter or profile view is a different person, or the profile faces left.
- A shoulder, collar or weapon is drawn under the head (the import keeps it and it floats over the body).
- Soft airbrushed edges or a glow: the hard alpha keeps a pale rim of dots around the head.

## Import options

| Flag            | Use                                                                                                                                                  |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--hat`         | Headwear. With a magenta head: keep the hat and whatever hangs from it. Without: keep only rows above the brim.                                      |
| `--drape`       | With `--hat` and no magenta head: also keep the hat's own colours hanging below the brim when they connect to it (hood, veil).                       |
| `--sit-on-hair` | With `--hat`: draw over the hair instead of replacing it, and drop hair or skin the generator drew between the pieces (crown, circlet, flower).      |
| `--brim R`      | Brim depth below the crown as a share of the front width. Default 0.5; raise it for a topknot or tall spiky hair, lower it when a hat cuts the eyes. |
| `--scale S`     | Head size. Default 0.78. Change all sheets of a cast together, or faces and hats stop matching.                                                      |

After importing, look at the strip at 4x next to the others: the same size, eyes on the same row, the left views
mirrored correctly. A face with eyes two pixels higher than the rest needs `--brim` adjusted, not a new sheet.
