---
name: pixel-art-diorama
description: 'Build, tune or review a three.js scene that renders as pixel art (도트 디오라마, 픽셀아트 3D): a low-res render target with depth outlines, Bayer dither and palette quantization, a toon ramp, an orthographic camera at 31° snapped to the texel grid and turned in 90° steps, camera-side cutaways, optionally a headless agent simulation feeding it, then cut draw calls (static bake, instanced dolls, off-screen render skip) and verify with headless SwiftShader screenshots and a frame probe. Use for isometric dioramas, "3D that looks like pixel art", pixel crawl, z-fighting, noisy outlines or a slow diorama; not sprite animation, game planning or a generic Three.js prototype.'
allowed-tools:
  - Bash
metadata:
  short-description: Low-res 3D pixel-art diorama with a draw-call budget and headless checks
---

# Pixel Art Diorama

A 3D scene of boxes drawn small, outlined from depth, snapped to a fixed palette and enlarged by
whole pixels. The references hold the complete, unabridged source of a worked example (a futsal
match on a floating school yard). Each code block starts with its module path (`// src/…`, or
`// qa/…` for the headless scripts) so its relative imports resolve. Adapt names and values; keep
the mechanics. Use the user's language for reports.

## Request

Fill gaps with labeled defaults and record them in the report. Ask only when there is no subject.

- `SUBJECT`: what the diorama shows and the one thing that moves in it (a match, a market, a farm).
- `LOW_RES_HEIGHT`: 270 px default; 180 for a chunkier look, 360 for more detail.
- `PALETTE`: 32–48 sRGB colours in ramps of 3–4 per material family, plus one entry for each colour
  that must stay distinct (team kits, each floor surface, each sky).
- `CAMERA`: orthographic, elevation 31°, azimuth 45° + k·90°; modes as half-heights in metres
  (wide, follow, close).
- `TIMES`: day, dusk and night as lighting rows; lamps change intensity, never visibility.
- `SIM`: none, or a fixed-step headless simulation the scene only reads (Stage 4).

## Stage 1 — Pixel pipeline

Render the scene into a `WebGLRenderTarget` with a `DepthTexture` at `LOW_RES_HEIGHT`, then draw one
full-screen quad into the canvas with the post shader. The canvas buffer stays low-res and CSS
enlarges it with `image-rendering: pixelated` by an integer factor. Antialias off, pixel ratio 1,
`NearestFilter` everywhere. The shader, in order: linear → sRGB, a depth-edge outline tinted from the
pixel's own fill, ordered dither only in dark midtones, nearest palette colour. Code and the reason for
each threshold: [render pipeline](references/render-pipeline.md).

## Stage 2 — Camera

Place the camera from the target along `(sin az·cos el, sin el, cos az·cos el)`, ease the azimuth the
short way round (instant under reduced motion), then snap the target to the texel grid on the
camera's right and up axes and leave depth alone. Without the snap the whole scene crawls a pixel
while the camera follows. Cutaways: walls whose outward normal faces the camera drop to a low
kickboard, and a tall building on a near side hides its upper floors. Keep near and far tight around
the scene; the outline and the floor offsets live on depth precision. Code: [camera](references/camera.md).

## Stage 3 — Scene

- Build from one shared unit box scaled per mesh and a material cache keyed by colour; give every
  surface that changes on its own (a swapped floor, emissive windows, a recoloured lamp) its own
  material.
- A three-step toon ramp (128, 200, 255). One shadow-casting light, its map sized to the frame:
  1024² over ±40 m is 7.8 cm a texel, finer than a 270 px frame shows.
- Mark everything that changes after build (transform, visibility, material, vertices) with
  `markLive`; the rest is baked in Stage 5. Floors sit a few centimetres above what they cover, and
  everything standing on them is lifted by the same constant.
- Crowds and dolls are instanced. Draw small things larger than life (a 0.1 m ball at 1.6×) so they
  never shrink to one pixel.

Lights, the world class and the doll rig: [scene](references/scene.md).

## Stage 4 — Simulation (optional)

Pure TypeScript with no three.js: a fixed 30 Hz step, a seeded RNG, scripted sequences as generator
coroutines (`yield wait(s)`, `yield until(pred)`, a timeout on every `until`), grid A\* for walking, and
closed-form ball motion (rolling with constant deceleration plus linear drag, a lob with linear drag)
inverted by bisection, so agents aim passes and lobs exactly on every surface. The render loop reads
the simulation into meshes each frame; React reads only a small external store through
`useSyncExternalStore`. Code: [simulation](references/simulation.md).

## Stage 5 — Draw-call budget

Measure first: `renderer.info.autoReset = false` with a manual reset per frame so both passes count,
and a frame probe that times every `requestAnimationFrame` callback. Then:

1. `bakeStatic(group)` on each static group after the lights have read their anchors: one mesh per
   material, shadow flags and attribute set, in the group's space, mirrored copies re-wound.
2. Every doll part as one instance of a single `InstancedMesh` with per-instance colour; the rig stays
   outside the scene as empty `Object3D`s, hidden agents get a zero-scale matrix, and
   `frustumCulled = false`.
3. Skip `render` while the canvas is off screen (`IntersectionObserver`), and keep advancing the
   simulation.

The worked example went from 1,335–1,595 draw calls to 105–125, and its frame CPU from 1.1 to 0.45 ms.
Code, the measurements and the full list of live nodes: [draw calls](references/draw-calls.md).

## Stage 6 — Verify and deliver

1. Unit tests in jsdom for the pure parts (camera snap, cutaway sides, palette distinctness, bake,
   instancing). jsdom has no WebGL; build scene objects and check them without a renderer.
2. Headless Chromium with SwiftShader against the production preview
   (`--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`): every surface × time of day × rotation,
   the close and wide modes, phone widths with `scrollWidth === innerWidth`, zero app console
   warnings, and the frame probe before and after any performance change. Scripts and the screenshot
   checklist: [verification](references/verification.md).
3. Read every screenshot against the [pitfalls](references/pitfalls.md) table before calling it done.
4. Report each check with its status, the draw-call and frame numbers, and `NOT_RUN` for phone GPU
   performance (SwiftShader is a CPU rasterizer) and real touch input unless a phone was used.

A review request reads the scene code and screenshots, runs the probe, and reports findings ordered
P0–P3 (symptom, cause, smallest fix) without editing until asked.

## Scope

- Original scenes only; do not rebuild a specific existing game's look, characters or levels.
- A passing probe is not phone performance, and a screenshot set is not game feel.
- Sprite frames belong to `pixel-sprite-animation`; turning the diorama into a playable game loop
  belongs to `threejs-game-wireframe`.
