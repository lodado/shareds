/**
 * React preset (flat): ESLint React strict-typescript, the official React Compiler
 * diagnostics, and effect discipline - effects only synchronize external systems,
 * derived state and effect chains fail lint.
 *
 * eslint-plugin-react-hooks owns the compiler rules (rules-of-hooks, purity,
 * set-state-in-effect ...). ESLint React ships its own ports of the same rules, so
 * those are switched off - one defect reports once, under the `react-hooks/` id.
 */
import eslintReact from '@eslint-react/eslint-plugin'
import reactHooks from 'eslint-plugin-react-hooks'
import youMightNotNeedAnEffect from 'eslint-plugin-react-you-might-not-need-an-effect'

export default [
  eslintReact.configs['strict-typescript'],
  youMightNotNeedAnEffect.configs.strict,
  {
    name: 'lodado/react',
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',

      '@eslint-react/error-boundaries': 'off',
      '@eslint-react/exhaustive-deps': 'off',
      '@eslint-react/purity': 'off',
      '@eslint-react/rules-of-hooks': 'off',
      '@eslint-react/set-state-in-effect': 'off',
      '@eslint-react/set-state-in-render': 'off',
      '@eslint-react/static-components': 'off',
      '@eslint-react/unsupported-syntax': 'off',
      '@eslint-react/use-memo': 'off',

      '@eslint-react/dom-no-missing-button-type': 'off', // buttons default to submit only inside forms; TS props cover the rest
      '@eslint-react/jsx-no-useless-fragment': 'off',
    },
  },
]
