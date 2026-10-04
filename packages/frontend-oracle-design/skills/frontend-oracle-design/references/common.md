# Common contract — authority · policy sources · feedback routing

Read this before any other reference node on every invocation, regardless of risk or mode. Immediately
after it, load `mandatory-verification.md` before Draft/lock. Definitions that used to be duplicated across references are
canonical here — each reference adds only its own stage-specific rules, and on any conflict this
document wins.

## User communication contract

After the mandatory lane header, speak in the user's language. Keep internal codes as supporting
labels, not the whole explanation. Distinguish facts, assumptions, and recommendations. This is
not an extra approval gate: continue ordinary investigation and planning; preserve existing policy
questions, Draft confirmation, lock, and delivery gates. The historical Low fast path is legacy-only; it adds no current routing exception. New Low work uses
the same Oracle entry and mandatory verification as every other risk.

| Message    | Required content                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Start      | Goal, scope/non-goals, expected artifacts, first action.                                                                               |
| Progress   | Current stage, newly established fact or result, next action.                                                                          |
| Decision   | Unresolved question, recommendation and reason, alternatives/tradeoffs, what remains blocked. A recommendation is not approved policy. |
| Failure    | Observed cause (or unknown cause), impact, recovery action and outcome; retain the canonical classification.                           |
| Completion | Actual state, result, changed paths, verification evidence, unverified scope and artifact paths.                                       |

Emit progress only when the stage, evidence, scope, or blocker changes. Do not invent percentages or ETAs.
Put the short result first; for detail, link files the workflow already keeps (card, journal, ledger
reports) instead of dumping raw tool logs, and never create a file just to hold tool output.
Never claim a linked file exists without checking it. No new progress artifact is required.

Example shapes (placeholders, not execution claims; translate to the user's language):

```text
[시작] 목표: <사용자 결과> · 범위: <포함 / 제외>
산출물: <예정 파일> · 먼저: <조사>

[진행 · <단계>] 확인: <새 근거> · 다음: <행동>
가정: <있을 때만 명시; 확정 사실과 분리>

[결정 필요 · NEEDS_DECISION] <질문>
추천: <안> — <이유> · 대안: <차이>
미결정 영향: <확정할 수 없는 동작>

[문제 · <분류>] 원인: <관측 사실 또는 미확인>
영향: <검증/작업 범위> · 복구: <다음 조치 또는 실제 결과>

Status: <실제 상태> — <실제로 완료된 결과>
Blocked: <있을 때만: 원인과 해제 조건>
변경: <경로와 결과> · 검증: <label / runId / exit / grade>
미검증: <남은 범위와 이유> · 상세: <실제 보고서 경로>
```

Completion uses SKILL.md's existing Final report applicability and evidence rules, not a second
report. Cite each runId once. Design-only work reports the card/approval state without implying
test execution; unavailable evidence is unverified, never PASS. File creation is not execution,
and `IMPLEMENTED_GREEN` is not `REVIEW_VERIFIED`. Progress summaries cannot create ledger states.

## Authority priority

Priority of material the user provided or the repo designated as an approved standard. A lower
source never overrides a higher one.

1. Mandatory constraints (`mandatory-constraint`): security, privacy, legal, accessibility,
   financial and data integrity
2. The user's explicit behavior contracts and public compatibility
3. The target repo's required architecture·API·test contracts (including `AGENTS.md`·`CLAUDE.md`)
4. Approved specs·PRD·acceptance criteria·design system·Figma originals, within their jurisdiction
5. The Oracle Card that translates the above into an executable contract
6. Official docs for the actually installed versions, framework maintainer·community heuristics —
   implementation options, not product policy sources
7. Production code·existing tests·browser observation — investigation evidence, not answer
   authority

When a `mandatory-constraint` conflicts with another source, never pass by downgrading
security·accessibility·integrity to a product or visual preference. Present the conflict and a safe
alternative, then `NEEDS_DECISION`.

## Risk taxonomy — canonical

Risk judgment is canonical in this document. Other documents point to this table and add only their
lane procedure.

| Risk     | Entry criteria                                                                                                                                                                        | Lane     | Default evidence                                                                                                                                   |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Low`    | no new policy·architecture decisions; a clear regression fix inside an existing approved behavior contract that still has a modelable core                                            | `oracle` | common + mandatory-verification + Bend/fast-check, plus type-fest/TypeScript with an exposed type boundary; same Oracle gates (scope may be small) |
| `Medium` | needs a contract — new UI states·forms·responsive structure·async ordering·local/identity visual intent beside modelable behavior — but not payment·permission·data-loss-scale damage | `oracle` | Oracle Card, `VALID_RED`, required-label GREEN, one independent review                                                                             |
| `High`   | payment·permissions·destructive actions·data loss·legal/security/privacy/financial/complex concurrency, where a false GREEN is costly                                                 | `oracle` | Medium evidence + consecutive-GREEN hardening, mutation kill·revert·re-GREEN, 2-sample independent review                                          |

Risk judgment may take one optional evidence input: `scripts/oracle-twr.mjs` scores the target
files' time-weighted bug-fix history from git. A high score is grounds to raise the lane or spend
more sweep·exploration budget; it is never a gate, never grounds to lower a judgment, and its
absence blocks nothing.

Low is not a bypass or escalation lane. Every Low invocation stays in the Oracle lane and loads
common plus mandatory verification before Draft/lock. Copy, token and isolated-CSS work has no behavior a model can state: the scope gate in `SKILL.md`
Entry stops it before this stack instead of looping in `NEEDS_DECISION`. The historical [`lanes/low-fast-path.md`](lanes/low-fast-path.md)
text only explains legacy records and cannot authorize a new-work carve-out.

## Jurisdiction rules

- A standard wins only inside its own jurisdiction. Figma decides layout·copy·interaction but not
  API idempotency; the API contract is the reverse.
- Overlapping or unclear jurisdiction: never split the difference — `NEEDS_DECISION`.
- When a standard's revision/version changes, invalidate the judgments that cited it and
  re-compare.

## Policy sources

Accepted: 1) the user's explicit answers, 2) approved specs·PRD·acceptance criteria·design
system·Figma with the exact location·version, 3) applicable security·privacy·legal·accessibility·
data-integrity constraints, 4) API·architecture·compatibility documents the repo designates as
public contracts.

Not accepted: agent recommendations, production code, existing tests, current behavior observed in
a browser, framework docs·implementation heuristics classified as `implementation-reference`,
evidence·critique from tests or subagents.

Attach a source to every decided policy. If even one policy lacks a source, it is not
`ORACLE_READY`.

## Feedback routing — canonical classification

For each established finding from tests·review·implementation, record one primary cause and use only
these routes. An unconfirmed problem candidate stays in the existing investigation/journal as
`needs-evidence`, not a guessed defect classification. Current implementation, test observations,
and reviewer preference are classification evidence, not policy sources.

| Classification       | Meaning                                                                                             | Routing                                                                     |
| -------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `POLICY_GAP`         | approved source requirement omitted from the card, or an outcome-changing policy decision is needed | print the current card and questions, then `NEEDS_DECISION`                 |
| `EVIDENCE_GAP`       | missing tests·mappings inside the locked card scope                                                 | add only the missing test·reviewer mapping                                  |
| `HARNESS_DEFECT`     | test machinery defect: locator·fixture·barrier                                                      | repair allowed items only, shared 2-round budget (`budget --spend harness`) |
| `PRODUCT_DEFECT`     | mismatch between the locked contract and implementation                                             | production improvement budget after a deterministic `VALID_RED`             |
| `ENVIRONMENT_DEFECT` | tools/environment prevent judgment                                                                  | `FAIL` with the actual cause, production untouched                          |
| `NON_ORACLE_OPINION` | sourceless preference·taste                                                                         | record with rationale; never blocks completion or changes policy            |

- A revision mismatch is not a feedback classification. Stop using existing evidence for the changed
  revision and move to `NEEDS_DECISION` or `FAIL` per the lock rules. Preserve past artifacts and
  execution facts; invalidation is not deletion or rewriting of history.
- Budgets never substitute for each other. On `BUDGET_EXHAUSTED`, report `FAIL` with the last
  actual failure and never bypass via another budget.

### Problem discovery is not policy authority

The contract is the agreed implementation criterion, not proof that all user problems are defined.
Anyone investigating may record a candidate without a card row. Only the existing source and
Draft/delta confirmation procedure can authorize changed product behavior. Never infer
`NON_ORACLE_OPINION` from a missing row: link observed impact to the user task, approved goal or
mandatory constraint and use the conditional [problem-definition review](card/policy-sources.md#problem-definition-review).
An approved requirement missing from the card is `POLICY_GAP`, not taste; an unobserved preference
with no approved criterion remains `NON_ORACLE_OPINION`. A candidate alone establishes neither.

An unrelated observation need not stop delivery. Investigate bounded uncertainty while proceeding
only where the approved outcome remains judgeable. An unresolved outcome-changing policy uses
`NEEDS_DECISION`; evidence of serious harm or a mandatory-constraint violation uses the existing
risk and blocking rules. No candidate authorizes a production edit or bypasses `VALID_RED`.
New observations alone do not invalidate all earlier runs: apply the existing lock/source/target
snapshot rules when their inputs actually change, and confirm changed meaning in a new revision.

### Closing a problem candidate

Use the existing journal/finding/report, not a Delivery state. For an important closure, retain the
judgment, checked scope, original evidence, remaining unknowns and evidence that would reopen it.
Distinguish these conclusions; none implies the others:

| Conclusion                           | Limit                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------- |
| Not defined in the contract          | A statement about specification coverage, not absence of a user problem             |
| Outside this change                  | An investment/scope decision, not nonexistence                                      |
| Not reproduced in checked conditions | Limited negative observation, not impossibility                                     |
| A hypothesis refuted                 | Refutes that explanation or impact claim, not all competing explanations            |
| Owner accepted/deferred the risk     | Retain harm/uncertainty and the decision source; never lower a mandatory constraint |
| Unsupported preference               | `NON_ORACLE_OPINION` only without approved criteria or observed user impact         |

Presence, links and shape can be checked mechanically; filled-in prose does not validate the
meaning of a dismissal. Low follows the same mandatory verification and Oracle gates; only historical
records may retain the old single-node report shape.

## Common state meanings

- `NEEDS_DECISION` — an outcome-changing policy is unresolved. Print the current card, the open
  questions, and a recommendation with rationale per question; do not proceed to tests or
  implementation. If ever locked, print the last SHA-256 and the mismatch too.
- `FAIL` — contract judgment impossible due to environment·harness·tool failure or budget
  exhaustion. Never substitute LLM judgment for it.

## Common prohibitions

- Reporting an execution that did not go through the ledger as evidence
- Auto-relocking or lock bypass to pass a mismatch
- Manufacturing GREEN via weakened assertions, `test.skip`, or arbitrary sleeps
- Adopting current browser behavior as the expected value
- Inventing states·transitions·policies not on the card — `POLICY_GAP` → `NEEDS_DECISION`
