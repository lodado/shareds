# Changelog

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
