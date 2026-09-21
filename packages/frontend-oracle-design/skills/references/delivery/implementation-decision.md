# Delivery — Frontend implementation decision record

After `VALID_RED` and before modifying frontend production, leave the record below grounded in the
actual package versions and the repo rules. External best practice does not set product policy or
override the repo contract. Items that do not apply are N/A with a reason.

First read all of [`changeability.md`](../changeability.md), and move only the rationale that is
material to this diff into the Decision. Do not substitute copying the principle text or declaring a
full run through the five axes.

The record location is `.ai/oracles/<oracle-id>/implementation-decision.md`. It is not a product
policy source but the raw implementation reasoning a reviewer will check against the diff. Instead of
boilerplate that ceremonially fills every axis, record only material trade-offs.

```markdown
### Implementation Decision

- Target: React/Next.js/TanStack Query versions and the router/runtime
- State ownership: the owners of server state, URL state, client state, derived state
- Server/Client boundary: what to leave on the server and the minimal client leaf
- Async boundary: handling of initial loading, refetch, error, retry, mutation pending
- Hook boundary: the interaction/query responsibilities to separate and the trivial logic not to separate
- Type contract: material input·success·failure·state transitions and impossible states, or the N/A reason
- Architecture: affected units, the approved architecture document, existing conventions·data/effect
  boundaries, and the Oracle source hash
- Changeability: material Readability·Predictability·Cohesion·Coupling judgments, and the
  trade-off between the axis prioritized and the axis sacrificed
- Side effects: the kinds of request·navigation·storage·analytics·logging and their owner/boundary
- Simplicity: the first step among existing implementation→platform/framework built-in→installed
  dependency→minimal local code that satisfied the requirement
- Dependency: if a framework/library was newly introduced·replaced, the actual problem it solves,
  the features actually used, the alternatives considered, the cost and removal path; if none, N/A
- Design: if there is a Design Intent, the visual scope, component·token reuse, typography,
  responsive, motion·reduced motion, copy, signature and the generic choice discarded; if none, N/A
- Accessibility: evidence of semantic name·keyboard·focus·state communication for interactive UI, or N/A
- Performance: claim, if any, with metric·budget·same-environment baseline/after runId; if none, N/A
- Public API: if the exported shared/package surface changes, the consumer·compatibility·type/runtime·pack·
  migration contract, otherwise N/A
- Sources: the repo contracts·official docs·heuristics applied
- Rejected: alternatives actually considered but not applied, the related quality axis and the concrete reason
```

## Responsibility assignment

For a material UI/business boundary change, use the existing State ownership, Hook boundary,
Architecture and Side effects entries to settle where the implementation belongs before editing.
Name the file and symbol that owns each changed responsibility, what its caller may use and must not
duplicate, the applicable approved source, and the existing check. Mark a new symbol as planned;
do not claim it already exists. Reuse actual query, mutation, form and domain owners before choosing
a new hook. This is not a new field, artifact, policy approval or a requirement for one-line changes.

For example, only if the consuming repo has approved this separation:

```markdown
- Architecture: <approved source location + locked hash> applies to
  src/profile/ProfileView.tsx#ProfileView: render and view-local interaction are allowed;
  saving policy and direct profile transport calls belong to the owners below.
- Hook boundary: src/profile/useProfileEditor.ts#useProfileEditor owns the edit/save/cancel
  workflow. ProfileView calls its intent actions; it does not repeat the save decision.
- State ownership: existing query owns remote data; useProfileEditor owns the editable draft
  under <approved initialization/save/cancel/conflict contract>. Display-only values are derived.
- Side effects: useProfileEditor calls src/profile/api.ts#profileMutation, which keeps its
  existing retry/error policy. <existing behavior command> checks save/cancel outcomes;
  <existing approved boundary command> checks the View import restriction separately.
```

Replace the example with investigated owners and approved constraints. It does not prescribe this
file layout, props-only data flow, leaf-only hook calls, or a new hook for every action. Implement the
changed responsibility at its assigned owner, then connect the caller; do not finish the workflow
inside the UI and merely add a forwarding hook beside it. The conditional structural-check contract
stays in [`architecture-contract.md`](../architecture-contract.md#hook-encapsulation-contract--conditional).

If the actual implementation takes a technically equivalent path within the approved boundaries,
update the existing Decision with the actual owner and reason, then rerun affected checks. A
disagreement with this implementation prediction is not itself a policy violation. Repair an actual
violation of a known contract through the existing feedback path. If the proposed allocation requires
changing approved behavior or architecture, stop at the existing `NEEDS_DECISION` route; rewriting
the Decision cannot approve that change.

## Material change sketch

When a boundary choice materially affects change cost, use the existing Changeability and Rejected
entries for `change + evidence → preserved contract → owner/impact path → choice + verification +
accepted cost`. This is not a separate artifact or an additional required field. Do not repeat
unrelated axes or invent a future change merely to fill it in.

For a material choice, make the existing entries traceable to the code:

- Architecture / Simplicity: cite the reuse candidate's actual file, symbol, and call sites. Explain
  what fits the current requirement and what does not fit; existing code and tests are evidence,
  not approved policy. Compare the simplest existing implementation with the proposed change.
- State ownership: name the data source, update owner, derivation, and lifetime. Apply the query
  result versus editable-draft distinction in [`frontend/decisions.md`](../frontend/decisions.md#1-decide-state-ownership-first).
- Changeability / Rejected: name the current complexity the boundary hides, the accepted cost,
  and the existing check or concrete change scenario that could disprove the choice. “More cohesive”
  or “for extensibility” alone is not evidence.

These are prompts for a significant boundary decision, not extra mandatory fields. An obvious
one-line change needs no list of alternatives or expanded design document.

```markdown
- Changeability: the approved SDK callback-format update changes the feature's transport mapping,
  not its success/error outcomes, request count, or cancellation/cleanup contract. Existing mapper
  remains the owner; its contract tests and the consumer behavior tests cover the change. Prioritized
  Coupling at the cost of keeping a local conversion rather than exposing the SDK DTO to the UI.
- Rejected: a new adapter/interface adds no information beyond the existing mapper.
```

Replace the example with actual paths, change evidence, and verification commands for the target
repo. Mark predicted impact as a walkthrough, not a measured improvement. A new outcome or error
meaning still needs the approval flow below, even if a mapper could conceal the difference.

If a choice changes the card's observed outcome or conflicts with the approval criteria, do not
implement it and return to `NEEDS_DECISION`. If the choices are technically equivalent, decide by the
runtime criteria of [`frontend/decisions.md`](../frontend/decisions.md)·[`frontend/authoring.md`](../frontend/authoring.md) and
the change-cost criteria of [`changeability.md`](../changeability.md), and continue.
