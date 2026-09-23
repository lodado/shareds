# Time and lifecycle

Based on [Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/).

## Time

- Fixed simulation step (for example 1/60 s) with an accumulator. `advance(elapsedMs)` returns nothing to the caller except state changes.
- Clamp catch-up steps per call. Time beyond the clamp is dropped, not queued.
- Ignore zero, negative and non-finite deltas.
- Absorb float error so different delta splits of the same wall time give the same step count.
- Render interpolation (`alpha`) is presentation only. Rules never read interpolated values.

## Pause

- Pause is a set of reasons: `user`, `hidden`, `context-lost`, `ad`, `modal`. Play resumes only when the set is empty.
  A user resume never overrides `hidden`.
- Input arriving while paused is discarded, not replayed on resume.
- The first wall delta after a resume spans the pause; discard it.
- `visibilitychange` → `pause('hidden')` / `resume('hidden')`. rAF stops in hidden tabs; do not rely on it for pausing.

## Runs

- Restart creates a fresh world and increments `runId` (epoch). Commands, timers and async callbacks carry the `runId` they were created for;
  the session ignores stale ones.
- Restart discards queued commands, events and debris. No leftover entity, listener or timer from the previous run.

## Teardown

- One owner per resource: rAF handle, event listeners, `ResizeObserver`, pointer capture, session subscriptions, physics bodies,
  Three.js geometry, material, texture and render targets.
- `dispose()` is idempotent and runs in reverse creation order.
- Removing a mesh from the scene frees nothing on the GPU. Dispose its per-mesh material and geometry; dispose shared geometry or textures once, at view teardown.
- React Strict Mode double-mounts in development, Vite HMR re-runs modules, and R3F remounts on key changes.
  Mount → unmount → mount must leave exactly one loop and one set of listeners. Wire `import.meta.hot.dispose` in the entry.
- `webglcontextlost`: `preventDefault()` and pause with `context-lost`; `webglcontextrestored`: resume.
