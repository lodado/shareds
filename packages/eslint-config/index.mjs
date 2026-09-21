import antfu from '@antfu/eslint-config'
import prettier from 'eslint-config-prettier'

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
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'eslint-comments/require-description': 'error',
      'eslint-comments/no-unlimited-disable': 'error',
    },
  },
  {
    name: 'lodado/habits',
    files: ['**/*.?([cm])[jt]s?(x)'],
    // Async and mutation habits that type-check but hide a defect; Antfu registers
    // the unicorn and e18e plugins, this only turns the extra rules on.
    rules: {
      'unicorn/no-thenable': 'error',
      'unicorn/no-unnecessary-await': 'error',
      'unicorn/no-useless-promise-resolve-reject': 'error',
      'unicorn/no-useless-spread': 'error',
      'unicorn/no-unreadable-iife': 'error',
      'unicorn/no-immediate-mutation': 'warn',
      'unicorn/prefer-single-call': 'warn',
      'unicorn/prefer-optional-catch-binding': 'warn',
      'e18e/ban-dependencies': 'warn',
    },
  },
).renamePlugins({ import: 'import-lite' })
