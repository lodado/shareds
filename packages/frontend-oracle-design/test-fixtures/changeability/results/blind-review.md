## Verdict

- **PASS (tie)** — Both blind runs preserve the tested contract in both stages, use a proportionate local boundary, avoid unnecessary abstractions, and keep the v3 follow-up localized.

## Evidence

### Behavior

- **Preserved — Run A, Stage 1:** `run-a/stage-1/controller-test.log` reports all 5 tests passed and 0 failed. The source handles the v2 event forms at `run-a/stage-1/src/status-view.mjs:3-14`, retains the disposed guard at `:4`, audits only settled events at `:7-10`, and cancels once at `:16-20`.
- **Preserved — Run B, Stage 1:** `run-b/stage-1/controller-test.log` likewise reports 5/5 passed. The equivalent v2 handling, guard, audit, and cleanup are at `run-b/stage-1/src/status-view.mjs:3-16` and `:18-22`.
- **Preserved — Run A, Stage 2:** Fresh `SDK_VERSION=v3` execution against `run-a/stage-2/src` passed all 5 tests (exit 0). The v3 nested string amount is converted at `run-a/stage-2/src/status-view.mjs:8`; all other behavior is unchanged from Stage 1.
- **Preserved — Run B, Stage 2:** Fresh `SDK_VERSION=v3` execution against `run-b/stage-2/src` passed all 5 tests (exit 0). The same localized conversion is at `run-b/stage-2/src/status-view.mjs:8`.
- The controller assertions directly cover `$12.34`, `$0.00`, `$-1.25`, error distinctions, audit/subscription counts, cause identity, idempotent cleanup, late-event suppression, and toggle immutability/labels (`verify.test.mjs:37-91`).

### Current boundary choice

- **Preserved — both runs, both stages:** SDK transport representation is handled directly at the sole consumer in `status-view.mjs`; rendering, audit policy, and disposal remain there. No adapter or compatibility layer was added. This is proportionate to the stated one-SDK/one-consumer change.
- The two implementations make a small, observable policy trade-off: Run A treats any `rejected` code other than `DENIED` as `Try again` (`run-a/stage-1/src/status-view.mjs:10-11`), while Run B enumerates `DENIED` and `OFFLINE` (`run-b/stage-1/src/status-view.mjs:10-14`). Only the declared union is tested; behavior for malformed/unknown rejection codes is therefore **unverified**, not a basis to prefer a larger abstraction.

### No unnecessary abstraction

- **Preserved — both runs:** The four diffs add no files, wrappers, interfaces, registries, state owners, dependencies, retries, or compatibility paths. Stage 1 changes only `status-view.mjs` and the requested `toggle.mjs` label; Stage 2 changes only the amount expression in `status-view.mjs` (`run-a/stage-2/change.diff`, `run-b/stage-2/change.diff`).
- Run A's `subscription` local and Run B's `cancel` destructuring are cleanup handles, not new abstraction layers (`status-view.mjs:3`, `:16-20` / `:3`, `:18-22`).

### Follow-up localization

- **Preserved — both runs:** Each Stage 2 diff is exactly one expression replacement: `event.payload.minorUnits` to `Number(event.payload.amount.minor)` (`run-a/stage-2/change.diff`, `run-b/stage-2/change.diff`). Toggle code and event/error/audit/cleanup policy remain untouched. This demonstrates the requested representation change is local to the settled rendering line.

## Gaps

- **Unverified:** malformed event objects, unknown rejection codes, and SDK/runtime behavior outside the supplied controller fixtures. No React/browser coverage is implied by these Node tests.
- No evidence here establishes timing, token, model, statistical, or general architectural conclusions; those are outside this review.

## Risks

- Run A's permissive `rejected` fallback could mask a future unsupported rejection code; Run B's explicit branches are stricter but its fallback throws `event.error` for malformed rejected events. The declared SDK contract makes both paths acceptable for this task, and neither is exercised by the controller tests.
