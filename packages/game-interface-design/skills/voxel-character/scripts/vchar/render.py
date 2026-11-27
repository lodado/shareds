"""Tiny skeletal voxel renderer: every part keeps its own voxel grid and is ray cast through its
posed transform, so limbs rotate without resampling the model. Output is palette-indexed pixel art.

Character space: x right, y forward, z up, origin on the ground under the pelvis.
"""

import math

import numpy as np

from spec import SPEC

# art pixels per voxel, across and up: growing the body taller, not wider, keeps a painted head in proportion
ZX, ZY = SPEC.get("body", {}).get("zoom", (1.0, 1.25))
CW, CH = round(128 * ZX), round(116 * ZY)  # art pixels per frame
AX, AY = round(64 * ZX), round(82 * ZY)  # the ground origin inside a frame
SS = 2
SQUASH = 0.24
ELEV = math.asin(SQUASH)
RIGHT = np.array([1.0, 0.0, 0.0])
UP = np.array([0.0, math.sin(ELEV), math.cos(ELEV)])
VIEW = np.array([0.0, math.cos(ELEV), -math.sin(ELEV)])
BACK = 200.0


def rx(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]], float)


def ry(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], float)


def rz(deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]], float)


class Part:
    """vol[z, y, x] of palette codes (0 empty); corner = character position of voxel (0,0,0)."""

    def __init__(self, vol, corner, pivot):
        zs, ys, xs = np.nonzero(vol)
        lo = np.array([xs.min(), ys.min(), zs.min()])
        self.vol = vol[
            zs.min() : zs.max() + 1, ys.min() : ys.max() + 1, xs.min() : xs.max() + 1
        ]
        self.corner = np.asarray(corner, float) + lo
        self.pivot = np.asarray(pivot, float)
        self.size = np.array(self.vol.shape[::-1], float)  # x, y, z


class Inst:
    def __init__(self, name, part, matrix, pos, bias=0.0, dim=0):
        self.name, self.part, self.M, self.pos = (
            name,
            part,
            matrix,
            np.asarray(pos, float),
        )
        self.bias, self.dim = bias, dim

    def point(self, rest):
        """Posed character-space position of a rest-pose point of this part."""
        return self.M @ (np.asarray(rest, float) - self.part.pivot) + self.pos


def camera(direction, dirs=16):
    return rz(360.0 * direction / dirs)


def project(points, C):
    """Character points -> (column, row, depth) in art pixels."""
    q = np.atleast_2d(points) @ C.T
    return np.stack([AX + (q @ RIGHT) * ZX, AY - (q @ UP) * ZY, q @ VIEW + BACK], axis=1)


def render(instances, direction, dark, dirs=16):
    """Return palette codes, instance ids (1-based) and depth, each CH x CW. `dark[n]` maps a code
    to the code n tones down its ramp."""
    C = camera(direction, dirs)
    H, W = CH * SS, CW * SS
    code = np.zeros((H, W), np.int32)
    ident = np.zeros((H, W), np.int32)
    depth = np.full((H, W), np.inf)
    zbuf = np.full((H, W), np.inf)
    for n, inst in enumerate(instances, 1):
        p = inst.part
        inv = np.linalg.inv(inst.M)
        corners = (
            np.array([[i, j, k] for i in (0, 1) for j in (0, 1) for k in (0, 1)])
            * p.size
            + p.corner
        )
        posed = (corners - p.pivot) @ inst.M.T + inst.pos
        screen = project(posed, C)
        i0 = max(0, int(screen[:, 0].min() * SS) - 1)
        i1 = min(W, int(screen[:, 0].max() * SS) + 2)
        j0 = max(0, int(screen[:, 1].min() * SS) - 1)
        j1 = min(H, int(screen[:, 1].max() * SS) + 2)
        if i0 >= i1 or j0 >= j1:
            continue
        jj, ii = np.mgrid[j0:j1, i0:i1]
        jj, ii = jj.ravel(), ii.ravel()
        u = ((ii + 0.5) / SS - AX) / ZX
        v = (AY - (jj + 0.5) / SS) / ZY
        origin = u[:, None] * RIGHT + v[:, None] * UP - BACK * VIEW
        q0 = (
            (origin @ C - inst.pos) @ inv.T + p.pivot - p.corner
        )  # row vectors: C.T applied
        qd = inv @ (C.T @ VIEW)
        qd = np.where(np.abs(qd) < 1e-9, 1e-9, qd)
        t0, t1 = -q0 / qd, (p.size - q0) / qd
        near = np.minimum(t0, t1).max(axis=1)
        far = np.maximum(t0, t1).min(axis=1)
        live = np.nonzero(far > near)[0]
        t = near[live] + 1e-3
        while live.size:
            idx = np.floor(q0[live] + t[:, None] * qd).astype(int)
            ok = ((idx >= 0) & (idx < p.size.astype(int))).all(axis=1)
            c = np.zeros(live.size, np.int32)
            c[ok] = p.vol[idx[ok, 2], idx[ok, 1], idx[ok, 0]]
            hit = c > 0
            if hit.any():
                h = live[hit]
                a, b = jj[h], ii[h]
                key = t[hit] - inst.bias
                win = key < zbuf[a, b]
                a, b = a[win], b[win]
                zbuf[a, b] = key[win]
                depth[a, b] = t[hit][win]
                code[a, b] = dark[inst.dim][c[hit][win]] if inst.dim else c[hit][win]
                ident[a, b] = n
            t = t + 0.34
            keep = ~hit & (t < far[live])
            live, t = live[keep], t[keep]

    def blocks(a):
        return a.reshape(CH, SS, CW, SS).transpose(0, 2, 1, 3).reshape(CH, CW, SS * SS)

    c, i, d = blocks(code), blocks(ident), blocks(depth)
    opaque = c > 0
    key = c * 64 + i
    score = (key[..., :, None] == key[..., None, :]).sum(-1) * opaque
    pick = score.argmax(-1)[..., None]
    body = opaque.sum(-1) >= SS * SS // 2
    c = np.where(body, np.take_along_axis(c, pick, -1)[..., 0], 0)
    i = np.where(body, np.take_along_axis(i, pick, -1)[..., 0], 0)
    d = np.where(body, np.take_along_axis(d, pick, -1)[..., 0], np.inf)

    # a part standing clearly in front of another gets a dark seam, so limbs separate from the torso
    seam = np.zeros_like(body)
    dp, ip = np.pad(d, 1, constant_values=np.inf), np.pad(i, 1)
    for dj, di in ((0, 1), (2, 1), (1, 0), (1, 2)):
        nd, ni = dp[dj : dj + CH, di : di + CW], ip[dj : dj + CH, di : di + CW]
        with np.errstate(invalid="ignore"):
            seam |= body & (ni > 0) & (ni != i) & (d - nd > 3.0)
    c = np.where(seam, dark[2][c], c)
    return c, i, d


def outline(code, outline_code):
    body = code > 0
    pad = np.pad(body, 1)
    ring = ~body & (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:])
    return np.where(ring, outline_code, code)
