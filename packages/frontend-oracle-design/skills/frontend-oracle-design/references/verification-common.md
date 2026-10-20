# Verification authority shared by both profiles

Prerequisites are an explicitly resolved `verificationProfile`, scoped role, mode and current stage.
The controller identity and card, stage, lock, run, worker packet and review receipt must agree.
Bare roles and unknown profiles stop and request the appropriate controller. Never default a role
to a profile, reinterpret legacy records as new authorization or override an immutable lock with a flag.

Read [common](common.md), then [loading](roles/loading.md). Load only the selected profile's
current-stage dependencies, fully, in this context. A catalog is not a whole-run prerequisite.
Source-approved outcomes, human approval and an immutable revision precede consumer tests.
Only the lock tool creates ORACLE_READY. Design-only never writes or executes consumer tests
and never edits production or dependencies. Preflight shape checks grant no approval.

Delivery uses one runtime, append-only ledger and shared budgets: policy 2, harness 2, product 3.
Invoke `$test` explicitly before test writes. Accept deterministic product VALID_RED before production
edits. ALREADY_SATISFIED is zero-production verification, not edit permission. Never weaken assertions,
fabricate runIds, bypass a rejected gate or relock to pass a mismatch. Missing required evidence is FAIL,
not PASS. Outcome-changing uncertainty is NEEDS_DECISION and requires a decision/new revision.

Required labels describe obligations, not success. Actual reported case IDs, current source/lock hashes
and final target snapshots bind evidence. Re-run after relevant changes and independent review findings.
Applicable type and property evidence supplements case evidence. File creation and plans are not runs.
Reviewers return findings, never receipts or transitions. The controller alone records transition intent
through existing scripts and reads acceptance back. IMPLEMENTED_GREEN is not REVIEW_VERIFIED.

Fresh workers read their own full dependencies. Reviewer-only criteria stay in the independent context.
Card-only cold-read, reverse-impossible, source-aware and Delivery reviews keep distinct input boundaries.
High requires its existing independent hardening and review obligations. Never claim independence from
a same-context role switch. Record scope, holds, pending observations and honest verification limits.

A command that can outlive the host's command limit (`oracle-run.mjs exec` or `red`, `emit-trace`,
`oracle-model.mjs space`, `cross-check`, a full suite) runs as a job: `scripts/oracle-job.mjs start -- <command>`,
then `oracle-job.mjs wait --job <id>`. Wait prints `JOB_DONE` with the command's own exit code and log
tail, or `JOB_RUNNING` (exit 75) when its limit passes first; call wait again. The default wait (110 s)
fits Claude Code's default Bash limit; for longer waits give the call `timeout: 600000` and pass
`--max-seconds 540`. A stuck job stops at `--timeout-seconds` (default 3600) or with
`oracle-job.mjs cancel --job <id>`. The job log is the tool's output channel in its private temp
directory; never copy it into the run directory. Never hand-roll `until`/`sleep` loops, poll output
files or coordinate parallel workers through mailbox files; the controller relays.
