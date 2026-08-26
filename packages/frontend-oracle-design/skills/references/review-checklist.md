# Independent Review — Reviewer Judgment Checklist

These are the judgment criteria the reviewer reads together with the review packet.
Procedure·independence·finding schema are owned by [`subagent-review.md`](subagent-review.md), and
this document holds only what to check against. The primary agent does not paste the body into the
prompt but registers it with `--review-point`.

For changeability, judge Readability·Predictability·Cohesion·Coupling·Simplicity first by the
canonical criteria of [`changeability.md`](changeability.md). Check each axis's
`Implementation Decision evidence`·`Reviewer judgment criteria` against an actual path·line or
packet field. All five axes passing is not the goal, and an axis that does not apply gets a concrete
N/A reason.

## Decision Falsification Questions — Applicable Items Only

The reviewer does not re-interview the user with the questions below or set new policy. Find the
grounds in the Oracle, `implementation-decision.md`, the diff, and the ledger, and cite an actual
path·line·runId. If it is material but only the grounds are missing it is `EVIDENCE_GAP`, if the
outcome must be newly decided it is `POLICY_GAP`, and if it does not apply, N/A with a concrete
reason. Do not create a finding out of explanation taste or writing quality alone.

- Why was the change taken to this scope? — user value, stated constraints, the Outcome Brief's
  success·Non-goals
- Why is this state owned by a local or global owner? — the actual consumer scope, the
  create·maintain·discard lifecycle
- If the requirement changes, where is it modified and how far does it propagate? — policy owner,
  public surface, import·data flow impact scope
- Why is this component·abstraction shared? — the stable invariant current consumers share and the
  contract that changes with it
- Why was the duplication left in? — the independent change directions, the coupling cost of
  unification and the drift risk
- Why is the complexity of this type·state model necessary? — the actual impossible states·wrong
  transitions the types block
- Which errors does this boundary recover and what does it propagate upward? — the owner of expected
  errors·unknown errors, the fallback and retry contract
- Which contracts were not verified and why were they excluded? — risk, card row evidence, or a
  sourced N/A
- Are there grounds for the performance problem or improvement claim? — same-environment
  metric·budget·baseline/after, or no claim
- Why was a new dependency·framework introduced? — the actual problem it solves, the features
  actually used, the cost of alternatives, the removal path
- What is the next priority? — not a technical wishlist but the order of the remaining
  user·security·consistency·operational risks

## Contract Check

- Does the implementation match the layout, states, copy, and interaction of the approved
  spec·Figma?
- Are the Outcome Brief's user·situation and observable success achieved by the actual diff without
  invading the Non-goals?
- Is each requirement of the external criteria translated exactly into the Oracle Card without
  omission·distortion?
- Do the Oracle SHA-256 and source hashes match the last verify result?
- Is the reported pass backed by a ledger runId, and is the grade `reported`?
- Is every Oracle row mapped to the tier owner's evidence or a sourced N/A, and did
  `oracle-verify.mjs evidence` pass?
- Does every non-N/A card row correspond to a test?
- Does each row verify `Then`, `Never`, and the kind·count of side effects?
- Are the UI state and the actual side-effect count verified separately?
- Are assertions free of coupling to internal state or implementation details?
- Are loading, retry, race, and out-of-order controlled deterministically?
- Did the implementation avoid arbitrarily adding policy or behavior outside the card?
- Were the actual package version and the repo contracts confirmed and given priority over external
  best practices?

## Type·State·React Boundaries

- The type·state contract — state union and action placement, hiding impossible states,
  reimplementing server state, Suspense/Error Boundary branching, late-response defense — is judged
  only by [`types/review-criteria.md`](types/review-criteria.md) and
  [`frontend/decisions.md`](frontend/decisions.md) received as review points. Do not repeat the same
  criteria in this list.
- Do the query cache and local/global state avoid duplicate ownership of server state?
- Was work for which a Server Component is sufficient not moved to a Client Component·TanStack Query?
- Does retry recover only the scope of the failed query/boundary without indiscriminately resetting
  the whole cache?
- Does the micro-hook separate the responsibilities of UI and business logic exactly? Does the UI
  component own only semantic JSX·accessibility·visual state·user intent wiring, and not directly
  own domain judgment·DTO conversion·query/cache·navigation·storage·observer coordination?
- Does each micro-hook own only one interaction workflow or external system connection, return only
  render-ready values and intent actions, and not hide JSX·class·token·copy?
- Are the filtering·grouping·sorting·validation·state transitions that do not need React in pure
  model functions, without creating a trivial wrapper that is a mere rename or a giant hook that
  merges unrelated responsibilities?
- Is the final justification for introducing a new dependency·framework the actual problem and the
  features to be used, rather than the technology name·popularity? Do the Dependency item of the
  Implementation Decision and the diff match?
- If the change touches navigation·persistence·permission·payment·cross-unit boundaries, were the
  actual route·user journey·save/restore lifecycle·history contracts outside the diff checked? If it
  is material but has no grounds, it is `EVIDENCE_GAP`.
- Was work achievable with pure functions·render derivation·event handlers not moved into an effect,
  and does every effect correspond to an external system·reason·cleanup in the approved document?
- Is there no effect chain running setState → effect → setState, and no effect that subscribes to a
  state change to stand in for an event handler?

## Architecture and Structure

- Do the approved architecture unit document and the actual import/data flow match?
- Was an unnecessary FSD migration or an empty layer·segment not created on the existing structure?
- If it is FSD, was all of [`fsd.md`](fsd.md) read and is there no item that falls under the
  "Common violations" table?
- Are components split by state·async/error·accessibility responsibility, without cramming
  independent components into one file or, conversely, multiplying trivial wrappers?
- Does the interactive UI satisfy the semantic element·accessible name·keyboard·focus·state delivery
  contract, and were Escape and focus return for dialog·popover verified where they apply?
- Does the UI keep the api/model/public API boundary without calling the network transport directly?
- If there is a performance claim, are there a same-environment metric·budget and a baseline/after
  ledger run, and was a benchmark·memoization dependency not added when there is no claim?
- Is consumer·compatibility·type/runtime·pack·migration evidence present only when the exported
  shared/package API changed, and was a release gate not forced on an app-internal change?
- Do the architecture document bytes, the Oracle source lock, and the repo structure verification or
  reviewer evidence all match?

## Design Intent

- If there is a Design Intent, are palette·type·layout·copy·signature·motion actually derived from
  subject·audience·single job and consistent with the approved direction?
- For `local`·`identity-shaping`, is the location of the explicit user answer of the Design Change
  Confirmation received before lock on the card?
- For `identity-shaping`, were generic choices that would attach unchanged to another product
  removed and was boldness concentrated in one signature place?
- Is every `D*` row mapped to a `HARD` test, a `RELATIONAL` visual artifact, a `JUDGMENT` designer
  finding, or a sourced N/A, and was evidence sharing the same fixture·reference not exaggerated as
  independent evidence?
- If a `$frontend-visual-qa` artifact exists, does it cite the same Oracle revision and judge every
  pre-agreed visual·browser row without omission? For `RELATIONAL`·`JUDGMENT` or a UI-shaping
  interaction, is there one existing tool browser journey or a source-backed N/A?
- Were repo mandatory contracts such as security, accessibility, and data loss prevention not
  damaged?
