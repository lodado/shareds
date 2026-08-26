# Frontend Quality Gates — Design Intent·Performance·Accessibility

Authority·policy sources are owned by [`frontend/decisions.md`](decisions.md), and code authoring
boundaries by [`frontend/authoring.md`](authoring.md). This document owns only the pre-GREEN·pre-review
verification gates and the Source Registry.

## 1. Implement the Approved Design Intent

For `behavior-only`, preserve existing components·tokens·visual results. For `local`·`identity-shaping`:

1. First find the target repo's existing components, semantic tokens, typography, and layout
   patterns, and reuse the ones that fit the approved Design Intent.
2. Introduce a new color·font·signature only when a new identity has been approved. Concentrate the
   signature in one place and reduce the remaining decoration.
3. Keep the canonical action vocabulary consistent across action→pending→success·error, and make
   empty·error copy explain the next action.
4. Check responsive reflow·reading order·overflow with real content·long strings.
5. Implement only the approved purpose·trigger for motion and follow the repo's
   reduced-motion·property limits. Do not sacrifice accessibility·performance to aesthetic risk.
6. Check that CSS selector specificity does not cancel out section·element rules.

Do not turn an internal class·component tree into a public contract for the sake of a design test.
If an approved `D*` result cannot be implemented or a new visual choice is needed, do not substitute
arbitrarily, `NEEDS_DECISION`.

## 2. Minimum Performance·Quality Checks

Only applicable items. Do not add `memo`, `useMemo`, `useCallback`, a global store, or dynamic
import wholesale without measurement·structural grounds.

- Remove waterfalls of independent async work
- Minimize RSC boundary serialization and the client bundle
- Defer only heavy optional features with `next/dynamic` and the like
- Place static JSX and providers at the scope where they are needed
- Convey interactive controls with semantic elements·accessible names·keyboard equivalence, loading
  with `role="status"` or `aria-live`, and errors with `role="alert"`, matching the repo contract
- Restore focus·previous input after retry exactly as the Oracle says, and verify Escape·tab order·
  trigger focus return for dialog·popover
- Verify the target repo's required UI, such as 320px·both themes·reduced motion
- The approved architecture document matches the Oracle source lock, and the repo structure verification command passes

If there is a performance requirement·improvement claim, first read all of
[`performance.md`](../performance.md) and finish the Initial-load·Runtime·Responsiveness axis
classification and profiler cause confirmation.
Only when there is a performance requirement·improvement claim, record the `metric·budget`, baseline
run, after run, and the difference in the same environment. Prefer existing benchmark·bundle scripts
and pin those commands with `oracle-run.mjs init --required-label performance` and a ledger run. If
there is no comparable environment, do not claim "improved". For a change with no performance
requirement, give only an N/A reason, without a benchmark or a new measurement dependency.

## Source Registry

Below are implementation grounds. Product policy must come from the Oracle's approved sources. If
the link content differs from the actually installed version, the installed version's documentation
wins.

- React state/effect/hook/Suspense: [Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure), [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect), [Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks), [Suspense](https://react.dev/reference/react/Suspense)
- Next server/client/stream/error: [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components), [loading.js](https://nextjs.org/docs/app/api-reference/file-conventions/loading), [error.js](https://nextjs.org/docs/app/api-reference/file-conventions/error)
- TanStack Query Suspense/reset/SSR: [Suspense](https://tanstack.com/query/latest/docs/framework/react/guides/suspense), [QueryErrorResetBoundary](https://tanstack.com/query/latest/docs/framework/react/reference/QueryErrorResetBoundary), [Advanced SSR](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr)
- Vercel performance heuristics: [React Best Practices](https://vercel.com/blog/introducing-react-best-practices), [Dashboard frontend optimization](https://vercel.com/blog/how-we-made-the-vercel-dashboard-twice-as-fast)
- Community cross-check: [TkDodo: Practical React Query](https://tkdodo.eu/blog/practical-react-query), [Kent C. Dodds: State Colocation](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster)
- Changeability implementation·review: the canonical definitions·React examples·trade-offs·Decision evidence·review criteria in [`changeability.md`](../changeability.md). External grounds and pinned revisions are also owned by that reference.
