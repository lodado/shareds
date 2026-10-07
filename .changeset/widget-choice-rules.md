---
'@lodado/eslint-config': minor
'@lodado/eslint-plugin-local-rules': minor
---

Lint the widget choices code can judge without rendering: a dialog opened inside another dialog, and a select that hides two or three fixed choices.

Local rules (all `recommended: false`):

- `no-nested-dialog` reports a dialog opened inside another dialog in the same file's JSX. `<dialog>`, a native element with a literal `role="dialog"`/`"alertdialog"`, `Dialog`, `AlertDialog`, `Modal`, `Drawer`, `Sheet` and their `.Root` count. A library part (`DialogContent`, `.Content`, `.Panel`) and the direct child surface of a `Modal` or `Drawer` (React Aria, Joy UI) belong to the same dialog. `{ dialogs }` replaces the component list.
- `prefer-radio-for-few-options` reports a `<select>` with two or three literal `<option>` choices. A mapped, conditional or grouped child, `multiple`, `size` above 1, a `hidden` option, or a placeholder first option (disabled, or empty in a `required` select) does not count. `{ components }` adds a design-system select that takes `<option>` children.

Presets:

- `interaction` turns on `no-nested-dialog` and `prefer-radio-for-few-options` as warnings.
