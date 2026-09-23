# ECS and session

The ECS owns game rules. The session wraps one `World` and is the only thing the UI touches.
Game-state ownership follows [Game Programming Patterns](https://gameprogrammingpatterns.com/) (game loop, update method, command, component, event queue):
time, state, commands, events, object lifetime and presentation each have one owner.

## Choosing an implementation

| Option                                                | License (checked 2026-09)     | Fits                                                                    |
| ----------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------- |
| Map-per-component world (starter)                     | yours                         | tens of entities, few queries; runs under `node --test` with no install |
| [Miniplex](https://github.com/hmans/miniplex) 2.0     | MIT; last npm publish 2023-07 | object entities, `world.with('a','b')` queries, React bindings          |
| [bitECS](https://github.com/NateTheGreatt/bitECS) 0.4 | **MPL-2.0**                   | thousands of entities, structure-of-arrays, `query(world, [A, B])`      |

Record the choice and reason in `architecture.md`. Confirm the installed version's API before writing systems; bitECS 0.3 and 0.4 differ.
MPL-2.0 is file-level copyleft: note it for the user before shipping modified bitECS files.

## Session contract

```ts
interface GameSession {
  dispatch(command: SessionCommand): void // input → queued command, tagged with runId
  advance(elapsedMs: number): void // wall time → fixed steps
  pause(reason: PauseReason): void
  resume(reason: PauseReason): void
  getSnapshot(): HudSnapshot // immutable, same reference when unchanged
  subscribe(listener: () => void): () => void
  renderFrame(): readonly RenderBlock[] // interpolated poses for the renderer
  dispose(): void // idempotent
}
```

- Create per mount: `createGameSession(rules)`, plus `{ rng }` when rules need chance. No module-level world, singleton or static registry; two sessions must not affect each other.
- The UI never calls `stepWorld`, adds components, reads component maps or orders commands.
  If the UI needs to know "add component → update score → clear old command" order, the boundary is wrong — move that sequence into a system.
- Do not generate ports, wrappers or interfaces with one implementation just to look layered.

## System order

Decide order in one function (`stepWorld`). General shape; drop steps the game does not need:

1. consume commands (start, input) for the current run only
2. spawn and apply player actions
3. movement or physics step
4. collect judgment candidates (overlaps, merges, hits)
5. resolve conflicts and commit structural changes (add/remove components, despawn)
6. score and progression
7. failure or completion
8. emit events and update the read model

For each system record reads, writes, preconditions and structural changes in `architecture.md`, in the same order.
A test fails when the documented order and the code diverge (the starter's package test does this).

## Determinism

- No `Date.now`, `performance.now`, `Math.random`, timers or globals inside the core. Time arrives as `advance(elapsedMs)`; chance arrives as an injected seeded RNG.
- Same seed and same command sequence per step → same result. This does not promise identical replays across devices or floating-point environments.

## Physics

ECS and a physics engine are different things.

- Simple overlap, stacking by arithmetic or grid moves: no physics engine.
- Contacts, rolling, settling, merging round bodies (Suika-like games): a physics engine behind `lib/physics-adapter.ts`.
  Do not delete collision, settling or merge-on-contact rules to make the prototype faster.
- The adapter steps the engine once per fixed step. One boundary reads body poses back into ECS components after the step;
  the ECS does not integrate velocity for bodies the engine owns.
- Merge candidates collected during contact callbacks are resolved in the resolution system, never inside the callback.
