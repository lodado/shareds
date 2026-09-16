---
'@lodado/eslint-plugin-local-rules': minor
---

Add `interaction-pattern-contract` and `interaction-pattern-guess`, plus `contracts/*.json` exported as
`contracts`: WAI-ARIA pattern contracts (keys, roles, focus, CSS states) for button, dialog,
menu-button, combobox, tabs, disclosure, listbox and switch. The contract rule checks what source can
show — state attributes bound to expressions, required naming/relationship attributes, and a key
handler for the pattern's primary keys in the enclosing component. The guess rule flags a boolean-gated
overlay or list that renders a widget without declaring its role. Both ship as warnings through the
`local-rules` preset.
