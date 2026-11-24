"""Bake rotation sprites from a sprite-stacking slice strip without slice terraces.

The strip (ground slice on the left) is read as a voxel volume, smoothed into an iso-surface and
ray-marched from an orthographic camera at the stack's pitch, one frame per direction. Colours come
from the voxel the ray hits, optionally relit by a sun fixed in the world, then averaged over the
supersample and snapped back onto the strip's own colours so the sprite stays crisp pixel art.

  uv run --with pillow --with numpy python bake_sprites.py strip.png --slices 37 --dirs 32 \
      --out sheet.png [--relight] [--squash 0.75] [--supersample 2] [--cols 8]

Frame k shows the object turned by k * 360 / dirs degrees; its slice +y (front, the strip's down)
points away from the camera at k = 0. Writes sheet.png and sheet.json (frame size, order).
"""

import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image


def load_volume(path: Path, slices: int) -> np.ndarray:
    strip = np.array(Image.open(path).convert("RGBA"))
    if strip.shape[1] % slices:
        raise SystemExit(
            f"strip width {strip.shape[1]} is not a multiple of --slices {slices}"
        )
    return np.stack(np.split(strip, slices, axis=1))  # [z, y, x, rgba]


def blur(a: np.ndarray, passes: int = 2) -> np.ndarray:
    for _ in range(passes):
        for axis in range(3):
            a = (np.roll(a, 1, axis) + a + np.roll(a, -1, axis)) / 3
    return a


def tri(f, z, y, x):
    Z, Y, X = f.shape
    z0 = np.clip(np.floor(z).astype(int), 0, Z - 2)
    y0 = np.clip(np.floor(y).astype(int), 0, Y - 2)
    x0 = np.clip(np.floor(x).astype(int), 0, X - 2)
    fz, fy, fx = z - z0, y - y0, x - x0
    out = 0.0
    for dz in (0, 1):
        for dy in (0, 1):
            for dx in (0, 1):
                w = (
                    (fz if dz else 1 - fz)
                    * (fy if dy else 1 - fy)
                    * (fx if dx else 1 - fx)
                )
                out = out + w * f[z0 + dz, y0 + dy, x0 + dx]
    return out


def bake(vol: np.ndarray, dirs: int, squash: float, ss: int, relight: bool):
    P = 2
    rgba = np.pad(vol, ((P, P), (P, P), (P, P), (0, 0)))
    solid = rgba[..., 3] > 0
    sm = blur(solid.astype(np.float32))
    gz, gy, gx = np.gradient(sm)
    Z, Y, X = solid.shape
    cx, cy, zc = (X - 1) / 2, (Y - 1) / 2, Z / 2
    palette = np.unique(vol[vol[..., 3] > 0][:, :3], axis=0).astype(np.float32)

    e = math.asin(squash)
    d = np.array([0.0, math.cos(e), -math.sin(e)])  # view direction
    up = np.array([0.0, math.sin(e), math.cos(e)])
    sun = np.array([-0.45, -0.35, 0.82])
    sun /= np.linalg.norm(sun)
    half = (sun - d) / np.linalg.norm(sun - d)
    R = math.sqrt(cx**2 + cy**2 + zc**2) + 2
    AW = int(2 * math.hypot(cx, cy)) + 12
    AH = int(2 * R * 0.95) + 8

    j, i = np.mgrid[0 : AH * ss, 0 : AW * ss]
    u = ((i + 0.5) / ss - AW / 2).ravel()
    v = ((j + 0.5) / ss - AH / 2).ravel()
    ox, oy, oz = u, -v * up[1] - R * d[1], zc - v * up[2] - R * d[2]

    frames = []
    for k in range(dirs):
        a = 2 * math.pi * k / dirs
        ca, sa = math.cos(a), math.sin(a)

        def grid(t, idx):
            px, py, pz = ox[idx] + t * d[0], oy[idx] + t * d[1], oz[idx] + t * d[2]
            return pz, -sa * px + ca * py + cy, ca * px + sa * py + cx

        hit = np.full(u.size, -1.0)
        active = np.arange(u.size)
        t = 0.0
        while t < 2 * R and active.size:
            gzf, gyf, gxf = grid(t, active)
            zi, yi, xi = (
                np.rint(gzf).astype(int),
                np.rint(gyf).astype(int),
                np.rint(gxf).astype(int),
            )
            ok = (xi >= 0) & (xi < X) & (yi >= 0) & (yi < Y) & (zi >= 0) & (zi < Z)
            h = np.zeros(active.size, bool)
            h[ok] = solid[zi[ok], yi[ok], xi[ok]]
            hit[active[h]] = t
            active = active[~h]
            t += 0.5
        idx = np.nonzero(hit >= 0)[0]
        th = hit[idx]
        zi, yi, xi = (np.rint(c).astype(int) for c in grid(th, idx))
        col = rgba[zi, yi, xi, :3].astype(np.float32)
        if relight:
            lo, hi = th - 0.75, th + 0.25
            for _ in range(7):  # settle onto the smooth 0.5 iso-surface
                mid = (lo + hi) / 2
                inside = tri(sm, *grid(mid, idx)) >= 0.5
                hi, lo = np.where(inside, mid, hi), np.where(inside, lo, mid)
            gzz, gyy, gxx = grid(hi, idx)
            n = np.stack(
                [
                    -tri(gx, gzz, gyy, gxx),
                    -tri(gy, gzz, gyy, gxx),
                    -tri(gz, gzz, gyy, gxx),
                ]
            )
            n /= np.linalg.norm(n, axis=0) + 1e-6
            nxw, nyw = ca * n[0] - sa * n[1], sa * n[0] + ca * n[1]
            lam = np.clip(nxw * sun[0] + nyw * sun[1] + n[2] * sun[2], 0, 1)
            spec = np.clip(nxw * half[0] + nyw * half[1] + n[2] * half[2], 0, 1) ** 24
            col = np.clip(
                col * (0.72 + 0.42 * lam)[:, None] + 90 * spec[:, None], 0, 255
            )
        img = np.zeros((u.size, 3), np.float32)
        img[idx] = col
        cov = np.zeros(u.size, np.float32)
        cov[idx] = 1
        img = img.reshape(AH, ss, AW, ss, 3).sum((1, 3))
        cov = cov.reshape(AH, ss, AW, ss).sum((1, 3))
        avg = img / np.maximum(cov, 1)[..., None]
        body = cov >= ss * ss / 2
        out = np.zeros((AH, AW, 4), np.uint8)
        flat = avg[body]
        dist = ((flat[:, None, :] - palette[None]) ** 2).sum(-1)
        out[body, :3] = palette[dist.argmin(1)].astype(np.uint8)
        out[body, 3] = 255
        pad = np.pad(body, 1)
        ring = ~body & (pad[:-2, 1:-1] | pad[2:, 1:-1] | pad[1:-1, :-2] | pad[1:-1, 2:])
        out[ring] = (20, 20, 26, 255)  # outline once, around the finished frame
        frames.append(out)
    return frames, AW, AH


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("strip", type=Path)
    p.add_argument("--slices", type=int, required=True)
    p.add_argument("--dirs", type=int, default=32)
    p.add_argument("--squash", type=float, default=0.75)
    p.add_argument("--supersample", type=int, default=2)
    p.add_argument("--cols", type=int, default=8)
    p.add_argument(
        "--relight",
        action="store_true",
        help="shade with a world-fixed sun (highlights stay put)",
    )
    p.add_argument("--out", type=Path, required=True)
    a = p.parse_args()
    frames, AW, AH = bake(
        load_volume(a.strip, a.slices), a.dirs, a.squash, a.supersample, a.relight
    )
    cols = min(a.cols, a.dirs)
    rows = math.ceil(a.dirs / cols)
    sheet = np.zeros((rows * AH, cols * AW, 4), np.uint8)
    for k, f in enumerate(frames):
        r, c = divmod(k, cols)
        sheet[r * AH : (r + 1) * AH, c * AW : (c + 1) * AW] = f
    Image.fromarray(sheet).save(a.out)
    meta = {
        "frameWidth": AW,
        "frameHeight": AH,
        "dirs": a.dirs,
        "cols": cols,
        "degreesPerFrame": 360 / a.dirs,
    }
    a.out.with_suffix(".json").write_text(json.dumps(meta, indent=1))
    print(f"{a.dirs} frames of {AW} x {AH} -> {a.out}")


if __name__ == "__main__":
    main()
