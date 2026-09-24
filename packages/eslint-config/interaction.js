/**
 * Widget contract rules. They ship `recommended: false` because they judge a whole WAI-ARIA pattern
 * rather than a single defect, so a repo turns them on when it wants that scrutiny.
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
    },
  },
]
