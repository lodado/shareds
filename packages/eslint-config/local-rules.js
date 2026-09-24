const localRulesPlugin = require('@lodado/eslint-plugin-local-rules')
const { CODE_FILES } = require('./code-files')

// Keep activation explicit: adding a plugin rule must not silently enable it here. Rules another
// preset turns on (fsd, interaction) are not listed, so spreading this after them keeps them on.
module.exports = [
  {
    name: 'lodado/local-rules',
    files: CODE_FILES,
    plugins: { '@lodado/local-rules': localRulesPlugin },
    rules: {
      '@lodado/local-rules/interaction-hover-needs-focus': 'warn',
      '@lodado/local-rules/no-action-in-state': 'warn',
      '@lodado/local-rules/no-arbitrary-sleep-in-tests': 'error',
      '@lodado/local-rules/no-boolean-state-flags': 'warn',
      '@lodado/local-rules/no-complex-ternary': 'warn',
      '@lodado/local-rules/no-derived-state-member': 'warn',
      '@lodado/local-rules/no-fetch-in-component': 'error',
      '@lodado/local-rules/no-nondeterministic-render': 'error',
      '@lodado/local-rules/no-refetch-in-effect': 'error',
      '@lodado/local-rules/no-response-type-assertion': 'error',
      '@lodado/local-rules/no-swallowed-rejection': 'error',
      '@lodado/local-rules/no-use-client-above-leaf': 'warn',
      '@lodado/local-rules/require-abort-signal-passthrough': 'error',
      '@lodado/local-rules/require-discriminated-state': 'warn',
      '@lodado/local-rules/require-effect-annotation': 'warn',
      '@lodado/local-rules/require-exact-call-count': 'error',
      '@lodado/local-rules/require-skip-reason': 'error',
      '@lodado/local-rules/scenario-test-filename': 'off',
    },
  },
]
