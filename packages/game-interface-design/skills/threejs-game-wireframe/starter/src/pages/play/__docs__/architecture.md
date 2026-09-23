# Play page architecture

Fidelity: `PLAYABLE_GREYBOX`. Rules, scoring, failure and restart are computed by the ECS; nothing is simulated or faked.

## Layers and owners

| Path                                            | Owner of                                                          | Must not                                       |
| ----------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------- |
| `app/entrypoint/bootstrap.ts`                   | mounting, HMR teardown                                            | hold game rules                                |
| `pages/play/index.ts`                           | public API: `mountPlayPage` only                                  | re-export model internals                      |
| `pages/play/ui/play-page.ts`                    | frame loop, visibility, resize, teardown order                    | write components                               |
| `pages/play/ui/game-hud.ts`                     | DOM HUD from `HudSnapshot`                                        | read entities                                  |
| `pages/play/ui/input/pointer-controls.ts`       | tap/Space → `SessionCommand`                                      | decide rule outcomes                           |
| `pages/play/ui/three/game-view.ts`              | meshes, camera, GPU resources, context loss                       | feed poses back to rules                       |
| `pages/play/model/game-session.ts`              | public operations, pause reasons, run id, snapshot, interpolation | touch DOM, Three.js, time or storage           |
| `pages/play/model/ecs/*`                        | world, components, systems                                        | import anything outside `model/` and `config/` |
| `pages/play/model/runtime/fixed-step-driver.ts` | wall time → fixed step count                                      | call `requestAnimationFrame`                   |
| `pages/play/config/game-rules.ts`               | tuning values                                                     | contain logic                                  |

No `shared` layer: nothing is reused yet. FSD entities (business nouns) are not ECS entities (numeric ids in `World`).

## Public operations

`createGameSession(rules)` returns `dispatch`, `advance`, `pause`, `resume`, `getSnapshot`, `subscribe`, `renderFrame`, `dispose`.
UI never calls `stepWorld`, never adds components and never reorders commands.

## System order

Fixed in `model/ecs/step-world.ts` (`stepWorld`). One step:

1. `consumeCommands` — reads `commands`, `status`; writes `status`; start spawns the first block. Several drops in one step count once.
2. `moveSystem` — reads `moving`, `pose`; writes `pose`, `moving.dir`.
3. `resolveDropSystem` — only on a drop; reads `moving`, `pose`, `size`, `topId`; structural change: removes `moving`, adds `placed` or `falling`, trims `size`, spawns debris; writes `score`, `combo`, `status`, `events`.
4. `spawnSystem` — reads `status`, `topId`, `score`; spawns the next moving block.
5. `fallingSystem` — reads `falling`, `pose`; despawns below the floor.

After the step the session drains `events` into `HudSnapshot.lastEvent`.

## Time

- Fixed step `stepMs` with an accumulator; at most `maxCatchUpSteps` per call, excess time is dropped.
- Pause is a set of reasons (`user`, `hidden`, `context-lost`); play resumes only when the set is empty.
- The first delta after a resume is discarded because it spans the pause.
- Rendering interpolates between the previous and current pose with `alpha`; rules never read interpolated values.

## Lifecycle

- `restart` creates a new `World` and increments `runId`; input tagged with an older `runId` is ignored.
- Input while paused is discarded.
- `mountPlayPage` returns an idempotent teardown: cancel rAF → observers → listeners → subscriptions → HUD → view (materials, shared geometry, renderer) → session.
- Materials are per mesh and freed with the mesh; the unit box geometry is shared and freed once.

## Verification

- Headless: `npm test` (rules, time, pause, restart, isolation, snapshot identity, core import/global boundary).
- Types: `tsconfig.core.json` compiles `model` and `config` without the DOM lib.
- FSD: `npm run check:fsd` (Steiger, plus allowed and violation fixtures).
- Browser: `npm run test:e2e` (real taps, pause, failure, retry, hidden tab, small screen and resize).
- Not covered: real devices, frame-time budgets, fun and usability.
