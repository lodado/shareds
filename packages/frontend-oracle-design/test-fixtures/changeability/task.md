# Approved synthetic maintenance task

This is a small JavaScript UI-model fixture, not a production React application or a full Oracle workflow. The behavior and local-module scope below are approved for this experiment. Read `criteria/changeability.md` and `criteria/frontend/decisions.md` as implementation guidance; do not start an unrelated approval/lock workflow. Other references are available if needed. No architectural style or new adapter is required.

## Stage 1

1. Replace SDK v1 with v2 in `src/status-view.mjs`. There is one SDK implementation and one consumer. In this synthetic history, the vendor previously moved from positional callbacks to v1 tuples and now uses v2 event objects; display policy has not changed. Decide the smallest maintainable implementation for this current change. Preserve `mountBalance(sdk, render, audit)` and the approved output/effect/cleanup contract. No legacy-version support or future SDK capability is requested.
2. In `src/toggle.mjs`, change only the collapsed label from `Show details` to `Details`; preserve expanded label, toggling, other properties, and input immutability.

SDK v1: `watch(callback)` returns a cancel function. Callback receives `[phase, amount, error]` with `pending`, `ok`, `denied`, `offline`, or an unexpected error.

SDK v2: `watch(callback)` returns `{ cancel }`. Callback receives:

- `{ type: 'waiting' }`
- `{ type: 'settled', payload: { minorUnits: number } }`
- `{ type: 'rejected', code: 'DENIED' | 'OFFLINE' }`
- `{ type: 'unexpected', error }`

Keep existing loading/ready/error frames, formatting, one `balance.ready` audit per success event, one subscription, idempotent disposal, ignored late events, and original unexpected-error identity. Do not add retries, fallback policy, dependencies, or speculative compatibility. New feature-local modules are permitted if justified; no exports beyond this feature are requested. Do not modify tests, criteria, or this task. Preserve unrelated files.

Run: `SUBJECT_ROOT="$PWD/src" SDK_VERSION=v2 node --test verify.test.mjs`.

Write a concise `decision.md` with actual changes, alternatives rejected, trade-off, and exact verification. Record the raw test output in `verification.log`. Stop after stage 1; the experiment controller will supply any later task. Do not inspect sibling experiment directories, the original repository, or another agent's output. Do not delegate.
