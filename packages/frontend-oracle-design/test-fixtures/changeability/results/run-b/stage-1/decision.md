# Implementation Decision

- Changed `src/status-view.mjs` at the existing consumer boundary from SDK v1 tuple callbacks to SDK v2 event objects, and from the v1 cancel-function return to the v2 `{ cancel }` return. Existing rendering, success audit count, disposal, late-event handling, and unexpected-error propagation remain in this consumer.
- Changed only the collapsed toggle label in `src/toggle.mjs` from `Show details` to `Details`; expanded labeling, toggling, and immutability remain unchanged.
- Rejected a compatibility adapter or version branch: the approved change targets v2 only, has one implementation and consumer, and requests no legacy support. Rejected a new abstraction because the existing consumer boundary is sufficient and a wrapper would add concepts without reducing current change cost.
- Trade-off: favor minimal local code and cohesion at the consumer over a reusable SDK seam; this accepts that a future SDK representation change would be handled here, while preserving the current contract and avoiding speculative coupling.

Verification: `SUBJECT_ROOT="$PWD/src" SDK_VERSION=v2 node --test verify.test.mjs` — exit code 0; 5 tests passed. Raw output and exit code are recorded in `verification.log`.
