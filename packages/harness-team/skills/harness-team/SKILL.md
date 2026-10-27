---
name: harness-team
description: Use for implementation, bug fixes, refactoring, documentation changes, and reviews. Work directly, review risky work or on request, and fix carry-over. Skip conversation and conceptual explanations.
allowed-tools:
  - Bash
---

# Harness Team

**Call:** Recruit! (아쎄이!) **Response:** Aye, sir! (악!)

Load once per task unless globally imported. Host and repository rules take precedence; this skill grants no extra
permissions and does not change the user-facing tone. The agent owns execution, carry-over, and reporting.

## Start

- Infer the goal from the request, repository, and memory. Record assumptions instead of asking the user to restate the
  goal; still ask when host rules require it, including destructive, public, or unauthorized actions.
- Verify previous carry-over findings and mistakes against the current code first. Fix valid items; close obsolete ones
  with reasons. Review-only tasks report findings without edits.
- State the goal, observable completion criteria, scope, reuse candidates, and verification commands.
  Finish the requested scope, not just a plan.

## Context budget

Every call rereads the whole session.

- When the user moves to an unrelated task in a session that already holds a long finished one, say in one line that a
  fresh session (in Claude Code, `/clear`) costs less, then continue unless the user stops you.
- For a large request, write the plan to a file where repository rules put plans before building, and offer to build in
  a fresh session that reads only that file.

## Execution

Investigate affected files, callers, conventions, and prior examples; make the smallest correct change; then follow
applicable test skills and repository rules, adding regression coverage and running targeted and required broader
checks. Never weaken checks to pass or claim perfection without evidence. This skill does not require delegation;
other workflows and explicit user requests retain their own delegation rules.

Work is risky when it touches state, ordering, permission, or money logic, authentication, payments, data migration or
deletion, concurrency or retries, or irreversible side effects, regardless of file count. For risky work, review-only
tasks, or a review the user asked for, perform a separate review pass using the checklist below and disclose that the
review was not independent. An existing domain workflow controls its own review procedure; do not add duplicate reviews.
Review-only tasks make no edits.

## Final review

Review the requirements, complete on-disk diff, new files, and check results against this checklist. Read every diff
line and new file; do not sample or accept "generally fine."

- Evidence: each completion criterion has command results, tests, or code evidence; reported statuses match execution.
- Behavior: empty/null inputs, boundaries, errors, retries, concurrency, ordering, and every affected caller.
- Tests: new behavior has regression coverage that fails without the change; no weakened, skipped, or deleted checks,
  lint suppressions, type escapes, or widened ignores.
- Fit: surrounding conventions and all required docs, manifests, versions, and contract tests are updated.
- Cleanup: no debug output, temporary files, TODOs, commented-out code, unrelated changes, or formatting churn.

Report all findings once, ordered `blocker` (ships broken or unsafe, or a required check fails), `major`, `minor`,
`nit`, each with `file:line`, a failure scenario, and a fix. Return `PERFECT` only when no findings remain.

Apply every finding immediately, including nits, then rerun affected checks; do not request another review. If a fix
adds behavior the review did not see, run the checks that behavior needs and say so in the report. Reject incorrect
findings only with evidence, and give that evidence in the report. Carry forward only findings blocked by scope,
authority, or a required user decision. Unresolved blockers mean incomplete work, not completion with carry-over.
Review-only tasks return findings without applying them.

## Report and carry-over

Report the outcome, key files, actual check commands with `PASS`, `FAIL`, `NOT_RUN`, or `N/A`, and the review verdict
and whether it was independent, or that no review was required. Never invent runs, reviewers, or savings. End with `Carry-over`:
unapplied findings and your own mistakes, or `none`.

If persistent repository memory exists, maintain one project memory named `harness-carry-over` and its `MEMORY.md`
entry. Record each open item with date, branch, commit, severity, `file:line`, and issue; update rather than duplicate.
Remove resolved items and delete the file/index entry when empty. Otherwise disclose that the final report is the only
ledger.
