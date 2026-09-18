# HCI → reference → wireframe — show what and why before Figma

Applies to new screens, major structure/behavior changes, wireframe requests. HCI designs so
a specific user in context can understand, execute, and recover from failure. A good pattern
doesn't prove usability — outputs below are a hypothesis to verify.

## 1. Task first

Read first: [request-contract](request-contract.md) §3 (five planes + Grill questions).

Derive flow from Strategy/Scope into Skeleton layout. Overlap research/sketching; ask only
on a new contradiction, no per-plane gate. Extract the brief from PRD/internal screens; don't
re-ask given answers, don't invent fake personas/research/metrics. Mark unclear non-blocking
items `proposed/unverified`; ask only about conflicts changing product direction.

Brief fields: users/context (skill, frequency, device, constraints) · core task (one
sentence, user language) · entry/info needs · action → feedback → error/recovery,
CTA/next-CTA · states: empty, loading, success, error, permission.

## 2. Compare 2–3 similar-task references

Read first: [taxonomy-reference-workflow](taxonomy-reference-workflow.md),
[research-selection](research-selection.md).

Check internal fit first. Compare **distinct sources** only if requested or the flow lacks
grounding — 2–3 similar-task cases plus pattern guidance is usually enough; count isn't a
quality score, leave thin sourcing thin. Component quantity/rights/import verification is
[component-source-gate](component-source-gate.md)'s job, not this comparison.

Narrow search to `user task, UI role, needed state/device` — examples, not dictionary IDs or
real results. Principle sources are a judgment basis, pattern libraries are behavior guidance,
product screens are observed cases — none automatically supplies an editable asset. Add rows
to the existing Reference Log, no new schema: source + observed level, task fit, role
(structure/behavior/visual), adopt/reject/adapted, where applied + assumption to verify.

## 3. Show rough sketch + explanation before target Figma write

Default: 1–3 key screens/states, scoped to the request; summarize larger scope first, expand
only decision-critical parts. Cover both desktop/mobile if both requested.

### Example — team invite (hypothetical)

```text
[1. Enter invitee]                  [2. Confirm before send]
+------------------------+          +------------------------+
| Email [______________] |   --->   | To: <email>            |
| Role  [Member v]       |          | Role: <selected role>  |
| [Cancel] [Review →]    |          | [Back] [Send invite]   |
+------------------------+          +------------------------+
                    | sending → success or error/retry
```

Email→role→review lowers memory load; invalid input shown as text, value kept. Review
re-confirms recipient/role, persists on back-nav. Sending blocks duplicate submit; success
states what completed, failure keeps input and states retry. Hypothetical — not observed, not
asset confirmation, not a usability-test pass; gains are hypotheses until observed.

Explanation output (5 items): 1) task + structure, one line 2) reference adopt/reject reasons

- unverified items 3) numbered ASCII/text wireframe: real headings/info/CTA/navigation

4. success path + key failure/recovery + keyboard/focus intent 5) why this order / what
   happens on click / which verified asset it maps to in Figma.

Show before the first target Figma write. Not user approval — don't record `accepted` or
repeat "shall I proceed?". Stop only on explicit "wait for my review" / "don't edit before
approval" — record `not-obtained`, proceed only once a real answer arrives.

## 4. Progress, stop, logging

Read-only material needs no write access; final build is BLOCKED — don't report a sketch as
PILOT_READY/FIGMA_READY. Small edits preserving structure/behavior reuse existing rationale,
one line on why the full flow was skipped; still sketch if explicitly requested. No new
workflow states/approval fields — link the brief to `brief`/`scope.states`, keep the
table/sketch/explanation in the Reference Log, connect from `source_trace.references`,
summarize in `handoff.summary`/`handoff.next_action`. Don't fabricate unobtained Figma IDs.

## 5. Figma handoff and verification

If visual direction is undecided, apply [visual-direction](visual-direction.md): compare
small real-asset variants after the text sketch, don't build the full screen first.
Reuse a locked direction; import candidates only after explanation and any stated review-wait.

Map per [figma-composition](figma-composition.md): `wireframe number → adoption rationale →
sourced asset/component → applied frame/state`. Preserve originals, links, edit mode; build
the pilot with real content. Log changed flow/state when upgrading a sketch; confirm
decisions that change product policy or approved scope.

Self task-walkthrough at sketch stage: does the user know where to act? Is
feedback/completion visible after each action? Can they recover from/cancel the key error? Is
keyboard read/focus order designed? Verify against agreed screens/states and the real
prototype path — not static-mock verification, can't cover network/backend behavior. See
[delivery-contract](delivery-contract.md) for QA.

## 6. Prototype behavior is part of the approved interaction

For a new or behavior-changing flow, the editable Figma deliverable includes the approved core prototype path, not just static frames. Attach only behavior supported by the brief: success, validation/error recovery, cancel/back, and required overlay open/close paths. Preserve existing reactions outside the approved change.

After writing, reread the actual reactions and report the source hotspot, trigger, action, destination, and any unresolved or unverified branch. A prototype reaction is evidence of the Figma connection, not proof of backend success, production navigation, or usability. Static-only and small visual edits skip this step and record why.
