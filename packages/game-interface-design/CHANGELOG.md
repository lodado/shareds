# Changelog

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
