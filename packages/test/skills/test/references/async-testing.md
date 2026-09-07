# Async test construction

Use this guidance when implementing an approved async contract, not as a mandatory recipe for every
Oracle design. Expected outcomes still come only from the card; these are harness choices.

- Keep the actual state owner and minimal consumer in integration tests; control the external boundary
  rather than mocking the entire owner. For query-backed tests, isolate the client per test and clean
  it up afterwards. State request-count meaning (starts, logical queries, or successful responses) and
  relevant retry, focus-refetch, and StrictMode settings. Disabling retry in a baseline does not test retry policy.
- For response inversion, the pending barrier in [`bva.md`](bva.md) can hold A and B: wait for A start,
  change input, wait for B start, release B and observe its result, then release A. Before final
  assertions, establish that the late response has crossed the controlled boundary and relevant
  updates have been processed. An already-visible B result is not that completion barrier. Adapt the
  mechanism to the actual owner and harness; use observable waits, not arbitrary sleeps.
- Test cancellation separately from inversion. Preventing A's delivery does not demonstrate safety
  when A arrives late. Use a cancellation-insensitive boundary when the approved race contract needs
  actual late delivery; verify signal propagation separately when cancellation is part of the contract.
- Select cache and scope premises from the card, distinguishing current-key cache from previous-key
  placeholder when relevant. Do not silently choose a retention, isolation, or retry policy in a fixture.

The existing `$test` Order/sequence evidence and single assertion-owner rules still apply. A proposed
helper is not an existing utility, and neither a plan nor an illustrative example is execution evidence.
