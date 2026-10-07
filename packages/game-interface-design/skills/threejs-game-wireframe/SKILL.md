---
name: threejs-game-wireframe
description: 'Implement a local Three.js game prototype or refine its web UI directly in code using inspected references, semantic tokens, and browser critique. Supports layout, flow, or playable greybox with headless ECS in an FSD page slice. Use for explicit game build or web UI polish requests, or a read-only review of an existing game web UI; not planning alone, Figma delivery, final game art, or backend services.'
allowed-tools:
  - Bash
---

# Three.js Game Wireframe

Turns an approved or supplied game plan into running local code. Planning lives in
`reference-driven-game-design`; this skill takes its output and does not repeat the planning interview.
Use the user's language for reports. Code identifiers stay in English.

## Request

| Field             | Default                  | Meaning                                               |
| ----------------- | ------------------------ | ----------------------------------------------------- |
| `PLAN_SOURCE`     | the current conversation | plan files, a delivery manifest, or pasted rules      |
| `TARGET_DIR`      | none, ask once           | new project directory, or the existing repo root      |
| `PROTOTYPE_LEVEL` | `PLAYABLE_GREYBOX`       | `LAYOUT_ONLY` · `FLOW_PROTOTYPE` · `PLAYABLE_GREYBOX` |
| `REVIEW_WAIT`     | `false`                  | `true` stops after the blueprint for approval         |

Read [fidelity levels](references/fidelity-levels.md) before choosing. `LAYOUT_ONLY` has no ECS (N/A).
`FLOW_PROTOTYPE` labels every timer or fake result `simulated`. `PLAYABLE_GREYBOX` computes core rules, failure and restart in the ECS.

Missing plan detail → fill only the gap with a labeled, reversible default and record it in the blueprint.
A missing core rule that changes the build (what fails the run, what scores) is the one question worth asking.
Figma is never a prerequisite.

Web HUD/menu implementation includes reference-driven visual design by default; `PROTOTYPE_LEVEL`
controls rule fidelity, not whether the UI receives design attention. An explicit greybox-only,
layout-only, or mechanics-only request skips expanded polish, not readability or accessibility.
An existing game web UI polish request preserves the host and rules; do not scaffold or rebuild its core.
A review request on an existing game web UI inspects the running app and reports findings ordered P0–P3
(location, evidence, player impact, smallest fix); it edits nothing until the user asks for changes.
For UI-only changes, reuse the current architecture and skip Stage 3–4 implementation, then verify regressions.
The prototype-level/ECS defaults apply to new prototypes, not a mandate to retrofit an existing game.

## Stage 1 — Inspect the target

Existing repo: read its `CLAUDE.md`/`AGENTS.md`, package manager, framework (Vite, Next.js, React, R3F), TypeScript config,
lint and any FSD checker before proposing anything. Keep React/R3F/Next.js if present; never add React to a DOM project.
Empty or new target: copy the [starter](starter/README.md) with `node scripts/create-wireframe.mjs <TARGET_DIR>` from the package root; it refuses a non-empty directory. Confirm versions from the actual lockfile, not memory.

If the implementation uses GLB assets, follow [runtime GLB loading](references/asset-loading.md): audit eager paths,
then download and parse only assets required by the current screen, scene and selection. This is runtime asset loading,
not progressive disclosure of skill documents. A shapes-only prototype needs no model loader, registry or external assets.

## Stage 2 — Blueprint

Use the shared [decision-summary protocol](../reference-driven-game-design/references/checkpoint-protocol.md):
show important choices, inspected source links, application, trade-offs and pending validation in the user's
language before dependent edits and after checks. Persist code-only decisions in the blueprint, not a second log.
If levels or changing pressure are requested, reuse or fill only the relevant
[level/progression contract](../reference-driven-game-design/references/level-progression.md).
Carry the representative L-ID setup, units, rules and experiments into the blueprint; block out and test it
before final art or expanding content. A UI-only request does not authorize changing level progression.

Read [code visual design](references/code-visual-design.md): reuse the journey, inspect references,
choose or preserve the direction, and map tokens/components before UI edits. This is a package-local
code adapter, not an invocation of the Figma skill. Record explicit polish exclusions with a reason.

Write `wireframe-blueprint.md` from [the template](templates/wireframe-blueprint.md) next to the plan, or in `TARGET_DIR/__docs__/`.
It fixes goal and exclusions, real versus mocked boundaries, rules and their owners, public session operations,
system order, fidelity level and the verification plan. Existing `__docs__/architecture.md` is updated, not duplicated.
Before GLB implementation, fill the screen/scene asset plan: required models, load triggers, fallback, cache/disposal owner,
and a finite idle-cache policy. Record `GLB: none` when unused; do not invent assets to fill the table.
`REVIEW_WAIT=true` → present the blueprint and stop. Explanation is not approval.

## Stage 3 — Place code (FSD)

Read [FSD for games](references/fsd-game.md). Pages-first: the playable screen is one `pages/<slice>`,
its rules live in `pages/<slice>/model/ecs`, render and HUD in `ui`, tuning in `config`.
No `src/ecs`, `src/managers`, `src/domains` or other extra top-level layers. `shared` holds no game policy.
Extract to `features`/`entities` only when a second real consumer exists.

## Stage 4 — Headless core (ECS)

Read [ECS and session](references/ecs-session.md) and [time and lifecycle](references/time-lifecycle.md).
Write failing headless tests for the rules first, then the systems. The core imports nothing from React, DOM, Three.js,
HTTP or storage, and reads no ambient time or randomness; inject a seeded RNG when rules need chance.
System order is decided in one function and mirrored in `architecture.md`.
The UI sees public operations (`dispatch`, `advance`, `pause`, `resume`, `getSnapshot`, `subscribe`, `renderFrame`, `dispose`), never component writers.

## Stage 5 — Render, HUD, input

Read [render and input bridge](references/render-input-bridge.md). Basic shapes and real buttons first; keep the plan's core choice.
The renderer reads interpolated poses and writes nothing back. The HUD reads an immutable snapshot.
React hosts use `useSyncExternalStore`; R3F `useFrame` mutates refs, never React state, per frame.
Every loop, listener, observer, pointer capture, subscription and GPU resource has one owner and an idempotent teardown.
Keep GLB loading, parsing, cache and Three.js objects outside the ECS core. Gate play on required asset readiness;
decoration alone may use an explicit substitute. Check scene validity before attaching async results, including after selection changes.

Apply the code visual design pilot → browser critique → targeted fixes before expanding the HUD/menus.
Basic world geometry is not an excuse for an unreviewed default-looking web interface.

## Stage 6 — Verify and report

Read [verification](references/verification.md). Run what exists: typecheck, lint, FSD check, headless tests, build, browser.
For new prototypes, fill `wireframe-report.json` ([schema](schemas/wireframe-report.schema.json), [example](examples/stack-greybox/wireframe-report.json)) and validate it with `node scripts/validate-wireframe.mjs <report>` from the package root.
Report each check as `PASS`, `FAIL`, `NOT_RUN` or `BLOCKED` with the command. No browser or WebGL → browser is `BLOCKED` or `NOT_RUN`, never `PASS`.
Real device, usability, fun and business stay `not_run` unless observed with people. Tests written are not tests passed.
For GLB work, verify cold-cache requests, parse reuse, transition/retry/disposal behavior and production asset output.
Dynamic import or screenshots alone do not prove lazy loading. Link logs through existing evidence fields or the blueprint;
do not extend the report schema. Report removed eager paths (or none), screen triggers, cache policy and unexecuted host checks.

For UI-only work, update an existing compatible report without changing its level or declaring new ECS readiness.
If the existing game has no compatible prototype report, record commands, visual status, and gaps in the blueprint;
do not invent a fidelity level or an ECS implementation merely to fit the schema.

## Scope

- Local code only. No deploy, publish, purchase, account, analytics or server unless explicitly requested.
- No fonts, licensed art or audio are fetched or bundled; list sources for the user to obtain.
- Existing files in `TARGET_DIR` are never overwritten by the scaffold; adapt in place instead.
- Physics is a separate adapter, not the ECS. Add it only when the rules need contacts or stacking; see [ECS and session](references/ecs-session.md).
