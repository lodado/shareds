---
'@lodado/eslint-plugin-local-rules': minor
---

Add `interaction-pattern-contract` plus `contracts/*.json` exported as `contracts`: WAI-ARIA pattern
contracts (keys, roles, focus, CSS states) for button, dialog, menu-button, combobox, tabs,
disclosure, listbox and switch. The rule finds a widget by its declared `role` or `aria-haspopup`
and checks what source can show: state attributes bound to expressions rather than literals, the
required naming and relationship attributes, and — for every key the pattern needs — a comparison
against `event.key` in the enclosing component (`key === 'Escape'`, `switch (e.key)`,
`[...].includes(e.key)`). A string that merely appears in the file does not count, and one arrow
direction does not satisfy a pattern that needs both. It ships `recommended: false`; extend
`@lodado/eslint-config/interaction` to turn it on.
