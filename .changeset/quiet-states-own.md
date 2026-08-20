---
'@lodado/eslint-plugin-local-rules': patch
---

Limit parallel boolean state checks to locally-owned `*State` declarations so framework projections and component props do not require redundant status unions.
