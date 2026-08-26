# Performance Optimization Decision Guide

## Purpose and Authority

This is not product policy — it is a conditional implementation reference to read only when there is
a performance requirement or an improvement claim. A metric·threshold becomes policy only with an
approved performance contract or a user answer; without one it is a `POLICY_GAP` and
`NEEDS_DECISION`.

Measurement commands·baseline/after runs·the required `performance` label are owned by the
performance·quality check section of [`frontend/quality.md`](frontend/quality.md) and the GREEN gate
of [`delivery/green-review.md`](delivery/green-review.md). This document owns only problem
classification·cause confirmation·trade-off judgment.

## 1. Classify the Problem on Three Axes

| Axis           | Meaning                                                   | Representative Means                                                 |
| -------------- | --------------------------------------------------------- | -------------------------------------------------------------------- |
| Initial-load   | Transfer size, network latency, JavaScript execution time | bundle reduction, cache, prefetch, code splitting, resource priority |
| Runtime        | Total processing time, rendering, main-thread blocking    | algorithm·data structure, work splitting, narrowing render scope     |
| Responsiveness | Screen response delay to input·action                     | long task splitting, progress indication, transition                 |

- Record first which axis the problem belongs to. A different axis means different means and
  different verification.
- Total processing time and perceived responsiveness are separate. Splitting work can improve
  responsiveness even when total time grows — which one is the product requirement is policy, and if
  unresolved it is `NEEDS_DECISION`.

## 2. Do Not Optimize Before Measuring

- Development machines·networks are faster than real users'. Pin identical
  route·fixture·viewport·device/network conditions and record a baseline first.
- Confirm the cause with a profiler: prefer tools already present in the target repo, such as the
  browser performance profiler, React Profiler, and bundle analyzer. Do not touch a guessed
  bottleneck first.
- Wrong code splitting delays first-screen resources and makes things worse instead — re-measure
  under the same conditions after the change too.

## 3. Change Only the Smallest Bottleneck

- Change only the bottleneck area the profiler pointed at, and do not do preventive blanket
  optimization (applying `memo`·`useMemo`·prefetch·dynamic import across the board).
- Every improvement has a cost: memory, code volume, bundle, complexity, maintenance. Record the
  cost you accepted as a trade-off in the Performance item of the Implementation Decision.
- Do not build a render-derived value with an effect+setState chain —
  follow the state ownership table in [`frontend/decisions.md`](frontend/decisions.md).

## 4. Verification

- Record baseline/after runs with `oracle-run.mjs exec` and the required `performance` label. If
  there is no comparable identical environment, do not claim "improved".
- Leave the path of the raw measurement artifact (trace·reporter output) in the evidence.

## General Rules Not Adopted

- Do not force P95/P99 measurement on every project. Check the slow-user segment only when there is
  an approved performance contract or real product data.
- Do not use `React.memo`·prefetch·chunking·web worker as defaults.
- Do not assume that responsiveness always takes priority over total processing time.

## Source Registry

These are implementation grounds only, not a source of product policy. The actually installed
version's documentation wins.

- [web.dev: Performance](https://web.dev/performance)
- [React Profiler](https://react.dev/reference/react/Profiler)
- [Chrome DevTools: Performance panel](https://developer.chrome.com/docs/devtools/performance)
