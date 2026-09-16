---
'@lodado/eslint-plugin-local-rules': minor
---

Ship `examples/<pattern>/*.tsx`: 13 reference implementations of the interaction contracts (button
basic·toggle, dialog modal·alert, menu-button, combobox list·select-only, tabs automatic·manual,
disclosure, listbox single·multi, switch) with the shared `examples/styles.css` realising each
contract's CSS guidance. Every contract now carries an `example` path; the package test lints the
examples with jsx-a11y strict plus the interaction rules and typechecks them, so a contract and its
example cannot drift apart.

The examples were driven in a real browser through every keyboard step their contracts promise
(35 steps, all passing), which caught one defect: the disclosure content carried both `hidden` and a
grid-rows transition, so it never became visible. Collapsed content keeps `hidden` and the contract
now says a height transition needs `transition-behavior: allow-discrete`. The listbox contract also
records that typeahead only sees keys that arrive as `keydown`, never IME composition.
