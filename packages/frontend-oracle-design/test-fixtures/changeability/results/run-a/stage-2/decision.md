# Implementation Decision

- Updated `src/status-view.mjs` for SDK v3's settled payload by converting its signed decimal
  `amount.minor` string to a number before the existing currency formatting. Subscription,
  cleanup, rendering, audit, late-event, and error behavior remain unchanged.
- Kept the direct feature-local v3 boundary; rejected v1/v2 compatibility and new adapters because
  only the current SDK is approved and there is one consumer. The trade-off is narrow coupling to
  the current vendor event shape for the smallest predictable implementation.
- `src/toggle.mjs` was not changed in this follow-up; its archived Stage 1 behavior remains intact.
- Verification: `SUBJECT_ROOT="$PWD/src" SDK_VERSION=v3 node --test verify.test.mjs` (raw output in
  `verification.log`).
