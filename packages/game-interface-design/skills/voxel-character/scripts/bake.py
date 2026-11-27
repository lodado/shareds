"""Bake a character spec into a self-contained workshop page: body layers per tool, shield, action and
direction, with the imported head strips combined in the browser.

  python bake.py <character.json> <out.html>

Paths in the spec are relative to the spec file. See example/character.json.
"""

import base64
import html
import io
import json
import math
import os
import sys
from pathlib import Path

if len(sys.argv) != 3:
    sys.exit(__doc__)
SPEC_PATH = Path(sys.argv[1]).resolve()
os.environ["VCHAR_SPEC"] = str(SPEC_PATH)
sys.path.insert(0, str(Path(__file__).resolve().parent / "vchar"))

import numpy as np  # noqa: E402
from PIL import Image  # noqa: E402

import frames as F  # noqa: E402
import parts as mp  # noqa: E402
import render as R  # noqa: E402
import rig  # noqa: E402
from anims import ACTIONS  # noqa: E402
from heads import BRIM_Y, CELL, CX  # noqa: E402
from spec import SPEC  # noqa: E402

HERE = SPEC_PATH.parent
BRIM_Z = 37.5  # rest-pose height of the brim on the voxel head: where the painted head is pinned
# Invisible stand-ins for the flat head image, in the head's rest coordinates: (centre, radius in voxels).
# They give the painted head a depth, so body pixels in front of it cover it, and tools collide with it.
BLOBS = [
    (np.array(c, float), r)
    for c, r in SPEC.get("head", {}).get(
        "blobs", [([0.0, 0.0, 34.5], 8.0), ([0.0, 8.5, 27.0], 6.0)]
    )
]
MARGIN = 1.0  # voxels kept between a held tool and the head after the push
_raw_pose = rig.pose


def blobs_of(inst):
    head = next(i for i in inst if i.name == "head")
    return [(head.pos + head.M @ (c - rig.NECK), r) for c, r in BLOBS]


def solved(lo, q):
    """Collision: while a held tool or a hand sits inside the head stand-ins, move the grip out the shortest way."""
    q = dict(q)
    for _ in range(8):
        inst, info = _raw_pose(lo, q)
        mode = q["weapon"][0]
        if mode not in ("hand", "two"):
            break
        w = next(i for i in inst if i.name == "weapon")
        pts = [w.point((19.0, 0.0, z)) for z in range(0, 45, 2)] + list(
            info["hands"].values()
        )
        deepest, push = 0.0, None
        for c, r in blobs_of(inst):
            for pt in pts:
                gap = pt - c
                dist = np.linalg.norm(gap)
                if r + MARGIN - dist > deepest:
                    deepest = r + MARGIN - dist
                    push = (
                        gap / dist if dist > 1e-6 else np.array([0.0, 1.0, 0.0])
                    ) * deepest
        if push is None:
            break
        if q["space"] == "body":  # hand targets live in chest space
            push = (
                rig.rz(q["twist"]) @ rig.rx(-q["lean"]) @ rig.ry(q["roll"])
            ).T @ push
        for key in ("grip",) if mode == "two" else ("hand_lo", "hand_hi"):
            q[key] = tuple(np.asarray(q[key], float) + push)
    return inst, info


def penetration(lo, q, pose=solved):
    """Deepest point of a held tool or hand inside the head stand-ins, in voxels (negative = clear)."""
    inst, info = pose(lo, q)
    if q["weapon"][0] not in ("hand", "two"):
        return -math.inf
    w = next(i for i in inst if i.name == "weapon")
    pts = [w.point((19.0, 0.0, z)) for z in range(0, 45, 2)] + list(
        info["hands"].values()
    )
    return max(r - np.linalg.norm(p - c) for c, r in blobs_of(inst) for p in pts)


rig.pose = solved


def head_depth(inst, C):
    """Per-pixel depth of the painted head: the near surface of the stand-ins; elsewhere a flat card just in front."""
    blobs = blobs_of(inst)
    ys, xs = np.mgrid[0 : R.CH, 0 : R.CW] + 0.5
    proxy = np.full((R.CH, R.CW), R.project(blobs[0][0][None, :], C)[0, 2] - 2.0)
    for c, r in blobs:
        sx, sy, sd = R.project(c[None, :], C)[0]
        rr = ((xs - sx) / (r * R.ZX)) ** 2 + (
            (ys - sy) / (r * R.ZY * math.cos(R.ELEV))
        ) ** 2
        proxy = np.where(
            rr < 1, np.minimum(proxy, sd - r * np.sqrt(np.clip(1 - rr, 0, 1))), proxy
        )
    return proxy


def layers(name, act, k, d):
    """Body under the head, body over the head, and where the head's brim lands on screen."""
    lo = F.loadout(name)
    inst, _ = solved(lo, ACTIONS[act]["build"](lo)[k][0])
    rig.pose = lambda l, q: (
        lambda r: ([i for i in r[0] if i.name not in ("head", "chin")], r[1])
    )(solved(l, q))
    try:
        code = F.frame_image(name, act, k, d)[0]
    finally:
        rig.pose = solved
    base = np.dstack([rig.PAL[code], (code > 0) * 255]).astype(np.uint8)
    C = R.camera(d, 16)
    head = next(i for i in inst if i.name == "head")
    brim = head.pos + head.M @ (np.array([0.0, 0.0, BRIM_Z]) - rig.NECK)
    x, y = R.project(brim[None, :], C)[0, :2]
    body = [i for i in inst if i.name not in ("head", "chin")]
    _, ident, depth = R.render(body, d, rig.DARK, 16)
    # Every body pixel nearer than the head covers it: the near shoulder, a tool on the near shoulder.
    over = (ident > 0) & (depth < head_depth(inst, C) - 0.5)
    top = np.zeros_like(base)
    top[over] = base[over]
    return base, top, (float(x), float(y))


def uri(im):
    b = io.BytesIO()
    im.save(b, "PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()


def strips(group):
    out = {}
    for key, item in SPEC.get(group, {}).items():
        img = Image.open(HERE / item["strip"]).convert("RGBA")
        meta_path = (HERE / item["strip"]).with_suffix(".json")
        meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
        out[key] = (img, item.get("label", key), bool(meta.get("sitOnHair")))
    return out


def head_boxes(faces, hats):
    """Union of every face and hat pixel per view, relative to the brim anchor."""
    boxes = []
    for col in range(8):
        a = np.zeros((CELL, CELL), bool)
        for img, _, _ in list(faces.values()) + list(hats.values()):
            a |= np.array(img)[:, col * CELL : (col + 1) * CELL, 3] > 0
        ys, xs = np.nonzero(a)
        boxes.append(
            (xs.min() - CX, xs.max() - CX, ys.min() - BRIM_Y, ys.max() - BRIM_Y)
            if xs.size
            else None
        )
    return boxes


def main():
    out_path = Path(sys.argv[2])
    tools = SPEC.get("tools", {"pick": {"part": "weapon_pick", "label": "pick"}})
    shields = [False, True] if SPEC.get("shield", True) else [False]
    acts = SPEC.get(
        "actions",
        {"idle": {"source": "idle", "dirs": list(range(0, 16, 2)), "label": "idle"}},
    )
    for act, a in acts.items():
        if a["source"] not in ACTIONS or any(d not in range(0, 16, 2) for d in a["dirs"]):
            sys.exit(f"actions.{act}: source one of {sorted(ACTIONS)}, dirs even numbers 0-14")
    faces, hats = strips("faces"), strips("hats")
    if not faces:
        sys.exit("the spec needs at least one face strip (heads.py import)")
    boxes = head_boxes(faces, hats)
    data = {"body": {}, "ms": {}}
    lo_x = lo_y = math.inf
    hi_x = hi_y = -math.inf
    for tool, t in tools.items():
        for shield in shields:
            name = f"{tool}|{int(shield)}"
            mp.LOADOUTS[name] = (
                "body_cloth",
                "head_base",
                "hair_long",
                "chin_long",
                *(("shield_octagon",) if shield else ()),
                t["part"],
            )
            for act, a in acts.items():
                timing = [f[1] for f in ACTIONS[a["source"]]["build"](F.loadout(name))]
                data["ms"][act] = timing
                for d in a["dirs"]:
                    fr = [layers(name, a["source"], k, d) for k in range(len(timing))]
                    h, w = fr[0][0].shape[:2]
                    sheet = Image.new("RGBA", (w * len(fr), h * 2))
                    for i, (b, top, (ax, ay)) in enumerate(fr):
                        sheet.paste(Image.fromarray(b, "RGBA"), (i * w, 0))
                        sheet.paste(Image.fromarray(top, "RGBA"), (i * w, h))
                        ys, xs = np.nonzero(b[..., 3])
                        lo_x, hi_x, lo_y, hi_y = (
                            min(lo_x, xs.min()),
                            max(hi_x, xs.max()),
                            min(lo_y, ys.min()),
                            max(hi_y, ys.max()),
                        )
                        box = boxes[((d - 8) // 2) % 8]
                        if box:
                            lo_x, hi_x = (
                                min(lo_x, round(ax) + box[0]),
                                max(hi_x, round(ax) + box[1]),
                            )
                            lo_y, hi_y = (
                                min(lo_y, round(ay) + box[2]),
                                max(hi_y, round(ay) + box[3]),
                            )
                    key = f"{tool}|{'on' if shield else 'off'}|{act}|{d}"
                    data["body"][key] = {
                        "src": uri(sheet),
                        "at": [[round(f[2][0], 2), round(f[2][1], 2)] for f in fr],
                    }
                    data["w"], data["h"] = w, h
            print(f"baked {tool}, shield {'on' if shield else 'off'}", flush=True)
    m = 2  # the crop is the union of every frame and every head, plus a margin
    data["crop"] = [
        int(lo_x - m),
        int(lo_y - m),
        int(hi_x - lo_x + 1 + 2 * m),
        int(hi_y - lo_y + 1 + 2 * m),
    ]
    for group, sets in (("faces", faces), ("hats", hats)):
        data[group] = {
            k: {"src": uri(img), "label": label, "sitOnHair": sit}
            for k, (img, label, sit) in sets.items()
        }
    data["cx"], data["brimY"], data["cell"] = CX, BRIM_Y, CELL
    data["coat"] = [list(c) for c in mp.RAMP["coat"]]
    data["coats"] = SPEC.get("coats", {"base": {"label": "base", "ramp": None}})
    data["tools"] = {k: t.get("label", k) for k, t in tools.items()}
    data["acts"] = {
        k: {"label": a.get("label", k), "dirs": a["dirs"]} for k, a in acts.items()
    }
    data["shield"] = len(shields) > 1
    data["ui"] = SPEC.get("ui", {})
    data["title"] = SPEC.get("title", "Character workshop")
    template = (Path(__file__).resolve().parent / "workshop.template.html").read_text()
    head, tail = template.split("__DATA__")  # one pass, so a label cannot inject a placeholder or close the script
    page = head.replace("__TITLE__", html.escape(data["title"]))
    out_path.write_text(page + json.dumps(data).replace("</", "<\\/") + tail)
    print(
        f"wrote {out_path}: cell {data['w']}x{data['h']}, crop {data['crop']}, {out_path.stat().st_size} bytes"
    )


if __name__ == "__main__":
    main()
