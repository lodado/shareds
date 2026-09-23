# Simulation, navigation and interruption contracts

Keep state dimensions independent where they can coexist:

- run phase (ready/playing/ending/result, game-specific);
- menu/overlay navigation;
- lifecycle visibility;
- interruption reasons (user pause, hidden tab, ad, context loss, etc.);
- ad/reward request lifecycle, only if in scope.

Do not flatten their cross-product into an unmanageable single enum. A hierarchy, parallel machine or pause-reason set is acceptable; explain one concrete model. Avoid assuming a tab-visible event cancels a user pause.

Authoritative progression rule example: `canAdvance = runPhase == playing AND pauseReasons is empty`. This is a design example, not shipped code. Different valid games may use a different model if all interruptions are handled.

Transition rows: `id | from | event | guard | to | data effects | feedback | cancellation/recovery | tests`. Every primary CTA and overlay exit must map to a transition. Reject undefined target states and reuse stable identifiers.

Pause/resume: freeze applicable game time and cancel active gestures; preserve intentional settings. Define which UI animation can continue. Returning to a visible tab can require a tap to resume. No accumulated time jump that advances a long hidden interval as one frame.

Rewarded flow (conditional): an offer is not a reward; close is not necessarily completion. The verified provider's callback contract controls entitlement. Separate `reward_confirmed`, `reward_granted` and resumption. Use a request/grant ID to make credit idempotent. A late result must not mutate a new run with an old run ID. No match to provider docs → leave policy unverified.

Required interruption case: ad ends while tab remains hidden. Remove only the ad reason; hidden/user reasons remain. Grant a confirmed reward at most once even if paused. Do not resume the simulation because credit succeeded. Recovery from crash around a persistent grant requires a defined transaction/storage boundary, not an unsupported exactly-once guarantee.

Other edge cases: rapid taps, double start, end event twice, collision on a consumed entity, restart during animation, pointercancel, drag under an overlay, device rotation mid-gesture, refresh/back, storage quota/corruption, network failure only when network is required, graphics/context failure. For each, specify preservation/reset and user-facing recovery.

Separate entitlement, run score and ranked score. If assistance changes competitive outcomes, specify eligibility or separate boards rather than silently treating runs as equivalent.
