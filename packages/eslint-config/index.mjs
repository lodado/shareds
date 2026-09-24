import antfu from '@antfu/eslint-config'
import prettier from 'eslint-config-prettier'
import { CODE_FILES } from './code-files.js'

/** Base preset: Antfu's modern JS/TS defaults without formatter ownership. */
// eslint-disable-next-line antfu/no-top-level-await -- consumers spread a resolved config array
export default await antfu(
  {
    type: 'lib',
    formatters: false,
    lessOpinionated: true,
    stylistic: false,
    typescript: true,
  },
  prettier,
  {
    name: 'lodado/feedback',
    linterOptions: { reportUnusedDisableDirectives: 'error', reportUnusedInlineConfigs: 'error' },
    rules: {
      'eslint-comments/require-description': 'error',
      'eslint-comments/no-unlimited-disable': 'error',
    },
  },
  {
    name: 'lodado/no-disable-correctness',
    files: CODE_FILES,
    // Documentation code blocks show forbidden patterns on purpose.
    ignores: ['**/*.md/**', '**/*.mdx/**'],
    // These rules report defects rather than style; a described disable still ships the defect, so
    // a real exception goes in a file-scoped config override where review sees it.
    rules: {
      'eslint-comments/no-restricted-disable': [
        'error',
        'react-hooks/*',
        'ts/no-floating-promises',
        'ts/no-misused-promises',
        'ts/no-unsafe-*',
        '@lodado/local-rules/*',
      ],
    },
  },
  {
    name: 'lodado/habits',
    files: CODE_FILES,
    // Async and mutation habits that type-check but hide a defect; Antfu registers
    // the unicorn and e18e plugins, this only turns the extra rules on.
    rules: {
      'no-nested-ternary': 'error',
      // An empty catch swallows the failure; a comment inside the block is the documented exception.
      'no-empty': ['error', { allowEmptyCatch: false }],
      'unicorn/no-thenable': 'error',
      'unicorn/no-unnecessary-await': 'error',
      'unicorn/no-useless-promise-resolve-reject': 'error',
      'unicorn/no-useless-spread': 'error',
      'unicorn/no-unreadable-iife': 'error',
      'unicorn/no-immediate-mutation': 'warn',
      'unicorn/prefer-single-call': 'warn',
      'e18e/prefer-includes': 'off', // unicorn/prefer-includes owns this diagnostic
      'e18e/ban-dependencies': 'warn',
    },
  },
  {
    name: 'lodado/assertions',
    files: ['**/*.?([cm])ts?(x)'],
    // `<T>value` and `{ ... } as T` claim a shape instead of building one.
    rules: { 'ts/consistent-type-assertions': ['error', { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }] },
  },
  {
    name: 'lodado/components',
    files: ['**/*.{jsx,tsx}'],
    // `type: 'lib'` asks exported functions for a return type; a component returns its JSX.
    rules: { 'ts/explicit-function-return-type': 'off' },
  },
).renamePlugins({ import: 'import-lite' })
