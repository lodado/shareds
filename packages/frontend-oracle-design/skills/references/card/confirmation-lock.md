# Oracle Card — user confirmation·revision lock·run artifact

## Draft Oracle and user confirmation

A new card or a revision whose meaning changed must pass the following serial gate and be confirmed
by the user.

1. Investigate the external standards and the existing revision without modifying production.
2. Write the **Draft Oracle**, the semantic delta, and the open questions.
3. Run the cold-read gate in [`card-format.md`](card-format.md) — a context-free read, the four
   questions, the single root and its first nail — and repair the Draft before showing it.
4. Show the full card and the delta to the user and re-confirm.
5. On approval, change `User Confirmation` to `approved` and record the actual response location.
6. On a modification request, fix the Draft and re-confirm.
7. On no response·policy conflict, `NEEDS_DECISION`.

Do not create a new card for implementation·test corrections inside the scope of an existing locked
Oracle. However, when the meaning of any one of `Then`·`Never`·side effects·BVA·Design
Intent·policy sources changes, do not fix the locked file in place — create a Draft revision at a
new path. A new revision also does not move on to lint·lock·tests·production modification before
user confirmation.

## Deterministic revision lock

After the cold-read gate, save the exact bytes of the user-confirmed card to a file and lock it with
the bundled script. Work with no new policy·card, such as the Low fast path, does not enter this
procedure.

When a revision locked as Design-only is later extended to Delivery and a new local source such as
architecture·backend becomes necessary, do not append to the existing lock. Show the source delta to
the user and lock the card and the full source set at once on a new revision path. When Delivery was
requested from the start, defer the lock until all source approvals are complete.

When the target repo has not decided the agent artifact location:

```text
<repo>/.ai/oracles/<oracle-id>/oracle.md
<repo>/.ai/oracles/<oracle-id>/oracle.lock.json
<repo>/.ai/oracles/<oracle-id>/run-state.json
<repo>/.ai/oracles/<oracle-id>/runs.jsonl
<repo>/.ai/oracles/<oracle-id>/.run-ids/ # atomic runId reservation for parallel exec
<repo>/.ai/oracles/<oracle-id>/evidence.json
<repo>/.ai/oracles/<oracle-id>/review-input.json # when generated
```

### Card structure lint

Before the lock, machine-check the structural minimum with `oracle-verify.mjs card`. The lint is
only a token·table structure check, not a semantic approval — semantic review is owned by the
cold-read gate in [`card-format.md`](card-format.md).

```bash
node <skill-dir>/scripts/oracle-verify.mjs card \
  --oracle .ai/oracles/<oracle-id>/oracle.md
```

Checked items: a complete Outcome Brief, a Source Registry with unique IDs and `Kind`, the presence
of an approved User Confirmation, a stable ID·`(source: …)`·applied rows on every policy line, the
bidirectional reference between policy IDs and row IDs, the registered source/user-confirmation FK
of each policy source, approval status·jurisdiction·location/version, no `implementation-reference`
alone as a policy, inclusion of `repo:` local sources in the lock manifest, row IDs without
duplicates, `Then`·`Never`·side effects on `O*` rows, the contract·source·evidence tier of `D*` rows
and their Source Registry references, the absence of vague words, and either a real contract row or
a sourced N/A note for each of the seven auto-added TCs. `CARD_LINT_FAILED` means fix the card
before the lock, and do not merely change the wording to bypass the check.

The agent runs it directly and does not ask the user to run the command. Lock approved local spec
files together by repeating `--source`. For remote standards such as URL·Figma, record the exact
version in the card bytes and confirm it again at the external standard gate.

```bash
node <skill-dir>/scripts/oracle-lock.mjs create \
  --oracle .ai/oracles/<oracle-id>/oracle.md \
  --lock .ai/oracles/<oracle-id>/oracle.lock.json \
  --source <local-approved-source>

node <skill-dir>/scripts/oracle-lock.mjs verify \
  --lock .ai/oracles/<oracle-id>/oracle.lock.json
```

- `<skill-dir>` is the directory of this skill that the current host actually loaded. Do not
  hardcode a home path.
- The printed `sha256:<digest>` is the Oracle revision.
- `create` is idempotent against an existing lock with identical bytes, and does not overwrite an
  existing lock when the card·source changed. An approved new revision preserves the previous
  artifacts and is created at a new path.
- Every new card·revision has its full card·delta confirmed. The digest is only an identifier for
  the confirmed bytes and does not replace user confirmation.
- Re-run `verify` immediately before writing tests, modifying production, independent review, and
  issuing a completion state. `exec`·`transition` in `oracle-run.mjs` perform the same verification
  automatically on every call.
- On `ORACLE_CHANGED`·`SOURCE_CHANGED`, discard the existing RED·GREEN·review evidence, present the
  change diff and the current card, and return to `NEEDS_DECISION`.
- `LOCK_INVALID`·a missing tool·an unrunnable command is a determinism judgment failure → `FAIL`.
- Automatic regeneration to clear a mismatch is forbidden. Re-locking happens only after going
  through the source gate, the Draft delta, user re-confirmation, and the cold-read gate again.
- When the card was skipped as Low risk, leave the lock N/A reason. At Medium/High, when the
  filesystem·Node is unavailable, both Design-only and Delivery report `FAIL` instead of
  substituting LLM judgment.

SHA-256 is only a drift detection device and does not guarantee the approval authority of an actor
who can rewrite the lockfile. Only at High risk, preserve `.ai/oracles/**`, the lock SHA, and run
IDs as CI artifacts and protect them with CODEOWNERS·required human approval. It is not enforced by
default for Low/Medium, and is promoted to repo policy only when needed. The run ledger·state files
have the same limit.

### Run artifact initialization

On entering Delivery, create the run ledger and state files immediately after the lock. When it ends
as Design-only, do not create them. `journal.md` is the exception — it accumulates in the same
directory from the Grill onward and holds only stage rationale, separate from the ledger.

```bash
node <skill-dir>/scripts/oracle-run.mjs init \
  --dir .ai/oracles/<oracle-id> \
  --lock .ai/oracles/<oracle-id>/oracle.lock.json \
  --risk low|medium|high \
  --required-label behavior \
  --required-label lint \
  --harness-path vitest.config.ts \
  --milestone list:O1,O2 \
  --milestone detail:O3,O4
```

- `--required-label`: repeatedly declare the targeted test, lint, typecheck, and build labels that
  actually apply in the target repo. At least one is required, and all are re-confirmed in the
  re-verification after GREEN·review.
- `init` verifies the lock and stores the current worktree digest as the `ORACLE_READY` baseline —
  the basis for the later TDD ordering judgment.
- The default for `--scan-root` is the current working directory. Specify it only to narrow the
  scope in a monorepo.
- For config·setup·mock wiring that must change before RED, repeatedly declare the exact relative
  file path from the scan root with `--harness-path`. Globs·directories·paths outside the root are
  not allowed, only files that actually exist and are included in the worktree snapshot.
- For a large card, repeat `--milestone <name>:O1,O2` to group non-overlapping test-owned rows. The
  rows must exist in the Oracle and two milestones never own the same row. Do not declare it for a
  small card.
- `init` fails when the state file already exists. Re-running it to reset the budget·baseline is
  forbidden. A new revision gets a new `<oracle-id>` directory.

## Design exit states

### `ORACLE_READY`

- A complete Outcome Brief, and Kind·jurisdiction·location·version·approval status in the Source
  Registry, or an N/A reason
- The card does not omit·distort the external standard's states·copy·interaction·side effects
- Every policy has an accepted source
- `User Confirmation` is `approved` and has the actual user response location that approved the new
  card or the semantic delta
- The UI visual scope is recorded, and for `local`·`identity-shaping` the approved Design Intent and
  the `Never`·source·evidence tier of every `D*` row are complete
- For `local`·`identity-shaping`, the explicit user answer location of the Design Change
  Confirmation
- For `identity-shaping`, confirmation was obtained with a proposal that completed two design passes
- The `Never` and side-effect counts of every row are complete
- The seven auto-added TCs are added, or an N/A reason is given
- The cold-read gate passed — the context-free read, the five questions, and a first nail that was
  actually driven
- The `oracle-verify.mjs card` lint and the revision lock verification pass

### `NEEDS_DECISION`

Print the open questions, a recommendation with rationale per question, and the current card. In
this state, do not proceed to tests·implementation. If it was ever locked, print the last SHA-256
and the mismatch as well. The current card is the resumption material for the next session.
