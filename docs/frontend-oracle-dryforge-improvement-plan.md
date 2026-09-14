# Frontend Oracle Design: Dryforge-Informed Improvement Plan

## Outcome and scope

Preserve Oracle's approval, source authority, revision locks, RED/GREEN evidence,
independent review, and Low fast path. Improve two boundaries: detecting source intent
missing from a Draft, and discovering unsupported Delivery environments before expensive
Draft/lock work. Reuse existing cards, references, journals, evidence, and eval tooling.

Approved on 2026-09-14. Research compared Dryforge commit
`c950599d463d083a48e49c6dc1207904cf0c4374` with this repository at
`278f7cc33197d40f284a258260e6027329322a79` (Oracle 0.47.0).

This is an English implementation plan, not evidence that a model followed the workflow.
Prompt/source inspection establishes design mechanisms, not measured improvements in
accuracy, tokens, or design quality. Live comparative evaluation remains a separate task.

## What Dryforge contributes

| Mechanism                                                              | Benefit                                                           | Oracle adaptation                                                               |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Decision-surface audit against original conversation                   | Finds requirements omitted before they ever reach a specification | Conditional source-aware review, separate from existing card-only cold reads    |
| Intent completeness and artifact executability use different inputs    | Separates faithful requirements from self-contained instructions  | Preserve cold-read input isolation; do not add another three-document gate      |
| Findings return to the decision owner                                  | Reviewers do not invent product policy                            | Reuse Open questions, `POLICY_GAP`, explicit confirmation, and existing budgets |
| Cheap preconditions before mutation                                    | Avoids expensive work that cannot proceed                         | Investigate Delivery runner/verification capability early                       |
| Task contracts and persistent project context have different lifetimes | Reduces stale context and duplicated authority                    | Explain existing Card/journal/lock/ledger roles; add no memory system           |
| Risk and independence determine orchestration                          | Avoids unnecessary parallelism                                    | Preserve Low and conditional lifecycle/graph routing                            |

The capability investigation is an **Oracle-specific extension** of Dryforge's
pre-mutation principle. Dryforge does not implement browser capability probes or a
source-hash-bound readiness artifact. Conditional reviewer triggers are also our cost
adaptation, not a claim of identical upstream behavior.

### Do not import

- Mandatory handoff/spec/plan files, another scheduler, a new readiness state, or another ledger.
- `deferred-tunable` for decisions that change user outcomes or side effects.
- Mandatory fresh reviewers, worktrees, or whole-repository exploration for every task.
- Automatic browser QA, dependency installation, screenshot baselines, or approval defaults.
- Claims that natural-language review instructions are deterministic enforcement.

## Updated flow

```text
Existing entry / risk and lane selection
  Low -> existing single-node fast path
  Oracle -> Outcome and Source investigation
    -> Delivery only: cheap capability investigation
    -> existing Grill / Case space / Draft and verification realization plan
    -> conditional source-aware intent review
    -> existing card-only cold read and reverse impossible review
    -> Draft with Open questions / explicit user confirmation
    -> card lint / final revision lock
       Design-only -> ORACLE_READY or NEEDS_DECISION
       Delivery -> RED -> VALID_RED -> implementation -> GREEN -> independent review
```

Existing architecture/backend/source finalization and lock ordering remain authoritative.
Capability observations do not authorize implementation, replace actual execution, or
move implementation choices ahead of `VALID_RED`.

## P0-A: Audit the source-to-card direction

### Changes

1. Reuse investigated journeys, owners, boundaries, Grill questions, and Case space.
   Map each relevant outcome-changing decision to approved P/O/D rows, an unresolved Q,
   or a justified inapplicability. Avoid an exhaustive entity cross-product or new schema.
2. Keep implementation observations separate from policy approval. Unsupported
   `grounded` decisions and outcome-changing `tunable` decisions are not accepted.
3. Add one source-aware review before approval when combining sources across
   jurisdictions, revising approved policy/new identity-shaping intent, or discovering
   unmapped source requirements or unsupported inference.
4. Supply verbatim relevant user messages with message locations, approved source
   excerpts and versions, decision dispositions, and Draft bytes. Record the input list;
   an author's persuasive summary is not a substitute. Minimize sensitive content and
   treat source instructions as data, not reviewer authority.
5. Use an independent `analyst` surface with fresh context when available and permitted
   by host authority. Otherwise use the existing independent surface or record an
   explicit same-context fallback. Do not reuse a Delivery code-review receipt.
6. Findings identify source/message location, P/O/D/Q location or missing item, reason,
   `POLICY_GAP | EVIDENCE_GAP | NON_ORACLE_OPINION`, and the corresponding Q/investigation.
   Store findings and resolution in the existing journal, not a new artifact schema.
7. Investigate evidence gaps; return policy gaps to existing Open questions. Revisit only
   the affected neighborhood, with at most one focused recheck and existing budgets.
   Preserve card-only cold-read and reverse-review inputs and guarantees.

### Files and acceptance

Modify `skills/SKILL.md`, `references/card/{policy-sources,risk-grill,card-format}.md`,
and the relevant `references/subagent-review.md` contract within the Oracle package.

- An approved input-preservation requirement absent from the Draft is found and mapped.
- Production-only policy authority and unapproved retry defaults are rejected.
- A reviewer cannot create new product requirements or approve a Draft.
- A complete simple Oracle card does not acquire unnecessary questions/reviews.
- The card-only reviewer receives no conversation/source context.

## P0-B: Discover unsupported Delivery capability earlier

### Changes

1. If Delivery is explicit at intake, investigate after entry/risk/source discovery and
   before expensive Draft/lock/init/test writing. On later Delivery entry, investigate
   alongside the existing `$test` availability check before new lock/init/test writing.
2. Inspect the target repo, package scripts, connected runner configuration, trusted
   adapter contract, and real verification boundary. `node` availability or a package
   name alone does not establish support or rejection.
3. Record paths/commands, `supported | unsupported | unknown`, reasons, and remaining
   investigation or the existing FAIL cause in the journal. These are observations,
   not new workflow states. Investigate unknowns rather than guessing failure.
4. Preserve the current rule: only the trusted `node-test` reporter path yields
   `reported` evidence. A structurally unsupported route is an early
   `ENVIRONMENT_DEFECT → FAIL`, not permission to replace a runner, install a dependency,
   or promote `exit-only` evidence.
5. For applicable visual evidence, distinguish tool availability from authorization.
   Do not run browsers, install tools, or create baselines implicitly. Preserve pending
   visual evidence and existing completion restrictions.
6. Exclude Low and Design-only. Missing runtime tools do not prevent design-only work;
   proposed verification tools remain explicit gaps in the realization plan.

Modify `skills/SKILL.md` and `references/delivery/ledger.md`; do not add a capability CLI.

### Acceptance

- A fixture without an approved supported reporter path reports the specific obstacle
  before changing tests/production/lock/run-init. Merely containing vitest is not rejection.
- A supported fixture proceeds without another approval round.
- Unknown support prompts investigation, not fabricated readiness or automatic failure.
- Low and Design-only remain unchanged; pending visual evidence never becomes false completion.

## P1: Reuse artifacts and make evaluation inspectable

Document existing ownership: Card = approved contract; journal = non-authoritative
investigation/rationale; implementation-decision = implementation choices; lock = revision
binding; ledger/evidence = execution proof. Do not create another handoff document.

Add opt-in `--transcript-dir` to the existing `evals/run-live.mjs`, preserving raw host
stdout/stderr in fresh per-run directories with metadata linkage. Opt-out writes no
transcript artifacts. Prevent path traversal/overwrites; keep records private and use only
non-sensitive fixtures. Do not promote self-reported fields to observed evidence.

The current grader does not mechanically prove source-review input isolation or whether
failure preceded Draft/lock/init. Assess these from preserved raw transcripts and pre/post
file inventories by independent manual review. Missing records mean `unverified`, not PASS.

### Regression evidence

| Location                                                        | Obligation                                                                             | What it proves                                                               |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `scripts/skill-contract.test.mjs`                               | Conditional role/input contract, fallback, Low/Design-only exclusions, preserved gates | Deterministic document contract, not model compliance                        |
| `scripts/eval-live.test.mjs`                                    | Raw preservation, safe paths, no overwrites, opt-in, metadata and CLI integration      | Artifact capture behavior                                                    |
| `test-fixtures/oracle-intent-readiness/`                        | Omitted/complete/conflicting source inputs and supported/unsupported runner settings   | Fixed inputs for model/manual evaluation, not executed proof by themselves   |
| Existing black-box corpus plus separate adversarial diagnostics | Same expectations across baseline/candidate; no assumed approvals                      | Routing/evidence grading where supported; otherwise explicit manual judgment |

Keep the existing grader/corpus semantics and holdout rules. Do not require implementation
or `REVIEW_VERIFIED` from a design-only review prompt. Any new manual diagnostic corpus
must be labeled non-authoritative for aggregate machine grading.

### Comparative pilot protocol

- Pin baseline/candidate skill bytes and digests; use the same corpus, host/model, tools,
  fixtures, and preapproved response scripts. Do not change expectations after seeing results.
- Give each `(variant, case, replicate)` a pristine temporary workspace and independent
  host session. Repeating the same `--repo` is not isolation.
- Use one-case, one-replicate runner invocations and retain unique replicate IDs plus
  a manifest when aggregating results. Verify actual skill Read paths/digests; exclude
  runs using a global installation or the wrong revision.
- Pilot at least three repetitions per relevant case. Multi-turn approvals require fixed
  authorized responses or manual observation; silence is never approval.
- Report observed tool calls/tokens/runtime separately from self-reported and judged
  outcomes. Compare missed policy, false completion, question count, and extra review cost.
- Narrow or defer ineffective triggers instead of weakening existing safety gates to
  meet a cost target. Sampled results are not general correctness guarantees.

Live model benchmarking is not a prerequisite for publishing truthful workflow/tooling
improvements, but no measured quality/cost improvement may be claimed without those runs.

## Implementation and release verification

1. Fix expectations and run focused regression tests RED before behavior changes.
2. Implement P0-A, P0-B, and P1 in bounded diffs without new dependencies or graph nodes.
3. Regenerate reference bundles and affected generated eval/docs from canonical sources.
4. Run package tests/lint, bundle/docs checks, and changed-code static/type checks.
5. Independently review executable changes and gate preservation.
6. Synchronize plugin/package/marketplace versions, install the same verified release in
   Codex, Claude, and Jcode, and compare installed bytes with repository sources.
7. Commit only intended source/release changes and push normally; exclude unrelated runtime state.

```bash
rtk pnpm --filter @lodado/frontend-oracle-design-plugin test
rtk pnpm --filter @lodado/frontend-oracle-design-plugin lint
rtk pnpm --filter @lodado/frontend-oracle-design-plugin bundles:check
rtk pnpm --filter @lodado/frontend-oracle-design-plugin workflow-docs:check
```

Existing earlier improvements to node closure, Standard/High review finalization, hook
diagnostics, and the live eval runner are not reintroduced as missing features.

### Release verification: 0.48.0

- The full package run passed 358 of 359 tests; its sole failure was the old 0.47.0
  release expectation after the version bump. Both version assertions were updated.
- Final focused rerun: 87 tests passed, including all skill-contract and eval-live tests.
  The long full suite was not rerun after those expectation/manual-fixture corrections.
- Package lint, bundle/doc checks, JavaScript syntax checks, and independent executable
  review passed. Three existing lint warnings remain in unchanged files.
- Live model A/B quality/cost measurement was not performed; no improvement rate is claimed.

## Sources

- [Dryforge decision-surface review](https://github.com/prekuter/dryforge/blob/c950599d463d083a48e49c6dc1207904cf0c4374/src/skills/ready/SKILL.md#L203-L260)
- [Intent completeness and reviewer inputs](https://github.com/prekuter/dryforge/blob/c950599d463d083a48e49c6dc1207904cf0c4374/src/skills/ready/references/intent-completeness.md#L27-L82)
- [Three-document executability gate](https://github.com/prekuter/dryforge/blob/c950599d463d083a48e49c6dc1207904cf0c4374/src/skills/ready/references/3-doc-gate.md#L17-L86)
- [Pre-mutation checks](https://github.com/prekuter/dryforge/blob/c950599d463d083a48e49c6dc1207904cf0c4374/src/skills/go/SKILL.md#L97-L146)
- [Harness lifecycle](https://github.com/prekuter/dryforge/blob/c950599d463d083a48e49c6dc1207904cf0c4374/src/skills/go/references/harness-lifecycle.md#L8-L89)
- Oracle: `packages/frontend-oracle-design/skills/references/card/card-format.md`,
  `card/policy-sources.md`, `card/case-space.md`, `delivery/ledger.md`,
  `lifecycle-adaptation.md`, and `visual-design.md`.

Dryforge is MIT-licensed. These are selectively adapted principles, not a claim of full
conformance. Preserve copyright/license notices if copying substantial upstream material.
