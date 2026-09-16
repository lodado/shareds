import base from './packages/eslint-config/index.mjs'
import localRules from './packages/eslint-config/local-rules.js'

export default [
  { ignores: ['node_modules/**', 'dist/**', '.turbo/**'] },
  ...base,
  ...localRules,
  // Reference widget implementations are app code, not library surface: inferred return types are fine.
  {
    files: ['packages/eslint-plugin-local-rules/examples/**/*.tsx'],
    rules: { 'ts/explicit-function-return-type': 'off' },
  },
]
