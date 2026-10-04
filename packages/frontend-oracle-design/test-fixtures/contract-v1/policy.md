# Approved synthetic toggle fixture policy v1

This is explicit synthetic test data authorized by the Task6a fixture assignment and Task 6 brief. It is not a real consumer user's approval, independent review, or Delivery acceptance.

## Exact policy

- P1 / O1: Calling toggle(false) once returns true.
- P2 / O2: Calling toggle(true) once returns false.
- Each call is synchronous, has no network requests, and has no externally visible side effects. No rendering or persistence is promised.
- Domain is exactly the two Boolean inputs false and true. Other JavaScript values are outside this approved synthetic scope.
- The oracle's string choice IDs false and true name these Boolean inputs. Expected outputs come from this policy, not from generated tuple metadata.
- The initial product deliberately returns enabled. The sole authorized repair is return !enabled. Product tests and oracle remain unchanged.

## Investigation and applicability

Inspected fixture paths: packages/frontend-oracle-design/test-fixtures/contract-v1/product.mjs and packages/frontend-oracle-design/test-fixtures/contract-v1/product.test.mjs. These form a private JavaScript-only fixture with no TypeScript declarations, compiler API, consumer package, or public typed interface. Type contract: N/A for this bounded fixture, not a conclusion about the surrounding repository.

The product is one synchronous return with no promises, timers, concurrent events, owner lifetime, requests, server boundary, or persistent data. Async/Order and their property obligations are N/A for this bounded fixture. Repeated calls, non-Boolean values, UI, environment, platform, and inherited behavior are outside the two single-call cases. Nothing is sampled or silently excluded from the declared two-value product.

## Source authority and limits

S1 is this file, revision v1, approved synthetic fixture authority only. The assignment approves fixture implementation and this exact false-to-true / true-to-false policy. The design spec's heading still says Proposed, so approval authority is the explicit coordinator assignment, not a claim that the document itself records consumer approval. Spec sections 2, 4.3 and 7 and the acceptance inventory sections 1 and 3 constrain structure and evidence. No fake evaluator, formal verification, native independence, or public runner acceptance is authorized here.
