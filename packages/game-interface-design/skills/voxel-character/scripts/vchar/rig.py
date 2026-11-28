"""The character as a jointed rig. Parts come from parts.py; legs and arms are re-cut into segments
that two-bone IK can pose."""

import math

import numpy as np

import parts as mp
from render import Inst, Part, rx, ry, rz
from spec import SPEC

N = 54
mp.N = N
mp.zz, mp.yy, mp.xx = np.mgrid[0:N, 0 : mp.D, 0 : mp.W]
zz, yy, xx = mp.zz, mp.yy, mp.xx
CORNER = (-24.0, -20.0, 0.0)

# --- palette: every ramp tone is one code, plus effect and prop colours ----------------------------
EXTRA = {
    "outline": [(20, 20, 26)],
    "fx": [(176, 166, 150), (226, 216, 190), (255, 250, 232)],
    "rock": [
        (46, 42, 50),
        (72, 66, 72),
        (102, 94, 94),
        (136, 126, 116),
        (170, 160, 142),
    ],
    "leaf": [(28, 50, 36), (44, 82, 44), (70, 118, 52), (112, 156, 64), (170, 196, 92)],
    "bloom": [(122, 40, 62), (180, 58, 82), (226, 98, 104), (248, 160, 140)],
}
RAMPS = {**mp.RAMP, **EXTRA}
PAL = [(0, 0, 0)]
CODE = {}
for _name, _ramp in RAMPS.items():
    CODE[_name] = []
    for _rgb in _ramp:
        CODE[_name].append(len(PAL))
        PAL.append(_rgb)
PAL = np.array(PAL, np.uint8)
DARK = {n: np.arange(len(PAL)) for n in (1, 2, -1)}  # -1 is one tone up, for lit faces
for _name, _codes in CODE.items():
    if _name == "lamp":  # a light source keeps its tones: no shade, no far-side dimming
        continue
    for _t, _c in enumerate(_codes):
        for _n in (1, 2, -1):
            DARK[_n][_c] = _codes[min(len(_codes) - 1, max(0, _t - _n))]
_BY_RGB = {}
for _name, _ramp in mp.RAMP.items():
    for _t, _rgb in enumerate(_ramp):
        _BY_RGB.setdefault(_rgb, CODE[_name][_t])


def painted(m):
    """Shade a material grid in its rest pose and turn the colours into palette codes."""
    rgb = mp.shade_volume(m)[0]
    out = np.zeros(m.shape, np.int32)
    for colour, code in _BY_RGB.items():
        out[(rgb[..., 3] > 0) & (rgb[..., :3] == colour).all(-1)] = code
    assert ((out > 0) == (m > 0)).all()
    return out


def part(m, pivot):
    return Part(painted(m), CORNER, pivot)


def tall(name):
    return np.pad(mp.PARTS[name], ((0, N - mp.PARTS[name].shape[0]), (0, 0), (0, 0)))


def pick(m, names, side=None):
    keep = np.isin(m, [mp.ID[n] for n in names])
    if side:
        keep &= (xx < 24) if side == "lo" else (xx >= 24)
    return np.where(keep, m, 0).astype(np.uint8)


def boxes(*specs, mirror=False):
    mp.mat = np.zeros((N, mp.D, mp.W), np.uint8)
    for material, x0, x1, y0, y1, z0, z1, c in specs:
        mp.box(material, x0, x1, y0, y1, z0, z1, c=c)
    return mp.mat[:, :, ::-1].copy() if mirror else mp.mat.copy()


# --- joints (rest pose) ---------------------------------------------------------------------------
PELVIS = np.array([0.0, 0.0, 16.0])
WAIST = np.array([0.0, 0.0, 19.0])
NECK = np.array([0.0, 0.0, 31.0])
CHIN = np.array([0.0, 5.0, 33.0])
NECK_LEN = float(SPEC.get("head", {}).get("neck", 0.0))  # voxels of visible neck between collar and head
if not 0 <= NECK_LEN <= N - NECK[2] - 4:
    raise SystemExit(f"head.neck: 0 to {int(N - NECK[2] - 4)} voxels, got {NECK_LEN}")
SIDE = {"lo": -1.0, "hi": 1.0}
LEG_X, ARM_X = 5.5, 11.5
LIFT = 3.0  # the animated rig stands on longer legs than the standing model
THIGH, SHIN = 8.8, 8.2
UPPER, FORE = 8.0, 8.5
SHOULDER_REST = 4.0  # depth a haft resting on the shoulder is drawn above what it rests on
HEEL, TOE = np.array([0.0, -5.0, -3.0]), np.array([0.0, 8.0, -3.0])
WEAPON_PIVOT = np.array([19.0, 0.0, 12.0])
WEAPON_HEAD = np.array([19.0, 0.0, 39.0])
WEAPON_NECK = np.array([19.0, 0.0, 29.0])
SHIELD_PIVOT = np.array([-20.5, 0.0, 14.0])

BODY = tall("body_cloth")
for _z in (10, 11, 12, 13):  # the hem sits higher than the standing model so the stride reads
    BODY[_z][np.isin(BODY[_z], [mp.ID["skirt"], mp.ID["skirttrim"]])] = 0

SHARED = {
    "belt": part(pick(BODY, ("belt", "buckle")), PELVIS),
    "chest": part(pick(BODY, ("breast", "chevron", "gorget")), WAIST),
}
for _s, _sx in SIDE.items():
    _m = _s == "hi"
    SHARED[f"skirt_{_s}"] = part(
        pick(BODY, ("skirt", "skirttrim"), _s), (_sx * 6, 0, 19)
    )
    SHARED[f"pauldron_{_s}"] = part(
        pick(BODY, ("pauldron", "pauldrontrim"), _s), (_sx * ARM_X, 0, 28)
    )
    SHARED[f"thigh_{_s}"] = part(
        boxes(("greave", 15, 21, 16, 24, 8, 16, 1), mirror=_m), (_sx * LEG_X, 0, 16)
    )
    SHARED[f"shin_{_s}"] = part(
        boxes(("greave", 15, 21, 17, 23, 6, 9, 1), ("sabaton", 15, 21, 16, 24, 3, 6, 1), mirror=_m),  # trouser into a boot shaft
        (_sx * LEG_X, 0, 9),
    )
    SHARED[f"foot_{_s}"] = part(
        boxes(("pauldrontrim", 14, 21, 15, 27, 0, 0, 0), ("sabaton", 14, 21, 15, 27, 1, 2, 1), ("sabaton", 14, 21, 15, 25, 3, 4, 1), mirror=_m),  # sole, toe, instep
        (_sx * LEG_X, 0, 3),
    )
    # arms are slimmer than the standing model so they do not cover the legs in side views
    # one coat sleeve from shoulder to a leather cuff, then a smaller glove: no bulge at the forearm
    SHARED[f"upper_{_s}"] = part(boxes(("pauldron", 9, 14, 17, 23, 19, 27, 2), mirror=_m), (_sx * ARM_X, 0, 27))
    SHARED[f"fore_{_s}"] = part(boxes(("pauldron", 10, 14, 17, 23, 16, 21, 1), ("vambrace", 9, 14, 17, 22, 14, 15, 1), mirror=_m), (_sx * ARM_X, 0, 20))
    SHARED[f"hand_{_s}"] = part(boxes(("gauntlet", 10, 14, 18, 22, 10, 14, 1), mirror=_m), (_sx * ARM_X, 0, 12.5))


def _weapon(name):
    m = tall(name)
    m[m == mp.ID["gauntlet"]] = 0
    m[10:14, 19:21, 42:44] = mp.ID["haft"]
    return part(m, WEAPON_PIVOT)


SHARED["weapon_mattock"] = _weapon("weapon_mattock")
SHARED["weapon_axe"] = _weapon("weapon_axe")
def _pick():
    """The animated pick is wider than the shared part grid: a long crescent in the swing plane (local x)."""
    vol = np.zeros((48, 2, 28), np.int32)  # z, y, x; x 14 is the haft
    vol[0:42, :, 14:16] = CODE["wood"][3]
    vol[0:42, :, 14] = CODE["wood"][2]
    for x in range(1, 28):
        t = abs(x - 14.5) / 13.5
        top = int(round(45 - 8 * t * t))
        thick = 4 if t < 0.35 else 3 if t < 0.65 else 2 if t < 0.88 else 1
        vol[top - thick + 1 : top + 1, :, x] = CODE["steel"][2]
        vol[top, :, x] = CODE["steel"][4]
    vol[38:44, :, 13:17] = CODE["bronze"][2]
    return Part(vol, (19.0 - 15.0, -1.0, 0.0), WEAPON_PIVOT)


SHARED["weapon_pick"] = _pick()


def _lantern():
    vol = np.zeros((9, 5, 5), np.int32)
    vol[0, :, :] = CODE["bronze"][2]
    vol[1:6, 1:4, 1:4] = CODE["lamp"][3]
    for y in (0, 4):
        for x in (0, 4):
            vol[1:6, y, x] = CODE["bronze"][1]
    vol[6, :, :] = CODE["bronze"][3]
    vol[7:9, 2, 2] = CODE["bronze"][2]
    return Part(vol, (-2.5, -2.5, -8.0), (0, 0, 0))


SHARED["lantern"] = _lantern()
_shield = tall("shield_octagon")
_shield[_shield == mp.ID["gauntlet"]] = 0
SHARED["shield"] = part(_shield, SHIELD_PIVOT)


def _item():
    vol = np.zeros((9, 7, 7), np.int32)
    vol[0:5, 3:5, 3:5] = CODE["leaf"][2]
    vol[2:4, 1:6, 3:5] = CODE["leaf"][3]
    vol[3:5, 3:5, 0:7] = CODE["leaf"][3]
    vol[5:8, 2:6, 2:6] = CODE["bloom"][2]
    vol[8, 3:5, 3:5] = CODE["bloom"][3]
    return Part(vol, (-3.5, -3.5, -2.0), (0, 0, 0))


SHARED["item"] = _item()
# the neck runs from inside the collar up into the head, where the painted head covers its top;
# it is as thick as the jaw and sits half a voxel forward of the axis, under the chin
SHARED["neck"] = part(boxes(("skin", 21, 26, 17, 23, 28, int(NECK[2] + NECK_LEN + 3), 1)), NECK)


class Loadout:
    def __init__(self, name):
        names = mp.LOADOUTS[name]
        head = np.zeros((N, mp.D, mp.W), np.uint8)
        for slot in ("head", "hair", "helm"):
            for n in names:
                if n.split("_")[0] == slot:
                    head[tall(n) > 0] = tall(n)[tall(n) > 0]
        self.name = name
        self.head = part(head, NECK)
        self.chin = part(tall("chin_long"), CHIN)
        self.weapon = next(n for n in names if n.startswith("weapon"))
        self.shield = "shield_octagon" in names


# --- posing ---------------------------------------------------------------------------------------
def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def ik(root, target, upper, lower, pole):
    """Two bones from root to target. Returns the middle joint and the stretch factor (>= 1)."""
    delta = target - root
    dist = max(np.linalg.norm(delta), 1e-3)
    axis = delta / dist
    stretch = max(1.0, dist / (upper + lower))
    if dist >= upper + lower - 1e-6:
        return root + delta * upper / (upper + lower), stretch
    dist = max(dist, abs(upper - lower) + 0.5)
    along = (upper**2 - lower**2 + dist**2) / (2 * dist)
    off = math.sqrt(max(upper**2 - along**2, 0))
    side = np.asarray(pole, float) - np.dot(pole, axis) * axis
    return root + axis * along + unit(side) * off, stretch


def frame(down, forward):
    z = -unit(down)
    y = np.asarray(forward, float) - np.dot(forward, z) * z
    if np.linalg.norm(y) < 1e-3:
        y = np.array([0.0, 0.0, 1.0]) - z[2] * z
    y = unit(y)
    return np.column_stack([np.cross(y, z), y, z])


def segment(rest_a, rest_b, a, b, forward):
    """Matrix that lays the rest segment rest_a->rest_b onto a->b, stretching along its length."""
    rest, posed = rest_b - rest_a, b - a
    s = np.linalg.norm(posed) / np.linalg.norm(rest)
    return frame(posed, forward) @ np.diag([1, 1, s]) @ frame(rest, (0, 1, 0)).T


def weapon_axes(pitch, az, roll):
    """Haft direction and striking face. pitch 0 = up, 90 = forward, 180 = down; az turns it."""
    p = math.radians(pitch)
    d = rz(az) @ np.array([0, math.sin(p), math.cos(p)])
    f = rz(az) @ np.array([0, math.cos(p), -math.sin(p)])
    r = math.radians(roll)
    f = f * math.cos(r) + np.cross(d, f) * math.sin(r)
    return d, f


def basis_zx(z, x):
    z = unit(z)
    x = unit(np.asarray(x, float) - np.dot(x, z) * z)
    return np.column_stack([x, np.cross(z, x), z])


def pose(lo, q):
    """Build the instances of one frame from pose parameters; also return measurements for checks."""
    inst, info = [], {"stretch": {}, "sole": {}, "joint": {}, "elbow": {}}
    Mp = rz(q["pyaw"])
    pelvis = PELVIS + np.asarray(q["pelvis"], float) + (0, 0, LIFT)
    waist = pelvis + Mp @ (WAIST - PELVIS)
    Mc = rz(q["twist"]) @ rx(-q["lean"]) @ ry(q["roll"])

    def chest_point(p):
        return Mc @ (np.asarray(p, float) - WAIST) + waist

    def add(name, key, matrix, pos, bias=0.0):
        part_ = key if isinstance(key, Part) else SHARED[key]
        inst.append(Inst(name, part_, matrix, pos, bias))
        return inst[-1]

    add("belt", "belt", Mp, pelvis, 0.15)
    add("lantern", "lantern", Mp, Mp @ np.array([7.5, 13.0, 5.0]) + pelvis, 0.3)
    add("chest", "chest", Mc, waist, 0.1)
    for s, sx in SIDE.items():
        hip = Mp @ np.array([sx * LEG_X, 0, 0]) + pelvis
        fx, fy, lift, pitch = q[f"foot_{s}"]
        flat = np.array([fx, fy, 3.0 + lift])
        contact = (
            HEEL if pitch > 0 else TOE
        )  # roll over the heel on landing, over the toe on leaving
        ankle = flat + contact - rx(pitch) @ contact
        knee, st = ik(hip, ankle, THIGH, SHIN, (sx * 0.15, 1, 0))
        info["stretch"][f"leg_{s}"] = st
        rest_hip = np.array([sx * LEG_X, 0, 16.0])
        rest_knee = np.array([sx * LEG_X, 0, 9.0])
        rest_ankle = np.array([sx * LEG_X, 0, 3.0])
        add(
            f"thigh_{s}",
            f"thigh_{s}",
            segment(rest_hip, rest_knee, hip, knee, (0, 1, 0)),
            hip,
        )
        add(
            f"shin_{s}",
            f"shin_{s}",
            segment(rest_knee, rest_ankle, knee, ankle, (0, 1, 0)),
            knee,
            0.05,
        )
        foot = add(f"foot_{s}", f"foot_{s}", rx(pitch), ankle, 0.1)
        info["sole"][s] = {
            "heel": foot.point(rest_ankle + HEEL),
            "toe": foot.point(rest_ankle + TOE),
        }
        info["joint"][f"leg_{s}"] = hip
        swing = math.degrees(math.atan2(knee[1] - hip[1], hip[2] - knee[2]))
        add(
            f"skirt_{s}",
            f"skirt_{s}",
            Mp @ rx(np.clip(swing * 0.45, -22, 32)),
            Mp @ np.array([sx * 6, 0, 3.0]) + pelvis,
            0.2,
        )

    weapon_name = lo.weapon if q["tool"] in (None, "weapon_mattock") else q["tool"]
    mode = q["weapon"][0]
    hands = {}
    to_char = chest_point if q["space"] == "body" else (lambda p: np.asarray(p, float) + (0, 0, LIFT))
    if mode == "two":
        _, pitch, az, roll = q["weapon"]
        d, face = weapon_axes(pitch, az, roll)
        centre = to_char(q["grip"])
        hands = {"hi": centre + d * 3.0, "lo": centre - d * 4.5}
    else:
        hands = {s: to_char(q[f"hand_{s}"]) for s in SIDE}
        if mode == "hand":
            _, pitch, az, roll = q["weapon"]
            d, face = weapon_axes(pitch, az, roll)
            if q["space"] == "body":
                d, face = Mc @ d, Mc @ face
    for s, sx in SIDE.items():
        shoulder = chest_point((sx * ARM_X, 0, 27))
        hand = hands[s]
        pole = q[f"elbow_{s}"]
        pole = Mc @ np.asarray([sx * 0.9, -0.8, -0.4] if pole is None else pole, float)
        assert np.linalg.norm(pole) > 1e-6, f"elbow_{s} must point somewhere"
        elbow, st = ik(shoulder, hand, UPPER, FORE, pole)
        info["stretch"][f"arm_{s}"] = st
        info["joint"][f"arm_{s}"] = shoulder
        info["elbow"][s] = Mc.T @ (elbow - shoulder)
        rs = np.array([sx * ARM_X, 0, 27.0])
        re = np.array([sx * ARM_X, 0, 20.0])
        rh = np.array([sx * ARM_X, 0, 12.5])
        add(
            f"upper_{s}",
            f"upper_{s}",
            segment(rs, re, shoulder, elbow, (0, 1, 0)),
            shoulder,
        )
        fore = segment(re, rh, elbow, hand, (0, 1, 0))
        add(f"fore_{s}", f"fore_{s}", fore, elbow, 0.05)
        add(f"hand_{s}", f"hand_{s}", frame(hand - elbow, (0, 1, 0)), hand, 0.3)
        local = Mc.T @ (elbow - shoulder)
        raise_ = math.degrees(math.atan2(local[1], -local[2] + 1e-6))
        add(
            f"pauldron_{s}",
            f"pauldron_{s}",
            Mc @ rx(np.clip(raise_ * 0.3, -30, 30)) @ np.diag([0.85, 0.85, 0.85]),
            chest_point((sx * ARM_X, 0, 28)),
            0.25,
        )

    if mode in ("hand", "two"):
        # resting on the shoulder, the haft lies on the shoulder plate instead of sinking into it
        rest = SHOULDER_REST if mode == "hand" and q["rest"] else 0.05
        w = add("weapon", weapon_name, basis_zx(d, face), hands["hi"] + d * (q["choke"] if mode == "hand" else 0), rest)
        if rest > 1:  # the gripping hand still closes over the haft
            next(i for i in inst if i.name == "hand_hi").bias += rest
    else:  # slung on the back, haft diagonal
        centre = chest_point((-3, -16 if lo.shield else -13.5, 22))
        w = add(
            "weapon",
            weapon_name,
            basis_zx(Mc @ np.array([0.5, 0, 0.87]), Mc @ np.array([0.87, 0, -0.5])),
            centre,
        )
    info["head_point"] = w.point(WEAPON_HEAD)
    info["neck_point"] = w.point(WEAPON_NECK)
    info["hands"] = hands

    if lo.shield:
        if q["shield"][0] == "arm":
            yaw = math.radians(q["shield"][1])
            n = np.array([-math.cos(yaw), math.sin(yaw), 0.0])
            up = np.array([0.0, 0.0, 1.0])
            if q["space"] == "body":
                n, up = Mc @ n, Mc @ up
            centre = hands["lo"] + n * 3.5 + up * 1.5
        else:
            n, up = Mc @ np.array([0.0, -1.0, 0.1]), Mc @ np.array([0.0, 0.0, 1.0])
            centre = chest_point((0, -13.5, 25))
        m = basis_zx(up, -n) @ np.diag([1.0, 0.68, 0.68])
        add("shield", "shield", m, centre, 0.1)

    Mh = Mc @ rz(q["head_yaw"]) @ rx(-q["head_pitch"])
    neck = chest_point(NECK)
    if NECK_LEN:
        add("neck", "neck", Mh, neck, 0.3)
        neck = neck + Mh @ np.array([0.0, 0.0, NECK_LEN])
    add("head", lo.head, Mh, neck, 0.35)
    add("chin", lo.chin, Mh @ rx(q["chin"]), neck + Mh @ (CHIN - NECK), 0.5)
    if q["item"]:
        add("item", "item", np.eye(3), hands["hi"] + np.array([0, 2.0, 2.0]), 0.6)
    return inst, info
