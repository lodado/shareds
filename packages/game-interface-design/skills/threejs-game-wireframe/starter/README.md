# Stack greybox starter

Vite + TypeScript + Three.js with a DOM HUD. One FSD page slice (`pages/play`) holds a headless ECS core in `model/`.
Copied by `create-wireframe.mjs`; see `src/pages/play/__docs__/architecture.md` for owners, system order and lifecycle.

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # headless rules, no browser, no install needed on Node >= 22.18
npm run typecheck    # app + DOM-free core
npm run check:fsd    # Steiger + fixture proof
npm run build
npm run test:e2e     # Playwright, mobile Chromium
```

Swap the game by replacing `config/game-rules.ts` and the systems in `model/ecs/step-world.ts`; keep the session's public operations.
No fonts, art or audio are bundled.
