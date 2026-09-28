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

## Async scene lifetime (GLB only)

- Follow [runtime GLB loading](asset-loading.md). The render host uses a scene/selection generation distinct from `runId`:
  leaving a screen, replacing its selection or disposing it invalidates pending attachments and error UI updates.
  Check the generation after every async boundary before connecting the result; an old result never changes the new scene.
- Track pending and mounted consumers. Release each claim once, including stale completion, failure and unmount. Do not
  cancel another consumer's shared request. Unsupported loader cancellation falls back to ignoring/releasing stale results.
- Keep the existing session API and independent pause reasons. Required assets gate play in the host; a completed load
  must not override user/hidden/context-lost pause state. Loading/parsing does not belong in the ECS or fixed-step loop.

## Teardown

- One owner per resource: rAF handle, event listeners, `ResizeObserver`, pointer capture, session subscriptions, physics bodies,
  Three.js geometry, material, texture and render targets.
- `dispose()` is idempotent and runs in reverse creation order.
- Removing a mesh from the scene frees nothing on the GPU. Dispose only resources exclusively owned by that instance.
  Shared geometry/material/texture is disposed once by its owner after the final consumer releases it and the finite
  idle-cache policy evicts it; a view teardown alone is not proof that no other consumer exists.
- Distinguish parsed source, screen instance and GPU resource ownership. Cache eviction is not GPU disposal. Reuse a cached
  source with separate instances, and clone shared materials before local mutations. Pending consumers also prevent eviction.
- React Strict Mode double-mounts in development, Vite HMR re-runs modules, and R3F remounts on key changes.
  Mount → unmount → mount must leave exactly one loop and one set of listeners. Wire `import.meta.hot.dispose` in the entry.
- `webglcontextlost`: `preventDefault()` and pause with `context-lost`; `webglcontextrestored`: resume.
