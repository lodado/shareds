/** Accessibility preset (flat): jsx-a11y strict, minus rules TypeScript already guarantees. */
const jsxA11y = require('eslint-plugin-jsx-a11y')

module.exports = [
  // Raw module as the plugin instance - see react.js on flat-config plugin identity.
  { ...jsxA11y.flatConfigs.strict, plugins: { 'jsx-a11y': jsxA11y } },
  {
    name: 'lodado/a11y',
    rules: {
      'jsx-a11y/control-has-associated-label': 'off', // buttons label via children
    },
  },
]
