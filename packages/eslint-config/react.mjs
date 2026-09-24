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
import { forCode } from './code-files.js'

// ESLint React ships ports of the React Compiler rules; react-hooks owns them, so every port is off -
// derived from both plugins, so a new port in a minor release cannot start a second report.
const compilerPorts = Object.keys(eslintReact.rules).filter((rule) => rule in reactHooks.rules)

// react-hooks/set-state-in-effect reports every state update inside an effect, including these shapes.
export const EFFECT_STATE_DUPLICATES = ['no-derived-state', 'no-adjust-state-on-prop-change', 'no-initialize-state', 'no-reset-all-state-on-prop-change']

export default [
  eslintReact.configs['strict-typescript'],
  youMightNotNeedAnEffect.configs.strict,
  {
    name: 'lodado/react',
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'error',
      ...Object.fromEntries(EFFECT_STATE_DUPLICATES.map((rule) => [`react-you-might-not-need-an-effect/${rule}`, 'off'])),
      ...Object.fromEntries(compilerPorts.map((rule) => [`@eslint-react/${rule}`, 'off'])),

      // Certain defects, not judgement calls: a leaked listener, a `javascript:` URL, text leaked into render.
      ...Object.fromEntries(
        ['event-listener', 'fetch', 'intersection-observer', 'interval', 'resize-observer', 'timeout'].map((resource) => [
          `@eslint-react/web-api-no-leaked-${resource}`,
          'error',
        ]),
      ),
      '@eslint-react/dom-no-script-url': 'error',
      '@eslint-react/jsx-no-comment-textnodes': 'error',
      '@eslint-react/jsx-no-leaked-semicolon': 'error',

      '@eslint-react/dom-no-missing-button-type': 'error',
      '@eslint-react/jsx-no-useless-fragment': 'off',
    },
  },
].map(forCode)
