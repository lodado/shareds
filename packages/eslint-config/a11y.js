/**
 * Accessibility preset (flat): jsx-a11y-x strict. The es-tooling fork ships the same
 * rules as eslint-plugin-jsx-a11y under the `jsx-a11y-x/` id and supports ESLint 10.
 */
const jsxA11y = require('eslint-plugin-jsx-a11y-x').default
const { CODE_FILES, forCode } = require('./code-files')

module.exports = [
  forCode(jsxA11y.configs.strict),
  {
    name: 'lodado/a11y',
    files: CODE_FILES,
    // Installed with the plugin but outside its strict config; each is a defect agents produce.
    rules: {
      'jsx-a11y-x/prefer-tag-over-role': 'error', // <div role="button"> instead of <button>
      'jsx-a11y-x/no-aria-hidden-on-focusable': 'error',
      'jsx-a11y-x/lang': 'error',
      'jsx-a11y-x/control-has-associated-label': [
        'warn',
        { ignoreElements: ['input', 'textarea', 'select', 'tr', 'th', 'td'] },
      ],
      'jsx-a11y-x/anchor-ambiguous-text': 'warn', // "click here"
    },
  },
]
