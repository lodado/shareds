# Mandatory verification stack — Bend · type-fest · TypeScript · fast-check

Read this after `common.md` on every invocation, before investigation choices, Draft or lock.
This contract applies to every risk, including Low, and to both Design-only and Delivery.
Risk changes verification depth, not whether this stack is used. There is no opt-out, low-risk
fast path, sourceless N/A, or silent substitution for any member of the stack. The scope gate in
`SKILL.md` Entry decides whether the work belongs to Oracle at all — state, ordering, counts,
permissions or effects a model can state — and is not an opt-out for work that does. type-fest and
TypeScript apply when the card has an exposed type boundary (exported Props, a shared/package API,
a client state union, a trust-boundary type); a card with none declares `typeContract` not applicable
with the files it investigated and never adds an unused utility to fill the slot.

This changes the skill's operating contract, not the meaning of earlier execution records. Preserve
earlier cards, locks and ledgers; do not claim that a historical run used this stack. Resume against
the current requirements only after any necessary source and semantic delta is approved and locked
as a new revision. Never rewrite an old lock or ledger to manufacture compliance.

## Four distinct obligations

| Member     | Required use                                                                                                                                                             | Not a substitute                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Bend       | An approved reference model and laws, checked proofs, complete declared bounded space, Terms and Adequacy                                                                | Type checking, a model nobody connects to the product, or a passing runtime test                                              |
| type-fest  | With an exposed type boundary: an actually installed, version-pinned utility used at the real type-contract boundary to preserve a source-backed relation                | Merely mentioning the library, a dummy import, an unused alias, or assuming a transitive dependency is available to consumers |
| TypeScript | With an exposed type boundary: effective compiler environment, real positive and negative witnesses for that relation, checker canary and relevant mutation evidence     | Transpilation, suppressed unrelated diagnostics, or a runtime assertion alone                                                 |
| fast-check | Positive-count property/sequence sampling against the approved model, with actual run count, domain bounds, seed, failure path and shrunk counterexample when applicable | Hand enumeration, generated-but-unexecuted tests, exhaustive cases alone, or `--runs 0`                                       |

The members protect different boundaries. Do not claim that a type enforces async ordering, that a
model proof establishes server writes, or that sampling proves every possible product execution.
Keep expectation ownership on the existing card rows; the stack adds verification means, not four
copies of the policy.

## Before Draft and lock — both modes

1. Read `bend-cross-verification.md` and `adequacy.md` — and, with an exposed type boundary,
   `type-environment.md` and the type authoring ladder — with their graph dependencies. Identify the actual model, product boundary, source-backed
   relation and observation path. Do not invent a new product policy to make a tool applicable.
2. Prepare the pinned Bend executable using `ensure-bend.mjs`. Confirm the actual target TypeScript
   compiler and effective configuration. Confirm whether fast-check (and type-fest, with an exposed type boundary) is available as an
   explicit dependency at the target's owning package and record the resolved versions. A missing
   dependency is one approval item in the Draft: Design-only records it as unavailable until approved
   and installs nothing; Delivery adds it after approval with the project's package manager, lockfile
   and dependency rules. It does not authorize unrelated upgrades or configuration edits.
3. Record Terms, a finite Adequacy world and its goals/assumptions, the Formal Model and laws, and
   with an exposed type boundary, the type-fest utility's real protected relation — for new work in the model package first, then
   projected into the card (`bend-cross-verification.md` §2), never hand-copied into both. Include the compiler witness and fast-check
   realization plans in the existing Draft. Every declared assumption, excluded phenomenon, bound
   and expected outcome retains its approved source or an Open question.
4. Check the Bend laws, complete the bounded space and run the Adequacy check before confirmation
   and lock. Preserve their actual results. These pre-lock model checks do not authorize writing
   target tests or production code. The card, MODEL, LAWS, world and imported local sources are
   confirmed and locked together; PROOF remains a repairable proof candidate.
5. Design-only stops at the approved, checked and locked `ORACLE_READY` contract. It uses the
   formal checks and records the type-fest/static/fast-check plans and capability results, but
   does not write or execute consumer test files or production changes. Do not report these plans
   as completed product verification. Delivery executes them after its existing initialization
   and explicit `$test` gates.

Within Oracle orchestration, a sibling test skill's standalone Low/card exemption or hand-enumeration
fallback cannot waive this stack. Standalone test requests outside Oracle retain their own scope.

Behavior no model can state is stopped by the scope gate before this stack. Inside work that passed
it, an unsupported domain, a requirement only the unmodelable part can state, or a necessary
unapproved source/configuration change is a blocking decision, not permission to create meaningless
proofs or types: retain the evidence and use `NEEDS_DECISION`. A missing tool, failed approved
installation, broken checker or structurally unsupported runner is `ENVIRONMENT_DEFECT` → `FAIL`.
Automatic Bend selection no longer permits falling back to ordinary tests. Never silently narrow
the domain, replace type-fest with a custom equivalent, or replace fast-check with enumeration.

## Delivery — actual execution, not a checklist claim

Register these required, reported labels at `oracle-run.mjs init`, in addition to the target repo's
real behavior, impact, lint, typecheck and build labels:

```text
bend-proof:reported
bend-adequacy:reported
type-contract:reported
fast-check:reported
```

`type-contract:reported` is required only when the card has an exposed type boundary; a card that
declares `## Type Contract` not applicable registers the other three.

Use existing trusted `node-test`/`vitest` reporter paths to assert each check and record the actual
runs. Do not invent a Bend or TypeScript trusted adapter. Inspect current runner support before
choosing the harness; a directly executed CLI's exit code is not a reported product test result.
The recommended pair is `vitest` with `fast-check` ([`bend-cross-verification.md`](bend-cross-verification.md) §4);
an existing `node:test` harness stays, and a missing runner is a Draft approval item.

When registered, the type-contract check must compile the actual type-fest consumer and its witnesses with the
target compiler; a separate fixture using unrelated types is not consumer evidence. The fast-check
check must execute positive-count sampling and assert the owning model relation/invariant, not
only import `fc` or assert that a generator exists.

Both projection generators refuse a missing, zero or non-integer `--runs` (`SAMPLING_REQUIRED`). For
trace projection, pass a stated `--max-length` greater than Bound; the generated test counts the
executed runs and the length each trace actually reached, and fails when fewer runs executed than
requested or when the environment allows traces past the bound but no sample reached one. For state
projection, the useful exhaustive check on small domains stays and a separate fast-check property of
`--runs` runs is always added and counted; the earlier small-domain generator that skipped sampling
whenever it stayed exhaustive is gone — regenerate files it produced. Do not reduce exhaustive coverage
to obtain a library import.

Model proof, adequacy, static rejection and harness failure are not a product `VALID_RED`. Record a
product contract violation before any product edit, or take the existing zero-production
`ALREADY_SATISFIED` path with evidence. Then require fresh stack and repo verification for the
current snapshot at GREEN and again after independent review.

The existing runner enforces the labels registered at initialization, lock drift and reported run
evidence; it does not infer arbitrary library use from a label's spelling. For a card projected from a
model package, `init` also refuses unless every label above that applies is registered (`STACK_LABELS_REQUIRED`)
and the lock covers the package (`PACKAGE_UNLOCKED`); a legacy card keeps its earlier gates. The operator and
independent reviewers must check the consumer path, commands, reporter cases and artifacts. A
label alone proves neither a proof nor a compiler rejection nor fast-check execution.

## Review and completion

Every review receives this contract. Check every applicable obligation, their sources, real target paths,
positive/negative observations, snapshots and actual ledger-bound runs. Missing required evidence
is `EVIDENCE_GAP`; a misleading adapter or compiler harness is `HARNESS_DEFECT`; changed policy
uses a new confirmed revision. No member is marked N/A to obtain completion.

Report model laws as `formal: proven`, product correspondence as `conformance: tested` with
exhaustive and sampled scope, and type guarantees as actual checked relations with diagnostics.
State any residual model, type, observation and sampling limits. With a model package, add the
closure verdict of [`discovery.md`](discovery.md) and its residual-risk list; the closure attacks the
space these four obligations verify and replaces none of them. All existing visual-pending,
independent-review, TDD, budget and final-report gates remain in force.
