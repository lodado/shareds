# my-Vibe-Coding-Helper

Monorepo distributing lodado's shared ESLint configuration and coding-agent plugins.

| Package                                                                   | Distributed via                        | What it is                                            |
| ------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| [`@lodado/eslint-config`](packages/eslint-config)                         | npm (changesets)                       | Composable ESLint presets - enable only what you need |
| [`@lodado/eslint-plugin-local-rules`](packages/eslint-plugin-local-rules) | npm (changesets)                       | Custom ESLint rules                                   |
| [`vibe-coding-helper`](packages/vibe-coding-helper)                       | Claude Code / Codex plugin marketplace | Skills shared with coding agents                      |
| [`frontend-oracle-design`](packages/frontend-oracle-design)               | Claude Code / Codex plugin marketplace | Risk-aware Oracle contracts, TDD, and review          |
| [`frontend-system-design`](packages/frontend-system-design)               | Claude Code / Codex plugin marketplace | Oracle-dependent patterns for known frontend problems |
| [`test`](packages/test)                                                   | Claude Code / Codex plugin marketplace | Oracle-driven frontend behavior testing               |
| [`frontend-visual-qa`](packages/frontend-visual-qa)                       | Claude Code / Codex plugin marketplace | Screenshot comparison and direct-browser QA           |

## ESLint config

Presets compose - the base preset is always on, the rest are opt-in:

```js
// .eslintrc.js
module.exports = {
  root: true,
  extends: [
    '@lodado/eslint-config',
    '@lodado/eslint-config/react',
    '@lodado/eslint-config/a11y',
    '@lodado/eslint-config/local-rules',
  ],
}
```

Available: base (`.`), `react`, `next`, `a11y`, `turbo`, `local-rules`, `testing`, `query`.
Full guidance lives in the plugin's [`eslint-setup` skill](packages/vibe-coding-helper/skills/eslint-setup/SKILL.md).

## Agent plugin

```
/plugin marketplace add lodado/my-Vibe-Coding-Helper
/plugin install vibe-coding-helper@my-vibe-coding-helper
```

The same package carries a `.codex-plugin/plugin.json`, so Codex loads the identical `skills/` directory.

## Development

```bash
pnpm install
pnpm lint
pnpm test          # preset smoke tests
pnpm changeset     # record a release
```

Releases run from `main` via `.github/workflows/intergrate_workflow.yml`. The release job is gated on
the `ENABLE_NPM_RELEASE` repo variable being `true` and needs an `NPM_TOKEN` secret allowed to create
`@lodado/*` packages.
