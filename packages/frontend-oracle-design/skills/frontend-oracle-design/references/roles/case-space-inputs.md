# Case space input families

At discovery, consider each applicable family with [BVA](../bva.md): initial state/data, user actions
and repeats, request lifecycle, response ordering, owner lifetime, server/trust boundary and data values.
Use real approved boundaries, not mechanical 0/1 padding. Record source-backed applicability or reason
for non-application. Include inherited behavior and cross-family interactions changing outcomes.
Keep unknown combinations until decided. Timing is represented by finite event/order paths where relevant.
Return axes/value proposals, constraints and provenance, not an invented product answer or approval.
The selected profile's Space procedure owns enumeration/dispositions and current-stage checks.

Eight families, imported rather than invented. The first seven are input families: the test drives them.

| Family      | Typical dimensions                                                                 | Provenance                                                   |
| ----------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Data        | volume (0/1/page/boundary/max), staleness                                          | SFDIPOT Data, bva value axis                                 |
| Value       | per-field input classes (min−1/min/format/unicode)                                 | bva value boundaries                                         |
| Async       | per-operation states (pending/success/error subtype)                               | bva state axis, SFDIPOT Time                                 |
| Order       | operation-pair interleavings (sequential/inverted/duplicate/late-after-cancel)     | bva time/order axis                                          |
| Entry       | fresh/refresh/back-forward/deep-link                                               | SFDIPOT Operations                                           |
| Environment | StrictMode, measured layout (observer·scroll ownership)                            | SFDIPOT Platform, ISO 25010                                  |
| Platform    | browser/OS choices derived from the repo's browserslist/engines, never from recall | SFDIPOT Platform                                             |
| Inherited   | still-effective prior P\*                                                          | interaction sweep owns this, reference rather than duplicate |

Every family is decided: a declared dimension, or `excluded: <reason>` (`family-undispositioned` otherwise).
