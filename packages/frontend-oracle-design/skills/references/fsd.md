# FSD (Feature-Sliced Design) contract

Apply this only when the target repo is already FSD or the adoption of FSD in a greenfield is
approved. This document does not force FSD — it becomes the criterion for those structural decisions
when an architecture document that passed the approval gate of `architecture-contract.md` adopted
FSD. If the repo's explicit convention differs from this document, follow the repo convention and
record the reason. FSD supplies the layer/slice rules; the domain-design method below adapts
Matt Pocock's domain-modeling and deep-module heuristics, not additional official FSD rules.
Neither source approves product policy or a migration. See the pinned sources at the end.

## Domain boundary before folder structure

Treat a slice as a product/domain responsibility boundary, not a bucket for a technical file type.
High cohesion means the rules, state, effects, UI, tests, and mappings serving that responsibility
have a clear owner and can change together. Low coupling means other responsibilities need its
public contract, not its internal store, query keys, DTOs, or execution recipe. A legal import graph
is necessary structural evidence, not proof that the domains are well designed.

A business domain can involve several slices on different layers; one slice is not automatically
a DDD bounded context, backend service, database table, or aggregate. Layer chooses responsibility
level, slice chooses product meaning, segment organizes implementation inside that owner. Do not
duplicate domain state in every layer or add a `domains/` super-layer. A slice group is navigation
only: it grants no shared code, group public API, or sibling-import exemption.

Before choosing paths for an affected FSD boundary:

1. Start from the user capability and approved rules. Define ambiguous terms with examples: a
   shipping address and a billing address may share fields but have different invariants and
   lifecycles. Record unknown policy as `POLICY_GAP` → `NEEDS_DECISION`, not a guessed domain rule.
2. Trace the actual owner of each invariant, mutable state, query/cache, and effect through current
   callers. Distinguish observed coupling from approved ownership. Keep query/router/form state
   with its existing owner; do not introduce another store to make a slice look self-contained.
3. Compare keeping the existing boundary with a focused merge, local split, lower-layer extraction,
   or upper-layer composition. Use present consumers, co-change evidence, independent policy
   changes, and a concrete leak. Similar JSX or DTO shape alone does not imply one domain.
4. Sketch the consumer-facing contract before the folder tree. Identify what knowledge it hides,
   then map that responsibility to the smallest existing layer/slice/segment that can own it.

Record only material decisions in the existing `__docs__/architecture.md`, not a second domain
card or repository-wide glossary. Reuse the architecture gate; implementation refinements after
`VALID_RED` belong in the existing Implementation Decision. A compact boundary record can contain:

| Item                    | Evidence to record                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Capability and language | Product goal, domain terms, included responsibilities and explicit non-goals                                             |
| Invariants and owners   | Approved source/card rows; state, policy, cache, effects and lifecycle owner                                             |
| Public seam             | Actual consumers and exports; inputs, results/errors, visible side effects; hidden knowledge                             |
| Dependencies            | Directed caller → owner edges, layer mapping, external seam and any approved exception                                   |
| Change and verification | One evidenced change/removal path, consumers that stay unchanged, public behavioral test boundary and structural command |
| Rejected alternative    | Why a merge/split/extraction/wrapper costs more or violates ownership                                                    |

This is design evidence, not a new schema, numeric cohesion score, approval gate, or instruction to
fill every cell. Keep policy definitions in their existing approved source and cite them here.

### Deep public seam, not a barrel over internals

Adapt the deep-module idea to the slice's public API: offer useful domain behavior behind a contract
that needs less caller knowledge than the implementation it hides. Count concepts and required
ordering, not exports or lines of code. A single generic hook with mode flags and independent state
owners can be more coupled than several explicit actions.

- A payment consumer should express intent and observe approved outcomes, not decode provider DTOs,
  reconstruct query keys, or repeat cache invalidation steps. Keep mapping and workflow policy at
  their owner, while making error meaning, request count, retry/cancel behavior, and effects explicit.
- Use the deletion thought experiment: if removing a wrapper merely changes an import, it may be
  shallow; if callers must reconstruct domain rules or provider knowledge, it hides useful
  complexity. A small pure function or a required compatibility entry is not bad merely for being
  small. Do not actually delete approved boundaries as an experiment.
- For an external dependency, distinguish in-process collaborators from a local substitutable
  service, an owned remote service, and a third-party system. Use that distinction to locate the
  real test/translation seam, not to generate a port per dependency. Try the existing HTTP/query
  seam and a local mapper first. A current external knowledge leak can justify a local boundary
  even with one consumer; it does not automatically justify a new FSD layer or slice. See
  [the present-boundary exception](changeability.md#present-boundary-exception).

### Change walkthrough and behavioral verification

Use one actual requirement, approved upcoming change, or observed leak to challenge the proposed
boundary. For a transport-format change, trace the mapper/adapter and public contract tests while
unrelated consumers remain unchanged. For a domain-policy change, identify the one policy owner and
its affected UI/tests. For removal, identify the slice, its owned tests/mocks/docs, composition
call sites, and any remaining global registrations. Do not equate changed-file count with quality.

Preserve regression tests before a refactor. Test the slice's observable public behavior with real
in-process collaborators and control nondeterministic I/O at the nearest existing seam; do not mock
every internal hook or module to assert a call recipe. Internal pure-function unit tests remain
useful, but do not replace the boundary test that survives segment/file rearrangement. Cross-slice
journeys belong to the actual upper-layer composition owner. Keep assertions tied to approved
outcomes, errors, and side-effect counts, not provider implementation details.

Run the repo's existing import-boundary check as separate structural evidence. If unavailable,
record the verification gap and bounded import inspection; do not silently install a tool or claim
automated enforcement. Report a walkthrough as predicted impact, not measured lower coupling.

## Layers and import direction

- The standard layers: `app → pages → widgets → features → entities → shared`.
  An upper layer imports only lower layers. Reverse imports are forbidden.
- Do not import another slice of the same layer. For conflict resolution, follow
  "Cross-import resolution".
- **New adoption of the widgets layer is discouraged** in the current FSD guide, not forbidden.
  A UI block usually contains user-flow logic and overlaps in responsibility with features. Put screen-only composition in pages, actions
  that several pages reuse and their UI in features, common UI with no business context in
  `shared/ui`, and the app-wide layout in app. A repo that already uses widgets keeps its existing
  convention. A large reusable composition can justify widgets when these other owners do not fit.
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
- A feature·entity that only one page uses normally stays in that page
  (Steiger `insignificant-slice`). This limits layer extraction, not useful local policy or
  external-system boundaries inside the page.
- Use entities conservatively. FSD without entities is also valid. `shared/api` may own the HTTP
  client and business-agnostic endpoint bindings; transport reuse does not move domain validation,
  DTO-to-domain mapping, workflows, or cache policy out of their slice owner. Auth token/session
  plumbing can stay in `shared/auth` (or `shared/api`), but authorization and account-domain rules
  stay with their owner. Do not create a user entity merely because auth data exists.
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

- Each slice exposes its production public API through a single `index.ts`. External consumers (including an
  upper layer's route·widget) do not deep import a path inside a slice.
  `@/features/x/ui/Foo` is forbidden, only `@/features/x` is allowed.
- The index exports only the minimal surface the outside actually uses. Do not export internal lib
  functions·test-only helpers out of inertia or use wildcard exports to expose the whole slice.
  Internal modules use direct relative imports, not their own public barrel, to avoid cycles.
- shared does not create a top-level `shared/index.ts` but has a per-segment public
  API (`shared/ui/index.ts`, `shared/api/index.ts`, and so on).
- Do not mix server-only code into the client public API. Keep client-used domain contracts in a
  runtime-safe module at their existing owner and expose them through its public entry; move only
  genuinely context-free contracts to shared, or shared domain contracts to an approved entity.
  Keep client code from importing a server domain module directly. Add an environment-specific entry
  such as `index.server.ts` only when a single `index.ts` cannot hold the runtime boundary.
- When tests outside a slice need its MSW handlers, expose only those test assets through the
  repo's existing test-only entry, or `<slice>/__test__/index.ts` if a new entry is needed. This is
  an explicit exception to the single production entry, not permission for arbitrary deep imports
  or same-layer imports. Only tests or test/bootstrap tooling consume it; production modules and
  `index.ts` never import or re-export it. Keep the same layer direction for cross-slice assembly.

## Cross-import resolution

A cross-import within the same layer is a code smell, even through `index.ts`: the public API ban
on deep imports and the layer import rule are separate constraints. First repair ownership:

- **entities**: consider whether the responsibilities really belong together. Where distinct entity
  relationships genuinely require a cross-reference, `@x` is an explicit, narrow last resort, not a
  reason to merge unrelated domains or expose all internals.
- **features**: use whichever of the four strategies fits the situation — A) merge the slices (if
  they always change together), B) demote the shared domain logic to entities, C) compose at an
  upper layer (pages·app, or existing widgets) with explicit inputs/results, render props·slots,
  or an existing injection seam. Do not introduce a global event bus or shared store to hide the
  same coupling. `@x` is entities-only.

If none fits, the official cross-import guide permits a documented project trade-off, not automatic
permission. Before adding a new exception, use the existing architecture approval gate to record
the exact directed edge, why alternatives fail, minimal public export, cycle risk, existing lint
handling, and a removal/revisit condition. Public-API access alone does not approve that edge, and
this reference does not authorize relaxing lint. Keep the normal same-layer prohibition elsewhere.

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
- Put reusable MSW wiring (`setupServer`·`setupWorker`) in `shared/config/msw`, without importing
  higher-layer handlers. The owning slice exposes handlers through the test-only entry defined
  under Public API; its test or an
  upper-layer test/bootstrap composes them and passes them to the shared wiring. Production entry
  points do not export mocks merely for test assembly.

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

| Violation                                                         | Correction                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------ |
| An upper layer deep imports a file inside a slice                 | import only through the slice `index.ts` public API          |
| `features/<slice>/components\|hooks\|utils` segment               | relocate to `ui`·`model`·`lib`                               |
| A client hook imports a server domain module directly             | expose a runtime-safe contract from its existing owner       |
| The index exports even internal implementation functions          | keep only the external usage surface and remove the rest     |
| Tests colocated next to the source                                | move to the slice·segment `__test__/`                        |
| The fetch wrapper floats outside the layers (`src/lib` and so on) | move to `shared/api`                                         |
| Server domain code floats in `src/server/` outside the layers     | move to the owning slice's `api` segment                     |
| Single-use code extracted early into a feature·entity             | return it to the page slice that uses it                     |
| `model/types.ts`·`utils.ts` technical-role file names             | change to domain-based file names                            |
| Widgets introduced without a distinct reusable composition owner  | prefer pages·features·shared·app when those owners fit       |
| Domain policy moved to shared just because it makes HTTP calls    | keep policy/mapping/workflow at its domain owner             |
| Same-shaped data forces independent policies into one store       | separate owners by invariant and lifecycle                   |
| `index.ts` re-exports a store/DTO/cache recipe to every consumer  | expose domain intent and results; contain internal knowledge |
| Same-layer import treated as legal because it uses a public API   | repair ownership/composition or obtain a scoped exception    |

## Sources — rules versus adapted heuristics

Consulted 2026-09-11; pinned commits are source snapshots, not release versions.

- Official FSD: [slices — zero coupling, high cohesion](https://github.com/feature-sliced/documentation/blob/bfeacbb99289e391c746812328af6c2f507f6910/src/content/docs/docs/reference/slices-segments.mdx#L9-L42),
  [public API](https://github.com/feature-sliced/documentation/blob/bfeacbb99289e391c746812328af6c2f507f6910/src/content/docs/docs/reference/public-api.mdx#L19-L63),
  and [cross-import trade-offs](https://github.com/feature-sliced/documentation/blob/bfeacbb99289e391c746812328af6c2f507f6910/src/content/docs/docs/guides/issues/cross-imports.mdx).
- Matt Pocock's [domain-modeling](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/domain-modeling/SKILL.md#L42-L64)
  informs domain language and scenario stress-testing. Its separate artifact layout is not required here.
- [codebase-design](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/codebase-design/SKILL.md#L8-L65)
  and [DEEPENING](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/skills/engineering/codebase-design/DEEPENING.md#L5-L37)
  inform caller knowledge, locality, the deletion thought experiment, and boundary testing. They do
  not mandate ports/adapters, deleting internal tests, multiple agents, or a new Oracle workflow.
