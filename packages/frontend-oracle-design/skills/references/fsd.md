# FSD (Feature-Sliced Design) contract

Apply this only when the target repo is already FSD or the adoption of FSD in a greenfield is
approved. This document does not force FSD — it becomes the criterion for those structural decisions
when an architecture document that passed the approval gate of `architecture-contract.md` adopted
FSD. If the repo's explicit convention differs from this document, follow the repo convention and
record the reason. The reference version is FSD v2.1 ([fsd.how](https://fsd.how),
[feature-sliced/skills](https://github.com/feature-sliced/skills)).

## Layers and import direction

- The standard layers: `app → pages → widgets → features → entities → shared`.
  An upper layer imports only lower layers. Reverse imports are forbidden.
- Do not import another slice of the same layer. For conflict resolution, follow
  "Cross-import resolution".
- **New adoption of the widgets layer is discouraged** (v2.1). A UI block usually contains user-flow
  logic and overlaps in responsibility with features. Put screen-only composition in pages, actions
  that several pages reuse and their UI in features, common UI with no business context in
  `shared/ui`, and the app-wide layout in app. A repo that already uses widgets keeps its existing
  convention.
- The minimal composition `app + pages + shared` is also valid FSD. Add features·entities only when
  an actual call site appears, and do not create empty layers·slices·segments.
- `shared` is composed directly of segments without slices (`shared/api`, `shared/ui`,
  `shared/lib`, `shared/auth`, `shared/config`). Segments inside shared may import one another. The
  app-wide fetch wrapper·api client is not placed outside the layers but owned by `shared/api`.
- Next.js uses the `app/`·`pages/` folder names for routing, so they conflict with FSD layers.
  Following the official convention, rename the FSD layers to `_app/`·`_pages/`, record it in the
  architecture document, and use it consistently. A route file (`app/**/page.tsx`) only
  re-exports·assembles the FSD `_pages/` slice and pushes the logic down into the slice.
- If Steiger is used alongside, the default `fsd/typo-in-layer-name` rule may see `_app`·`_pages` as
  typos. If this Next.js convention is approved, turn off only that rule as in the bootstrap config
  below and leave the structural reason in the architecture document.

## Extraction judgment — Pages-first

- **"Start simple, extract when needed."** Put new code first in the `pages/` slice that uses it.
  Duplication across pages is allowed and is not a reason for automatic extraction.
- Move it down to a lower layer only when all three extraction conditions hold: the same code is
  **currently** actually used in two or more places, the call sites do not always change together,
  and the boundary's responsibility is clear. Do not extract for hypothetical reuse.
- A feature·entity that only one page uses stays in that page
  (Steiger `insignificant-slice`).
- Use entities conservatively. FSD without entities is also valid. Put CRUD in
  `shared/api` and the auth token·session·login DTO in `shared/auth` (or `shared/api`)
  — do not create a user entity because of auth data.
- Split a god slice whose responsibility is excessively wide into focused slices
  (for example `user-management` → `auth`·`profile-edit`).

## Slices and segments

- A slice is a business domain unit and is the folder directly under a layer.
- The standard segments are only `ui`, `model`, `api`, `lib`, `config`.
  **`components`, `hooks`, and `utils` are not FSD segments.**
  - Put components and view-logic hooks in `ui`.
  - Put state·business-logic hooks, stores, and query keys/options in `model`.
  - Put transport, DTO conversion, and request functions in `api`.
  - Put pure computations·helpers in `lib`.
- A hook that owns an interaction workflow (for example a mutation hook) belongs to `model`.
  Do not create a `hooks/` folder and mix model and ui responsibilities.
- Name files inside a segment on a domain basis (`model/user.ts`,
  `api/fetch-profile.ts`). A technical-role name such as `types.ts`·`utils.ts`·`helpers.ts`
  mixes unrelated domains into one file and is forbidden.

## Public API

- Each slice exposes its public API through a single `index.ts`. External consumers (including an
  upper layer's route·widget) do not deep import a path inside a slice.
  `@/features/x/ui/Foo` is forbidden, only `@/features/x` is allowed.
- The index exports only the minimal surface the outside actually uses. Do not export internal lib
  functions·test-only helpers out of inertia.
- shared does not create a top-level `shared/index.ts` but has a per-segment public
  API (`shared/ui/index.ts`, `shared/api/index.ts`, and so on).
- Do not mix server-only code into the client public API. Move the contract types the client uses
  into a module owned by `shared` (or approved entities), and keep client code from importing a
  server domain module directly. Add an environment-specific entry such as `index.server.ts` only
  when a single `index.ts` cannot hold the runtime boundary.

## Cross-import resolution

A cross-import within the same layer is a code smell. If you introduce one, you must record the
reason in the architecture document.

- **entities**: consider merging the boundaries first. The `@x` notation is a last resort for when
  merging is truly impossible, not a recommended pattern.
- **features**: use whichever of the four strategies fits the situation — A) merge the slices (if
  they always change together), B) demote the shared domain logic to entities, C) compose at an
  upper layer (pages·app) with render props·slot·DI (IoC), D) if unavoidable, access only through
  the other slice's `index.ts` public API. `@x` is entities-only.

## Server code placement

- In full-stack Next.js, one domain's server logic (service, repository port·adapter,
  validation·recomputation) is not pulled out to an `src/server/` root outside the layers. Put it in
  the `api` segment of the slice that owns that domain.
- A server-only module marks its boundary with a `server-only` import and is not mixed into the
  client public API (`index.ts`). Expose the entry point for server consumers through a separate
  entry such as `index.server.ts` or `<slice>/api/server.ts`.
- A route handler (`app/api/**/route.ts`) and RSC only assemble·forward, and call the slice `api`
  for domain logic.
- Put only infrastructure that several slices actually share, such as the DB
  client·connection·container, in `shared/api`.
- Keep DB driver·ORM imports and query execution only inside the db infrastructure of `shared/api`
  (client·migration·seed) and the repository of each slice's `api`. The repository owns
  mapping·keyset pagination·hasNext judgment, and a route handler·RSC·`ui`·`model` does not import
  the driver directly.

## Test·mock placement

- A scenario·Playwright test that cuts across several segments: `<slice>/__test__/`.
- A unit·component test confined to one segment: that `ui|model|api|lib/__test__/`.
- Colocation next to the source file and concentration in a root `e2e/`·`mocks/` are forbidden.
  Follow a different location only when the repo explicitly enforces it, and record the reason.
- MSW handlers and example data: `<slice>/api/__mocks__/` if only one segment uses them,
  `<slice>/__mocks__/` if they cut across several segments, and raise them to an upper layer only
  when several slices actually share them.
- Put the MSW wiring (`setupServer`·`setupWorker`) in `shared/config/msw` but do not include
  handlers there. The owning slice exports the handlers and the wiring only assembles them.

## Greenfield bootstrap

- Create only the approved layers and record the path alias (`@/*` and the like) mapping in the
  architecture document.
- If there is no import-boundary verification, **propose** adopting one. Reuse that preset only when
  the target workspace already uses `@lodado/eslint-config` and can actually resolve
  `@lodado/eslint-config/fsd`. Do not recommend installing this internal workspace package into an
  external repo.
- Otherwise use Steiger (the official FSD linter) or an equivalent
  `eslint-plugin-boundaries`·`import/no-internal-modules` rule. For Steiger, the runner and the
  FSD plugin are separate packages.

  ```bash
  pnpm add -D steiger @feature-sliced/steiger-plugin
  ```

  If you use the `_app`·`_pages` convention in Next.js, the minimal config is as follows.

  ```js
  // steiger.config.js
  import fsd from '@feature-sliced/steiger-plugin'
  import { defineConfig } from 'steiger'

  export default defineConfig([...fsd.configs.recommended, { rules: { 'fsd/typo-in-layer-name': 'off' } }])
  ```

  Record `pnpm exec steiger ./src` as the structural verification command.
  After user approval, add it as a devDependency and include it in the GREEN gate's structural
  verification command. Do not add it without approval.

- If the user's global rules or the repo instructions recommend a different folder structure (for
  example a `components/`, `hooks/`, `lib/` organization) and conflict with FSD, do not compromise
  arbitrarily. Ask the priority with `NEEDS_DECISION`, record the approved decision in the
  architecture document, and then proceed.

## Example — full-stack Next.js list + likes

```text
src/
├── app/                      # Next routing only — page.tsx·route.ts assemble only
├── _pages/product-list/      # page-only composition (not widgets)
│   ├── model/useProductsInfinite.ts
│   ├── ui/                   # List·Skeleton·Empty·Error·LoadMoreSentinel
│   ├── api/                  # list GET + cursor (here if used once)
│   └── __test__/
├── entities/product/         # only what several consumers really share
│   ├── model/product.ts      # domain file name — types.ts forbidden
│   ├── api/product.repository.ts   # server-only
│   ├── api/__mocks__/
│   └── ui/ProductCard.tsx
├── features/product-like/
│   ├── api/like.repository.ts      # server-only
│   ├── api/likeApi.ts + __mocks__/
│   ├── model/useToggleLike.ts + likeCachePatch.ts
│   ├── ui/LikeButton.tsx
│   └── __test__/             # scenario across segments
└── shared/
    ├── api/httpClient.ts + db/     # driver·client·migration·seed
    ├── auth/
    └── config/msw/           # setupServer wiring only, no handlers
```

## Common violations

| Violation                                                         | Correction                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------- |
| An upper layer deep imports a file inside a slice                 | import only through the slice `index.ts` public API      |
| `features/<slice>/components\|hooks\|utils` segment               | relocate to `ui`·`model`·`lib`                           |
| A client hook imports a server domain module directly             | move the contract type to shared/entities                |
| The index exports even internal implementation functions          | keep only the external usage surface and remove the rest |
| Tests colocated next to the source                                | move to the slice·segment `__test__/`                    |
| The fetch wrapper floats outside the layers (`src/lib` and so on) | move to `shared/api`                                     |
| Server domain code floats in `src/server/` outside the layers     | move to the owning slice's `api` segment                 |
| Single-use code extracted early into a feature·entity             | return it to the page slice that uses it                 |
| `model/types.ts`·`utils.ts` technical-role file names             | change to domain-based file names                        |
| New adoption of the widgets layer                                 | route it to pages·features·shared·app                    |
| CRUD·auth tokens promoted to entities                             | keep them in `shared/api`·`shared/auth`                  |
