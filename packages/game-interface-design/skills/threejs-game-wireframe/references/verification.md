# Verification

Report every check separately. A passing type check says nothing about fun.

| Check                            | Command (starter)        | Proves                                                                   |
| -------------------------------- | ------------------------ | ------------------------------------------------------------------------ |
| Types                            | `npm run typecheck`      | app compiles; `tsconfig.core.json` compiles the core without the DOM lib |
| Lint                             | the repo's existing lint | local conventions                                                        |
| FSD                              | `npm run check:fsd`      | Steiger passes on `src`, fails on the violation fixture                  |
| Headless                         | `npm test`               | rules and session behavior below                                         |
| Build                            | `npm run build`          | production bundle                                                        |
| Browser                          | `npm run test:e2e`       | real input journey below                                                 |
| Device, usability, fun, business | people                   | only when observed                                                       |

## Headless cases

- Core rules: start, success, partial success, failure, restart.
- Time: zero, negative and non-finite deltas ignored; catch-up clamp; different delta splits give the same state.
- Pause: independent reasons; input while paused discarded; first delta after resume discarded.
- Runs: stale `runId` input ignored; restart leaves no entities, events or commands from the previous run.
- Snapshot: same reference when unchanged, new immutable value on change.
- Isolation: two sessions do not affect each other.
- Lifecycle: `dispose` is idempotent; no notifications after dispose or unsubscribe.
- Boundary: core files import only core modules and use no platform globals, ambient time or randomness.
- Write the failing test before the rule. Mutate one guard and confirm a test fails; record mutations that survive.

## Browser journey

- Real taps and clicks: start, play, fail, retry, pause and resume, hidden tab.
- Canvas visible, HUD in viewport, no horizontal overflow at 320×568 and after resize, no `console.error` or `pageerror`.
- Wait for a state (`data-status`, a role, text), never a fixed sleep. Retry loops use `expect(...).toPass()` with a bound.
- If Playwright or a WebGL-capable browser is unavailable, mark the browser check `BLOCKED` or `NOT_RUN` with the reason.

## Status words

`PASS` (ran, exit status and output support it) · `FAIL` (ran, failed; quote the decisive line) ·
`NOT_RUN` (not executed, including a failed dependency install) · `BLOCKED` (missing tool, permission or environment).
If dependency download failed, every later check is `NOT_RUN`. Installed-but-unverified code is delivered as files, not as "ready to run".
