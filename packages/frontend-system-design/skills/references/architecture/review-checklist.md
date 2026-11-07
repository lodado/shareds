# Independent Review — Reviewer Judgment Checklist

These are the judgment criteria a reviewer reads together with the diff, the approved requirements
and the Implementation Decision. This document holds only what to check against. A finding is one of:
`FINDING` (a proven violation of an approved contract), `GAP` (material but the grounds are
missing), `ASK` (the outcome must be newly decided by the user), or `OPINION` (unsupported style
preference, not reported).

For changeability, judge Readability·Predictability·Cohesion·Coupling·Simplicity first by the
canonical criteria of [`changeability.md`](changeability.md). Check each axis's
`Implementation Decision evidence`·`Reviewer judgment criteria` against an actual path·line or
packet field. All five axes passing is not the goal, and an axis that does not apply gets a concrete
N/A reason.

## Decision Falsification Questions — Applicable Items Only

The reviewer does not re-interview the user with the questions below or set new policy. Find the
grounds in the approved requirements, the Implementation Decision, the diff and the check output, and
cite an actual path·line·run. If it is material but only the grounds are missing it is a `GAP`, if
the outcome must be newly decided it is an `ASK`, and if it does not apply, N/A with a concrete
reason. Do not create a finding out of explanation taste or writing quality alone.

- Why was the change taken to this scope? — user value, stated constraints, the requested
  success criteria·non-goals
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
- Which contracts were not verified and why were they excluded? — risk, the covering test, or a
  stated N/A
- Are there grounds for the performance problem or improvement claim? — same-environment
  metric·budget·baseline/after, or no claim
- Why was a new dependency·framework introduced? — the actual problem it solves, the features
  actually used, the cost of alternatives, the removal path
- What is the next priority? — not a technical wishlist but the order of the remaining
  user·security·consistency·operational risks

## Contract Check

### Contextual pattern index

Use these questions only when the stated premise applies. This is an index into existing criteria,
not authority to invent product behavior. Five-axis judgments above remain mandatory. Each row specifies its
id, dimension, when it applies, required context, checks, counterexamples and evidence, without
duplicating a separate rule catalog.

| ID / dimension                              | Applies when; required context                                                                              | Check / counterexamples                                                                                                                                                       | Evidence and existing criteria                                                                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `error-to-empty` / reliability              | Error handling changes; approved error/empty rules, request and upper error owners                          | Does a failed request become normal empty UI? Counterexamples: explicitly approved silent fallback, or a real upper boundary that preserves the error                         | Original catch/return, actual propagation and UI path, spec rule and reproduction status; Contract Check, [`decisions.md`](decisions.md) error boundary                                                |
| `stale-response` / reliability              | Responses may overlap; selection, request key and state-update owners                                       | Can an old response replace the latest selection? Counterexamples: verified query-key isolation, cancellation or version guard at the actual owner, not merely a library name | Request/response ordering and update path, approved ordering rule; Contract Check, [`types/review-criteria.md`](types/review-criteria.md) when applicable                                              |
| `duplicate-mutation` / reliability          | Action triggers a mutation; handler, pending state, business-effect owner and approved idempotency contract | Is effect count correct independently of disabled UI? Counterexamples: transport retries that still produce one approved idempotent business effect                           | Actual effect count/payload and triggering path; Contract Check. A disabled screenshot alone proves neither request nor business-effect count                                                          |
| `shared-api-consumer` / maintainability     | Public/shared API changes; export/re-export, actual unchanged consumers and approved compatibility scope    | Does the changed seam break an unmodified consumer? Counterexamples: verified versioned compatibility, app-internal-only API outside the claimed public scope                 | Original API plus consumer import/use and approved scope; Architecture and Structure, `changeability.md` Coupling, conditional `fsd.md`                                                                |
| `repeated-work` / performance               | Repeated work is present; execution path, invocation count, data size, cache/subscription owner             | Is redundant work real? Counterexamples: intentional separated requests, proven deduplication, a small simple workload with no breached requirement                           | Distinguish static work count from measured delay; Architecture and Structure and conditional `performance.md`. No memoization, virtualization, benchmark dependency or arbitrary threshold by default |
| `premature-commonization` / maintainability | Similar states/policies are unified; policy owners, independent change directions and consumer invariants   | Does one policy's change leak into another? Counterexample: a demonstrated shared invariant with preserved independent ownership                                              | Both policy sources and actual consumers; Decision Falsification Questions, `changeability.md` Cohesion/Coupling/Simplicity; shape similarity alone is not a defect or reason to abstract              |

Classification for every row: a proven approved-contract violation is a `FINDING`; missing policy
is an `ASK`; missing required proof is a `GAP`; unsupported style preferences are `OPINION`. A question or inferred edge alone is not a
finding. Do not suppress mandatory or global critical/high issues because no pattern ID fits.

- Does the implementation match the layout, states, copy, and interaction of the approved
  spec·design?
- For every interactive element the diff adds that is not a native control, name the WAI-ARIA
  pattern it behaves like — dialog, menu-button, combobox, tabs, disclosure, listbox, switch, or
  `none` — from what it renders and how its state changes, not from the role it happens to declare.
  Then check it against `contracts/<pattern>.json` of `@lodado/local-rules`: the role and state
  attributes, the keys under `guidance.keys`, and where focus goes. Cite the path·line for each key
  found or missing. A key the approved requirements cover but the code lacks is a `GAP`; a key they
  never decided is an `ASK`. A boolean-gated overlay or list with no role is a finding, not `none`.
- Are the requested user·situation and observable success achieved by the actual diff without
  invading the non-goals?
- Is each requirement of the external criteria translated exactly into the approved requirements
  without omission·distortion?
- Is the reported pass backed by a command that was actually run, with its output?
- Does every approved rule correspond to a test or a stated N/A?
- Does each test verify the expected result, the forbidden outcome, and the kind·count of side effects?
- Are the UI state and the actual side-effect count verified separately?
- Are assertions free of coupling to internal state or implementation details?
- Are loading, retry, race, and out-of-order controlled deterministically?
- Did the implementation avoid arbitrarily adding policy or behavior outside the approved requirements?
- Were the actual package version and the repo contracts confirmed and given priority over external
  best practices?

## Type·State·React Boundaries

- The type·state contract — state union and action placement, hiding impossible states,
  reimplementing server state, Suspense/Error Boundary branching, late-response defense — is judged
  only by [`types/review-criteria.md`](types/review-criteria.md) and
  [`decisions.md`](decisions.md). Do not repeat the same criteria in this list.
- Do the query cache and local/global state avoid duplicate ownership of server state?
- Was work for which a Server Component is sufficient not moved to a Client Component·TanStack Query?
- Does retry recover only the scope of the failed query/boundary without indiscriminately resetting
  the whole cache?
- Does the micro-hook separate UI and business logic for a responsibility identified in
  [`authoring.md`](authoring.md)?
  Compare the actual callers, state/effect owners and checks with the Implementation Decision;
  do not accept its self-assessment. Preserve an approved orchestration-only scope without
  imposing it elsewhere. Under an approved hook-tiers profile, check that the domain hook only
  coordinates and that each micro-hook connects one state owner. A trivial wrapper or giant hook is
  not justified by extracting a file.
- For a material [responsibility assignment](decision-note.md#responsibility-assignment),
  derive the caller → state/policy owner → external effect path from code, then compare it with
  the Decision and the applicable approved boundary. Cite the actual decision/update sites in the
  existing Cohesion/Coupling evidence, including a View that still owns the workflow behind a
  forwarding hook. A passing behavior test is not proof of responsibility placement. An equivalent
  implementation under the same approved constraints is allowed; disagreement with a predicted
  file layout alone is not a contract violation. Missing owner/consumer code remains missing evidence.
- Is the final justification for introducing a new dependency·framework the actual problem and the
  features to be used, rather than the technology name·popularity? Do the Dependency item of the
  Implementation Decision and the diff match?
- If the change touches navigation·persistence·permission·payment·cross-unit boundaries, were the
  actual route·user journey·save/restore lifecycle·history contracts outside the diff checked? If it
  is material but has no grounds, it is a `GAP`.
- Was work achievable with pure functions·render derivation·event handlers not moved into an effect,
  and does every effect correspond to an external system·reason·cleanup in the approved document?
- Is there no effect chain running setState → effect → setState, and no effect that subscribes to a
  state change to stand in for an event handler?

## Architecture and Structure

- Do the approved architecture unit document and the actual import/data flow match?
- Was an unnecessary FSD migration or an empty layer·segment not created on the existing structure?
- If it is FSD, was all of [`fsd.md`](fsd.md) read and is there no item that falls under the
  "Common violations" table?
- For an FSD boundary change, including one without folder moves, can the reviewer trace the
  capability to one invariant/state/effect owner and the public seam's hidden knowledge? Challenge
  the recorded change/removal path: do unrelated domains need internal DTO/store/query knowledge,
  or are different policies unified merely because their data shapes match? Judge concrete leaks
  and approved contracts, not folder count; inspect behavioral and import-boundary evidence separately.
- Are components split by state·async/error·accessibility responsibility, without cramming
  independent components into one file or, conversely, multiplying trivial wrappers?
- Does the interactive UI satisfy the semantic element·accessible name·keyboard·focus·state delivery
  contract, and were Escape and focus return for dialog·popover verified where they apply?
- Does the UI keep the api/model/public API boundary without calling the network transport directly?
- If there is a performance claim, are there a same-environment metric·budget and a baseline/after
  run, and was a benchmark·memoization dependency not added when there is no claim?
- Is consumer·compatibility·type/runtime·pack·migration evidence present only when the exported
  shared/package API changed, and was a release gate not forced on an app-internal change?
- Do the approved architecture document, the code, and the repo structure verification or
  reviewer evidence all match?

## Design

- If there is an approved design direction, are palette·type·layout·copy·signature·motion actually
  derived from subject·audience·single job and consistent with that direction?
- For a local or identity-shaping change, is there an explicit user answer approving the visual
  change?
- For an identity-shaping change, were generic choices that would attach unchanged to another
  product removed and was boldness concentrated in one signature place?
- Is every approved visual requirement covered by a test, a visual artifact, a designer judgment, or
  a stated N/A, and was evidence sharing the same fixture·reference not exaggerated as independent
  evidence?
- If a `frontend-visual-qa` artifact exists, does it judge every agreed visual·browser requirement
  without omission? For a UI-shaping interaction, is there one browser journey or a stated N/A?
- Were repo mandatory contracts such as security, accessibility, and data loss prevention not
  damaged?
