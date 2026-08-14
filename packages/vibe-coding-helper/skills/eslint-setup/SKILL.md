---
name: eslint-setup
description: Use when adding or changing ESLint config in a project that uses @lodado/eslint-config - picks the right preset combination instead of copying a full config in.
---

# ESLint setup with @lodado/eslint-config

The config ships composable presets. Enable only what the package actually is.

## Install

```bash
pnpm add -D @lodado/eslint-config eslint@^8.57.0
```

## Compose

`.eslintrc.js` in the consuming package:

```js
module.exports = {
  root: true,
  extends: [
    '@lodado/eslint-config', // always - TS parsing, import sort, prettier conflict removal
    '@lodado/eslint-config/react', // React components (airbnb style guide)
    '@lodado/eslint-config/next', // Next.js apps only
    '@lodado/eslint-config/a11y', // JSX that renders user-facing markup
    '@lodado/eslint-config/turbo', // Turborepo workspaces - catches undeclared env vars
    '@lodado/eslint-config/local-rules', // lodado custom rules (no-console-log)
  ],
}
```

## Which presets

| Package kind                   | Presets                                  |
| ------------------------------ | ---------------------------------------- |
| Node/TS library, no JSX        | base                                     |
| React component library        | base + react + a11y + local-rules        |
| Next.js app                    | base + react + next + a11y + local-rules |
| Any package inside a turborepo | add turbo                                |

Order matters: later entries win. Keep the base preset first.

## Rules

- Do not re-declare rules the preset already sets. Change the preset instead and release it.
- Formatting is Prettier's job, not ESLint's - the base preset only turns conflicting rules off.
- A rule that should apply everywhere belongs in `@lodado/eslint-plugin-local-rules`, not in a per-project override.
