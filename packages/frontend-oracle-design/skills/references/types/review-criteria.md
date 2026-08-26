# Type constraints — Reviewer judgment criteria

When reviewing a change that created a type·state contract, judge it by the same criteria as
[`state-ladder.md`](state-ladder.md)·[`authoring.md`](authoring.md)·[`api-surface.md`](api-surface.md).

## State model and ownership

- If a boolean combination allows a card `Never` row at the type level and it was not made a union,
  it is a `FINDING`.
- If a transition not in the card exists in the implementation, it is a `FINDING`.
- If a derivable value was stored as a separate state, query·mutation state was copied into a local
  machine, or a raw setter was exposed outside the hook, it is a `FINDING`.
- If existing query·router·form state was repackaged into a new `status` union that only renames
  it, or a full lifecycle type was created for shared UI that needs only a single capability, it is
  a `FINDING`.
- If an action was stored in a state union or a state value, a no-op action was filled into a state
  where it cannot be used, or a new action doing the same job was created when an existing
  `refetch` is there, it is a `FINDING`.
- If `O*` rows sharing a screen·recovery path were split into separate states, or a value the card
  does not distinguish was invented as a state field, it is a `FINDING`. If the distinction is
  needed, it is a `POLICY_GAP`.
- If an Event union·transition function·transition command was introduced for a simple query on the
  grounds of the card's State Model, it is a `FINDING`. It is not if the reason for the ladder rung
  choice is in the Implementation Decision.
- If the loading·error of the first query that runs unconditionally was branched inside the
  component instead of being lifted to a boundary, it is a `FINDING`. It is not if an actual
  disqualifying reason such as a conditional query·placeholder·cancellation constraint was written
  in the Implementation Decision.

## Ladder rung selection

- If a union·machine was introduced for a problem that ends at ladder rung 1·2, or a state branch
  has no exhaustiveness enforcement (at or above the baseline tier), it is a `FINDING` without an
  exception reason in the Decision.
- If a later-rung type was used for a problem that an earlier-rung mechanism closes, it is a
  `FINDING`.
- If feature code has a homemade mapped·conditional·recursive utility, reimplements a built-in
  utility, or has an advanced utility without a type test, it is a `FINDING`.
- Failing to write down the actual misuse the advanced type blocks, or citing a puzzle corpus such
  as Type Challenges as product policy, is also a `FINDING`.

## False contracts

- If a boundary value was asserted without parsing, `any` leaked into the application layer, or a
  `Partial<DomainEntity>` mutation was introduced, it is a `FINDING`.
- If a type derivable from a schema·operation union was hand-duplicated in a declaration, it is a
  `FINDING`.
- If the implementation does not fill every key but a total map was promised with `Record<K, V>`,
  it is a `FINDING`. However, `Partial<Record<K, V>>` for a sparse lookup result is not subject to
  the `Partial<DomainEntity>` mutation ban — banning the two under the same rule is a
  misapplication.
- If `Partial<Record<K, V>>` was used on an open key domain such as an ID·branded string, it is a
  `FINDING`.
- If a wrapper whose execution is deferred·cached declared that it immediately returns the
  original's `ReturnType`, it is a `FINDING`.
- A type predicate that does not check the required invariants, a key-remapping return type without
  a runtime key transform, and reporting `satisfies`·`as const`·annotation·excess property check as
  runtime validation or sanitization are `FINDING`.
- Making a `{ kind }` tagged object union when at most one member has its own fields, or a variant
  record that only reduces declaration lines without a single authority, is a `FINDING`.
- If a schema is placed on a value generated inside the app while the storage·URL·response read
  point is trusted without parsing, it is a `FINDING`.

## Public API and advanced types

- If the generic of an exported shared/package API newly designed in this change does not create a
  relation between two or more public places, or an ordinary product call site has to repeat a type
  argument, it is a `FINDING`. A one-time pin at a config·schema definition boundary and the use of
  an existing library generic are not subject to this.
- If a distributive conditional has no `any`·`unknown`·`never`·union edge test, or a mapped type
  unintentionally loses readonly·optional modifiers, it is a `FINDING`.
- Reporting a template literal type as a runtime input validator, or mistaking method bivariance
  for callback safety evidence, is a `FINDING`.
- If one `@ts-expect-error` line holds several misuses and could pass on an unrelated diagnostic,
  or there is only an `Equal`-style helper and no public call·assignment witness, it is a
  `FINDING`.
- If a boundary axis declared as closed has no witness, or witnesses were filled in even for axes
  this API does not close, it is a `FINDING`. The axis list is owned by the type boundary section
  of [`../bva.md`](../bva.md).
- If one API's `@ts-expect-error` exceeds 30 and an API split was not considered, it is a `FINDING`.
  30 is not a target to be filled but a design disqualification line meaning the surface is too
  wide.
- If Implementation Decision 3 has a misuse list but every boundary axis was written as N/A, it is
  a `FINDING`. The misuse written as blocked is exactly the axis being closed.
- If a recursive/distributive type goes in without project compiler evidence and the required
  performance before/after values, it is a `FINDING`.
- If a type error is hidden with `any`, a double assertion, `@ts-ignore`, or `skipLibCheck`, it is
  a `FINDING`.

## Evidence and contract files

- If time-axis non-determinism was treated as "resolved" by types alone, it is a `FINDING`.
- If merely running a typecheck after generation is reported as having made generation itself
  deterministic, it is a `FINDING`.
- If the implementation diff deleted·weakened an `@ts-expect-error` case in `.test-d.*`, or removed
  a type error by widening the contract type·schema (required field→optional, union→`string`)
  without a card row citation, it is a `FINDING`. The contract file is the root of trust for
  inspection — a relaxation is not an implementation decision but a policy change, and it is
  `NEEDS_DECISION` as a `POLICY_GAP`.
- If the type selection rules and their rationale were transcribed into code comments, it is a
  `FINDING`. The reason for the choice is owned by the Implementation Decision, and the comments
  leave only the domain constraint citing a card row ID.

## What is not subject to judgment

- If only state-name taste, the reducer versus individual handler syntax preference, or the pattern
  matching library preference differs, it is a `NON_ORACLE_OPINION`.
