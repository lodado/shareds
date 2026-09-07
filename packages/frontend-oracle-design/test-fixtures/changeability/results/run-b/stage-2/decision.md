# Implementation Decision

- Stage 1 migrated the existing consumer boundary from SDK v1 tuples to SDK v2 event objects and `{ cancel }`; the toggle's collapsed label changed to `Details`.
- Stage 2 updates only the settled-event conversion in `src/status-view.mjs` from `event.payload.minorUnits` to v3's `event.payload.amount.minor` signed decimal string, converting it with `Number` before existing currency formatting.
- No compatibility branch or new abstraction was added: the approved change targets v3 only, and the existing consumer boundary remains the smallest cohesive owner for this actual SDK representation change.
- Trade-off: retain the local consumer conversion rather than introduce a reusable adapter; this keeps the current surface and policy unchanged while accepting future SDK representation changes are handled at this boundary.

Verification: `SUBJECT_ROOT="$PWD/src" SDK_VERSION=v3 node --test verify.test.mjs` — exit code 0; all controller tests passed. Raw output and exit code are recorded in `verification.log`.
