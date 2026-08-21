/**
 * React preset (flat): plugin-react recommended plus effect discipline - effects
 * only synchronize external systems, derived state and effect chains fail lint.
 *
 * Plugin references are the raw module objects so every preset (and the next
 * preset's normalized eslint-config-next) shares one instance per plugin name -
 * flat config rejects two different objects under the same plugin key.
 */
const react = require('eslint-plugin-react')
const reactHooks = require('eslint-plugin-react-hooks')
const youMightNotNeedAnEffect = require('eslint-plugin-react-you-might-not-need-an-effect')

module.exports = [
  { ...react.configs.flat.recommended, plugins: { react } },
  youMightNotNeedAnEffect.configs.strict,
  {
    name: 'lodado/react',
    plugins: { 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/set-state-in-render': 'error',

      'react/prop-types': 'off', // TypeScript covers this
      'react/require-default-props': 'off',
      'react/button-has-type': 'off',
      'react/jsx-no-useless-fragment': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/jsx-props-no-spreading': 'warn',
      'react/jsx-filename-extension': ['error', { extensions: ['.js', '.jsx', '.ts', '.tsx'] }],
      'react/function-component-definition': [
        'error',
        {
          namedComponents: 'arrow-function',
          unnamedComponents: 'arrow-function',
        },
      ],
    },
  },
]
