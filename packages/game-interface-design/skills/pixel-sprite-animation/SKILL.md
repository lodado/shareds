---
name: pixel-sprite-animation
description: 'Make, retime or review a dynamic pixel-art sprite animation (도트, 픽셀아트, 스프라이트 애니메이션) through a deterministic harness: a JSON sprite spec built from a base frame plus diffs, gated by lint rules for palette, silhouette, phases, timing, smear, hit feel and source licenses, then checked on a contact sheet. Use for character or effect animations (attack, jump, idle, hit), picking a licensed base sprite, stiff imported sheets that need anticipation and impact, or a read-only review of a sprite spec; not static illustration, UI icons, or engine code.'
allowed-tools:
  - Bash
metadata:
  short-description: Base-plus-diff pixel animation with lint gates
---

# Pixel Sprite Animation

Turns a request into a sprite spec, composes it, and lets scripts gate what a machine can judge.
You still draw: the gates catch stiff timing, missing anticipation, teleporting frames, unsafe flashes
and unclear licenses, not ugly art. Use the user's language for reports; spec keys stay English.
Commands run from this skill's folder: `node scripts/pixel-sprite.mjs <command>`.

## Request

Fill gaps with labeled defaults and record them in the report. Ask only when there is no subject at all.

- `SUBJECT`, `ACTION`: who does what (knight, light slash).
- `ACTOR`: `player` (startup ≤ 100 ms) · `enemy` (telegraph ≥ 300 ms) · `neutral` (no startup budget).
- `CANVAS`: 32×32 default; 16–24 for small mobile units, 48–64 for bosses.
- `PALETTE`: ≤ 16 colors in hue-shifted ramps plus an outline and sel-out shades.
- `ROUTE`: `BASE_DIFF` (default) · `HAND` · `PARTS` · `3D_RIG` · `IMPORT` — see below.
- `OUT`: output directory (default `<spec dir>/out/<name>/`); `ENGINE`: where `sheet.json` goes.

## Routes

- `BASE_DIFF`: start from one good base frame and write every other frame as `base` + `ops`/`patch`
  diffs. Redrawing whole frames drifts; diffs keep the character identical. Stage 0 finds the base.
- `HAND`: every frame drawn as `rows`, only for tiny sprites (≤ 16 px) where diffs save nothing.
- `PARTS`: props reused across frames (weapons, effects) as `parts` placed with `layers` (rotate in
  90° steps; draw separate variants for other angles). Mark thin props `outline: false`.
- `3D_RIG`: many animations or frequent retakes. Use the user's `.blend`, or hand a new rig to the
  separate `reference-driven-3d-character` skill when it is installed; then `blender` → `import` →
  clean up as diffs ([pipelines](references/pipelines.md#3d-rig-route)).
- `IMPORT`: PNGs from a generator or an artist; with PixelLab tools connected, follow the
  [PixelLab MCP route](references/pipelines.md#pixellab-mcp-route). Every gate still applies.

Provenance follows the pixels: imported frames carry `source`, frames inherit their `base` chain's
sources, and parts may carry a `source` too. The spec lists each in `sources` with author, license and
url; `L1` checks that a license is filled in and `L2` classifies it. `build` writes `credits.txt`.
AI-assisted assets also need the store's AI-content disclosure.

## Stage 0 — Base

1. **Candidates** (when no project sprite or user file is given): search free asset libraries with the
   host's web or browser tools — OpenGameArt, Kenney (CC0), itch.io free game assets, the LPC
   character generator. Prefer CC0, and read the license on each asset's own page, not the search
   listing. Search pages that come back empty usually render with scripts: open the asset page
   directly or use a browser tool. Write 3–6 picks to a manifest
   (`[{ id, url | path, page, author, license, note }]`, PNG only) and run
   `node scripts/pixel-sprite.mjs candidates <manifest.json> --out <dir>`. Read `candidates.png` and
   show the board with a table (id, author, license class, size, detected upscale, colors) as a draft,
   then wait for the user's pick unless they told you to choose. Nothing found: a generator (the
   PixelLab route), else draw one base frame by hand as `rows`.
2. **License classes** (`L2`, [lint rules](references/lint-rules.md#records)): `open` (CC0, public
   domain, MIT, own work) and `attribution` (CC-BY, OGA-BY) pass; `copyleft` (CC-BY-SA, GPL) and
   `generator` (plan-dependent terms) warn and need a waiver that says why the release allows them;
   `restricted` (NonCommercial, NoDerivatives) and `unknown` are errors no waiver removes. A CC-BY
   source also needs its author and url (`L2` warns). A waiver names one source with
   `"frame": "<source name>"`; without `frame` it waives every `L2` warning.
3. **Import** the pick, which `candidates` saved as `<out>/<id>.png`, with its record:
   `import <out>/<id>.png --actor <actor> --source <id> --out <spec>` plus `--license`, `--author` and
   `--url` (the asset page). `import` slices sheets (`--grid 64x64 --row 2 --cols 0-5` or
   `--cells 2:0,2:3`), undoes integer upscales (`--downscale auto` measures the block size and refuses
   uneven ones; `--downscale 4` forces it), and snaps to `--palette auto:N` or to any JSON file with a
   `palette` (a full spec or `{ "palette": {…} }`). `colors <png...>` lists colors by use and groups
   near-duplicate shades, which tells you N. In the import report, `maxError` 0 is exact, under 24 is a
   merged near-duplicate shade, and 24 or more means the palette lacks a color: raise N or add it.
   `--diff-base first` writes later frames as `base` = the first frame plus one patch each;
   `--diff-chain` (`--diff-base previous`) chains each to the one before, so editing one patch moves
   every later frame. Imported frames get placeholder `hold`/100 ms so the phase and timing gates fail
   until Stage 1 retimes them.
4. **Base gate**: build the base alone as a 1-frame spec with `build --draft` and fix its palette,
   outline and dust findings before deriving anything; every flaw in the base copies into every frame.
   Set `outline` and `baseline` in the spec: `H6` and `H7` only run when they are set.

## Files from the user

At any stage, when the user gives a file path, never redraw it from scratch. Inspect it first with
`colors <png>` and `attach <spec> <png> --as <role> --dry-run` (size, detected upscale, opaque colors,
snap error), decide its role, then attach it and keep going with diffs:

- `--as base`: the pixels become the base `rows` (of frame `--at <id>`, or a new first frame).
- `--as frame`: a placeholder frame (`hold`, 100 ms) inserted after `--after <id>`; retime it.
- `--as part`: a prop in `parts` with its pivot at center-bottom, placed with a `layers` item.

`attach` snaps to the spec palette, refuses a snap that would visibly change colors unless
`--palette-extend` adds them within `maxColors`, records the source (`--source`, `--license`,
`--author`, `--url`), keeps the previous spec as `<spec>.bak`, and prints the lint findings so
`show <spec> <id>` works at once. A multi-frame sheet goes through `import --grid`, not `attach`.

## Stage 1 — Timing before drawing

Write the phase table first from [timing and feel](references/timing-and-feel.md): anticipation →
travel or smear → impact → follow-through → recovery → hold, each with milliseconds. `travel` covers
airborne and lunging frames between the wind-up and contact (rise, apex, fall); a smear may sit
anywhere in that stretch, including take-off and arrival. Startup (player ≤ 100 ms) and telegraph
(enemy ≥ 300 ms) count anticipation only; `M11` warns when a player then waits more than 250 ms of
travel and smear before contact. An enemy telegraph also needs a visible cue: a color shift, an eye
glint or a `!` drawn as an `fx` item. Hold key poses, pass fast frames quickly; uniform timing fails
lint (`M1`). The phase table goes into the delivery report.

## Stage 2 — Key poses

Choose or make the 2–3 key poses from the base and tag them `key`: wind-up, contact, and settle (the
pose the actor rests in after recovery). Silhouette first: run `build --draft`, then Read
`contact.png`. `M5` compares the last anticipation with the first impact, and each pair of
consecutive `key` frames, so every key must read differently in silhouette. Check coordinates with
`show <spec> <frameId>` (rulers every 5/10) and body bounds with `show <spec> --bbox` before writing
ops. To promote an imported or derived frame to a key `rows` frame, paste the output of
`show <spec> <frameId> --rows`.

## Stage 3 — Breakdowns as diffs

Derive frames from a key pose with `base` and author only what changes, in this order: body `layers`
→ `ops` → body `patch` → effect items ([spec format](references/spec-format.md)). Ops run after body
layers, so keep op rects clear of new layer pixels; derive strongly different poses from the key
frame, not from a frame that already moved the prop. Mark pure effects (sparks, dust, smear arcs)
`fx: true` on their `layers`/`patch` items: they draw after the ops, `base` does not inherit them,
and body metrics ignore them. `show <spec> <frameId> --diff` compares the frame's body with its
`base` frame's body (effects left out) and prints the changed pixels, a changed-cells grid and one
equivalent body patch. Iterate with `build --draft`.

- Gap rule (`M4`): when more than 55% of the silhouette changes in one step, add an in-between, or a
  take-off/arrival smear.
- Smear: a `smear` frame between the wind-up and contact, drawn along the arc; never after contact.
- Overlap: hair, capes and props settle 1–2 frames after the body.
- Squash/stretch: rough it with the `scale` op (`size`, `anchor: "bottom"` keeps the ground line), then
  clean up with `patch`; tag `squash`/`stretch`; area stays within 25% of the first plain frame, or of
  `volumeRef` when generated frames vary in size (`M6`).

## Stage 4 — Clean-up

Ramps instead of near-duplicates (`H2`), closed outline or sel-out shades in `outlineAlt` (`H6`),
no floating dust (`H5`), grounded feet on `baseline` unless tagged `airborne` (`H7`).

## Stage 5 — Feel

Add `feel` only where the hit deserves it; game-level policy lives in the planning skill's
[game feel](../reference-driven-game-design/references/game-feel.md). Hitstop needs `scope`: use
`presentation` by default, including enemy hits, unless both actors' logic really pauses
(`simulation`). A hit flash belongs to the target being hit, so an enemy attack sheet usually has
none; `knockbackPx` likewise moves the target, not the attacker. Shake is whole pixels, at most 3
flashes per second, and `reduced` keeps the hit readable with values no larger than the full ones
(`F1`–`F4`, `M8`).

## Stage 6 — Verify and deliver

1. `node scripts/pixel-sprite.mjs build <spec>` without `--draft` until it exits 0: zero errors and
   zero unwaived warnings. Fix every warning or waive it in `waivers` with a reason
   ([lint rules](references/lint-rules.md)); errors and stale waivers (`W1`) cannot be waived.
   `--draft` exits 0 whatever lint finds (2 when the spec itself is invalid) and never counts as
   delivery.
2. Read `contact.png` and answer each item. Each block holds up to 6 frames (`--cols N`) and shows,
   per frame: the checkerboard, a dark background, the body silhouette, the onion skin (the previous
   frame's body in pink under the current frame) and the timing bar. Judge 1× readability from
   `sheet.png` or `frames/` directly. You judge from the contact sheet; the GIFs are for humans. A
   visual revision pass is a change made after reading the contact sheet of a build without
   `--draft`; draft reads in Stages 2–3 do not count. At most 3:
   - silhouette: every frame reads at 1× and in solid black;
   - arcs: blade tips, heads and feet travel on curves, not zigzags;
   - spacing: onion skin shows ease-in/out, no frame-to-frame teleport;
   - overlap: secondary parts lag and settle;
   - timing contrast: the duration bars are not uniform;
   - small screen: the contact pose reads at phone size against light and dark.
3. Report in the user's language: the phase table, outputs (`frames/`, `sheet.png`, `sheet.json`,
   `preview.gif`, `preview-feel.gif`, `contact.png`, `lint.json`, `feel.json`, `credits.txt`), the lint
   summary (errors 0, warnings fixed or waived with reasons), the checklist answers labeled as visual
   judgment, and `NOT_RUN`: in-engine feel, device performance, playtest/fun. Both GIFs hold the last
   frame an extra 300 ms when the spec does not loop and round delays to 10 ms; `preview-feel.gif`
   turns the sprite white for the flash only to mark its timing. Read frame durations from
   `sheet.json`, not from the previews.

A review request reads the spec and outputs, runs `lint`, and reports findings ordered P0–P3
(frame, rule or visual evidence, player impact, smallest diff) without editing until asked.

## Handoff

`sheet.png` + Aseprite-compatible `sheet.json` (durations, phase tags) load in most engines and in the
package-local [Three.js Game Wireframe](../threejs-game-wireframe/SKILL.md). `feel.json` gives hitstop
and shake in milliseconds plus logic ticks (`frames`), the flash in ticks, phase ranges in
milliseconds, and startup, travel and time to contact in milliseconds. Bake squash, hops and recoil into the sprite while the
body's lift stays under about a third of the canvas height; horizontal travel and higher arcs are engine
root motion, so keep the body in place and write the distance, lift, curve and frames into `rootMotion`
(it is copied to `feel.json`). Display at integer scale with a pixel-perfect camera
([pipelines](references/pipelines.md)). The example [knight slash](examples/knight-slash/sprite.json)
is a complete passing spec: a `rows` base, sword parts, `fx` smear and spark layers, and diff-only
frames.

## Scope

- Local files, plus the candidate URLs you list and generator calls through tools the user connected.
  No fonts, licensed art or generator credits are bundled; list sources for the user.
- Lint passing is not good art, and a contact sheet is not game feel. Never claim fun without a playtest.
- Read [principles](references/principles.md) when a pose reads stiff and the rules all pass.
