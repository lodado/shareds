/**
 * Widget contract rules. They ship `recommended: false` because they judge a whole WAI-ARIA pattern
 * rather than a single defect, so a repo turns them on when it wants that scrutiny. The two warnings
 * judge widget choice: a dialog opened inside a dialog, and a select hiding two or three fixed choices.
 * The always-on half - keyboard handlers, focusability, hover without focus - is in `a11y` and
 * `local-rules`.
 */
const localRulesPlugin = require('@lodado/eslint-plugin-local-rules')
const { CODE_FILES } = require('./code-files')

module.exports = [
  {
    name: 'lodado/interaction',
    files: CODE_FILES,
    plugins: { '@lodado/local-rules': localRulesPlugin },
    rules: {
      '@lodado/local-rules/interaction-pattern-contract': 'error',
      '@lodado/local-rules/no-nested-dialog': 'warn',
      '@lodado/local-rules/prefer-radio-for-few-options': 'warn',
    },
  },
]
