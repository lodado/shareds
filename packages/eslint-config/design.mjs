/**
 * Design-system preset (flat) - opt-in. `@deslint/eslint-plugin` judges the axis the other
 * presets leave alone: whether generated markup drifts from the design system (arbitrary
 * colors, spacing, radii, z-index), whether it covers dark mode and breakpoints, and
 * whether placeholder or server-only code reached the client.
 *
 * Its accessibility, security and Tailwind-correctness rules restate something `a11y`,
 * `quality`, `local-rules` or `tailwind` already judges, so those ship off - one defect
 * reports once. The plugin is an optional peer.
 *
 * The token rules read Tailwind classes, so they are worth turning on only for a repo
 * whose theme actually defines the scale the arbitrary value is escaping.
 */
import deslint from '@deslint/eslint-plugin'

const plugin = deslint.default ?? deslint

/** Rules another preset owns, mapped to the owner that decides the same question. */
const DEFERRED = {
  'a11y-color-contrast': 'jsx-a11y (rendered contrast belongs to visual QA)',
  'aria-validation': 'jsx-a11y-x/role-supports-aria-props',
  'autocomplete-attribute': 'jsx-a11y-x/autocomplete-valid',
  'focus-trap-patterns': '@lodado/local-rules/interaction-pattern-contract',
  'focus-visible-style': '@lodado/local-rules/interaction-hover-needs-focus',
  'form-labels': 'jsx-a11y-x/label-has-associated-control',
  'heading-hierarchy': 'jsx-a11y-x/heading-has-content',
  'icon-accessibility': 'jsx-a11y-x/alt-text',
  'image-alt-text': 'jsx-a11y-x/alt-text',
  'lang-attribute': 'jsx-a11y-x/lang',
  'link-text': 'jsx-a11y-x/anchor-has-content',
  'no-conflicting-classes': 'better-tailwindcss/no-conflicting-classes',
  'no-duplicate-class-strings': 'better-tailwindcss/no-duplicate-classes',
  'no-dangerous-html': '@eslint-react/dom-no-dangerously-set-innerhtml',
  'iframe-sandbox': '@eslint-react/dom-no-missing-iframe-sandbox',
  'safe-external-links': '@eslint-react/dom-no-unsafe-target-blank',
  'no-async-useeffect': 'react-hooks/set-state-in-effect',
  'no-floating-promise-handler': 'ts/no-floating-promises',
  'no-empty-catch': 'sonarjs/no-ignored-exceptions',
  'no-eval': 'no-eval',
  'no-hardcoded-secrets': 'sonarjs/no-hardcoded-passwords',
  'no-permissive-cors': 'sonarjs/cors',
  'no-path-traversal': 'sonarjs/no-path-traversal',
  'no-shell-injection': 'sonarjs/os-command',
  'no-sql-injection': 'sonarjs/sql-queries',
  'no-ssrf': 'sonarjs/no-ssrf',
  'no-weak-crypto': 'sonarjs/weak-ssl',
  'secure-cookies': 'sonarjs/insecure-cookie',
  'no-prod-console': '@lodado/local-rules/no-console-log',
}

const deferred = Object.fromEntries(Object.keys(DEFERRED).map((rule) => [`deslint/${rule}`, 'off']))

export default [
  {
    name: 'lodado/design',
    plugins: { deslint: plugin },
    rules: {
      ...plugin.configs.recommended.rules,
      ...deferred,

      // Token drift is the point of the preset, so it fails rather than warns.
      'deslint/no-arbitrary-colors': 'error',
      'deslint/no-arbitrary-spacing': 'error',
      'deslint/no-arbitrary-typography': 'error',
      'deslint/no-arbitrary-border-radius': 'error',
      'deslint/no-arbitrary-zindex': 'error',
      'deslint/no-magic-numbers-layout': 'error',

      // Coverage and rhythm are judgement calls, and ship off upstream.
      'deslint/dark-mode-coverage': 'warn',
      'deslint/responsive-required': 'warn',
      'deslint/no-inline-styles': 'warn',
      'deslint/consistent-color-palette': 'warn',
      'deslint/spacing-rhythm-consistency': 'warn',
      'deslint/max-tailwind-classes': 'warn',
    },
  },
]
