# Render and input bridge

## Renderer

- Build with basic geometry and real buttons first. Art replaces meshes later without touching rules.
- Read `renderFrame()` each animation frame; create meshes for new ids, update pose and scale, dispose meshes whose ids disappeared.
- Presentation-only state (camera easing, particles, screen shake) lives in the view. Rules never read it.
- Visible and judged geometry must match. If the art is larger than the collider, say so in the blueprint; players judge by what they see.
- Effects must not hide the next decision: particles, shake and flashes stay off the drop zone and the danger line.
- Cap device pixel ratio (for example `Math.min(devicePixelRatio, 2)`); size the drawing buffer from the canvas box on resize.
- Official API reference: [three.js docs](https://threejs.org/docs/). Confirm names against the installed version.

## HUD

- DOM overlay by default: crisp text, real buttons, screen-reader output, focus styles, 44 px targets.
- Render from `HudSnapshot` only, skipping when the reference is unchanged. The HUD never sees entity ids or component writers.
- React: `useSyncExternalStore(session.subscribe, session.getSnapshot)` ([docs](https://react.dev/reference/react/useSyncExternalStore)).
  `getSnapshot` must return the same reference until something changed.
- Per-frame data (poses, particles) never goes through React state, Zustand or TanStack Query.

## R3F hosts

- Keep the session outside React state; create it in a ref or a mount effect that also disposes it.
- `useFrame` calls `session.advance(delta * 1000)` once (in one owner component) and mutates refs; it never calls `setState`
  ([R3F pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls)).
- Reuse geometries and materials across instances; `<instancedMesh>` for many identical blocks.

## Input

- Pointer events on the canvas; `touch-action: none` on the canvas only. Primary pointer and left button only.
- Map input to commands tagged with the current `runId`. The session decides outcomes.
- HUD buttons sit outside the canvas so their taps never reach the field. Keyboard shortcuts skip when a button has focus.
- Record per action: when input is committed, first visible response, rule result, cancellation path. Timings are hypotheses until measured on a device.
