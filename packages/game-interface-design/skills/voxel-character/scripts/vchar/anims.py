"""Every motion as a list of (pose, milliseconds, phase tag). Poses are full parameter sets built
from a base pose, so any frame can be read and tuned on its own."""

import math

WALK_STEP = 2.6  # voxels travelled per walk frame
CARRY = ("hand", -48.0, -4.0, 0.0)  # weapon resting back over the shoulder

BASE = dict(
    pelvis=(0, 0, 0),
    pyaw=0,
    lean=5,
    twist=0,
    roll=0,
    head_pitch=0,
    head_yaw=0,
    chin=0,
    foot_lo=(-6, 1, 0, 0),
    foot_hi=(6, -1, 0, 0),
    hand_lo=(-15, 6, 21),
    hand_hi=(14.5, 8, 21),
    grip=(0, 12, 20),
    weapon=CARRY,
    shield=("arm", 22),
    space="body",
    tool=None,
    item=False,
    flash=False,
    choke=0,  # how far below the default grip the hand holds the haft
)


def P(**changes):
    unknown = set(changes) - set(BASE)
    assert not unknown, unknown
    return {**BASE, **changes}


def idle(_):
    rows = [
        (0.0, 5, 0, 190),
        (-0.2, 4.5, 1, 150),
        (-0.7, 4, 2, 170),
        (-1.0, 4.5, 3, 210),
        (-0.6, 5.5, 1, 150),
        (-0.1, 5.5, 0, 170),
    ]
    return [
        (
            P(
                pelvis=(0, 0, z),
                lean=lean,
                chin=b,
                head_pitch=-z,
                hand_lo=(-15, 6, 21 + z * 0.5),
                hand_hi=(14.5, 8, 21 + z * 0.5),
                weapon=("hand", -52 - z * 2, -4, 0),
            ),
            ms,
            "hold",
        )
        for z, lean, b, ms in rows
    ]


# 12 frames: the foot is planted on frames 0-6 and swings on 7-11; the other leg is 6 frames later
# 12 frames: a foot is planted on frames 0-6 and swings on 7-11; the other leg runs 6 frames later
WALK_Y = [7.8, 5.2, 2.6, 0, -2.6, -5.2, -7.8, -7.6, -2.4, 3.4, 7.6, 9.2]
WALK_LIFT = [0, 0, 0, 0, 0, 0, 0, 2.8, 5.8, 6.4, 4.2, 1.4]
WALK_PITCH = [16, 0, 0, 0, 0, -14, -28, -38, -22, -4, 12, 20]
WALK_BOB = [-0.7, -1.7, -1.1, 0.0, 0.9, 0.4]


def walk(_):
    frames = []
    for k in range(12):
        a, b = k, (k + 6) % 12
        ph = 2 * math.pi * k / 12
        late = 2 * math.pi * (k - 2) / 12  # secondary parts trail the body by two frames
        c = math.cos(ph)
        frames.append((P(
            pelvis=(-1.4 * math.sin(ph), 0, WALK_BOB[k % 6]),
            pyaw=-7 * c, twist=9 * c, roll=-3.0 * math.sin(ph),
            lean=9 + 2 * math.cos(2 * ph - 1.0), head_yaw=-7 * c, head_pitch=-1.5 * math.cos(2 * late),
            chin=7 * math.cos(2 * late) + 3,
            foot_lo=(-6, WALK_Y[a], WALK_LIFT[a], WALK_PITCH[a]),
            foot_hi=(6, WALK_Y[b], WALK_LIFT[b], WALK_PITCH[b]), choke=6,
            hand_lo=(-14.5, 6.5 - 5.0 * c, 23.5 + 1.5 * max(0, -c)),
            hand_hi=(12.5, 7.5 + 2.0 * c, 26.0 + 0.7 * math.cos(2 * late)),
            weapon=("hand", -50 + 5 * math.cos(2 * late), -4, 0),
            shield=("arm", 18 - 8 * c),
        ), 80, "cycle"))
    return frames


def attack(_):
    w = dict(space="world")
    front, back = (-7, 7, 0, 0), (7, -5, 0, 0)
    return [
        (P(**w, hand_hi=(14.5, 8, 21)), 80, "hold"),
        (
            P(
                **w,
                pelvis=(0, -1, -1.5),
                lean=-2,
                twist=-16,
                foot_lo=(-7, 4, 2, 8),
                foot_hi=back,
                hand_hi=(17, 1, 29),
                weapon=("hand", -60, -12, 0),
                hand_lo=(-13, 11, 23),
                shield=("arm", 50),
                chin=-4,
            ),
            100,
            "anticipation",
        ),
        (
            P(
                **w,
                pelvis=(0.5, -2.5, -0.5),
                lean=-15,
                twist=-30,
                head_yaw=18,
                head_pitch=-6,
                foot_lo=front,
                foot_hi=back,
                hand_hi=(14, -4, 40),
                weapon=("hand", -78, -10, 0),
                hand_lo=(-9, 15, 26),
                shield=("arm", 65),
                chin=-9,
            ),
            170,
            "anticipation",
        ),
        (
            P(
                **w,
                pelvis=(0, 1.5, -1.5),
                lean=9,
                twist=-2,
                foot_lo=front,
                foot_hi=back,
                hand_hi=(12, 11, 37),
                weapon=("hand", 22, -4, 0),
                hand_lo=(-15, 9, 24),
                shield=("arm", 30),
                chin=6,
            ),
            40,
            "smear",
        ),
        (
            P(
                **w,
                pelvis=(-0.5, 5, -4.5),
                lean=29,
                twist=20,
                head_yaw=-14,
                head_pitch=9,
                foot_lo=(-7, 10, 0, 0),
                foot_hi=(7, -5, 0, -20),
                hand_hi=(8, 19, 16),
                weapon=("hand", 116, 3, 0),
                hand_lo=(-19, -1, 20),
                shield=("arm", -8),
                chin=22,
            ),
            100,
            "impact",
        ),
        (
            P(
                **w,
                pelvis=(-0.5, 5, -5.5),
                lean=33,
                twist=23,
                head_yaw=-15,
                head_pitch=12,
                foot_lo=(-7, 10, 0, 0),
                foot_hi=(7, -5, 0, -22),
                hand_hi=(7, 19, 14),
                weapon=("hand", 120, 4, 0),
                hand_lo=(-19, -3, 18),
                shield=("arm", -12),
                chin=15,
            ),
            90,
            "follow-through",
        ),
        (
            P(
                **w,
                pelvis=(0, 3.5, -3.5),
                lean=21,
                twist=10,
                head_yaw=-6,
                foot_lo=(-7, 10, 0, 0),
                foot_hi=(7, -5, 0, -8),
                hand_hi=(11, 17, 18),
                weapon=("hand", 82, 0, 0),
                hand_lo=(-17, 3, 20),
                shield=("arm", 5),
                chin=6,
            ),
            120,
            "recovery",
        ),
        (
            P(
                **w,
                pelvis=(0, 1.5, -1.5),
                lean=10,
                twist=2,
                foot_lo=(-6.5, 5, 2.5, 6),
                foot_hi=(6.5, -3, 0, 0),
                hand_hi=(15, 12, 21),
                weapon=("hand", 12, -3, 0),
                hand_lo=(-15.5, 6, 21),
                chin=-3,
            ),
            110,
            "recovery",
        ),
        (P(**w, hand_hi=(14.5, 8, 21), weapon=("hand", -34, -4, 0)), 90, "hold"),
    ]


def block(lo):
    brace = dict(foot_lo=(-8, 8, 0, 0), foot_hi=(8, -8, 0, 0))
    rows = [  # pelvis y, pelvis z, lean, guard y, guard z, shake, ms, tag
        (0, -1.0, 7, 12, 23, 0, 70, "anticipation"),
        (-1, -4.5, 15, 16, 28, 0, 150, "key"),
        (-5.0, -5.5, 0, 11, 29, 7, 60, "impact"),
        (-4.0, -5.0, 7, 13, 28.5, -4, 90, "follow-through"),
        (-2, -4.5, 15, 15.5, 28, 0, 170, "hold"),
        (0, -1.5, 8, 12, 23, 0, 110, "recovery"),
    ]
    out = []
    for i, (py, pz, lean, gy, gz, shake, ms, tag) in enumerate(rows):
        feet = brace if 0 < i < 5 else {}
        common = dict(pelvis=(0, py, pz), lean=lean, chin=shake * 2.0, head_pitch=10 - shake * 1.5, **feet)
        if lo.shield:
            q = P(**common, twist=14, head_yaw=-9, hand_lo=(-2, gy, gz - 4), shield=("arm", 90 + shake),
                  hand_hi=(18, -3, 19), weapon=("hand", -32 - shake, -28, 0))
        else:  # no shield: catch the blow on the haft held up across the body
            q = P(**common, grip=(0, gy, gz), weapon=("two", 58 + shake * 1.5, -90, 0))
        out.append((q, ms, tag))
    return out


def hurt(_):
    return [
        (
            P(pelvis=(0, -1.5, 0), lean=-9, head_pitch=-16, chin=-12, flash=True),
            60,
            "impact",
        ),
        (
            P(
                pelvis=(0.5, -5, -2.5),
                lean=-21,
                twist=14,
                head_pitch=-22,
                head_yaw=10,
                chin=-20,
                foot_hi=(7, -9, 0, 0),
                foot_lo=(-6, 2, 3, 14),
                hand_lo=(-20, 3, 27),
                hand_hi=(19, -2, 26),
                weapon=("hand", -78, -20, 0),
                shield=("arm", -5),
            ),
            100,
            "follow-through",
        ),
        (
            P(
                pelvis=(0, -4, -4.5),
                lean=12,
                twist=6,
                head_pitch=10,
                chin=14,
                foot_hi=(7, -9, 0, 0),
                foot_lo=(-7, 1, 0, 0),
                hand_lo=(-18, 8, 17),
                hand_hi=(17, 9, 17),
                weapon=("hand", -30, -12, 0),
            ),
            130,
            "recovery",
        ),
        (
            P(
                pelvis=(0, -2, -2),
                lean=9,
                head_pitch=3,
                chin=5,
                foot_hi=(6.5, -5, 2, 0),
            ),
            110,
            "recovery",
        ),
        (P(), 100, "hold"),
    ]


def mine(_):
    w = dict(
        space="world",
        tool="weapon_mattock",
        shield=("back",),
        foot_lo=(-7, 7, 0, 0),
        foot_hi=(7, -5, 0, 0),
    )

    def s(pz, py, lean, twist, grip, pitch, az, chin, head=0):
        return P(
            **w,
            pelvis=(0, py, pz),
            lean=lean,
            twist=twist,
            head_yaw=-twist * 0.6,
            head_pitch=head,
            grip=grip,
            weapon=("two", pitch, az, 180),
            chin=chin,
        )

    return [
        (s(-2.5, 0, 13, 0, (1, 14, 19), 62, -6, 3, 6), 110, "hold"),
        (s(-1.5, -1, 1, -14, (5, 9, 28), 4, -10, -5), 100, "anticipation"),
        (s(0.0, -2, -12, -24, (6, 2, 34), -62, -10, -10, -8), 190, "anticipation"),
        (s(-2.0, 0, 12, -4, (3, 12, 31), 42, -4, 6), 40, "smear"),
        (s(-5.0, 2.5, 31, 9, (0, 16, 15), 108, 2, 20, 8), 90, "impact"),
        (s(-4.0, 2, 24, 5, (1, 15, 18), 90, 0, 6, 4), 90, "follow-through"),
        (s(-3.5, 1, 20, 2, (1, 15, 19), 82, -3, 2, 6), 130, "recovery"),
        (s(-2.8, 0.5, 15, 0, (1, 14, 19), 70, -5, 3, 6), 100, "recovery"),
    ]


def chop(_):
    w = dict(
        space="world",
        tool="weapon_axe",
        shield=("back",),
        foot_lo=(-7, 8, 0, 0),
        foot_hi=(8, -5, 0, 0),
    )

    def s(pz, px, twist, grip, pitch, az, chin, lean=10):
        return P(
            **w,
            pelvis=(px, 0, pz),
            lean=lean,
            twist=twist,
            head_yaw=-twist * 0.75,
            grip=grip,
            weapon=("two", pitch, az, 48),
            chin=chin,
        )

    return [
        (s(-2.5, 0, -10, (3, 15, 23), 52, -12, 2), 100, "hold"),
        (s(-2.5, 1.5, -27, (8, 8, 23), 74, -75, -4, 6), 110, "anticipation"),
        (s(-2.0, 2.5, -40, (9, 3, 25), 70, -118, -9, 2), 200, "anticipation"),
        (s(-3.0, 0.5, -8, (7, 13, 22), 84, -55, 8), 40, "smear"),
        (s(-4.0, -1.5, 22, (-1, 15, 19), 92, 8, 16, 17), 100, "impact"),
        (s(-4.0, -1.5, 24, (-1, 15, 19), 92, 11, 9, 18), 140, "follow-through"),
        (s(-3.0, -0.5, 8, (2, 15, 21), 74, -6, -2, 13), 100, "recovery"),
        (s(-2.5, 0, -6, (3, 15, 23), 60, -14, 0), 110, "recovery"),
    ]


def gather(_):
    w = dict(space="world", weapon=("back",), shield=("back",))
    kneel = dict(foot_lo=(-7, 8, 0, 0), foot_hi=(7, -9, 0, -48))

    def s(pz, py, lean, lo, hi, chin, head=0, item=False, **extra):
        return P(**w, pelvis=(0, py, pz), lean=lean, hand_lo=lo, hand_hi=hi, chin=chin, head_pitch=head,
                 item=item, **extra)

    return [
        (s(0, 0, 6, (-15, 6, 17), (15, 6, 17), 0), 100, "hold"),
        (s(-3.5, 1, 24, (-11, 14, 14), (12, 16, 15), -6, -4, **kneel), 100, "anticipation"),
        (s(-7.5, 2.5, 40, (-8, 20, 6), (9, 23, 7), -14, -12, **kneel), 130, "travel"),
        (s(-9.0, 3.5, 50, (-6, 21, 2), (7, 23.5, 1), -24, -18, **kneel), 190, "impact"),
        (s(-7.5, 2.5, 36, (-8, 19, 5), (9, 22, 11), -8, -6, True, **kneel), 100, "follow-through"),
        (s(-5.0, 1, 15, (-12, 11, 15), (8, 18, 27), 2, 10, True, **kneel), 220, "hold"),
        (s(-2.5, 0, 9, (-14, 7, 17), (12, 11, 18), 4, 6, True), 130, "recovery"),
        (s(0, 0, 5, (-15, 6, 17), (15, 6, 17), 1), 110, "recovery"),
    ]


ACTIONS = {
    "idle": dict(build=idle, loop=True),
    "walk": dict(build=walk, loop=True),
    "attack": dict(build=attack, loop=False, hitstopMs=100, shakePx=2),
    "block": dict(build=block, loop=False, hitstopMs=70, shakePx=1),
    "hurt": dict(build=hurt, loop=False),
    "mine": dict(build=mine, loop=True, hitstopMs=80, shakePx=1),
    "chop": dict(build=chop, loop=True, hitstopMs=80, shakePx=1),
    "gather": dict(build=gather, loop=False),
}
