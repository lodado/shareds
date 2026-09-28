# Runtime GLB loading

Applies only when the implementation uses GLB assets. Basic-shape prototypes keep their existing geometry and need no
model loader, registry or external assets. Lazy loading here means **runtime download and parsing**, not reading skill documents.
Preserve the existing host and FSD placement: rendering/loading belongs in the page's `ui/three` boundary, declarative
asset configuration in `config` when useful. Keep loaders, Promises, parsed models and Three.js objects outside `model/ecs`.
Reuse the host's existing loader/cache before adding a small local helper; do not introduce a general AssetManager framework.

## Demand and registry

- Use a small side-effect-free registry or resolver containing IDs, URLs and necessary metadata only. Importing it must
  not fetch or parse assets. Resolve the required set from the current screen, scene, selected character and selected map.
- A 2D home requests zero GLBs. A 3D home requests only its displayed models; play requests the selected character and
  current map's required models; skin detail requests only the displayed skin. Unvisited screens, unselected characters
  and other maps must not download or parse. Selection alone is not a load trigger if that screen does not display a model.
- Request cache misses only. Required files for the current scene may load in parallel with `Promise.all` or the host's
  equivalent; serializing the entire catalog is not lazy loading. Reuse both in-flight requests and completed parse results.
- Speculative cross-screen prefetch is disabled by default. Loading required assets after the user commits to entering
  the selected screen is allowed; this is not permission to preload possible next screens.
- Demand is scene/interaction scoped, not per-frame camera visibility. Document immediately possible enemies/obstacles
  as required assets; do not load/unload whenever an object crosses the frustum.
- If the catalog is packed into one giant GLB, describe the necessary screen/use-case file split and remaining blocker.
  Downloading the entire file and using a few nodes is not lazy loading.

## Audit eager paths

Trace entrypoints, generated model modules, mounted screens and production build/PWA settings. Remove unnecessary eager
paths in the target implementation and report the actual findings, including “none found” where appropriate:

- App initialization calling `loadAsync`/`Promise.all` for the catalog, or `preloadAll` iterating every registry entry.
- Global `useGLTF.preload` / `useLoader.preload`, including top-level preload side effects in generated model files.
- Mounting every screen/model and hiding with CSS or `visible=false`; dynamic imports that still load the full catalog.
- Passing the full model URL array to `useGLTF` / `useLoader` instead of the current required set.
- Service worker/PWA precache of all GLBs or their external dependencies, and GLB binaries inlined into initial JavaScript.

Do not ban static asset imports that only produce URL strings. Distinguish **URL declaration → JS chunk loading → GLB
download → parsing → instance creation/GPU upload**. Inspect emitted URLs, bundle content and real requests; neither an
`import` keyword nor a missing `.glb` request alone proves eager or lazy loading. See [verification](verification.md).

## Readiness, errors and transitions

- The render host owns loading/error UI separately from the gameplay HUD snapshot. Start/resume the relevant play only
  when required models and their dependent buffers/textures are ready. Do not activate invisible enemies or obstacles.
  Optional decoration may start with an explicitly recorded substitute shape/image; collision-relevant visuals are not decoration.
- Provide accessible loading and error status, retry and safe exit. If total bytes are unknown, use indeterminate loading,
  not a fabricated percentage. A multi-file progress indicator must not treat one file's progress as the whole scene.
- Keep successful assets on partial failure and retry only missing/failed assets for the still-current selection.
  Preserve per-asset results even when a parallel `Promise.all` rejects. Check required dependency failures as well as
  the outer loader Promise: a loader may resolve a model with a missing texture rather than reject the entire model.
  Remove rejected in-flight entries so a failed Promise cannot permanently block retry; reset the host's error boundary
  as needed using supported APIs. A late failure from an old screen must not replace the new screen's UI.
- Capture a scene/selection generation at acquisition and check it immediately before attaching results. Invalidate it on
  exit, disposal or selection change. The session's `runId` protects game runs, not every screen/selection transition.
  Stale results release their consumer claim and follow the cache policy; they never attach to a destroyed or newer scene.
- Cancel only when the installed loader actually supports it and no other consumer needs the request. Ignoring stale
  results is still required. Do not invent `AbortSignal` parameters or cancel a shared request on one consumer's exit.

## Cache and ownership

- Reuse the installed host cache. Define its scope/key (asset URL/ID and relevant loader options) and a **finite idle-cache
  policy** in the blueprint: for example a small count-bounded least-recently-used set. Pick one policy appropriate to the
  project, not a configurable caching framework. Active working sets may exceed the idle limit; do not evict active assets.
- Count waiting consumers as well as attached instances. Acquire before awaiting; release once on exit/failure/staleness.
  Cleanup must be idempotent under Strict Mode, repeated exits and out-of-order completion. An unused pending result must
  enter the same bounded policy when it settles, not become an immortal orphan.
- Distinguish parsed source/cache ownership, per-screen instances and shared GPU resources. Never attach the same `scene`
  object in multiple places. Create independent instances; confirm the installed version's skeleton-aware clone support
  for skinned models. Clone a material when a screen must mutate it; do not silently change another consumer's material.
- Instance removal detaches that instance and frees only what it exclusively owns. Shared geometry/material/texture stays
  alive while any consumer uses it, including sharing across different cached models. Final unused resources are disposed
  once by their owner. Release animation/mixer or CPU image resources too when the chosen loader/model actually owns them.
- Cache removal and GPU `dispose()` are separate operations. Clearing a loader cache does not prove GPU memory was freed;
  unmounting a component does not authorize disposal of shared cached resources. Verify R3F's actual automatic disposal
  behavior and ownership for the installed version rather than applying a blanket unmount cleanup.
- Avoid both “dispose everything on every exit” and permanent retention of every visited model. Verify warm re-entry reuse
  and bounded resource counts after repeated transitions. GLB file size is transfer size, **not GPU memory usage**.

## Host integration

Use [render/input bridge](render-input-bridge.md) for vanilla, React/R3F and Next.js boundaries, and
[time/lifecycle](time-lifecycle.md) for teardown. Confirm loader, clone, cancellation and cache APIs against the installed
versions before implementation; do not add React/R3F/Next.js just to follow an example.
