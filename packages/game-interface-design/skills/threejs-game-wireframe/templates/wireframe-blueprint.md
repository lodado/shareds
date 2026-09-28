# Wireframe blueprint — <game>

- Plan source: <file or conversation reference>
- Target: <TARGET_DIR> · host: <Vite DOM | React | R3F | Next.js> · level: <LAYOUT_ONLY | FLOW_PROTOTYPE | PLAYABLE_GREYBOX>
- Filled defaults: <each gap filled without the user, labeled reversible>

## Goal and exclusions

- Question this prototype answers:
- Excluded: <art, audio, meta, persistence, server, ...>

## Real and simulated

| Behavior | Real / simulated / absent | Owner |
| -------- | ------------------------- | ----- |

## Rules

| ID  | Rule | System | Headless test |
| --- | ---- | ------ | ------------- |

## Public operations

`dispatch`, `advance`, `pause`, `resume`, `getSnapshot`, `subscribe`, `renderFrame`, `dispose` — list additions and why.

## System order

1. <system> — reads / writes / structural changes

## Placement

| Path | Owns |
| ---- | ---- |

## GLB asset plan

- GLB usage: <none, or existing assets/own-generated fixtures and provenance; no loader required for shapes-only>
- Decide before implementation. Resolve only the current screen/scene/selection; speculative cross-screen prefetch is off.

| Screen/scene   | Condition           | Required GLB                                       | Load trigger                           | Fallback                                                   | Cache/disposal owner                        |
| -------------- | ------------------- | -------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| <e.g. 2D home> | <current selection> | <none, or IDs/URLs and dependent buffers/textures> | <entry/selection that needs the model> | <loading/error/retry/exit; optional decoration substitute> | <source cache / instance / final GPU owner> |

- Immediately possible models: <required enemies/obstacles and why; no per-frame frustum load/unload>
- Readiness and lifetime: <play gate, scene/selection generation, pending/shared consumer release, partial-failure retry>
- Cache policy: <existing host cache/key, finite idle limit/eviction rule, active-consumer protection, warm re-entry behavior>
- Eager-path audit: <actual removed paths or none; URL import versus download; monolithic GLB split work if needed>
- Evidence: <cold-cache URL/parse logs, production manifest/bundle check, race/retry/disposal tests, unexecuted host cases>

## Verification plan

| Check | Command | Expected |
| ----- | ------- | -------- |

## Code visual design

- Scope: <HUD/menu components and states; preserve/change; explicit polish exclusions with reason>
- Direction: <approved/reused or proposed; source captures/URLs; observed adopt/reject rationale>
- Foundations: <existing tokens and component paths; only necessary additions>
- Pilot: <screen + key state; real copy; fixed viewport/state for comparison>
- Browser review: <mobile/desktop sizes and states; before/after capture paths; top fixes and regressions>
- Visual status: <PASS | FAIL | NOT_RUN | BLOCKED | N/A; evidence/reason and remaining gaps>

## Levels and decision evidence

- Progression: <STAGED / ENDLESS / N/A and reason; existing L-ID setup/units/pressure boundaries, R-ID and experiment links>
- Blockout checks: <placement/reachability/clearance/solution or survival strategy; randomness limits; run evidence or not_run>
- Decisions: <choice → inspected source title/section/link and observation → application → relevant alternative/trade-off → validation/revision trigger>
- User-facing summary: <important new/changed decisions shown before edits and after checks; facts vs proposals vs observations>
