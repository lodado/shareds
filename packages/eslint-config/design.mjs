/**
 * Design-system preset (flat) - opt-in. `@deslint/eslint-plugin` judges the axis the other
 * presets leave alone: whether generated markup drifts from the design system (arbitrary
 * colors, spacing, radii, z-index), whether it covers dark mode, breakpoints, touch targets
 * and reduced motion, and whether placeholder, mock or server-only code reached the client.
 *
 * Rules are listed one by one rather than spreading the plugin's recommended config, so a
 * plugin release cannot switch a new rule on. A deslint rule that restates something another
 * preset already judges stays off - one defect reports once; `DEFERRED` names the owner.
 * The plugin is an optional peer.
 *
 * The token rules read Tailwind classes, so they are worth turning on only for a repo
 * whose theme actually defines the scale the arbitrary value is escaping.
 */
import deslint from '@deslint/eslint-plugin'
import { CODE_FILES } from './code-files.js'

const plugin = deslint.default ?? deslint

/** Rules another preset owns, mapped to the owner that decides the same question. */
export const DEFERRED = {
  'a11y-color-contrast': 'jsx-a11y (rendered contrast belongs to visual QA)',
  'aria-validation': 'jsx-a11y-x/role-supports-aria-props',
  'autocomplete-attribute': 'jsx-a11y-x/autocomplete-valid',
  'focus-trap-patterns': '@lodado/local-rules/interaction-pattern-contract',
  'form-labels': 'jsx-a11y-x/label-has-associated-control',
  'icon-accessibility': 'jsx-a11y-x/alt-text',
  'image-alt-text': 'jsx-a11y-x/alt-text',
  'lang-attribute': 'jsx-a11y-x/lang',
  'link-text': 'jsx-a11y-x/anchor-has-content',
  'prefer-semantic-html': 'jsx-a11y-x/prefer-tag-over-role',
  'responsive-image-optimization': '@next/next/no-img-element',
  'no-conflicting-classes': 'better-tailwindcss/no-conflicting-classes',
  'no-duplicate-class-strings': 'better-tailwindcss/no-duplicate-classes',
  'no-dangerous-html': '@eslint-react/dom-no-dangerously-set-innerhtml',
  'iframe-sandbox': '@eslint-react/dom-no-missing-iframe-sandbox',
  'safe-external-links': '@eslint-react/dom-no-unsafe-target-blank',
  'no-async-useeffect': 'react-hooks/set-state-in-effect',
  'no-hydration-mismatch': '@lodado/local-rules/no-nondeterministic-render, react-hooks/purity',
  'no-floating-promise-handler': 'ts/no-floating-promises',
  'no-empty-catch': 'no-empty',
  'no-eval': 'no-eval',
  'no-hardcoded-secrets': 'ai-guard/no-hardcoded-secret',
  'no-permissive-cors': 'sonarjs/cors',
  'no-sql-injection': 'ai-guard/no-sql-string-concat, sonarjs/sql-queries',
  'no-weak-crypto': 'sonarjs/weak-ssl',
  'secure-cookies': 'sonarjs/insecure-cookie',
  'no-prod-console': 'no-console',
}

const rules = {
  // Token drift is the point of the preset, so it fails rather than warns.
  'no-arbitrary-colors': 'error',
  'no-arbitrary-spacing': 'error',
  'no-arbitrary-typography': 'error',
  'no-arbitrary-border-radius': 'error',
  'no-arbitrary-zindex': 'error',
  'no-magic-numbers-layout': 'error',

  // Placeholder, mock and server-only code must not ship as product code.
  'no-placeholder-code': 'error',
  'no-mock-data-in-prod': 'error',
  'no-leaked-env-on-client': 'error',
  'no-server-only-in-client': 'error',
  'no-leaked-stack-trace': 'error',

  // Security checks no other preset makes.
  'no-disabled-tls': 'error',
  'no-unsafe-mass-assignment': 'error',
  'no-shell-injection': 'error',
  'no-path-traversal': 'error',
  'no-ssrf': 'error',
  'safe-redirect': 'warn',
  'require-jwt-expiry': 'warn',
  'no-unvalidated-input': 'warn',
  'no-hardcoded-localhost': 'warn',

  // Accessibility checks jsx-a11y does not make.
  'viewport-meta': 'error',
  'focus-visible-style': 'warn',
  'heading-hierarchy': 'warn',
  'touch-target-size': 'warn',
  'prefers-reduced-motion': 'warn',

  // Coverage and rhythm are judgement calls.
  'dark-mode-coverage': 'warn',
  'responsive-required': 'warn',
  'no-inline-styles': 'warn',
  'consistent-color-palette': 'warn',
  'consistent-component-spacing': 'warn',
  'consistent-border-radius': 'warn',
  'spacing-rhythm-consistency': 'warn',
  'max-tailwind-classes': 'warn',
}

export default [
  {
    name: 'lodado/design',
    files: CODE_FILES,
    plugins: { deslint: plugin },
    rules: Object.fromEntries(Object.entries(rules).map(([rule, severity]) => [`deslint/${rule}`, severity])),
  },
]
