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

If a choice changes the card's observed outcome or conflicts with the approval criteria, do not
implement it and return to `NEEDS_DECISION`. If the choices are technically equivalent, decide by the
runtime criteria of [`frontend/decisions.md`](../frontend/decisions.md)·[`frontend/authoring.md`](../frontend/authoring.md) and
the change-cost criteria of [`changeability.md`](../changeability.md), and continue.
