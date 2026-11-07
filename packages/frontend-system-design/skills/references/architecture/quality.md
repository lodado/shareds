# Frontend Quality Gates — Design·Performance·Accessibility

React runtime decisions are owned by [`decisions.md`](decisions.md), and code authoring
boundaries by [`authoring.md`](authoring.md). This document owns only the pre-merge·pre-review
verification gates.

## 1. Implement the Approved Design

For a behavior-only change, preserve existing components·tokens·visual results. For a local or
identity-shaping visual change:

1. First find the target repo's existing components, semantic tokens, typography, and layout
   patterns, and reuse the ones that fit the approved design.
2. Introduce a new color·font·signature only when a new identity has been approved. Concentrate the
   signature in one place and reduce the remaining decoration.
3. Keep the canonical action vocabulary consistent across action→pending→success·error, and make
   empty·error copy explain the next action.
4. Check responsive reflow·reading order·overflow with real content·long strings.
5. Implement only the approved purpose·trigger for motion and follow the repo's
   reduced-motion·property limits. Do not sacrifice accessibility·performance to aesthetic risk.
6. Check that CSS selector specificity does not cancel out section·element rules.

Do not turn an internal class·component tree into a public contract for the sake of a design test.
If an approved design result cannot be implemented or a new visual choice is needed, do not
substitute arbitrarily; ask the user.

## 2. Minimum Performance·Quality Checks

Only applicable items. Do not add `memo`, `useMemo`, `useCallback`, a global store, or dynamic
import wholesale without measurement·structural grounds.

- Remove waterfalls of independent async work
- Minimize RSC boundary serialization and the client bundle
- Defer only heavy optional features with `next/dynamic` and the like
- Place static JSX and providers at the scope where they are needed
- Convey interactive controls with semantic elements·accessible names·keyboard equivalence, loading
  with `role="status"` or `aria-live`, and errors with `role="alert"`, matching the repo contract
- Restore focus·previous input after retry exactly as the approved requirements say, and verify Escape·tab order·
  trigger focus return for dialog·popover
- Verify the target repo's required UI, such as 320px·both themes·reduced motion
- The code matches the approved architecture document, and the repo structure verification command passes

If there is a performance requirement·improvement claim, first read all of
[`performance.md`](performance.md) and finish the Initial-load·Runtime·Responsiveness axis
classification and profiler cause confirmation.
Only when there is a performance requirement·improvement claim, record the `metric·budget`, baseline
run, after run, and the difference in the same environment. Prefer existing benchmark·bundle scripts
and record the exact commands. If
there is no comparable environment, do not claim "improved". For a change with no performance
requirement, give only an N/A reason, without a benchmark or a new measurement dependency.

### Changed UI Boundaries

For changed layouts or controls, verify 200% text resize through a supported browser
scaling mechanism without losing content or functionality (except captions and images of text).
Zoom may change the responsive breakpoint; do not require it to stay within one breakpoint.
Check pointer target size and spacing against the repo's adopted accessibility standard and
applicable exceptions; do not invent thresholds or apply pointer sizing to noninteractive elements.
Choose relevant widths from the affected layout and breakpoint, immediately below and above
the breakpoint where reflow changes; this is not a fixed four-viewport matrix for every task.
Map these checks to the approved requirements rather than creating a separate checklist.
Record resize scale, tested widths, and CSS-pixel target size/spacing observations or the
applicable exception as evidence.
Browser execution belongs to the `frontend-visual-qa` skill when it is authorized.
When authorization is declined or browser tools are unavailable, leave browser checks unverified;
static inspection alone cannot establish browser PASS.

### Noise-Aware Performance Claims

Only for a performance requirement or improvement claim, repeat baseline and after measurements
under the same pinned conditions when the metric varies. Record sample count, median and spread,
and retain the raw samples; deterministic measures such as bundle bytes
do not need artificial repetition. Use the approved budget and the harness's measurement
resolution: no universal minimum improvement percentage. A difference within measurement noise
means "improvement not established", not an improvement or proof that the budget passed.
Revert only complexity introduced solely for performance when repeated evidence shows no benefit;
preserve required behavior and mandatory constraints, then rerun affected checks. If the evidence
is inconclusive, report that limitation rather than claiming success or reverting unrelated work.
