# Delivery — minimal implementation·GREEN gate·review transition

## Minimal implementation·self-feedback

At most 3 rounds. One round:

1. Select one failing card row or a bundle of rows with the same root cause.
2. Trace the relevant call path to the end and identify the cause every caller shares.
3. Write the minimal production change that satisfies only that contract.
4. Re-run the targeted test that was failing.
5. Run the impact-scope tests.
6. Classify the result and decide the next action.

Round 3 never resumes the context that failed rounds 1 and 2. Dispatch a fresh implementer — a
subagent that receives only the locked card, the failing run output, the current diff, and the
Implementation Decision, on a more capable tier when the surface offers one — and record
`fresh-dispatch` in the round table's Next judgment. A loop that survives two same-context rounds
usually means the implementer cannot see its own problem; the third round buys fresh eyes, not a
third attempt at the same reading. The product budget stays 3: the dispatch is round 3, not an
extra round.

The canonical definition of classification·routing is the feedback routing in
[`common.md`](../common.md). Special rules for this stage:

- `POLICY_GAP` → print the current card and the question, then `NEEDS_DECISION`
- `EVIDENCE_GAP` → add only the missing tests·evidence within the locked card scope
- `HARNESS_DEFECT` → correct only within the sibling `test` skill's allowed items and the shared 2-use budget
- `PRODUCT_DEFECT` → keep the same card row, make the minimal fix, and re-run
- `ENVIRONMENT_DEFECT` → `FAIL` without touching production
- `NON_ORACLE_OPINION` → record it but do not change policy·assertions·completion state

A revision mismatch is not a target of feedback classification. Immediately discard the existing
evidence and move to `NEEDS_DECISION` or `FAIL` per the lock rules of
[`card/confirmation-lock.md`](../card/confirmation-lock.md).

Record every round:

| Round | Card row | Failure hypothesis | Minimal change | Actual run result | Next judgment |
| ----- | -------- | ------------------ | -------------- | ----------------- | ------------- |

## GREEN gate

After the card tests pass, actually run the repo verifications pinned with `--required-label` at init
through the `exec` of each label.

1. targeted test
2. impact-scope test — the required label `impact`. The file list is machine-fed, never judged:
   `oracle-run.mjs status --dir <dir> --changed-files` prints every path changed since the init
   baseline, one per line, and the repo's own related-tests command consumes it (`vitest related`,
   `jest --findRelatedTests`, `nx affected`). Other locked cards whose evidence tests fall in that
   set are reported as preserved in the final report.
3. typecheck and lint
4. Oracle source lock verify and any structure verification command that exists in the repo
5. required root or package test/build
6. side-effect ownership — `oracle-verify.mjs scan --side-effects --oracle <card> --path <changed
production files>`. Every known side-effect token in the diff (network·storage·navigation·
   messaging·analytics·timer·subscription·console·notification) must fall in a category some card
   row's side-effect column owns, or carry an `oracle:side-effect <row|reason>` comment on the
   same or the previous line. The exemption needs a real row (`oracle:side-effect O3`) or a reason
   in words; a bare marker, or a row the card does not have, is `SIDE_EFFECT_EXEMPTION_INVALID` —
   the exemption is audited like an `impossible` witness, never a free pass. `SIDE_EFFECT_UNOWNED` routes like the reviewer's finding would: the
   card lacks the row → `POLICY_GAP`; the card has the row and the implementation added an effect
   it never asked for → `PRODUCT_DEFECT`. The token list is known and finite — a clean scan is
   not evidence of no side effects.

If there is a performance requirement·improvement claim, add the existing repo command that checks a
same-condition baseline/after as a required `performance` label. If the exported shared/package API
changes, add only the type test, runtime test, and pack/export·changeset verification the repo already
provides as required labels. Do not create these commands or a new dependency for work where they do not apply.

Commands defined in the repo rules take precedence. Do not report a verification that was not run as
passing. If there is no documented command, read the package scripts and run the targeted verification
plus the closest package verification. If a required root command is missing or there is an unrelated
pre-existing failure, report the raw text and the impact separately and do not hide it behind GREEN.

Then attempt the `--to IMPLEMENTED_GREEN` transition. Machine checks:

- `ORACLE_CHANGED` — the card·source bytes differ from the locked values → discard the evidence and `NEEDS_DECISION`
- `RUN_NOT_GREEN` — the quoted run did not pass → produce an actually passing run and quote it
- `EVIDENCE_REQUIRED` — a state transition was attempted without an evidence manifest → map every row of the locked card and quote it with `--evidence`
- `REQUIRED_RUN_MISSING` — there is no latest pass for a declared required label → re-run that repo command with `exec --label`
- `FLAKINESS_GATE` — consecutive passes of the same command fall short of the count the risk requires → re-run the same command as-is to secure consecutive passes
- `TEST_WEAKENED` — assertions decreased, forbidden tokens, or deletions relative to the RED baseline → restore the tests to their original strength
- `ENV_DRIFT`(warning) — the RED and GREEN execution environments differ → confirm whether the environment difference changed the result and leave it in the report

The required flakiness count is Low 1, Medium 2, High 3. It is not about extracting a pass by
re-running but a procedure for showing that **the same command passes deterministically even when
repeated**. If a failure is mixed in, classify it as `HARNESS_DEFECT` and do not quietly roll it again.

`TEST_WEAKENED` forbidden tokens: `test.skip`·`it.skip`·`describe.skip`·`.only(`·
`waitForTimeout(`·`toBeTruthy(`·`toBeFalsy(`·`.first()`·`.nth(`·`setTimeout(` and raising the
screenshot tolerance (`maxDiffPixels`·`maxDiffPixelRatio`·`threshold`).

The chosen GREEN run must be a card test run that has a parsed reporter. Separate lint·
typecheck·build are each recorded under their declared label. The transition directly inspects every
required label and the evidence manifest, and only when the transition passes is it `IMPLEMENTED_GREEN`.

### Evidence manifest

Evidence mapping is managed as `.ai/oracles/<oracle-id>/evidence.json` rather than prose and is
verified by machine. Do not move row IDs by hand; generate the skeleton from the locked card and then
fill in only the values — this removes the round trip where the row set diverges from the card and
comes back as `EVIDENCE_MISSING_ROW`·`EVIDENCE_UNKNOWN_ROW`.

```bash
node <skill-dir>/scripts/oracle-verify.mjs evidence-scaffold \
  --oracle .ai/oracles/<oracle-id>/oracle.md > .ai/oracles/<oracle-id>/evidence.json
```

Replace the `<...>` slots in the generated output with the actual test name·artifact·finding·source.
An unfilled placeholder fails `evidence` verification as-is.

```json
{
  "schemaVersion": 1,
  "rows": {
    "O1": { "kind": "test", "name": "save > shows pending and POSTs once" },
    "O2": { "kind": "test", "name": "save > shows pending and POSTs once" },
    "O3": { "kind": "na", "reason": "this feature has no cancel path", "source": "S1" },
    "O4": { "kind": "reviewer", "finding": "f-3", "role": "code-reviewer" },
    "D1": { "kind": "visual", "artifact": "visual-qa/v-001/evidence.json" },
    "D2": { "kind": "reviewer", "finding": "d-1", "role": "designer" }
  }
}
```

`O1`·`O2` above quote one test on purpose: one observation covers both rows, and splitting it would
buy a second export rather than a second observation. Give a row its own test name only when it needs
its own observation.

```bash
node <skill-dir>/scripts/oracle-verify.mjs evidence \
  --oracle .ai/oracles/<oracle-id>/oracle.md \
  --map .ai/oracles/<oracle-id>/evidence.json \
  --ledger .ai/oracles/<oracle-id>/runs.jsonl \
  --run r-007 \
  --phase green
```

`D*` row owners: `HARD → test`, `RELATIONAL → visual | pending`, `JUDGMENT → designer
reviewer`. A visual `pending` or a Visual QA `declined` is reported as an unverified item in GREEN
evidence verification but blocks completion with `EVIDENCE_PENDING` in review evidence verification.
To reach `REVIEW_VERIFIED`, one of an existing tool browser journey artifact, a designer finding, or a
source-backed N/A revision is required. N/A is used not as an artifact but only when the locked card row
states `N/A (source: S*)` and the manifest quotes an approved Source Registry ID.

A RELATIONAL visual artifact receipt must be a regular file inside the Oracle directory, artifact paths inside the receipt must be relative to the receipt directory, and the minimum format is
as follows.

```json
{
  "schemaVersion": 2,
  "oracleSha256": "<locked-oracle-sha256>",
  "rows": {
    "D1": {
      "status": "passed",
      "journey": {
        "status": "passed",
        "tool": "playwright",
        "scenario": "primary purchase card at 320px and desktop",
        "checks": ["CTA does not overlap price"],
        "artifacts": ["mobile.png"]
      }
    }
  }
}
```

If only the browser journey is N/A, the row itself must still be `status: "passed"`, and row-level `checks`/`artifacts` and the approved source the row quotes are required. A whole-row N/A uses not an artifact but only `kind: "na"` in the manifest above.

```json
{
  "schemaVersion": 2,
  "oracleSha256": "<locked-oracle-sha256>",
  "rows": {
    "D1": {
      "status": "passed",
      "checks": ["Static relation reviewed from approved design source"],
      "artifacts": ["d1.png"],
      "journey": {
        "status": "not-applicable",
        "reason": "No interactive browser journey for this static relation",
        "source": "S1"
      }
    }
  }
}
```

The GREEN transition takes the same manifest as a required input.

```bash
node <skill-dir>/scripts/oracle-run.mjs transition \
  --dir .ai/oracles/<oracle-id> \
  --to IMPLEMENTED_GREEN \
  --run r-007 \
  --evidence .ai/oracles/<oracle-id>/evidence.json
```

`kind: test` requires that the same name exists as a pass in the reporter result of the quoted run.
`EVIDENCE_NOT_IN_RUN` = the mapping diverges from the actual run, `EVIDENCE_UNVERIFIABLE` = the run is
`exit-only` so the name cannot be confirmed. For both, do not invent a name; attach a reporter and re-run.

The final report first writes the Outcome Brief's user·success outcome·non-goals, the minimal boundary
chosen, the change per path, the verification, and the remaining risk and reversibility. In the
evidence appendix, record the Oracle SHA-256·source hashes·last verify command/exit, the quoted runId
and the actual verification command/PASS·FAIL counts, and the `oracle-verify.mjs evidence` output.
Record alongside them only the commit·runtime/browser version·locale/timezone·viewport/theme·role·clock/seed·data
initialization that affect the result. If a non-N/A row is unmapped or the revision does not match, do not issue GREEN.

Confirm the nondeterministic sources in the production diff by running `oracle-verify.mjs scan` on the
changed files. Replace a detected `Date.now`·`Math.random`·`crypto.randomUUID`·`toLocale`·`new Intl.`
with an injection seam, or record an exemption with an `oracle:nondeterminism <reason>` comment.

### Final review transition

After `IMPLEMENTED_GREEN`, if reviewer findings are reflected, re-run the test run to be quoted with
the same command used at GREEN. Quoting a pre-GREEN run as-is is `REVIEW_RERUN_REQUIRED`.
For the remaining required labels, reuse the existing passing run if the lock·worktree·production·harness
digests are the same as at GREEN, and if bytes changed from reflecting findings, `SNAPSHOT_STALE`
demands a re-run — re-running the same bytes does not add evidence. The review artifact must have no
blocking finding.

```bash
node <skill-dir>/scripts/oracle-verify.mjs review \
  --oracle .ai/oracles/<oracle-id>/oracle.md \
  --file .ai/oracles/<oracle-id>/findings-code-reviewer.json \
  --packet .ai/oracles/<oracle-id>/review-input.json \
  --revision <targetRevision-from-review-packet> \
  --map .ai/oracles/<oracle-id>/evidence.json

node <skill-dir>/scripts/oracle-run.mjs transition \
  --dir .ai/oracles/<oracle-id> \
  --to REVIEW_VERIFIED \
  --run r-010 \
  --evidence .ai/oracles/<oracle-id>/evidence.json \
  --findings .ai/oracles/<oracle-id>/findings-code-reviewer.json
```

High risk passes the reported failing run with the guard removed after GREEN and the affected card row
via `--mutation-run`·`--mutation-row`, and after restoring the guard makes the same GREEN command pass
again as the review run. The runner also inspects whether the production digest changed at the mutation
relative to GREEN and returned exactly before the review. If either of the two is missing it is
`MUTATION_EVIDENCE_REQUIRED`, and if the order·failure·reporter·digest conditions do not hold it is
`MUTATION_EVIDENCE_INVALID`. Pass the second reviewer file together with `--intersect`.
A critical/high finding blocks the review even if it exists on only one side.

```bash
node <skill-dir>/scripts/oracle-run.mjs transition \
  --dir .ai/oracles/<oracle-id> \
  --to REVIEW_VERIFIED \
  --run r-012 \
  --evidence .ai/oracles/<oracle-id>/evidence.json \
  --findings .ai/oracles/<oracle-id>/findings-code-reviewer.json \
  --intersect .ai/oracles/<oracle-id>/findings-second-reviewer.json \
  --mutation-run r-011 \
  --mutation-row O3
```

## Forbidden

In addition to the common prohibitions in [`common.md`](../common.md):

- Changing the card's policy·`Then`·`Never`·side-effect count
- Reporting a run that did not go through the ledger as evidence
- Routing around a rejected transition or editing `run-state.json`·`runs.jsonl` directly
- Repeating correction·improvement rounds without counting the budget
- Hiding errors with assertion weakening, `test.skip`, or `first()`/`nth()`
- Encoding the expected result into a fixture
- Serializing a race with an arbitrary sleep or by waiting on the assertion target
- Adopting the browser's current behavior as the expected value
- Modifying production on the basis of an invalid RED
- Auto-relocking a revision mismatch to reuse existing evidence
- Creating·modifying an architecture document or refreshing the lock without approval
- Retroactively changing the document·boundary to match the implementation rather than the approved architecture document

If it is still not GREEN after 3 rounds, report `FAIL` including the remaining card violations and the
actual output. Do not do unbounded self-improvement.
