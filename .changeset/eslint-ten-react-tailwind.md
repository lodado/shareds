---
'@lodado/eslint-config': major
'@lodado/eslint-plugin-local-rules': minor
---

Require ESLint 10. ESLint 9 reached end of life on 2026-08-06 and `eslint-plugin-react` never
followed, so the `react` preset now layers `@eslint-react/eslint-plugin` strict-typescript under the
official `eslint-plugin-react-hooks` recommended set (React Compiler diagnostics such as
`error-boundaries`, `globals` and `use-memo` are errors, ESLint React's duplicate ports stay off).
`a11y` moves to `eslint-plugin-jsx-a11y-x` (`jsx-a11y-x/*`), `next` ships only
`@next/eslint-plugin-next` core-web-vitals and no longer needs the `next` package, and Web API leak
rules report as `@eslint-react/web-api-*`. `react/function-component-definition` and
`react/jsx-props-no-spreading` have no ESLint React equivalent and are dropped.

`base` gains a `lodado/habits` block: `unicorn/no-thenable`, `no-unnecessary-await`,
`no-useless-promise-resolve-reject`, `no-useless-spread` and `no-unreadable-iife` are errors;
`no-immediate-mutation`, `prefer-single-call`, `prefer-optional-catch-binding` and
`e18e/ban-dependencies` warn.

Add an opt-in `tailwind` preset for Tailwind CSS v4 on top of `eslint-plugin-better-tailwindcss`
(unknown, conflicting, concatenated and duplicate classes fail, deprecated classes warn, ordering
stays with the formatter). The plugin and `tailwindcss` are optional peers, installed only by repos
that extend the preset.

`@lodado/eslint-plugin-local-rules` reads `context.filename` / `context.sourceCode` instead of the
accessor methods ESLint 10 removed and declares ESLint 10 as a supported peer.
