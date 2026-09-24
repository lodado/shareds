/** Self-lint: plain CJS rule sources - recommended JS, and console.log only as test progress output. */
const js = require('@eslint/js')
const globals = require('globals')

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-console': ['error', { allow: ['warn', 'error'] }] },
  },
]
