/** Self-lint: plain CJS rule sources - recommended JS plus this plugin's own rules. */
const js = require('@eslint/js')
const globals = require('globals')

const plugin = require('./index.js')

module.exports = [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    plugins: { '@lodado/local-rules': plugin },
    rules: { '@lodado/local-rules/no-console-log': 'error' },
  },
]
