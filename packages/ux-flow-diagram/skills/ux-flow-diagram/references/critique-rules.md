# UX graph critique rules

Findings begin with an observable graph fact, then a bounded interpretation, confidence, affected IDs, and recommendation. Do not turn a fixed heuristic into a universal UX law.

- **Reachability:** calculate per starting point. In partial or conditional graphs, say possible or unknown reachability rather than asserting unreachable.
- **Dead ends:** distinguish structural dead ends from problematic dead ends. A documented success or completion terminal is normally valid.
- **Broken destinations:** report confirmed missing targets separately from unresolved, unavailable, and out-of-scope targets.
- **Branches and recovery:** inspect conditional destinations, else/no-op behavior, validation, retry, cancel, and alternative paths only when relevant to the task.
- **Overlays:** inspect open, close, swap, back, and outside-dismiss evidence. Missing stack information is a limitation, not proof of a trap.
- **Cycles:** normal return navigation is allowed. Review exit-less loops in contextual onboarding or task flows instead.
- **Path length:** report observed shortest paths and bounded estimates. Do not declare a flow bad because it exceeds a fixed number of transitions.
- **State coverage:** consider loading, empty, success, error, validation, permission, offline, retry, and confirmation only when the task semantics require them.
- **Navigation consistency:** same labels with different semantics are review candidates, not automatic defects.

Use severity (`low`, `medium`, `high`, `critical`) for impact and confidence (`low`, `medium`, `high`) for evidence quality. Keep observation, interpretation, and recommendation separate.
