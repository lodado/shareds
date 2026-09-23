# Changelog

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
