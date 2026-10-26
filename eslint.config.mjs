import base from './packages/eslint-config/index.mjs'
import localRules from './packages/eslint-config/local-rules.js'
import quality from './packages/eslint-config/quality.js'
import strictTypes from './packages/eslint-config/strict-types.js'

export default [
  { ignores: ['node_modules/**', 'dist/**', '.turbo/**'] },
  ...base,
  ...quality,
  ...strictTypes,
  ...localRules,
  {
    files: ['packages/app-research/**/*.test.mjs'],
    // This package runs its tests with Node's built-in runner, not Vitest.
    rules: { 'test/no-import-node-test': 'off' },
  },
]
