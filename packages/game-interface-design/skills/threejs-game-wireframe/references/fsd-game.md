# FSD for games

Adapted from `frontend-oracle-design/skills/references/fsd.md` and the official
[layers](https://feature-sliced.design/docs/reference/layers), [slices and segments](https://feature-sliced.design/docs/reference/slices-segments)
and [public API](https://feature-sliced.design/docs/reference/public-api) references.

## Placement

```text
src/
  app/entrypoint/bootstrap.ts      mount, HMR teardown, global styles
  pages/play/
    index.ts                       public API: the mount entry only
    ui/                            page, HUD, input/, three/
    model/                         session, ecs/, runtime/
    lib/physics-adapter.ts         only when rules need a physics engine
    config/game-rules.ts           tuning values
    __test__/                      cross-segment and browser scenarios
    __docs__/architecture.md
```

- The minimal `app + pages` composition is valid FSD. Create no empty layers, slices or segments.
- Segments are `ui`, `model`, `api`, `lib`, `config`. No `components`, `hooks`, `utils`, `ecs` or `managers` segments or layers.
- `model/ecs` is a folder inside the `model` segment, not a layer.
- FSD entities (business nouns such as `player-profile`) are not ECS entities (numeric ids in a `World`). Do not create an FSD entity per ECS component.
- `shared` holds only business-agnostic code (math helpers, a generic button). Merge scores, fail lines, spawn tables stay in the page slice.
- No empty `api` segment for a server that does not exist.

## Growth

- A second screen that needs the same rules (a daily-challenge page, a replay viewer) is the trigger to move rules to `features/<game>`
  or `entities/<noun>`. Hypothetical reuse is not.
- Pages never import another page. Compose in `app` with explicit inputs, or move the shared piece down.
- No global event bus or cross-slice store to hide coupling between slices.

## Public API

- `pages/play/index.ts` exports only what `app` assembles, usually one mount function or component.
- Internal modules import each other by relative path, never through their own `index.ts`.
- Headless tests import model modules by relative path. They do not force the UI barrel to export internals.

## Hooks (React hosts)

Place by responsibility, not by name. Subscribing to the session, dispatching commands and deriving read models → `model`.
Canvas mount, focus, pointer capture and DOM measurement → `ui`. A hook that does both is split.

## Next.js

Next's `app/` and `pages/` routing folders collide with FSD layer names. Follow the repo's existing approved convention
(for example `_app`/`_pages`), keep route files as thin re-exports, and check aliases and lint together.
If Steiger reports `fsd/typo-in-layer-name` for that convention, disable only that rule and record why in `architecture.md`.

## Checking

Reuse the repo's existing import-boundary tool. `@lodado/eslint-config/fsd` only when the workspace already resolves it.
Otherwise Steiger with `@feature-sliced/steiger-plugin` (`fsd/forbidden-imports`, `fsd/no-public-api-sidestep`, `fsd/public-api`
and the rest of `recommended`); confirm rule names against the installed version.
Prove the checker fires with one allowed and one violating fixture, as the starter's `check:fsd` does.
