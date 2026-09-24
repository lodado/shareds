---
'@lodado/eslint-config': major
'@lodado/eslint-plugin-local-rules': minor
---

Check FSD layer direction without a strict policy, and keep verdicts independent of preset order, `--fix` and non-code files.

- New `fsd-layer-direction` rule, on in the `fsd` preset: a slice imports only from lower layers, never from a sibling slice (type-only imports included), and `@x` only from the entity it names. The fsd rules now read layers from cwd-relative paths anchored at `src/`, so a checkout under a folder named `views`, `features` or `db` no longer changes their verdict.
- `fsd` is now `fsd.mjs` and adds `fsdBoundaries({ cwd, tsconfig, roots })`, which runs `fsd-strict-boundaries` over the named roots. Inside strict or fsdBoundaries roots the folder-name rules step aside, and `verifyStrictProject` fails if a later `fsd` spread turns them back on.
- `local-rules` no longer lists the fsd and interaction rules as `off`, so spreading it after those presets keeps them on.
- Every preset block is scoped to JS/TS sources. Linting a README with `react` or `ai` no longer crashes.
- `base`: an empty `catch` block is an error (a comment inside it marks a deliberate one), and `unicorn/prefer-optional-catch-binding` is gone, so `--fix` cannot turn a reported empty catch into an unreported one. `.tsx`/`.jsx` files no longer need explicit function return types.
- `quality`: `sonarjs/no-reference-error` is off. `no-undef` owns undeclared names in JS and tsc owns them in TS, where the rule misread `React.ReactNode`.
- `testing`: `playwright/no-raw-locators` and `playwright/prefer-locator` are errors, replacing `@lodado/local-rules/no-css-locator-without-reason`, which is removed.
