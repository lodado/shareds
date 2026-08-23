import base from './packages/eslint-config/index.mjs'
import localRules from './packages/eslint-config/local-rules.js'

export default [{ ignores: ['node_modules/**', 'dist/**', '.turbo/**'] }, ...base, ...localRules]
