# Formal-only case space input families

Shared by Space discovery and model-package authoring. Read [`bva.md`](../bva.md) for real boundaries
of approved policy, not mechanical 0/1 padding. This taxonomy is not projected-card authoring procedure.

Eight families, imported rather than invented. The first seven are input families: the test drives them.

| Family      | Typical dimensions                                                                 | Provenance                                                   |
| ----------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Data        | volume (0/1/page/boundary/max), staleness                                          | SFDIPOT Data, bva value axis                                 |
| Value       | per-field input classes (min−1/min/format/unicode)                                 | bva value boundaries                                         |
| Async       | per-operation states (pending/success/error subtype)                               | bva state axis, SFDIPOT Time                                 |
| Order       | operation-pair interleavings (sequential/inverted/duplicate/late-after-cancel)     | bva time/order axis                                          |
| Entry       | fresh/refresh/back-forward/deep-link                                               | SFDIPOT Operations                                           |
| Environment | viewport boundaries, theme, reduced-motion, StrictMode                             | SFDIPOT Platform, ISO 25010                                  |
| Platform    | browser/OS choices derived from the repo's browserslist/engines, never from recall | SFDIPOT Platform                                             |
| Inherited   | still-effective prior P\*                                                          | interaction sweep owns this, reference rather than duplicate |

Value boundaries become Value choices, state boundaries become Async choices, time/order boundaries
become Order choices and count boundaries become Data choices. Only real boundaries of approved policy
are valid. Do not add assertion criteria (accessibility, visual quality, success invariants) as though
they were independent input dimensions. Unknown is not excluded. Production, test and browser observations
are investigation evidence, not approved policy. Package-specific mapped/behavior/excluded dispositions
are author duties in card/case-space.md, not a reason for intake to load projected-card instructions.
