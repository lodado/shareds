# Automatic Bend proof cross-verification for applicable Oracle work

Within the Oracle lane, assess applicability before Draft/lock without waiting for the user to say
"Bend". Automatically select this path for a pure calculation or deterministic state transition with
a meaningful invariant (for example bounded quantities, monetary conservation, or legal state
transitions) whose domain fits Bend's `Nat` or `U32`. A domain that needs negative numbers, 64-bit
values or a provable floating-point result is not eligible (Bend's F32 is axiomatic): record that
reason and continue normal Oracle verification. Also load it for an explicit Bend request. Start with one small core, not the whole UI;
do not invent a separate model for copy, CSS, trivial formatting, or external I/O alone. When no
eligible core exists, record that reason in the existing investigation and continue normal Oracle
verification. An explicit request outside the provable scope needs an explanation, not a fake proof.

This adds a verification technique, not a second orchestrator, runtime, approval flow, or delivery
state. Oracle owns approved policy and transitions; `$test` owns behavior tests and judgment. Low
does not load this node. Design-only may propose laws and their mapping, but writes no tests,
proof/model implementation, or production code and claims no executed proof. Automatic selection
authorizes only the pinned install in §1, never policy approval or bypassing the existing gates.

## 1. Scope and capability before Draft/lock

- Identify the actual module/export, input domain, numeric representation/overflow, invalid-input
  behavior, state transitions, and external assumptions. Each assumption must trace to approved
  policy or remain an Open question; narrowing inputs just to make a proof pass changes policy.
- In Delivery, run `scripts/ensure-bend.mjs` at capability discovery. It reuses a pinned-version
  Bend already on PATH or under `BEND_HOME`/`~/.bend`; otherwise it downloads the GitHub release,
  checks it against the sha256 pinned in the script and unpacks it into the skill's own cache. It
  never pipes `curl` to a shell or edits PATH and shell files. Call the absolute path it prints with
  `BEND_NO_TELEMETRY=1`. Design-only installs nothing and may record the limitation without
  claiming execution. Also read `bend guide` and the repository's existing trusted test runner; do
  not add a test dependency implicitly. Bend 2 is not the old HVM runtime.
- When `ensure-bend.mjs` fails (offline, sandbox, unsupported platform, checksum mismatch), an
  automatically selected path records the printed code and continues with normal Oracle
  verification; an explicit Bend request is `ENVIRONMENT_DEFECT` → `FAIL` for proof execution.
  Either way, never replace proof with tests silently or call a tool failure "not applicable".
- Keep UI, browser, network, foreign code and uncontrolled time/randomness outside the pure model;
  name the corresponding Oracle behavior checks. An assumption about an external effect is not a
  proof of that effect. Distinguish structural checks, executed tests, human acceptance, and formal
  proof; none substitutes for another.

## 2. Independent drafts, one approved contract

When native delegation is supported, authorized and has capacity, dispatch two independent analyst
tasks before waiting for either, so both actually run concurrently. Give them the same approved
source excerpts and revision, not each other's initial answers. The law analyst proposes invariants
and assumptions; the behavior analyst proposes observable outcomes, Never conditions, and
boundary/ordering cases. Neither starts another full Oracle workflow or changes the shared contract.
Before approval these are read-only investigations and candidate statements returned to the
Controller, not implementation work. The Controller waits for both before merging their results.

Join the drafts before showing the Draft Oracle: compare missing conditions, extra assumptions and
conflicts. Map each candidate law to existing `P*`/`I*`/`O*` rows rather than creating another policy
schema. A condition outside the formal model remains covered by Oracle, not silently omitted.
Unresolved policy follows `POLICY_GAP` → `NEEDS_DECISION`; agreement between agents is not approval.

The Controller presents the exact law statements and assumptions with the Draft/delta. After user
confirmation, materialize the approved `LAWS.bend` as a local Source Registry source and include its
bytes in the existing revision lock before init. It may import the future implementation; that does
not authorize writing it early. Implementers may write `PROOF.bend` and implementation later, but
cannot edit approved laws, assumptions, or Oracle expectations. A semantic law change needs the
existing new-revision confirmation/lock flow, never an in-place relock.

Disjoint file ownership alone does not prove independence: check shared mutable inputs and external
resources too. If native delegation, independent contexts or concurrency capacity are unavailable,
record the concrete limitation in the existing journal and run sequentially; never claim parallel
or independent execution that did not occur. This path does not implicitly activate graph mode or
replace Oracle's required reviewers.

## 3. Delivery: preserve RED, then build and prove

Follow `delivery/ledger.md` and `$test` at their normal load points. Before init, register the proof
check as an additional required label, for example `bend-proof:reported`, while retaining every
existing required label. Discovering applicability after init needs the existing revision/run
procedure, not manual edits to required labels or the ledger.

Prepare proof/correspondence harness tests with the behavior tests before RED, but use a real
behavior violation to establish `VALID_RED`. A missing compiler/proof file or a checker/type error
is not behavioral `VALID_RED`. Only then write the pure implementation/model and `PROOF.bend` through
the existing implementation path; do not launch conflicting product writers to imitate parallelism.
Keep proof authoring and behavior validation separate. Once their common inputs are stable, launch
the proof harness and behavior tests as separate ledger-backed executions in the same scheduling
batch, then wait for both. This is actual tool concurrency, not just two headings in a plan. Each
run keeps its own label, runId and output/report paths; never share mutable test fixtures, browser
contexts or output files. If the host cannot run them concurrently, or inputs/resources cannot be
isolated, record the concrete reason and run sequentially. Do not test a model or product being edited.
Do not execute proof checks before `VALID_RED`. The existing `ALREADY_SATISFIED` path may instead
check existing proofs with zero production/model/proof edits; never fabricate RED to authorize edits.

`PROOF.bend` must import the approved `LAWS.bend` and discharge every in-scope law. With the verified
Bend 2 CLI, the checker invocation is:

```sh
bend path/to/PROOF.bend --verdict
```

Use one test in the target repository's existing trusted `node-test` or `vitest` harness to invoke
the pinned executable that `ensure-bend.mjs` printed, without a shell and with `BEND_NO_TELEMETRY=1`, capture stdout/stderr, and assert **exit 0, no signal, and an
exact `ALL PROOFS CHECK` stdout line**. Missing/open laws, `?TODO`, failure output, timeout and tool
errors must fail the check. Run that harness through the existing ledger, for example:

```sh
node <skill-dir>/scripts/oracle-run.mjs exec --dir <oracle-dir> \
  --label bend-proof:reported --adapter node-test --report <report-path> \
  -- node --test <proof-check.test.mjs>
```

The paths and test are target-repository artifacts to create through the approved `$test` flow,
not utilities shipped by this skill. Do not invent a `bend` trusted adapter or forge a reporter.
A direct CLI run is `exit-only` execution evidence; it cannot replace reported behavior evidence,
establish `VALID_RED`, or by itself certify model/product correspondence. The wrapper's reported
result attests its assertions, not the soundness of the compiler or completeness of the laws.

Record the executable/version, exact command, checked laws, assumptions, raw output and runId.
Keep all proof inputs (laws, model, proofs, implementation and local imports) tracked/non-ignored
inside the scan root, outside the excluded Oracle artifact directory. Pin external libraries and
tool versions; a mutable external input cannot be treated as snapshot-bound by the runner.

## 4. Cross-check the model against the product

Cross-check after the proof and behavior executions have joined; neither branch's PASS alone permits
completion. The Controller owns the join and final state transition, not either worker.

After `VALID_RED`, put the mapping in the existing Implementation Decision and pass the raw inputs
to independent review; do not create another state ledger. For each formalized contract, record:

```text
P*/I*/O* → Bend law → actual product module/export
shared input domain/representation → observable result/error mapping
proof check name/runId → correspondence test name/runId → outside-proof behavior checks
```

If the product uses a separate TypeScript implementation, run differential tests: feed the same
policy-derived normal, boundary and invalid inputs (or transition sequences) into the executable
Bend model and actual implementation; compare public results/errors. Do not paste Bend formulas
into a JavaScript mock or call that correspondence evidence. Use the existing trusted runner and
evidence mappings; these tests supplement rather than duplicate ownership of Oracle expectations.
Differential tests cover sampled inputs, not a proof of equivalence for all inputs. If the product
uses generated Bend code directly, still verify the actual generated artifact and its calling
boundary; a proof of an unused model does not verify the product.

At the join, reconcile the law list against the approved contract, check assumptions and uncovered
behavior, and inspect counterexamples from both paths. Classify the cause before repair: policy
conflict → `POLICY_GAP`; missing proof/correspondence evidence → `EVIDENCE_GAP`; a demonstrated
implementation violation → `PRODUCT_DEFECT`; tool/harness failure → the existing environment/harness
route. Failure to construct a proof alone does not demonstrate a product defect. Preserve existing
budgets; never weaken laws/tests, exclude failing inputs, or loop without a bound to force agreement.

## 5. Join, freshness and claims

Before GREEN/review, require the proof harness, model/product correspondence checks and all normal
Oracle checks to pass against the same current revision and inputs. A change to laws/assumptions
requires reconfirmation; a change to model, proof, implementation, compiler or dependencies requires
affected checks to run again. No stale proof result may authorize completion.

Use the existing review packet/context mechanism to supply law, proof, model and actual source files
plus the mapping, commands and runIds. Include this reference as an applicable review point. Keep
law sources policy-bound and implementation/proof files as evidence, not new policy authority.
Oracle alone makes the existing state transition after the join; neither worker may issue it.

The existing runner enforces declared labels, snapshots and ordinary evidence gates. It does not
interpret Bend laws or automatically verify this semantic mapping; independent review must inspect
it. Report the proven property and model, tested correspondence, remaining runtime checks and trust
limits separately. `--verdict` adds a Lean-proven kernel check, but does not prove the translation
pipeline, foreign I/O, all compiler behavior, or the user's unstated intent. No `@unsafe`, foreign
assumption or axiomatic F32 claim may be presented as a proof of real runtime behavior.

## Official references

Checked against Bend v2.0.34, the version `scripts/ensure-bend.mjs` pins; a version bump updates its
checksums and this page together.

- [Laws, proofs and trust boundary](https://github.com/bendlang/bend/blob/v2.0.34/guide/GUIDE.md#laws-and-proofs)
- [CLI verdict and exit behavior](https://github.com/bendlang/bend/blob/v2.0.34/bend2/main.ts)
- [Language limitations](https://github.com/bendlang/bend/blob/v2.0.34/README.md#limitations)
