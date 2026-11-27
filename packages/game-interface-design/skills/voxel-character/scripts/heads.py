"""Painted heads for the voxel body: a layout reference for the image generator, and the import that
turns a generated five-view sheet into the eight game-size views the bake and the page use.

  python heads.py layout <out.png>
  python heads.py import <sheet.png> <out.png> [--hat] [--drape] [--sit-on-hair] [--brim R] [--scale S]

A sheet holds five heads of one character in a row: front, front three-quarter facing right, right
profile, back three-quarter facing right, back. The left-facing views are mirrors of the right ones.
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent / "vchar"))

CELL = 84  # one view in the strip, game pixels
CX = 41.5  # head centre column in a cell; a mirrored view lands on the same column
BRIM_Y = (
    26  # brim row in a cell: a hat keeps what is above it, the face strip what is below
)
CELL_PX = 40.2  # game pixels per fifth of the sheet at scale 1: one generated head about 19 px wide at 0.78
SCALE = 0.78  # smaller heads blur the face, larger ones read as a big head on the body
VIEWS = 5
MIRROR = {1: 7, 2: 6, 3: 5}
KEY = (255, 0, 255)  # a hat sheet's head is painted this colour, so the import can tell head from hat
CHIN = 0.75  # the layout head's chin sits this share of its width below the brim line (it is 1.25 times as tall as wide)


def layout(out):
    """Five views of a plain voxel head, in the angles and sizes the bake expects, on flat white."""
    import render as R
    import rig

    head = rig.part(rig.tall("head_bare"), rig.NECK)
    cell = 420
    sheet = Image.new("RGB", (cell * VIEWS, int(cell * 1.4)), (255, 255, 255))
    for col, d in enumerate((8, 10, 12, 14, 0)):
        code, _, _ = R.render(
            [R.Inst("head", head, np.eye(3), rig.NECK)], d, rig.DARK, 16
        )
        code = R.outline(code, rig.CODE["outline"][0])
        ys, xs = np.nonzero(code)
        img = Image.fromarray(
            rig.PAL[code[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]]
        )
        k = int(cell * 0.6 / img.width)
        img = img.resize((img.width * k, img.height * k), Image.NEAREST)
        mask = Image.fromarray(
            ((code[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1] > 0) * 255).astype(
                np.uint8
            )
        )
        sheet.paste(
            img,
            (col * cell + (cell - img.width) // 2, int(cell * 0.25)),
            mask.resize(img.size, Image.NEAREST),
        )
    sheet.save(out)
    print(f"wrote {out}: {sheet.width}x{sheet.height}, five views left to right")


def opaque(arr, tol=28):
    """Alpha mask of the sheet. A flat, opaque background is keyed out from the corner colour."""
    a = arr[..., 3]
    if (a < 128).mean() > 0.05:
        return a >= 128
    corners = np.concatenate(
        [arr[:4, :4, :3].reshape(-1, 3), arr[-4:, -4:, :3].reshape(-1, 3)]
    )
    bg = np.median(corners, axis=0)
    near = np.abs(arr[..., :3].astype(int) - bg).max(-1) <= tol
    # only background connected to the border: white eyes and highlights inside a head stay
    fill = Image.fromarray(np.pad(near, 1, constant_values=True).astype(np.uint8) * 255).copy()  # a view of the array ignores the fill
    ImageDraw.floodfill(fill, (0, 0), 128)
    return np.array(fill)[1:-1, 1:-1] != 128


def heads_on(solid):
    """Column ranges of the five heads: the five widest runs of occupied columns, left to right."""
    cols = solid.sum(0) > 2
    runs, start = [], None
    for x, v in enumerate(np.append(cols, False)):
        if v and start is None:
            start = x
        if not v and start is not None:
            runs.append((start, x))
            start = None
    runs = sorted(sorted(runs, key=lambda r: r[1] - r[0])[-VIEWS:])
    if len(runs) != VIEWS or min(b - a for a, b in runs) < solid.shape[1] / VIEWS / 6:
        sys.exit(
            f"expected {VIEWS} separate heads in a row, found runs {runs}; regenerate with clear gaps"
        )
    return runs


def palette_for(arr, solid):
    """The body's ramps plus 24 colours of the sheet, so skin and hair keep their own tones."""
    import rig

    extra = Image.fromarray(arr[solid][:, :3][None]).quantize(24).getpalette()[: 24 * 3]
    return np.array(
        [tuple(c) for c in rig.PAL[1:]]
        + [tuple(extra[i : i + 3]) for i in range(0, len(extra), 3)],
        int,
    )


def import_sheet(path, out, hat=False, drape=False, sit=False, brim=0.5, scale=SCALE):
    arr = np.array(Image.open(path).convert("RGBA"))
    solid = opaque(arr)
    runs = heads_on(solid)
    pal = palette_for(arr, solid)
    uniq, inv = np.unique(arr[..., :3][solid].astype(int), axis=0, return_inverse=True)
    near = np.concatenate(
        [
            ((u[:, None] - pal[None]) ** 2 * np.array([2, 4, 3])).sum(-1).argmin(1)
            for u in np.array_split(uniq, 60)
        ]
    )
    code = np.full(solid.shape, -1)
    code[solid] = near[inv.ravel()]
    rgb = arr[..., :3].astype(int)
    exact = solid & (np.abs(rgb - KEY).max(-1) <= 30)
    key_head = hat and exact.sum() > 0.01 * solid.sum()
    if key_head:  # the key plus the magenta the generator blended into the head's edge
        hue = (rgb[..., 0] - rgb[..., 1] > 90) & (rgb[..., 2] - rgb[..., 1] > 90)
        code[solid & hue & grow(exact, 4)] = len(pal)
        pal = np.vstack([pal, KEY])
    step = arr.shape[1] / VIEWS / (CELL_PX * scale)  # sheet pixels per game pixel
    front = runs[0][1] - runs[0][0]
    views, anchors = {}, {}
    for col, (x0, x1) in enumerate(runs):
        mine = code[:, x0:x1]
        top = np.nonzero((mine >= 0).any(1))[0].min()
        anchors[col] = (top, top + brim * front)  # brim: a fixed share of the front view's width below the crown
    if key_head:  # pin the hat by the painted head under it, measured like the layout head: chin and width
        head = [code[:, x0:x1] == len(pal) - 1 for x0, x1 in runs]
        width = head[0].sum(1).max()
        for col, h in enumerate(head):
            rows = np.nonzero(h.any(1))[0]
            if rows.size:
                anchors[col] = (anchors[col][0], rows.max() - CHIN * width)
        shown = [c for c, h in enumerate(head) if h.any()]
        if not shown:
            sys.exit("the magenta head is hidden in every view; regenerate with the head showing")
        lift = np.mean([anchors[c][1] - anchors[c][0] for c in shown])
        for col, h in enumerate(head):  # a view where the hat hides the whole head: the others' offset from the top
            if not h.any():
                anchors[col] = (anchors[col][0], anchors[col][0] + lift)
    for col, (x0, x1) in enumerate(runs):
        mine = code[:, x0:x1]
        cx, by = (x0 + x1) / 2 - x0, anchors[col][1]
        img = np.zeros((CELL, CELL, 4), np.uint8)
        for y in range(CELL):
            for x in range(CELL):
                sx, sy = cx + (x - CX) * step, by + (y - BRIM_Y) * step
                if sx < 0 or sy < 0:
                    continue
                block = mine[int(sy) : int(sy + step), int(sx) : int(sx + step)]
                if (
                    block.size and (block >= 0).mean() >= 0.5
                ):  # the dominant colour keeps edges crisp
                    img[y, x] = (*pal[np.bincount(block[block >= 0]).argmax()], 255)
        views[col] = img
    if key_head:
        views = {c: keyed_headwear(v) for c, v in views.items()}
    elif hat:
        views = {c: headwear(v, drape, sit) for c, v in views.items()}
    strip = np.zeros((CELL, CELL * 8, 4), np.uint8)
    for col, v in views.items():
        strip[:, col * CELL : (col + 1) * CELL] = v
        if col in MIRROR:
            strip[:, MIRROR[col] * CELL : (MIRROR[col] + 1) * CELL] = v[:, ::-1]
    Image.fromarray(strip, "RGBA").save(out)
    meta = {"kind": "hat" if hat else "face", "sitOnHair": bool(sit)}
    Path(out).with_suffix(".json").write_text(json.dumps(meta))
    width = [int((v[..., 3] > 0).any(0).sum()) for v in views.values()]
    print(f"wrote {out}: {meta['kind']}, view widths {width} px")


def grow(mask, n=1):
    for _ in range(n):
        mask = mask | (sum(np.roll(mask, (dy, dx), (0, 1)) for dy in (-1, 0, 1) for dx in (-1, 0, 1)) > 0)
    return mask


def keyed_headwear(v):
    """The hat on a key-coloured head: everything that is not the head or its outline, wherever it hangs."""
    a = v[..., 3] > 0
    key = a & (v[..., :3] == KEY).all(-1)
    rows = np.arange(CELL)[:, None]
    loose = a & ~key & ~(grow(key, 2) & (rows > BRIM_Y))  # the head's outline sits right around the key
    keep = loose & (rows <= BRIM_Y)
    for _ in range(CELL):  # brim edges and cloth that hang from the hat itself
        nxt = grow(keep) & loose
        if (nxt == keep).all():
            break
        keep = nxt
    out = v.copy()
    out[~keep] = 0
    return out


def headwear(v, drape, sit):
    """Only what sits above the brim; a cloth drape also keeps its own colours hanging below it."""
    a = v[..., 3] > 0
    keep = a.copy()
    keep[BRIM_Y + 1 :] = False
    rgb = v[..., :3].reshape(-1, 3)
    if sit:  # sits in the hair: drop hair or skin the generator drew between the pieces
        below = {
            tuple(c) for c in rgb[(a & (np.arange(CELL)[:, None] > BRIM_Y + 3)).ravel()]
        }
        keep &= ~np.array([tuple(c) in below for c in rgb]).reshape(a.shape)
    if drape:
        top = rgb[keep.ravel()]
        if len(top):
            values, n = np.unique(top, axis=0, return_counts=True)
            cloth = {tuple(c) for c, k in zip(values, n) if k >= 0.08 * len(top)}
            low = a & np.array([tuple(c) in cloth for c in rgb]).reshape(a.shape)
            low[: BRIM_Y + 1] = False
            for _ in range(2):  # drop thin specks that would dot another face
                around = (
                    sum(
                        np.roll(low | keep, (dy, dx), (0, 1)).astype(int)
                        for dy in (-1, 0, 1)
                        for dx in (-1, 0, 1)
                    )
                    - 1
                )
                low &= around >= 4
            reach = keep.copy()
            for _ in range(CELL):  # only cloth that hangs from the hat itself
                grown = (
                    sum(
                        np.roll(reach, (dy, dx), (0, 1)).astype(int)
                        for dy in (-1, 0, 1)
                        for dx in (-1, 0, 1)
                    )
                    > 0
                )
                reach |= grown & low
            keep = reach
    out = v.copy()
    out[~keep] = 0
    return out


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("layout").add_argument("out")
    imp = sub.add_parser("import")
    imp.add_argument("sheet")
    imp.add_argument("out")
    imp.add_argument(
        "--hat", action="store_true", help="keep only what sits above the brim"
    )
    imp.add_argument(
        "--drape",
        action="store_true",
        help="with --hat on a sheet without a magenta head: keep cloth hanging below the brim",
    )
    imp.add_argument(
        "--sit-on-hair",
        action="store_true",
        help="with --hat: drawn over the hair, which stays",
    )
    imp.add_argument(
        "--brim",
        type=float,
        default=0.5,
        help="brim depth below the crown, as a share of the front width",
    )
    imp.add_argument("--scale", type=float, default=SCALE)
    a = ap.parse_args()
    if a.cmd == "import" and (a.drape or a.sit_on_hair) and not a.hat:
        ap.error("--drape and --sit-on-hair only apply with --hat")
    if a.cmd == "layout":
        layout(a.out)
    else:
        import_sheet(a.sheet, a.out, a.hat, a.drape, a.sit_on_hair, a.brim, a.scale)


if __name__ == "__main__":
    main()
