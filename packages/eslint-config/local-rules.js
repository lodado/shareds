const { rules } = require('@lodado/eslint-plugin-local-rules')

const localRules = Object.keys(rules).reduce((acc, ruleName) => {
  acc[`@lodado/local-rules/${ruleName}`] = 'error'
  return acc
}, {})

/** Every rule shipped by @lodado/eslint-plugin-local-rules, switched on. */
module.exports = {
  plugins: ['@lodado/local-rules'],
  rules: localRules,
}
