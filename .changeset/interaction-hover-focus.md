---
'@lodado/eslint-plugin-local-rules': minor
'@lodado/eslint-config': minor
---

Add `interaction-hover-needs-focus`: an interactive element that styles `hover:` but nothing for
focus leaves keyboard users with no feedback, and jsx-a11y only checks handlers, never styles. It
reads the class list through `cn`/`clsx`, template literals and ternaries, and ships on as a warning.

`interaction-pattern-contract` and `interaction-pattern-guess` now ship `recommended: false`: they
judge a whole WAI-ARIA pattern rather than a single defect. Repos that want that scrutiny extend the
new `@lodado/eslint-config/interaction` preset, the same opt-in shape the FSD rules already use.
