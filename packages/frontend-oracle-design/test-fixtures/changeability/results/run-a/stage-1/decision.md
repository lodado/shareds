# Implementation Decision

- Changed `src/status-view.mjs` to consume the current SDK v2 event objects directly. The
  subscription remains one per mount, cleanup calls `subscription.cancel()` once, late events are
  ignored, and the existing render, audit, and unexpected-error behavior is preserved.
- Changed `src/toggle.mjs` so the collapsed label is `Details`; expanded behavior and immutable
  input handling are unchanged.
- Rejected a v1/v2 adapter or compatibility branch: there is one current consumer, no legacy
  support is requested, and direct v2 handling is the smallest local implementation. Rejected new
  modules and dependencies for the same reason.
- Trade-off: the consumer is intentionally coupled to the v2 event shape, accepting that narrow
  coupling in exchange for simpler, more predictable maintenance under the approved contract.
- Verification: `SUBJECT_ROOT="$PWD/src" SDK_VERSION=v2 node --test verify.test.mjs` passed all 5
  tests (exit code 0); raw output is recorded in `verification.log`.
