# Frontend Architecture Documentation Gate

When newly creating React production or changing its structure, pin the structural decisions of the
affected architecture unit with user approval and an Oracle source lock. This document does not
force a specific architecture (including FSD).

## Architecture intake

Before creating an approval document or an Oracle lock, confirm the following in the actual files and imports.

- the applicable `AGENTS.md`, `CLAUDE.md`, and repo-local instructions
- the source root (including `src/`) and the exact paths of the affected architecture unit
- the public API and the client/server entry points that external callers use
- the existing per-segment responsibilities, state, and async ownership
- the test ownership location and run command per unit·segment
- the existing architecture documents and the import-boundary verification means

Record the confirmed paths and responsibilities concretely in the approval document. Introduce an
architecture such as FSD only when there is no existing structure or the user has approved a new
structure. If FSD is adopted, read all of [`fsd.md`](fsd.md) and apply the layer·segment·public API
contract. If the folder convention of the user's global rules or the repo instructions (for example
a `components/`·`hooks/` organization) conflicts with FSD, do not compromise arbitrarily but confirm
the priority with `NEEDS_DECISION` and record the approved decision in the document. If the intake
result is unresolved or changes during the conversation, do not lock the document and return it to
`NEEDS_DECISION`.

## Architecture unit

Place the document not at every leaf component but at the responsibility boundary that changes together.

```text
<architecture-unit>/__docs__/architecture.md
```

A unit may be an existing repo's feature, package, route module, component group, or an FSD slice.
Read the existing `architecture.md` and the actual folder·import conventions first. Preserve a
consistent existing structure, and do not slip an FSD migration into the work.

## Approval gate

1. Read all of the affected existing `architecture.md`.
2. If it already permits the current change exactly, record the path and the Oracle source hash and
   do not modify it.
3. If there is no document or a change is needed, show the entire new body in the conversation, plus
   a diff if an existing document exists.
4. Get explicit approval from the user. Before approval, do not write or modify architecture
   documents·tests·production code.
5. Write the document with the approved exact bytes and include `--source <architecture.md>` when
   creating the Oracle lock.
6. Tests, production, browser, and the `oracle-lock.mjs verify` right before review detect document
   changes. On `SOURCE_CHANGED`, discard the existing evidence and get the new body approved again.

If the user-approved architecture and the repo instructions conflict, or either side changes, do not
guess the decision made at approval time. Re-compare the current document and instructions, get the
required minimal diff re-approved, and then lock the new revision.

If a Design-only lock already exists and this document is added as a new source, do not extend the
existing lock. Lock the whole source together in a new Oracle revision that includes the approved source delta.

For the document's own SHA-256, the source hash in the `oracle-lock.mjs` output is authoritative. Do
not create a separate hash file or a generic AST checker.

## Minimal document format

```markdown
# <Unit> Architecture

## Scope / Non-goals

## Existing conventions reused

## Responsibilities and public entry points

## State ownership

## Server / Client boundary

## Data and async flow

## API contract

## Component boundaries

## Pure functions and effects

## Loading / Error / Retry

## Test boundaries

## Rejected alternatives

## Approval evidence
```

Write the sections concretely only when they apply, and leave an N/A reason for items that do not apply.
Forbid template filling that makes the document larger than the code, and the creation of empty layers·folders.

For an FSD unit, the following must be included: the layer·segment mapping and the exact export list
of the slice public API (`index.ts`) in `Responsibilities and public entry points`, the
allowed·forbidden import boundaries (including the deep import ban) in `Component boundaries`, and
the `__test__/`·`__mocks__/` placement in `Test boundaries`. The criteria are [`fsd.md`](fsd.md).

## API contract — conditional

Fill in `## API contract` per endpoint only when the unit calls or defines an HTTP/RPC endpoint. If
there is no endpoint being called, leave only an N/A reason.

```markdown
### `POST /api/orders` — create an order

| Item        | Value                                                                   |
| ----------- | ----------------------------------------------------------------------- |
| Source      | S3 — API contract endpoint/version                                      |
| Auth        | whether it is required and the scope                                    |
| Idempotency | key generator·header·whether the response is replayed on resend, or N/A |
| Pagination  | end-of-list signal·token rule, or N/A                                   |

**Request parameters**

| Location          | Name | Type | Required | Constraints |
| ----------------- | ---- | ---- | -------- | ----------- |
| path/query/header |      |      |          |             |

**Request body**

| Field | Type | Required | Constraints |
| ----- | ---- | -------- | ----------- |

**Response 200**

| Field | Type | nullable | Note |
| ----- | ---- | -------- | ---- |

**Error codes**

| status | code           | Meaning          | UI result           | Retry     | Card row |
| ------ | -------------- | ---------------- | ------------------- | --------- | -------- |
| 400    | INVALID_FIELD  | format error     | show field error    | forbidden | O3       |
| 409    | ALREADY_PLACED | duplicate submit | keep existing order | forbidden | O5       |
```

- Transcribe values only from the approved API source (`project-constraint`). Do not fill them in
  from response observation or guesswork, and if there is no spec source, `NEEDS_DECISION`.
- The UI result·retry of each error code is product policy. If a code remains that is not mapped to
  a card `O*` row, `NEEDS_DECISION` as `POLICY_GAP`.
- If the server uses problem+json ([RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)), branch only
  on the `type` URI·machine-readable code and the UI does not parse the `detail` string.
- Record idempotency exactly as the server contract states — the key generator (recommended: a
  client UUID), whether the stored response is replayed when the same key is resent, and the
  handling of the same key with different parameters (see the
  [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests) approach).
- For a list endpoint, record the end-of-list signal (for example an empty `next_page_token`), token
  opacity (no client parsing), and the rule that fixes parameters across pages
  (see [AIP-158](https://google.aip.dev/158)).
- If generated types (OpenAPI codegen and the like) already exist, write only the type name and the
  generation path and do not duplicate the fields. Only one of the document and the generated types holds authority.
- Do not create a repo-wide endpoint catalog. Record only the endpoints this change unit actually uses.

### When there is no spec — deriving the schema from the card

If there is no approved API source, derive a draft schema from the card and propose it instead of guessing.
The derivation is a Proposal — before explicit approval do not write an implementation·mock from
this schema, and once approved register it as a `project-constraint` source and lock it together with the card.

| Card element                | Into the schema                                                           |
| --------------------------- | ------------------------------------------------------------------------- |
| P3 entity answer            | resource path·fields                                                      |
| `O*` side effect kind×count | method×endpoint list                                                      |
| `Given`·`When` inputs       | request parameters·body and constraints                                   |
| `Then` observed result      | response fields — only what the UI must render                            |
| `Never`·failure rows        | error code table — one code per failure policy that must be distinguished |
| P4·P5 answers               | idempotency header·pagination token rules                                 |

- Write the derived draft in the `## API contract` section of the owning unit's
  `__docs__/architecture.md` — the same file as the structural decisions, the same approval·lock
  flow. Only when the repo explicitly enforces a spec file location (OpenAPI and the like) does that
  convention take priority, and this section then keeps only the location·version reference and the
  card row mapping. Either way it must exist as a file and be included in the lock with `--source` —
  a schema that exists only in the conversation is not a source.
- The defaults reuse the standards above: RFC 9457 for errors, a client key for idempotency, a
  cursor for pagination. If the repo has an existing API convention, it takes priority.
- Do not invent a response field that is not in `Then`. Include only the observed results the card requires.
- If another team owns the server, the approval is a confirmation that "we will agree with the server
  team on this draft", and it is recorded in the journal.

## Exported Public API contract — conditional

Only when newly creating or changing a shared/package export, record the following in the
architecture document and the Implementation Decision.

- The actual consumers and the reason it changes together with them. If there is only one concrete use case, keep it as a local API first.
- The one problem this API solves and its non-goals. Triage and record whether a feature request is package scope or application scope.
- The reason it cannot be solved with the platform API and already installed dependencies
- Input·output·error types, the compatibility range, whether it is breaking, and the migration
- The runtime·type tests the target repo already provides, the build/pack/export checks, and the changeset
- The rollback on failure. Do not apply this gate and release procedure to an app-internal local implementation.

If a new checking tool is needed for a public API, do not install it automatically but present the
cost and the alternatives to the user. Do not widen the public surface for a speculative consumer,
an option flag, or a future replacement possibility alone.

## Hook Encapsulation contract — conditional

Record the policy as `orchestration-only` only when the user has approved making Page/UI components
an orchestration-free boundary. Do not infer this policy from component LOC, effect count, or
reviewer taste. Leave the following values in the approval document as exact values.

| policy               | target glob                    | rule ID                   | allow                        | block                         | lint command                 | config source                                      |
| -------------------- | ------------------------------ | ------------------------- | ---------------------------- | ----------------------------- | ---------------------------- | -------------------------------------------------- |
| `orchestration-only` | the Page/UI file glob to apply | the actual ESLint rule ID | hook names to allow directly | hook names to forbid directly | the actual repo lint command | the config path and the actually installed version |

- If an equivalent lint rule already exists, use it. Only when there is none, propose adopting
  `use-encapsulation/prefer-custom-hooks` of `eslint-plugin-use-encapsulation`, and the dependency
  installation and config change are also subject to architecture approval.
- Do not leave `allow` and `block` to the plugin defaults. Check the target runtime's
  React·router·query·form hooks in the actually installed versions and state them explicitly.
- Lock the config source as an Oracle local source and add `hook-encapsulation` to the required
  labels of `oracle-run.mjs init`. Run the lint command pinned after GREEN and review under the same label.
- This contract is a structural gate that blocks forbidden direct calls. The cohesion and the
  behavior contract of a custom hook are handled by tests and independent review.

## Implementation judgment

- Split a component only when state ownership, async/error boundary, accessibility responsibility,
  independent test, or reuse reason differs. Do not split by file count or LOC alone.
- Do not create transport directly in a component. Reuse an existing api/service/client boundary if
  there is one, and otherwise create the smallest data module the change unit's document approved.
- The location of query keys/options, domain selectors, and DTO conversion follows the existing
  convention. Under FSD you may use the slice's api/model/ui boundaries, but that is not a universal default.
- The implementation order is `pure function → render derivation → event handler → framework/query API → effect`.
  Use an effect only when connecting to an external system, such as an observer, timer,
  subscription, DOM, or external SDK synchronization. Record each effect's target·reason·cleanup in
  the architecture document.

## Verification

A generic skill does not guess and check the import graph, the component count, or the effect count.
If the target repo already has ESLint import-boundary rules, dependency-cruiser, Nx module
boundaries, TypeScript project references, or an equivalent verification, run that command. For a
greenfield or an FSD repo with no verification means, propose adopting steiger (the official FSD
linter) or ESLint boundary rules to the user, and once approved add it as a devDependency and
include it in the GREEN gate verification command. If adoption is declined or impossible, an
independent reviewer examines whether the approved architecture document and the production diff agree.

If strong approval authority is needed at High risk, protect `**/__docs__/architecture.md`,
`.ai/oracles/**`, the lock SHA, and the run IDs with CI artifacts and CODEOWNERS/required human
approval. Do not enforce it by default for Low/Medium. The Oracle source lock is a drift detection
device, not proof of authority in a local environment where the same actor can write the document
and the lock together.
