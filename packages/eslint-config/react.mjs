/**
 * React preset (flat): plugin-react recommended plus effect discipline - effects
 * only synchronize external systems, derived state and effect chains fail lint.
 *
 * Plugin references are the raw module objects so every preset (and the next
 * preset's normalized eslint-config-next) shares one instance per plugin name -
 * flat config rejects two different objects under the same plugin key.
 */
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import webApi from 'eslint-plugin-react-web-api'
import youMightNotNeedAnEffect from 'eslint-plugin-react-you-might-not-need-an-effect'

export default [
  { ...react.configs.flat.recommended, plugins: { react } },
  youMightNotNeedAnEffect.configs.strict,
  webApi.configs.recommended,
  {
    name: 'lodado/react',
    plugins: { 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/purity': 'error',
      'react-hooks/immutability': 'error',
      'react-hooks/refs': 'error',
      'react-hooks/static-components': 'error',
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
