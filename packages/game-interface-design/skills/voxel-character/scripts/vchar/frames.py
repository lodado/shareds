"""Render one posed frame of a loadout: palette codes, plus the measurements the checks read."""

import numpy as np
from PIL import Image, ImageDraw

import render as R
import rig
from anims import ACTIONS

DIRS = 16
LEG = ("thigh", "shin", "foot")
LIMB = LEG + ("upper", "fore", "hand", "pauldron")
_cache = {}


def loadout(name):
    if name not in _cache:
        _cache[name] = rig.Loadout(name)
    return _cache[name]


def tween(a, b, t):
    out = {}
    for key, vb in b.items():
        va = a[key]
        if isinstance(vb, tuple) and isinstance(va, tuple) and len(va) == len(vb):
            out[key] = tuple(
                y if isinstance(y, str) else x + (y - x) * t for x, y in zip(va, vb)
            )
        elif isinstance(vb, (int, float)) and not isinstance(vb, bool):
            out[key] = va + (vb - va) * t
        else:
            out[key] = vb
    return out


def smear_layer(lo, before, now, C):
    """The band the weapon head sweeps between two poses, as an effect layer drawn along the arc."""
    heads, necks, depths = [], [], []
    for i in range(17):
        _, info = rig.pose(lo, tween(before, now, 0.12 + 0.88 * i / 16))
        h, n = R.project([info["head_point"], info["neck_point"]], C)
        heads.append(h[:2])
        necks.append(
            h[:2] + (n[:2] - h[:2]) * min(1.0, 0.25 + i / 16)
        )  # the band widens toward the head
        depths.append(h[2])
    layer = Image.new("L", (R.CW, R.CH), 0)
    draw = ImageDraw.Draw(layer)
    mids = [(h + n) / 2 for h, n in zip(heads, necks)]
    for far, near, tone in ((mids, necks, 1), (heads, mids, 2)):
        draw.polygon(
            [tuple(p) for p in far] + [tuple(p) for p in near[::-1]], fill=tone
        )
    centre = R.project([[0, 0, 22]], C)[0, 2]
    return np.array(layer), float(np.mean(depths)) > centre + 2


def frame_image(lname, action, k, d, extra=()):
    """One rendered frame: palette codes plus the measurements the checks read."""
    lo = loadout(lname)
    frames = ACTIONS[action]["build"](lo)
    q, ms, tag = frames[k]
    inst, info = rig.pose(lo, q)
    C = R.camera(d, DIRS)
    for i in inst:
        base, _, side = i.name.rpartition("_")
        if base in LIMB:
            key = ("leg_" if base in LEG else "arm_") + side
            other = key[:4] + ("hi" if side == "lo" else "lo")
            mine_, theirs = R.project([info["joint"][key], info["joint"][other]], C)[
                :, 2
            ]
            if mine_ - theirs > 5:  # the far limb drops down its ramp, so both legs read from the side
                i.dim = 2 if base in ("thigh", "shin") else 1
    inst = inst + list(extra)
    code, ident, _ = R.render(inst, d, rig.DARK, DIRS)
    stats = {"components": components(code > 0)}
    stats["clip"] = bool(
        code[0].any() or code[-1].any() or code[:, 0].any() or code[:, -1].any()
    )
    for s in ("lo", "hi"):
        ids = [
            n
            for n, i in enumerate(inst, 1)
            if i.name in [f"{part}_{s}" for part in LEG]
        ]
        stats[f"leg_{s}_px"] = int(np.isin(ident, ids).sum())
        foot = [n for n, i in enumerate(inst, 1) if i.name == f"foot_{s}"]
        cols = np.nonzero(np.isin(ident, foot))[1]
        stats[f"foot_{s}_col"] = float(cols.mean()) if cols.size else None
    if q["flash"]:
        code = np.where(code > 0, rig.CODE["fx"][2], 0)
    code = R.outline(code, rig.CODE["outline"][0])
    if tag == "smear":
        layer, behind = smear_layer(lo, frames[k - 1][0], q, C)
        where = (layer > 0) & ((code == 0) if behind else True)
        code = np.where(
            where, np.where(layer == 2, rig.CODE["fx"][2], rig.CODE["fx"][1]), code
        )
        stats["clip"] |= bool(layer[0].any() or layer[:, 0].any() or layer[:, -1].any())
    return code, stats, info


def components(mask, min_size=6):
    todo = {tuple(p) for p in np.argwhere(mask)}
    count = 0
    while todo:
        stack, size = [todo.pop()], 1
        while stack:
            j, i = stack.pop()
            for dj in (-1, 0, 1):
                for di in (-1, 0, 1):
                    q = (j + dj, i + di)
                    if q in todo:
                        todo.remove(q)
                        stack.append(q)
                        size += 1
        count += size >= min_size
    return count


