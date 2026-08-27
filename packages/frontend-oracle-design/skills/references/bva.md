# BVA 5 Axes & Shared Reference

A reference shared by the frontend-oracle-design and test skills. Read all of it before writing a card.

## 1. Value boundaries

| Check               | Example                                                          |
| ------------------- | ---------------------------------------------------------------- |
| min−1 / min / min+1 | Search minimum 2 characters: 1 character→0 requests, 2→1, 3→1    |
| max−1 / max / max+1 | Character count limit, file size, quantity upper bound           |
| Empty value         | Empty string, whitespace only, null, empty list, 0-item response |
| Duplicate value     | Re-adding the same item, re-entering the same search term        |
| Format              | Invalid format, very long value, Unicode·emoji·newline           |

Do not put them all in mechanically — **only the real boundaries of the approved policy**. Do not
auto-add meaningless 0/1.

## 2. State boundaries

The moment right after each transition is the boundary: idle→pending, pending→success, pending→error, error→retry.

- Before the click: button enabled / right after the click: pending shown + re-action blocked
- Right after failure: loading cleared + error shown + no success side effect + whether input·existing data is kept (policy)
- Right after retry: previous error removed + new pending
- Right after success: loading cleared + success event exactly once

## 3. Time·order boundaries

- A second action while the first request is pending (same action, different action)
- Request A then request B → response B then response A (inversion) — a policy is required among latest wins / first wins / concurrent requests forbidden
- A late response after page exit·unmount·cancel — no screen contamination
- The test controls when the response completes (pending barrier below)

## 4. Side-effect count boundaries

0 times / exactly once / 2 or more times. Almost all mutation bugs are caught here.

- Permission·condition not met → 0 requests
- Normal submit → exactly once (including payload correctness)
- Consecutive clicks, double click, repeated Enter, click+Enter combination → still 1 time in total
- **UI blocking and the count are verified separately** — 2 requests are possible even when disabled (two events before disabled applies)

## 5. Type boundaries

Apply this only to exported shared/package API types — local state·internal Props are not targets.
A type's boundary is not a value's min·max but the extremes of the type lattice. Pick only the axes
this API **actually closes**, and per axis put one passing witness and one `@ts-expect-error` in `.test-d.ts(x)`.
Do not create a witness on an axis it does not close.

| Axis                    | Boundary                                                                                            |
| ----------------------- | --------------------------------------------------------------------------------------------------- |
| union member            | One member passes, one non-member is rejected                                                       |
| `never`·`any`·`unknown` | Pin each of the three values only when a distributive conditional is the contract                   |
| optional                | Distinguish omitting a property from `property: undefined` (effective `exactOptionalPropertyTypes`) |
| readonly                | Accepts `readonly T[]`·`as const` tuple input, no modifier loss in mapped types                     |
| literal widening        | A literal does not widen to `string` without repeating `as const` at the call site                  |
| tuple arity             | Only the lengths the contract actually distinguishes among empty tuple·1·n                          |
| inference authority     | Only the intended arguments join inference under `NoInfer`·`const` type parameter                   |

Put only one misuse expression on the line after `@ts-expect-error` — packing several misuses into one
line makes it pass on an unrelated diagnostic. When one API's `@ts-expect-error` count exceeds 30, stop
writing more cases and split the API. 30 is not a target to fill but a design disqualification line meaning the surface is too wide.

## 7 auto-added TC types

Even when it is not in the requirements, put it in the matrix **when the premise actually exists**. If not, N/A + reason.
Do not invent retry·cancel·race behavior that does not exist for the sake of testing.

| Premise                       | TC                                                                          |
| ----------------------------- | --------------------------------------------------------------------------- |
| Action with a side effect     | Duplicate click — UI blocking row + actual request count row, **each**      |
| Network request               | Error — error shown + loading cleared + no success side effect              |
| Failure possible              | Retry recovery — resubmit possible, new request exactly once                |
| List·query                    | Empty data / 0-item state                                                   |
| Async                         | Loading — at the start point + cleared on both success and failure          |
| Consecutive requests possible | out-of-order — a late earlier response does not overwrite the latest result |
| Exit·cancel possible          | Response during cancel/exit — no screen contamination from a late response  |

## Conditional guards — add a TC if applicable, otherwise N/A + reason

- optimistic UI → exact previous state restored on failure, concurrent user changes preserved, no duplicate items
- cache → exact query invalidation after a mutation, a stale response does not overwrite the latest data, state after back·refresh
- navigation → URL·history correctness on success/failure, no 2 entries from a duplicate click, a late response after exit
- interactive UI → semantic element and accessible name, keyboard equivalence, focus move·return,
  assistive technology delivery of loading/error (role, aria-live). UI that must trap or return focus,
  like dialog·popover, verifies Escape·tab order·return to trigger each.
- nondeterministic sources → control clock/timezone/seed/response order, isolate storage·data per test, no dependence on real external services

## Error subtype

Do not lump everything together as one "an error occurs". Pick only the subtypes that apply to the feature and define
the message·retryability·input retention·redirect for each:

validation / business rule / 401·permission / network disconnection / timeout / 5xx / response format error

**definitive vs outcome-unknown**: A failure where it is unknown whether the server processed it (timeout
after sending, lost response) is a separate type. Retrying unconditionally produces a duplicate side effect — for a High risk
write, raise the retry·idempotency policy as a grill question and record "duplicate side effect
occurs on retry" in Never.

## Deferred pending barrier (determinism)

The test controls time·response order. Arbitrary sleep·`waitForTimeout` is forbidden.

```ts
function createDeferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

// pending verification: the test holds the completion moment
const deferred = createDeferred<Response>()
vi.spyOn(globalThis, 'fetch').mockReturnValue(deferred.promise as Promise<Response>)
// ... after verifying pending UI + duplicate blocking + request count
deferred.resolve(new Response(JSON.stringify({ id: 'n1' }), { status: 200 }))

// order inversion: create two deferreds and resolve the later request first
```

With MSW, put the same barrier inside the handler. As in `http.post(path, async () => {
await deferred.promise; return HttpResponse.json({ id: 'n1' }) })`, the test holds the completion
moment, and the request count·order is also observed in the handler. With Playwright, use the same
barrier inside the `page.route` handler.

## Example of an adversarial counterexample

TC: "Verify the button is disabled while saving."
Counterexample: it passes even when 2 requests have already occurred before disabled applies.
Reinforcement: put the disabled check + `expect(requestCount).toBe(1)` together on the same row.
