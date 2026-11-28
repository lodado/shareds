# Changelog

## 0.12.5 — 2026-11-28

- `voxel-character`: a tool carried back over the shoulder is drawn on top of the shoulder cap, with the hand closed over it (`rest=True`, a new pose value), and the carrying elbow hangs down (`elbow_hi`, also new) in the idle and the walk. Seen from the tool side the cap used to swallow the middle of the haft, so the tool stuck into the chest and the hand held nothing. Two check cases cover it.

## 0.12.4 — 2026-11-28

- `voxel-character`: the renderer lights every view from the upper left of the screen, using smooth normals from each part's voxels: lit faces go one tone up, faces turned away one or two down, and a nearer part drops a short shadow. The near sleeve goes one tone up so it reads in front of a torso of the same cloth. The lantern glow keeps its tones. A pixel now goes to the part with most samples, whatever its tones. A side-on torso no longer comes out as one flat tone; a check case covers it.

## 0.12.3 — 2026-11-28

- `voxel-character`: the neck part is 6 voxels wide and 7 deep, and the example spec uses a 2-voxel neck, so a bald or short-haired head no longer sits on a thin stalk in profile. A check case covers the thickness. The mine smear grips lower, so the haft also clears the face at a 2-voxel neck; the haft and reach cases now run at necks 0 to 4, 6 and the longest. The head prompt asks for a mouth that survives the shrink to about 20 px, step 2 says to reject a sheet whose mouth is a hairline, and step 3 says to zoom the imported strip and repaint a mouth that came out under 3 px wide.

## 0.12.2 — 2026-11-28

- `voxel-character`: the walk carries the tool on the shoulder below the neck instead of across the throat, and the swing and mine wind-up and smear frames keep the haft off the face with every hand in arm reach. The neck part is 4 voxels wide and deep, and the example spec uses a 4-voxel neck. Check cases cover the shoulder carry and the face at short, example and longest necks, and bound arm stretch. Step 5 now starts from the page as it opens (walk, facing 12).

## 0.12.1 — 2026-11-27

- `voxel-character`: a spec's `head.neck` raises the painted head and draws a skin neck under it, so a beardless face no longer sits on the collar. The example spec uses 6 voxels; the default stays 0. A check case covers it.

## 0.12.0 — 2026-11-27

- New skill `voxel-character`: a rigged voxel body (two-bone IK, eight directions, idle, walk and work actions) with painted head images per view. `scripts/heads.py` writes a layout reference for the image generator and imports a five-view sheet into an eight-view strip, finding heads and brim anchors itself; `scripts/bake.py` bakes a JSON spec into a self-contained workshop page that swaps faces, headwear, coats, tools and shields, with the crop computed from every frame. The painted head gets a stand-in depth volume, so every nearer body pixel covers it, and held tools are pushed out of it while posing. `scripts/check.py` holds a case for each mistake code can catch (a hat swap changing the face, a tool through the face, the head drawn over the near shoulder, a shallow torso, hand-read anchors, a crop that cuts frames, white keyed out of a head, a broken ramp override).
- The router sends a 3D pixel character built from swappable parts to the new `VOXEL_CHARACTER` mode; one rubric case covers a character workshop with swappable faces, headwear and tools.

## 0.11.0 — 2026-11-24

- `sprite-stacking` gains `references/modular-parts.md`: a base with swappable parts (headwear, hair, weapons, turrets). Parts share one grid and an ordered list of slots, are stored as material volumes, authored complete so a cover can come off, and composed before shading; the file compares composing at build time with merging part strips at equip time and says why direction sprites are baked per loadout.
- `baking` adds what a first character bake showed: the bake is a true projection (use `--squash 0.6` for the live stack's proportions), its frames mirror the live stack, stacks under about 40 slices lose limbs to the smoothing, and `--relight` specks small faceted plates. Three lessons record the mistakes.

## 0.10.0 — 2026-11-24

- New skill `sprite-stacking`: fake-3D rotatable pixel art from a 4-view sheet (visual-hull carve, check sheet, web viewer, engine notes), now with references for reference research and blueprint-based realistic models (`references-and-likeness`), voxel sculpting past the carve with interior colour fill and material shading (`voxel-modeling`), and terrace-free direction sheets (`baking`, `scripts/bake_sprites.py`).
- The router sends a pixel-art object that turns (sprite stack, baked direction sprites) to the new `SPRITE_STACK` mode; one rubric case covers a realistic car request.

## 0.9.0 — 2026-11-16

- `pixel-art-diorama` gains the picture rules a one-shot build was missing, as three references without code. `composition` (value plan, the empty corners of a 45° frame, silhouette and rhythm, depth without perspective, a hero rotation with a lower bar for the other three, the eye path, editorial and phone page layout), `color-and-light` (hue-shifted ramps, a saturation budget, a harmony table by mood, contrast pairs, colours for day, dusk and night, and a second 33-entry palette whose numbers the contract test recomputes) and `pixel-craft` (clusters and banding, one pixel density, material patterns, contact shadows and ground wear, nothing under two pixels). Every number is marked a starting value, not a measurement.
- The Stage 0 sheet adds four rows (value plan, mood, hero rotation, quiet zones), `SKILL.md` says the worked example's palette and lighting are one answer rather than defaults, and `world-dressing` gains a rhythm-and-quiet section.
- `verification` adds six critique passes (squint, grayscale, silhouette, accent and colour, rotation, pixel zoom), run on the blockout shots and again on the dressed scene; `LOOK` fails if one was skipped. One rubric case covers the futsal prompt as a single shot.

## 0.8.0 — 2026-11-16

- `pixel-art-diorama` decides the look before it draws. A new Stage 0 writes a direction sheet whose rows are numbers, named colours or rules a screenshot can refute (reading order, what each camera mode holds, sizes in low-res pixels, foundation colours and the accent, module sizes, cutaway, hero time, motion, page), and the scene stage now blocks out ground, landmark, stage and supporting masses and shoots all four rotations before any detail.
- Two references without code: `art-direction` (the sheet, the pixel-size formula for an orthographic camera, adjective-to-decision rewrites, the worked example's sheet beside one for a subject that was not built, and rules for the page around the canvas) and `world-dressing` (blockout questions, four tiers from landmark to life, placement rules tied to the nav grid and the cutaway, and what a prop costs in draw calls after baking).
- The report gives two verdicts, `LOOK` and `FUNCTION`, each with its own evidence; `verification` lists the rows of both. Two rubric cases cover a new subject with no look given and a scene that looks empty.

## 0.7.0 — 2026-11-07

- New skill `pixel-art-diorama`, a three.js scene rendered as pixel art: a low-res render target with depth outlines, dark-midtone Bayer dither and palette quantization, a toon ramp, an orthographic camera at 31° snapped to the texel grid with camera-side cutaways, an optional headless simulation (fixed step, generator coroutines, grid A\*, closed-form rolling and lobs), a draw-call budget (static bake with live nodes, one instanced mesh for every doll, off-screen render skip, shadow map sized to the frame) and headless SwiftShader verification. Its references carry the complete modules of a worked example, each code block opening with its module path.
- The router sends a three.js scene rendered as pixel art to the new `PIXEL_DIORAMA` mode, and diorama reviews stay read-only there.

## 0.6.1 — 2026-11-06

- Reject mood trace events without finite valence and arousal instead of reporting an untested continuity rule as checked.

## 0.6.0 — 2026-10-31

- `lifelike-cat-motion` gains two references for rigging the legs. `limb-rig-and-gait` builds one shared cat skeleton (four bones per limb, joint angles measured at paw contact and lift-off for the hind limb, assumed and marked for the fore limb), a foot path with a planted stroke and a swing arc, two-bone IK, walk-to-trot gait blending, the body speed that keeps planted feet from slipping, and the solver tests (constant bone lengths, fixed planted feet, joint range, turn rate, touchdown order). `raster-view-rigging` moves an approved raster view without redrawing it: rest pose equal to the still, layered cuts (foot, walls, tips), hind legs that shear about a fixed junction below the pivot row and fold as they lift, a half stride for a view along the walking axis, and a field warp for a paw that is one lobe of the body outline, with the failures each form avoids and how to check frames.
- `SKILL.md` links both from the rig step, adds the no-slip and short-step rules, and asks the report for the solver tests and the rest-pose difference.

## 0.5.0 — 2026-10-28

- Add `lifelike-cat-motion` and the `CAT_MOTION` route: make a 2D or 2.5D cat move and react like a real cat. The skill collects real-cat photos and video per behavior first, writes a behavior sheet, maps the rig's channels (never faking one channel with another), builds mood → states → channels → motion with every input going through appraisal, and reviews read-only with P0–P3 findings. References cover the behavior catalog, body-language channels and mood presets, the interaction model (petting budget by zone with escalating warnings, the play sequence, startle habituation, calls and slow blinks), and motion and timing (idle timers, lateral-sequence walk, diagonal trot, anticipation and follow-through, reduced motion).
- Ship `node scripts/check-trace.mjs <trace.json>` in the skill folder: eight order and timing rules over a recorded behavior trace (swat warning, pounce anticipation, blink reply, startle latency, mood continuity, gait footfalls, idle variety, attention chain). It exits 0, 1 or 2 and lists the rules a trace did not exercise, so a vacuous pass is visible.

## 0.4.0 — 2026-10-21

- Add `pixel-sprite-animation` and the `PIXEL_SPRITE` route: a JSON sprite spec built from a base frame plus diffs (`layers`, `ops` move/copy/scale/flip/recolor/erase, `patch`), with `BASE_DIFF` as the default route and `HAND`, `PARTS`, `3D_RIG` and `IMPORT` alternatives. Effects marked `fx: true` draw after the ops and stay out of body metrics; `base` inherits the body only.
- Ship a dependency-free harness in the skill folder, `node scripts/pixel-sprite.mjs build|lint|show|import|colors|candidates|blender`: a PNG codec, a GIF encoder, deterministic lint gates for palette, outline, baseline, phase order (with a `travel` phase for airborne and lunge frames), anticipation-only startup/telegraph budgets, travel before contact (`M11`), gap/smear, key-pose distinctness, squash volume against a chosen `volumeRef`, flash rate, identity drift, hit feel and its reduced variant, inherited source licenses (`L1`) and license classes (`L2`: whole-word matching, negations and all-rights-reserved unknown, NonCommercial/NoDerivatives restricted, CC-BY credits need author and url), plus a wrapped contact sheet with a dark-background row, Aseprite-style sheet JSON, feel JSON with `timeToContactMs` and `rootMotion`, GIF previews and per-frame credits. `build`/`lint` exit 0 only with no errors and no unwaived warnings; `build --draft` is for iteration, and a rebuild deletes only the frame files the previous build recorded.
- `attach <spec> <png> --as base|frame|part` merges a file the user hands over mid-task into the spec in place (`.bak` kept): palette snap with a refusal for lossy snaps unless `--palette-extend`, placeholder frame or center-bottom-pivot part, recorded source, `--dry-run` analysis, lint findings printed.
- `candidates` reads or downloads (PNG only, 5 MB, 4096×4096, no auth headers, one timeout for headers and body) the base sprites a manifest lists and writes a measured table and a license-colored pick board; it replaces only files an earlier run wrote (`--force` to override) and never the manifest; the skill searches free asset libraries, shows the board and waits for the user's pick.
- `import` slices sheets, detects integer upscales (`--downscale auto`), snaps to a palette, fills the `sources` entry from `--license`/`--author`/`--url`/`--prompt`/`--seed`, requires `--actor`, and writes later frames as diffs of the first frame (`--diff-base first`) or of the previous one (`--diff-chain`). `colors` lists colors and near-duplicate shades; `show` adds base diffs, body bounding boxes (`--bbox`) and paste-ready rows (`--rows`).
- Add the passing `knight-slash` example (a `rows` base, sword parts, `fx` smear and spark layers, diff-only frames) and references for perception and animation principles, timing templates and hit feel, the spec format, lint rules, base candidates and sources, the 3D rig and PixelLab MCP routes, and engine rendering.
- Codex manifest: at most three starter prompts of up to 128 characters each, checked by `check-contract`.

## 0.3.0 — 2026-10-07

- Route a review request to the skill that owns the artifact and keep it read-only: findings ordered P0–P3 with location, evidence, player impact and smallest fix, and no edits until the user asks.
- Ship `product-copy.md` in the code UI lane: stable-ID rules for action, destructive, error, loading, naming and accessible-name copy, byte-identical to the frontend-interface-design copy and pinned by both packages' tests.

## 0.2.2 — 2026-09-28

- Require demand-driven runtime GLB loading for the current screen, scene and selection, without adding assets to shape-only prototypes.
- Define host readiness/error/retry boundaries, stale-result protection, shared resource ownership and finite idle-cache policies outside the ECS.
- Add the screen asset blueprint table, cold-cache/parse/build verification contracts and an independent generated-GLB browser fixture with 13 passing scenarios; preserve the existing report schema.

## 0.2.1 — 2026-09-28

- Add optional staged/endless level progression contracts with learning goals, layout/metrics, solvability limits and blockout/playtest handoff, grounded in The Level Design Book.
- Surface concise reference-backed decision summaries at checkpoints and delivery in both planning and code lanes; separate source observations, adaptations and unverified assumptions.

- Add a package-local reference-to-code visual design workflow for web HUDs and menus, adapted from frontend-interface-design 1.8.4 without invoking its Figma-only delivery contract.
- Route existing game web UI polish to code; preserve rules, host framework, explicit greybox-only scope, and optional Figma delivery.
- Require reference rationale, actual token/component bindings, a representative pilot, browser critique, and separate visual evidence; retain the existing report schema.

## 0.2.0 — 2026-09-23

- New `threejs-game-wireframe` skill: LAYOUT_ONLY, FLOW_PROTOTYPE and PLAYABLE_GREYBOX fidelity levels,
  FSD placement, headless ECS session contract, time and lifecycle, render/HUD/input bridge, verification.
- Stack greybox starter (Vite, TypeScript, Three.js, DOM HUD) with headless tests, a DOM-free core tsconfig,
  Steiger allowed/violation fixtures and Playwright scenarios.
- `create-wireframe.mjs` (refuses non-empty targets), `validate-wireframe.mjs` with report schema and example,
  `pack:zip` from committed state.
- Router routes PLAN_ONLY, FIGMA and THREEJS_WIREFRAME; the design skill's handoff points to the ECS contract.
- Validators and tests ported from Python to Node; package registered in the shareds marketplace.

## 0.1.0 — 2026-09-23

Independent game-focused source-contract fork from frontend-interface-design 1.8.1.
Adds core-loop, player-flow, lifecycle, game-feel, visual/HUD, business, handoff and playtest references.
Adds game schemas, templates, a synthetic merge-game example, validators and regression tests.
Retains three exact source-gate/critique/prototype references locally. Removes upstream runtime
and mandatory private-dictionary dependencies. No remote repository changes or host/playtest claims.
