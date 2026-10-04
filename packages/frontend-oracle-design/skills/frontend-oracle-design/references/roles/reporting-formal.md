# Formal-only controller verification and final report

Load before the controller reports, not in every specialist's context. No role's return creates acceptance.

## Verification before the final report

Four self-checks. Each names a way this skill has actually been bypassed. A check that cannot be answered
from artifacts on disk is a FAIL, not a judgment call.

1. **The lane header is true.** nodes lists only nodes actually Read, reconciled against actual tool
   calls, not the nodes the procedure says should have been read.
2. **Every claim cites the ledger.** No execution absent from runs.jsonl appears in the report.
   Each status word traces to a runId with label and exit code where the runtime records that state.
3. **The first nail was driven, not named.** The cold-read root and falsifying observation are both
   in journal.md, with the observation's result.
4. **The recorded state agrees.** oracle-run.mjs status --json reports the same terminal state the
   report claims. On disagreement the artifact wins and the report is wrong.

Checks 2 and 4 are also a command: `oracle-run.mjs status --dir <dir> --check-report <report|->`
compares Status and every cited r-NNN exit <n> with the ledger, failing REPORT_CLAIM_MISMATCH.
A VALID_RED, IMPLEMENTED_GREEN or REVIEW_VERIFIED Status with no runId fails the same way.
Claude Code's Stop hook runs this against the final message. Never manufacture a runId before init.
Design-only reports the actual contract/approval state without implying consumer test execution.
Re-read mandatory-verification before verification/review. With a model package, perform applicable
discovery closure again before reporting and preserve verdict/residuals, not a second approval.

## Final report

The block below is the Oracle lane's report for every new invocation, including Low. Historical Low
fast-path records retain their original three-line report; they do not waive current verification.
Padding inapplicable fields with N/A is a report defect.

1. **Lead with the state and the blocker.** First line states what actually happened. If the run did
   not reach its mode's normal terminal, second line names the blocking code and what would clear it.
   A blocker discovered at the bottom of a long field is a reporting defect.
2. **Print a group only when it applies; drop it whole when it does not.** Applicability is fixed by
   the table below, not by convenience. Never write a bare N/A. If an applicable group has nothing to
   show, give the reason in its place.
3. **Cite each runId once, and never truncate to fit a line.** A long value takes its own list item.

| Group                       | Printed only when                                                    |
| --------------------------- | -------------------------------------------------------------------- |
| Architecture                | an architecture boundary/state ownership/public API actually changed |
| Design, Design confirmation | visual scope is local or identity-shaping                            |
| External visual QA          | $frontend-visual-qa actually ran                                     |
| Mutation                    | risk is High                                                         |
| Closure                     | the card was projected from a model package                          |

```text
Status: <state>: <what actually happened, one line>
Blocked: <code>: <what it prevents> · <what would clear it>

**Outcome** actor/context · observable success · achieved result · non-goals

**Decisions**
- Chose <minimal boundary · state ownership · server/client · async · type contract>: sources <S*>
- Rejected <option>: <why>

**Changes**
- <path>: <observable behavior change>
- Delta new <O*> · kept <O*> · changed <O*>: <as-is> → <then> (only when the card has an As-is column)

**Verification**
- <label> <runId> exit <n> <grade>
- evidence verify <output> · findings verify <output>
- accessibility · performance: <claim, or the reason it does not apply>

**Closure** <verdict>: L1…L7 <pass|fail|n/a|no-evidence> · open candidates <n>
- Residual <kind>: <what was not verified>

**Risk and recovery** worst regression · what blocks it · reversibility/rollback

**Implementation**
- Round <n> <card rows>: hypothesis, minimal change, result
- Review <role>: findings, applied or not

**Evidence appendix**
- Oracle SHA-256 <digest> · source hashes <...>
- Row mapping <O*/D* → test name>
- Transitions <...>: last state <...>
- Budgets policy <n>/2 · harness <n>/2 · product <n>/3 · ENV_DRIFT <presence>
- Turns <n>: user turns from the request to this state
- Last verify <command> exit <n>
```

Report formal: proven only for modeled laws actually proved, conformance: tested with actual exhaustive/
sampled product scope, and checked type relations with diagnostics. Retain model/type/observation/sampling
limits and non-formalized scope. Plans, file creation, labels, scanner observations and Browser MCP cannot
be promoted to PASS. Open holds and visual-pending states retain their existing resumable meanings.
