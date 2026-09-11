# Changeability implementation·review criteria

## Purpose and authority

This is not product policy — it is a heuristic for picking an implementation with a low change cost
without altering approved behavior. Do not use it to newly decide outcomes·copy·state·side effects
or to modify an approved Oracle.

For the authority order, the common priority in [`common.md`](common.md) is canonical — mandatory
constraints and the approved Oracle, the target repo's `AGENTS.md`·`CLAUDE.md`·architecture·API·test
contracts, the actually installed versions and existing implementation conventions, and finally this
document's implementation heuristics and external cases. On conflict, follow the higher criterion.
Toss material is only evidence for finding implementation candidates, not authority that forces
anything on another repo.

## How to read

Read all of it before modifying production after `VALID_RED`. Do not score or fill in all five axes;
leave in the Implementation Decision only the axes that actually decided this choice and the cost
accepted. An independent reviewer also compares the Decision and the diff against the same criteria.
Without concrete drift, a hidden side effect, or change-propagation risk, a difference in preference
is `NON_ORACLE_OPINION`.

Each axis's **pre-implementation question**: does this choice actually reduce the scope of
understanding·modification·verification? Does it unnecessarily harm another axis's cost or an
existing boundary?

## Start with a concrete change

For a material boundary choice, start with the current requirement, an approved upcoming change,
actual change history, or an observed dependency leak — not an imagined future platform. Trace the
preserved contract, the owning responsibility, and the understanding·modification·verification
path. Compare the simplest existing solution with the proposed boundary and name the cost accepted.
Keep this reasoning in the existing Decision; its short example is owned by
[`delivery/implementation-decision.md`](delivery/implementation-decision.md#material-change-sketch).

Use only relevant scenarios: an API representation change, a policy change, a presentation-only
change, or feature removal. Tests and docs changing with their owner can be healthy cohesion;
unrelated consumers needing edits can signal coupling. Changed file count is not a quality score.
If the scenario requires a new observed outcome or error policy, return to the existing approval
flow rather than silently hiding that change in a mapper.

An independent reviewer should be able to follow user intent to the state·policy·effect owner,
identify what must remain unchanged, and locate applicable error·retry·cancel·cleanup responsibilities.
Name a concrete dependency path or hidden contract when that fails, not a preferred folder style.
Material-only Decision writing does not remove the five-axis review output owned by
[`subagent-review.md`](subagent-review.md).

For an existing or approved FSD repo, apply the domain-boundary method in
[`fsd.md`](fsd.md#domain-boundary-before-folder-structure) to material slice ownership, public API,
or dependency decisions, even without a folder move. It grounds these axes in domain language,
invariant owners, and a public behavioral seam; it does not authorize adopting FSD elsewhere.

### Bounded change rehearsal

Use a static walkthrough to compare candidate impact paths; it is not evidence of measured
change-cost improvement. When evaluating a change to these heuristics, start with one currently
needed boundary and one unnecessary wrapper, not a new universal scoring system:

1. Pin the same requirement/input, fixture revision, preserved behavior tests, and model/tool
   settings for the existing and proposed criteria. Identify the fixture location and existing test
   command before running either variant in isolated workspaces.
2. Keep the raw diff, Decision, commands, exit codes, and test results. Have an independent reviewer
   compare preserved behavior, responsibility leaks, and unnecessary abstractions with the expected
   choices. Check that the changeability and frontend criteria give consistent guidance together.
3. Stop when the existing seam satisfies the contract; do not add an adapter to complete a template.
   On a preserved contract failure, a new leak, or an unjustified abstraction, stop and fix or revert
   that small change before adding cases. Passing requires preserved contract tests and an explained,
   consistent boundary choice; unresolved judgment stays unverified.

Prose regex and review schema checks are not semantic evaluation. Record a walkthrough-only result
as such; do not claim a live-model improvement or a general cost reduction from it. This rehearsal
is a bounded evaluation method, not an additional gate on every product change.

## Readability

Reduce the context and conditions a first-time reader has to hold at once. Revealing user actions
and the execution order of state transitions and side effects takes priority over shorter code.
Compare the caller's required concepts, preconditions, order, and errors, not just the number of
public functions. A single `runTransfer(options)` with interacting flags and hidden ordering can be
harder to use than several explicit actions. Hide implementation knowledge, not the caller's contract;
a deep module is neither a large class nor a hook that merges independent state owners.

### Core patterns

Each item has the form `risk signal → default choice. Except: when it does not apply`.

- A complex condition repeats → give it a name that reveals the domain meaning. Except: it is used
  only once and the name is vaguer than the condition
- Independent state·async flows are mixed → separate them by state ownership·error boundary. Except:
  it is only long in LOC and the reason for change is the same
- The core order is scattered across several effects → reveal the order in an event or a named
  workflow. Except: it is real external system synchronization
- A helper·wrapper appears for every line → remove indirection that adds no information. Except:
  several call sites share the same policy

```tsx
const canSubmit = !isLoading && !isLocked && user != null && amount > 0
```

Give a domain name such as `canTransfer` only when the same policy repeats.

### React implementation criteria

- JSX reads around semantic structure, accessibility state, and the connection to user intent.
- A value computable from props and render is not copied into another state through an effect.
- Split a component not by LOC but when state ownership, async/error boundary, accessibility
  responsibility, independent test, or reuse reason differs.
- Do not hide a workflow whose explicit order matters behind a generic pipeline or an unnecessary hook.

### Implementation Decision evidence · Reviewer judgment criteria

- Record in the Decision the boundary you named or separated and the actual information gain.
- If an unnecessary file·timing move can create a real change error, it is `FINDING`.
- If only a nicer-looking name·function syntax or an LOC preference differs, it is `NON_ORACLE_OPINION`.

## Predictability

A caller must be able to predict the result and the external side effects from the name, the inputs,
and the return value. The internal algorithm may be hidden, but the kind·timing·count of external
writes such as request, navigation, storage, analytics, and timer must be visible at a named owner
and boundary. Make the external API read as user intent, but do not hide internal state transitions
and lifecycle behind vague automation.

### Core patterns

- `get*`·`fetch*` has a hidden side effect → compose it at the caller or reveal the whole workflow in
  the name. Except: the approved contract requires an atomic workflow
- A render·selector writes external state → move it to an event·mutation·external synchronization effect
- Success·failure handlers duplicate a write → gather the execution owner and the exact count into
  one boundary. Except: they are different approved side effects
- A timer·subscription has no cleanup → clean up at the boundary that created it. Except: the runtime
  explicitly owns the lifecycle
- Closing·removal·result confirmation is one boolean → split the name and owner only for transitions
  whose observed result differs. Except: they are atomic transitions at the same moment
- A local boundary consumes every error → handle only recoverable errors and propagate the rest
  upward. Except: it is the app top-level isolation·observation boundary

```ts
const balance = await fetchBalance()
trackBalanceViewed(balance)
saveLastViewedBalance(balance)
```

If the three actions are one approved workflow, do not separate them unconditionally. Use a name
that reveals the whole responsibility and verify the failure·retry·duplicate-execution contract.

### React implementation criteria

- A query function owns data acquisition and transport errors and does not hide UI copy·navigation.
- Use an effect only for observer, subscription, timer, DOM, or external SDK synchronization, and
  reveal its target and cleanup.
- Model a request·overlay·multi-step flow as separate transitions only when start·cancel·success·
  failure·visual close·resource removal actually produces a different result or cleanup. Do not
  inflate a simple toggle.
- A local catch·Error Boundary handles only the errors it can recover from. An unknown error and an
  error in the fallback itself preserve the cause and propagate to the upper boundary.
- SSR code makes the timing of browser global access and the server fallback predictable at the boundary.
- Do not dismantle an existing logging·telemetry boundary or an encapsulated workflow out of personal
  preference.

### Implementation Decision evidence · Reviewer judgment criteria

- Record in the Decision the owner of external writes, the execution timing and the count on
  failure·retry, and the material lifecycle transitions and error propagation boundary.
- A write the caller cannot know about, a missing cleanup, or a duplicated side effect is
  `PRODUCT_DEFECT` when concrete evidence exists, and `EVIDENCE_GAP` when only the required
  verification is missing.
- If the observed result must be newly decided it is `POLICY_GAP`, and if only an explicit handler
  preference differs it is `NON_ORACLE_OPINION`.

## Cohesion

Put the source, tests, mocks, and docs that change together for the same policy and the same reason
at the nearest owner. Do not factor code out merely because it repeats; look at whether a real drift
defect appears when only one side changes.

### Core patterns

- The same business rule is duplicated in several places → gather it at the nearest domain owner.
  Except: the policy and release cadence differ
- A feature's source·test·mock do not move together → put them in the same architecture unit. Except:
  the repo enforces a different boundary
- Per-consumer options keep growing in a generic util → separate the different reasons for change.
  Except: they share a stable identical invariant
- A single consumer is promoted to shared for future reuse → keep it local. Except: there are
  multiple consumers now and a stable contract

```ts
const isNicknameValid = nickname.length <= 20
const isCouponCodeValid = couponCode.length <= 20
```

Even if the numbers match today, do not merge independent policies into one domain API. Conversely,
if the same transfer limit rule is duplicated, a common owner is needed to prevent drift.

### React implementation criteria

- Put feature-only hooks, mappers, tests, and mocks at the nearest feature boundary.
- Put query options, DTO mappers, and cache updates near their server state owner.
- Do not mix the JSX·token·copy the UI should own with domain judgment·transport conversion in a generic hook.
- Do not co-locate across the target repo's public API·FSD·module boundary.

### Implementation Decision evidence · Reviewer judgment criteria

- Write in the Decision the policy and owner that change together, and the drift rationale for allowing duplication or factoring it out.
- Check that the source·test·mock·docs to be removed together when a feature·route is deleted are
  gathered at the same boundary.
- If the same policy sits apart and creates drift, or unrelated responsibilities are bound into one
  abstraction, it is a `FINDING` candidate.
- A plain duplicate line count and a preferred folder structure are not grounds for blocking.

## Coupling

Reduce the range of consumers that one change must know about or modify. Couple shared invariants,
but keep the public API, global store, shared util, transport DTO, and framework API from spreading
wider than their responsibility.

### Core patterns

- A global/public surface with only one consumer appears → keep it in local state·module. Except: an approved public contract is required
- The UI knows the transport DTO·query key → convert to render-ready values at the mapper/model owner. Except: the UI itself owns that contract
- A store·context is created just for a short props hand-off → pass it from the nearest common owner. Except: it is state that is genuinely shared widely
- An interface·adapter wraps a single implementation → use the implementation directly. Except: a current compatibility contract, shared implementations, or the present-boundary exception below justifies a seam
- External APIs obscure a complex current policy or transition → compare a pure transition core and thin adapters. Except: an existing seam or local derivation already makes the contract clear and testable

```tsx
function BalanceCard({ balance }: { balance: number }) {
  return <span>{formatCurrency(balance)}</span>
}
```

If the UI does not need the whole `BalanceApiResponse`, pass only the values it needs.

### Present-boundary exception

This section owns the exception, including for a single implementation; it is not an automatic
instruction to add an adapter. Consider a boundary when actual change history or an approved change
shows independent volatility causing current understanding·modification·verification cost, even
within one responsibility; when external knowledge leaks into unrelated consumers; or when external
dependencies obstruct deterministic verification of a current policy or transition.

Try the existing client·query·test seam first, then a local mapper or parameter, and only then a
minimal adapter. Name what the existing owner cannot absorb and what knowledge the candidate hides.
Keep error distinctions, request count, cancellation, and cleanup under the approved contract. Do not
duplicate retry logic or mirror state already owned by query, router, or form infrastructure.

- Candidate: a current SDK has an independent callback-format change while product policy remains
  stable. A feature-local conversion may contain that knowledge even for one consumer. If an existing
  mapper suffices, stop there; no interface·factory·registry is implied.
- Reject: a pass-through wrapper for a hypothetical future SDK, a seam created only for mock taste,
  or a pure core for a simple toggle. A small function or one implementation is not itself a defect;
  the question is whether the new boundary hides real complexity at lower total cost.

### React implementation criteria

- Put state at the nearest common owner that actually shares it.
- Follow FSD's public API only when the target repo already uses it or its adoption is approved.
- A custom hook returns only the values and intent actions the consumer needs. The tuple/object shape
  follows the target repo's convention and does not expose transport, cache, and UI copy at the same time.
- Shared approved runtimes or the present-boundary exception can justify pure state·transition
  separate from URL·navigation·browser APIs. Reuse the existing owners first and do not inflate a
  simple toggle. Do not add an adapter to a single runtime on future possibility alone.
- Do not bypass an approved design system·domain API or the same permission·currency·identity
  invariant with a local copy.

### Implementation Decision evidence · Reviewer judgment criteria

- Record in the Decision the public/global/shared surface and its actual consumers, the DTO
  conversion owner, and any seam's current volatility, compatibility, or shared-runtime evidence,
  why the existing seam was insufficient, and the preserved contract.
- If an unnecessarily wide surface, a transport leak, or a violation of an approved import boundary
  creates a concrete change-propagation risk, it is `FINDING`.
- If only a personal preference about context·props·barrel differs, it is `NON_ORACLE_OPINION`.

## Simplicity

Choose the smallest responsibility and the most familiar means that satisfy the current approved
contract. The goal is reducing new concepts, dependencies, runtime state, and operating cost rather
than short or clever code.

### Core patterns

Implementation choice stops at the first step in the following order that satisfies the requirement.

1. Is the code actually needed?
2. Does an existing repo implementation or util solve it?
3. Is it possible with the built-in features of JavaScript·TypeScript·DOM·Web·React·framework?
4. Does an already installed dependency solve it?
5. Is it possible with minimal local code?
6. Only after that, propose a new abstraction or dependency.

The risk signals are an interface·factory·registry with only one implementation, an option with no
call site, memoization·cache·lazy loading without measurement, and global state for a single request.

### React implementation criteria · when it does not apply

- Do not add an effect and state for a value that can be computed during render.
- Do not wrap a simple event handler in a custom hook that only renames it.
- Use `memo`, `useMemo`, `useCallback`, and dynamic import only when there is a measured bottleneck
  or an identity contract.
- Do not remove input validation, security, accessibility, cleanup, data-loss prevention, or a real
  calibration seam because of line count.

### Implementation Decision evidence · Reviewer judgment criteria

- Write in the Decision the first step chosen among existing repo→built-in feature→installed
  dependency→minimal local code, and the abstraction you did not add.
- An abstraction·dependency·performance complexity that the current consumers and requirements do
  not justify is a `FINDING` candidate.
- Do not create a finding merely because a shorter syntax exists.

## Trade-offs between axes

The five axes cannot be maximized at the same time. Write only the cost you prioritized and the cost you accepted in the actual choice.

- Readability ↔ Cohesion: keep them close when there is no independent change·test responsibility, and name and separate them once there is
- Predictability ↔ encapsulation: hide the algorithm and reveal external writes in the name·contract
- Cohesion ↔ Coupling: factor out only when the policy is the same and there is a real drift risk
- Coupling ↔ Readability: with few consumers use a local flow, with stable multiple consumers use a shared boundary
- Simplicity ↔ Performance: a simple implementation before evidence, and after measurement optimize only the necessary scope

Write only the trade-off that decided the choice; use the existing Decision rather than a separate
five-axis checklist. Its example lives in the delivery document linked above.

## Workflow owner

This document owns only the meaning of change cost and its rationale.

- The React runtime criteria are owned by [`frontend/decisions.md`](frontend/decisions.md) and
  [`frontend/authoring.md`](frontend/authoring.md).
- The Implementation Decision's path·fields·writing time are owned by
  [`delivery/implementation-decision.md`](delivery/implementation-decision.md).
- `PASS | FINDING | N/A`, the finding router, and the minimal fix procedure are owned by
  [`subagent-review.md`](subagent-review.md).

## Further reading — evidence, not authority

- [Fowler: YAGNI](https://martinfowler.com/bliki/Yagni.html) and
  [preparatory refactoring](https://martinfowler.com/articles/preparatory-refactoring-example.html):
  reject speculative capability without rejecting small changes that make the current task easier.
- [Cockburn: Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture): protect the
  application boundary from external technology, not a mandate for a port/factory around every call.
- [React: Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure) and
  [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect): preserve state
  ownership and distinguish user events from external synchronization.

## Universal rules not adopted

- Do not turn Toss's organizational structure·internal tools or a numeric threshold into a blocker.
- Do not auto-adopt FSD, a monorepo, or a specific state/query library.
- Do not unify hook returns, `type`/`interface`, exports, and function syntax.
- Do not judge component·hook·state structure by a paradigm label alone such as functional·object-
  oriented. The criteria are the state owner, the location of external effects, and the
  input·output·error contract.
- Do not make 100% coverage, zero dependency, or a specific React·Next version a universal rule.
- Do not make a build-vs-buy decision merely because “Toss made it”.
