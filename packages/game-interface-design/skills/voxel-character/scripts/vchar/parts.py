"""The character as swappable voxel parts. Every part is authored complete in the same 48 x 40 x 46 grid
with the same pivot; the rig (rig.py) re-cuts the body into posable segments and shades each piece once.

Axes: x = left/right, y = back/front (front is +y), z = up. Edit or add part functions here to change
the body shape; colours come from RAMP, which a character spec can override per material.
"""

import numpy as np

from spec import SPEC

W, D, N = 48, 40, 46
CX, CY = (W - 1) / 2, (D - 1) / 2

RAMP = {
    "iron": [
        (22, 24, 34),
        (38, 42, 56),
        (60, 66, 82),
        (88, 96, 112),
        (128, 136, 148),
        (186, 190, 192),
    ],
    "mail": [
        (18, 20, 28),
        (30, 34, 44),
        (46, 50, 62),
        (64, 70, 84),
        (86, 92, 104),
        (112, 118, 128),
    ],
    "bronze": [
        (52, 32, 24),
        (88, 56, 30),
        (128, 88, 40),
        (168, 124, 56),
        (206, 166, 84),
        (236, 210, 136),
    ],
    "leather": [
        (34, 20, 22),
        (56, 30, 28),
        (82, 44, 34),
        (108, 62, 44),
        (136, 84, 58),
        (166, 110, 78),
    ],
    "skin": [
        (96, 56, 48),
        (140, 84, 66),
        (184, 118, 90),
        (214, 150, 114),
        (236, 180, 142),
        (248, 206, 172),
    ],
    "hairbase": [
        (40, 22, 20),
        (70, 38, 26),
        (104, 58, 32),
        (138, 82, 42),
        (170, 110, 58),
        (198, 142, 84),
    ],
    "wood": [
        (38, 26, 24),
        (60, 40, 30),
        (84, 56, 38),
        (110, 76, 50),
        (136, 98, 64),
        (160, 122, 84),
    ],
    "eye": [(16, 14, 22)] * 6,
}
MATERIAL = {
    "sabaton": "iron",
    "greave": "iron",
    "knee": "bronze",
    "skirt": "iron",
    "skirttrim": "bronze",
    "belt": "leather",
    "buckle": "bronze",
    "breast": "iron",
    "chevron": "bronze",
    "gorget": "mail",
    "mailarm": "mail",
    "vambrace": "iron",
    "gauntlet": "iron",
    "pauldron": "iron",
    "pauldrontrim": "bronze",
    "skin": "skin",
    "eye": "eye",
    "helm": "iron",
    "helmband": "bronze",
    "crown": "iron",
    "crest": "bronze",
    "chin": "hairbase",
    "hair": "hairbase",
    "clasp": "bronze",
    "shield": "iron",
    "shieldtrim": "bronze",
    "haft": "wood",
    "hammer": "iron",
    "socket": "bronze",
    "blade": "iron",
}
RAMP.update(
    coat=[(22, 24, 36), (34, 44, 62), (48, 66, 88), (66, 92, 112), (92, 122, 138), (128, 156, 164)],
    hair=[(66, 26, 18), (116, 44, 18), (166, 70, 24), (208, 102, 32), (238, 142, 52), (252, 188, 92)],
    shirt=[(24, 26, 34), (40, 46, 58), (60, 72, 86), (86, 102, 116), (116, 134, 146), (150, 168, 176)],
    trouser=[(22, 18, 22), (36, 28, 30), (52, 40, 38), (70, 54, 48), (90, 72, 60), (112, 92, 76)],
    steel=[(34, 38, 50), (62, 70, 84), (100, 110, 124), (144, 154, 164), (192, 200, 204), (236, 240, 236)],
    white=[(236, 240, 236)] * 6,
    lamp=[(255, 190, 60), (255, 200, 70), (255, 212, 90), (255, 226, 120), (255, 238, 160), (255, 250, 214)],
)
MATERIAL.update(
    breast="coat", chevron="leather", pauldron="coat", pauldrontrim="leather", skirt="coat", skirttrim="leather",
    mailarm="shirt", gorget="shirt", vambrace="leather", gauntlet="leather", sabaton="leather", greave="trouser",
    knee="leather", chin="hair", hair="hair", brow="hair", white="white", helm="steel", helmband="leather", crown="steel", blade="steel", lamp="lamp",
)
for _name, _ramp in SPEC.get("ramps", {}).items():  # a spec recolours a material: six tones, dark to light
    if _name not in RAMP or len(_ramp) != len(RAMP[_name]):
        raise SystemExit(f"ramps.{_name}: expected one of {sorted(RAMP)} with {len(RAMP.get(_name, [0] * 6))} tones")
    RAMP[_name] = [tuple(c) for c in _ramp]
NAMES = list(MATERIAL)
ID = {name: i + 1 for i, name in enumerate(NAMES)}

zz, yy, xx = np.mgrid[0:N, 0:D, 0:W]
mat = np.zeros((N, D, W), np.uint8)  # the part being authored


def box(m, x0, x1, y0, y1, z0, z1, c=0, mirror=False):
    sel = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1) & (zz >= z0) & (zz <= z1)
    if c:
        sel &= np.minimum(xx - x0, x1 - xx) + np.minimum(yy - y0, y1 - yy) >= c
    mat[sel] = ID[m]
    if mirror:
        box(m, W - 1 - x1, W - 1 - x0, y0, y1, z0, z1, c)


def octagon(m, z, a, b, c, cy=CY, where=None):
    dx, dy = np.abs(xx[z] - CX), np.abs(yy[z] - cy)
    inside = (dx <= a) & (dy <= b) & (dx + dy <= a + b - c)
    if where is not None:
        inside &= where
    mat[z][inside] = ID[m]


def ellipse(m, z, a, b, cy=CY, where=None):
    inside = ((xx[z] - CX) / a) ** 2 + ((yy[z] - cy) / b) ** 2 <= 1.0
    if where is not None:
        inside &= where
    mat[z][inside] = ID[m]


def part(fn):
    """Author one part in an empty grid and return its material volume."""
    global mat
    mat = np.zeros((N, D, W), np.uint8)
    fn()
    return mat.copy()


# --- parts ---------------------------------------------------------------------------------------
def body_heavy():
    box("sabaton", 14, 21, 15, 27, 0, 1, mirror=True)
    box("sabaton", 14, 21, 15, 26, 2, 3, c=1, mirror=True)
    box("greave", 15, 21, 16, 24, 4, 9, c=1, mirror=True)
    box("knee", 15, 21, 23, 26, 7, 9, c=1, mirror=True)
    for z in range(10, 19):
        octagon("skirt", z, 11.6 - (z - 10) * 0.12, 10.8 - (z - 10) * 0.08, 4)  # barrel body: as deep as it is wide, or the head dwarfs it in side views
    mat[10][mat[10] == ID["skirt"]] = ID["skirttrim"]
    for z in (19, 20, 21):
        octagon("belt", z, 10.8, 10.2, 4)
    box("buckle", 21, 26, 28, 30, 19, 21)
    for z in range(22, 31):
        a = 9.2 + min(z - 22, 3) * 0.2 if z < 30 else 8.8
        octagon("breast", z, a, 9.8 if z < 26 else 10.2, 4)
    front = (mat == ID["breast"]) & (yy > CY + 3) & (zz < 30)
    chev = (zz + np.round(np.abs(xx - CX) * 0.5)).astype(int)
    mat[front & np.isin(chev, (26, 30))] = ID["chevron"]
    octagon("gorget", 30, 8.4, 9.4, 3)
    box("mailarm", 7, 13, 15, 24, 19, 24, c=2, mirror=True)
    box("vambrace", 6, 13, 14, 25, 14, 18, c=2, mirror=True)
    box("gauntlet", 6, 13, 15, 25, 10, 13, c=2, mirror=True)
    box("pauldron", 6, 14, 12, 27, 24, 26, c=3, mirror=True)
    box("pauldron", 7, 15, 13, 26, 27, 29, c=3, mirror=True)
    box("pauldron", 9, 16, 14, 25, 30, 31, c=3, mirror=True)
    mat[(mat == ID["pauldron"]) & (zz == 24)] = ID["pauldrontrim"]


def head_bare():
    """A whole head, skull top included, so it stands without a helm."""
    for z, a in {**{z: 5.6 for z in range(31, 39)}, 39: 5.0, 40: 3.8}.items():
        ellipse("skin", z, a, a)
    box("skin", 23, 24, 25, 26, 33, 35)  # nose
    for x0 in (20, 26):
        col = (
            (mat[35] == ID["skin"])
            & (xx[35] >= x0)
            & (xx[35] <= x0 + 1)
            & (yy[35] >= CY + 2)
        )
        front_y = np.where(col, yy[35], -1).max(axis=0)
        for x in (x0, x0 + 1):
            mat[35, front_y[x], x] = ID["eye"]
            mat[35, front_y[x] - 1, x] = ID["eye"]


def hair_long():
    for z in range(32, 39):
        ellipse("hair", z, 6.2, 6.2, where=yy[z] <= CY + 1)
    for z, a in {39: 5.6, 40: 4.6, 41: 3.0}.items():
        ellipse("hair", z, a, a)
    box("hair", 23, 24, 11, 13, 24, 33)  # braid down the back
    box("clasp", 23, 24, 11, 13, 25, 26)


def chin_long():
    ellipse("chin", 32, 4.8, 1.8, cy=CY + 5.4)  # moustache
    for z in (32,):
        ellipse("chin", z, 5.9, 3.6, cy=CY + 3.6, where=yy[z] >= CY + 1)  # jaw
    shape = {
        31: (5.0, 3.0),
        30: (6.2, 3.6),
        29: (6.6, 3.8),
        28: (6.6, 3.8),
        27: (6.2, 3.8),
        26: (5.6, 3.6),
        25: (4.8, 3.4),
        24: (4.0, 3.2),
        23: (3.4, 3.0),
        22: (3.0, 2.8),
        21: (2.6, 2.6),
        20: (2.0, 2.4),
        19: (1.5, 2.0),
    }
    for z, (a, b) in shape.items():
        ellipse("chin", z, a, b, cy=CY + 6.6, where=yy[z] >= CY + 3)
    mat[(mat == ID["chin"]) & ((zz == 22) | (zz == 23))] = ID["clasp"]


def helm_crested():
    """Closed helm: a solid block with a face hole, so it hides whatever hair is under it."""
    for z in range(31, 39):
        half = 2.6 if z <= 33 else 4.1
        opening = (
            (yy[z] >= CY + 2) & (np.abs(xx[z] - CX) <= half) & (z >= 32) & (z <= 36)
        )
        octagon("helm", z, 7.6, 7.6, 3, where=~opening)
    for z in (29, 30, 31):
        octagon("helm", z, 7.6, 8.6, 3, where=yy[z] <= CY - 2)
    for z in (37, 38):
        octagon("helmband", z, 8.1, 8.1, 3)
    for z, (a, c) in {
        39: (7.2, 3.5),
        40: (7.0, 3.5),
        41: (5.8, 3),
        42: (5.4, 3),
        43: (3.6, 2),
    }.items():
        octagon("crown", z, a, a, c)
    box("helm", 23, 24, 24, 27, 34, 38)  # nasal bar
    box("crest", 23, 24, 12, 27, 39, 44)
    box("crest", 23, 24, 15, 24, 45, 45)


def helm_open():
    """Open skullcap: band, stepped crown and a nasal bar; the face and hair stay visible."""
    for z in (37, 38):
        octagon("helmband", z, 7.4, 7.4, 3)
    for z, (a, c) in {
        39: (6.8, 3.5),
        40: (6.4, 3.5),
        41: (5.2, 3),
        42: (3.6, 2),
    }.items():
        octagon("crown", z, a, a, c)
    box("helm", 23, 24, 25, 27, 35, 38)
    box("crest", 23, 24, 19, 20, 43, 44)


def shield_octagon():
    sy, sz, sb, sh, sc = 20.0, 13.5, 10.0, 12.5, 6.0
    dy, dz = np.abs(yy - sy), np.abs(zz - sz)
    plate = (xx >= 2) & (xx <= 4) & (dy <= sb) & (dz <= sh) & (dy + dz <= sb + sh - sc)
    mat[plate] = ID["shield"]
    edge = np.minimum(np.minimum(sb - dy, sh - dz), (sb + sh - sc - dy - dz) * 0.75)
    cross = ((dy <= 1) & (dz <= 7)) | ((dz <= 1) & (dy <= 6)) | (dy + dz <= 3)
    mat[plate & ((edge < 2) | cross)] = ID["shieldtrim"]
    box("shieldtrim", 1, 1, 18, 22, 12, 15)
    box(
        "gauntlet", 5, 6, 16, 24, 10, 13
    )  # the hand reaching the grip travels with the shield


def weapon_mattock():
    box("haft", 42, 43, 19, 20, 0, 41)
    box("gauntlet", 40, 44, 17, 22, 10, 13, c=1)  # the fist travels with the weapon
    box("hammer", 42, 43, 19, 20, 42, 44)
    box("socket", 41, 44, 18, 21, 36, 41)
    box("hammer", 45, 47, 17, 22, 35, 42)
    box("hammer", 39, 40, 19, 20, 37, 40)
    box("hammer", 37, 38, 19, 20, 38, 39)


def weapon_axe():
    box("haft", 42, 43, 19, 20, 0, 41)
    box("gauntlet", 40, 44, 17, 22, 10, 13, c=1)
    box("blade", 42, 43, 19, 20, 42, 44)
    for x, (z0, z1) in {44: (35, 39), 45: (34, 40), 46: (33, 41), 47: (34, 40)}.items():
        box("blade", x, x, 19, 20, z0, z1)
        box(
            "blade", 85 - x, 85 - x, 19, 20, z0, z1
        )  # the inner blade mirrors about the haft
    box("socket", 42, 43, 18, 21, 34, 40)


def body_cloth():
    body_heavy()
    front = (mat == ID["chevron"])
    mat[front] = ID["breast"]
    strap = (mat == ID["breast"]) & (yy > CY + 3) & (np.abs((xx - CX) - (zz - 26) * 1.5) <= 1.2)
    mat[strap] = ID["chevron"]
    mat[np.isin(mat, (ID["pauldron"], ID["pauldrontrim"]))] = 0  # cloth shoulders: one rounded cap, no stacked plates
    box("pauldron", 7, 14, 13, 26, 25, 29, c=3, mirror=True)


def head_base():
    """Big readable face: 2x2 eyes with a glint, heavy brows, a round nose."""
    head_bare()
    mat[(mat == ID["eye"])] = ID["skin"]
    for x0, glint in ((19, 20), (27, 27)):
        for x in (x0, x0 + 1):
            front = np.where(mat[35, :, x] > 0)[0].max()
            for z, name in ((34, "eye"), (35, "eye"), (36, "brow"), (37, "brow")):
                mat[z, front : front + (2 if name == "brow" else 1), x] = ID[name]
            if x == glint:
                mat[35, front, x] = ID["white"]
    box("skin", 22, 25, 25, 28, 32, 34, c=1)


def helm_lamp():
    """A work hat that sits high on the head, so the face stays in view; a lamp on the front."""
    octagon("helmband", 38, 6.8, 6.8, 3)
    for z, (a, c) in {39: (6.8, 3.2), 40: (6.6, 3.5), 41: (5.6, 3.2), 42: (4.2, 2.5), 43: (2.4, 1.5)}.items():
        octagon("crown", z, a, a, c)
    box("buckle", 21, 26, 24, 28, 39, 42, c=1)
    box("lamp", 22, 25, 29, 29, 40, 41)


def weapon_pick():
    box("haft", 42, 43, 19, 20, 0, 41)
    box("gauntlet", 40, 44, 17, 22, 10, 13, c=1)
    box("socket", 41, 44, 17, 22, 37, 42)
    for x in range(34, 48):  # the head runs along the striking direction; grid ends at x 47
        t = (x - 42.5) / 8.5 if x < 42.5 else (x - 42.5) / 4.5
        z = int(round(42 - 6 * t * t))
        h = 0 if abs(t) > 0.8 else 1
        box("blade", x, x, 19, 20, z - h, z + h)


PARTS = {
    fn.__name__: part(fn)
    for fn in (
        body_cloth, head_base, helm_lamp, weapon_pick,
        body_heavy,
        head_bare,
        hair_long,
        chin_long,
        helm_crested,
        helm_open,
        shield_octagon,
        weapon_mattock,
        weapon_axe,
    )
}
# slot order: a later slot replaces the voxels it covers
SLOTS = ("body", "head", "hair", "chin", "helm", "shield", "weapon")
LOADOUTS = {}  # name -> part names; the bake registers its own


def compose(names):
    order = sorted(names, key=lambda n: SLOTS.index(n.split("_")[0]))
    out = np.zeros((N, D, W), np.uint8)
    for n in order:
        out[PARTS[n] > 0] = PARTS[n][PARTS[n] > 0]
    return out


# --- shading: one pass over a whole volume -------------------------------------------------------
def shade_volume(m):
    solid = m > 0
    pad = np.pad(solid, 1)
    above, below = pad[2:, 1:-1, 1:-1], pad[:-2, 1:-1, 1:-1]
    nx0, nx1 = pad[1:-1, 1:-1, :-2], pad[1:-1, 1:-1, 2:]
    ny0, ny1 = pad[1:-1, :-2, 1:-1], pad[1:-1, 2:, 1:-1]
    rim = solid & ~(nx0 & nx1 & ny0 & ny1)
    top = solid & ~above
    faces_y = solid & ~(ny0 & ny1)
    faces_x = solid & ~(nx0 & nx1)
    pad_above = np.pad(above, ((0, 0), (1, 1), (1, 1)))
    over = np.zeros_like(solid)
    for sy, sx in ((0, -1), (0, 1), (-1, 0), (1, 0)):
        out_empty = ~pad[1:-1, 1 + sy : D + 1 + sy, 1 + sx : W + 1 + sx]
        over |= (
            solid & out_empty & pad_above[:, 1 + sy : D + 1 + sy, 1 + sx : W + 1 + sx]
        )

    def is_(*names):
        return np.isin(m, [ID[n] for n in names])

    shade = np.full(m.shape, 1.3)
    for name in NAMES:
        p = m == ID[name]
        if p.any():
            zs = zz[p]
            shade[p] += 0.4 + (zz[p] - zs.min()) / max(1, zs.max() - zs.min()) * 0.4  # was 1.2: every limb piece read as a ring
    shade[top] += 1.0
    shade[top & rim] += 0.7
    shade[over] -= 1.6
    shade[solid & ~below & (zz > 0) & rim] -= 0.6
    row = (zz - 11) // 3
    skirt = is_("skirt")
    # a coat, not mail: a dark hem and a front opening instead of rows of rings
    shade[skirt & (zz == zz[skirt].min() if skirt.any() else False)] -= 1.0
    shade[(skirt | is_("breast")) & (yy > CY) & (np.abs(xx - CX + 0.5) < 1)] -= 1.2
    shade[is_("helm") & (zz == 33)] -= 0.8
    shade[is_("crown") & np.isin(zz, (39, 41))] -= 0.7
    shade[is_("chin", "hair")] += 1.6
    shade[is_("chin", "hair") & (xx // 2 % 2 == 0)] -= 1.0
    shade[is_("skin")] += 1.2
    shade[is_("shield")] -= 0.6
    shade[is_("hammer") & (xx >= 47)] += 1.0
    shade[is_("blade") & ((xx >= 47) | (xx <= 38))] += 1.2
    shade[is_("haft") & (zz % 6 == 3)] -= 1.0

    idx = np.clip(np.round(shade), 0, 5).astype(int)
    bronze = np.isin(m, [ID[n] for n in NAMES if MATERIAL[n] == "bronze"])
    idx[bronze] = np.minimum(idx[bronze] + 1, 4)
    vol = np.zeros((N, D, W, 4), np.uint8)
    for name in NAMES:
        p = m == ID[name]
        vol[p, :3] = np.array(RAMP[MATERIAL[name]], np.uint8)[idx[p]]
        vol[p, 3] = 255
    known = rim | top
    for _ in range(max(W, D)):
        todo = solid & ~known
        if not todo.any():
            break
        kp = np.pad(known, ((0, 0), (1, 1), (1, 1)))
        vp = np.pad(vol, ((0, 0), (1, 1), (1, 1), (0, 0)))
        for sy, sx in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            take = todo & kp[:, 1 + sy : D + 1 + sy, 1 + sx : W + 1 + sx]
            vol[take] = vp[:, 1 + sy : D + 1 + sy, 1 + sx : W + 1 + sx][take]
            todo &= ~take
        known = solid & ~todo
    return vol, (rim | top)


