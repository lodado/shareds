# Runtime GLB regression fixture

Run from the `game-interface-design` package root:

```sh
node scripts/verify-asset-loading.mjs
```

The runner copies the existing starter into `.test-tmp/asset-loading/run-*`, installs its locked dependencies, generates
four valid triangle GLBs and a 1×1 PNG from coordinates/pixels, builds, and runs Chromium against **production preview**.
No external model/image/decoder is downloaded. No generated binary or loader is added to the shapes-only starter.
The local package manifest declares only the same Three.js/Playwright versions for source lint; installation uses the
starter's existing lockfile, not a second dependency graph. Chromium must already be available to Playwright.

## What runs

- A separate URL-only registry imports emitted GLB URLs. A 2D home needs none; Play needs the chosen character + map;
  skin detail needs only the skin. Two-consumer controls exist solely to exercise shared ownership.
- Real GLTFLoader parsing, scene clones, WebGL rendering, instance-owned material copies and a shared source cache.
  Pending/active leases protect resources; retain at most **two idle sources**, evict least recently used idle entries.
  Exit releases claims; stale completions cannot attach. Retry preserves healthy entries and removes failed ones.
- Geometry is an embedded BIN chunk; each GLB references `../models/pixel.png`. Required texture failure rejects readiness
  even when GLTFLoader returns a model without its texture. This fixture knows its one required texture; it is not a
  general validator or an AssetManager to copy into every game.
- Thirteen browser cases cover the ten skill requirements plus both A/B completion orders, pending-consumer release,
  instance material isolation, safe error exit and missing-texture retry. Each test has a fresh context with service workers
  blocked; request listeners attach before navigation. The warm-reuse case deliberately stays within one context.
- Request starts are observed by Playwright; parse counts wrap the actual installed `GLTFLoader.parse` boundary, not
  `loadAsync` completion. Resource counts inspect real source/instance objects; disposal counts observe their `dispose`
  events. Test-only diagnostics never enter the ECS/session API. The runtime renders actual meshes, not labels posing as models.
- Build checks map all four source GLBs through the Vite manifest, compare emitted bytes, and reject those fixture bytes
  as base64/byte arrays or fixture JSON in JS. `assetsInlineLimit: 0` preserves external files even though fixtures are tiny.
  These checks cover this URL-import build, not arbitrary payload obfuscation in another application's bundle.

## Evidence and limits

Each run retains its command log, generated source/build, manifest and `asset-results.json` (request/resource observations
are test attachments). Its temporary `node_modules` is removed after success or failure. Old evidence directories may be
deleted once no longer needed. Assertions cover logical resource counts and renderer counters, not measured GPU bytes.

This is a controlled **vanilla Three.js fixture**, not a user game or agent-behavior evaluation. R3F/React Strict Mode,
Next.js/SSR, real PWA precaching, external `.bin` dependencies, compressed/skinned models and real-device performance are
not executed here. GLB buffers, an external texture, scene selection and late results after screen exit are exercised;
the pagehide renderer teardown is not a separate browser assertion. No before/after transfer-size improvement is claimed.
