# Low fast path — lane Contract

This is the only load node for work whose risk judgment at entry is Low. In this lane read **only**
this file and do not load any other reference node — the graph's Oracle lane (`common` and below)
opens only on an explicit Oracle request or a Medium/High judgment.

## Entry Conditions — Only When All Are Satisfied

- There is no new policy·card·architecture decision.
- It is a change inside an already approved contract: easily reversible copy·token·isolated CSS·a
  clear regression fix.
- The worst-case damage of a false GREEN is small (at the level of static display or a pure
  synchronous helper). If the side effects are risky, it is not Low even when the UI is simple.

## Procedure

1. Record the risk judgment and reason in one line, and print the lane header on the first line of
   the response (`risk=Low lane=low-fast-path nodes=[low-fast-path]`). Reason example:
   `risk: low — copy fix inside an approved wording contract`.
2. Make the change and run only the related tests and the repo's required verification
   (lint·typecheck·targeted test).
3. Report the result: the changed paths, the verification commands run and their actual results, and
   the risk reason.

## What This Lane Does Not Do

- Creating an Oracle Card·revision lock·run ledger·state file·evidence manifest
- Grill·user card confirmation·independent subagent review
- Loading other reference nodes

This is a lane that skips procedure, not a lane that skips verification — run the repo's required
verification as is, and never report a verification you did not run as passing.

## Promotion — Low Disqualification Conditions

If any one of the following appears during the work, it is immediately disqualified from Low. Do not
stay on the fast path; report the changes made so far and then promote to the Oracle lane
(`common.md` → `card/` node, Medium procedure). When the disqualification covers only part of the
request, read "Carving the risky scope out" below before promoting all of it.

- A policy question that changes the result has come up (`Then`·`Never`·the number of side effects must be decided)
- A new state·form·async flow·responsive structure has become necessary
- You have ended up changing an architecture boundary·state ownership·public API
- A side-effect risk such as mutation·permissions·data integrity has surfaced

After promotion, do not treat changes already made as a fait accompli — revert them if they conflict
with the policy the card procedure sets.

### Carving the risky scope out — mixed requests

A request usually disqualifies on one part, not all of it. Promoting the whole request buys nothing
and makes the card carry rows no one needed. Cut the disqualifying scope out, send only that to the
Oracle lane, and finish the remainder here at full strength.

Carve only when **all three** hold. If any one fails, promote the whole request — a split that
shares a failure is worse than the ceremony it avoided.

- The remainder touches no state, no side effect, and no type the carved-out scope reads or writes.
- The remainder is correct whichever way the carved-out policy is decided — no answer to the open
  question changes it.
- The remainder is separately verifiable and separately revertible.

Record the descope in one line before continuing: what was carved out, which disqualification
triggered it, and where it went. The Oracle card for the carved scope registers the remainder under
Non-goals, so the two halves cannot silently re-merge.

```text
descope: retry-on-5xx policy → oracle lane (side-effect count undecided); remainder = button label
copy fix, no shared state, verified separately
```

Worked pair — same request, opposite verdicts:

- **Carve.** "Fix the typo in the empty-state text and make the save button ignore duplicate
  clicks." The copy fix reads no submit state and survives any duplicate-submit policy.
- **Do not carve.** "Fix the disabled-button styling and make the save button ignore duplicate
  clicks." The styling renders the very state the undecided policy defines, so the safe-looking half
  is not safe — it is the unresolved policy wearing a CSS costume.
