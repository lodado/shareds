const localRulesPlugin = require('@lodado/eslint-plugin-local-rules')

/**
 * Rules that flag a judgement call rather than a certain defect ship as warnings.
 * `recommended: false` means the rule exists but conflicts with repos that have their own
 * convention - it ships off and each project turns it on deliberately.
 */
const severityOf = (rule) => {
  const { recommended } = rule.meta.docs

  if (recommended === false) {
    return 'off'
  }

  return recommended === 'warn' ? 'warn' : 'error'
}

const localRules = Object.entries(localRulesPlugin.rules).reduce((acc, [ruleName, rule]) => {
  acc[`@lodado/local-rules/${ruleName}`] = severityOf(rule)
  return acc
}, {})

/** Every rule shipped by @lodado/eslint-plugin-local-rules, switched on. */
module.exports = [
  {
    name: 'lodado/local-rules',
    plugins: { '@lodado/local-rules': localRulesPlugin },
    rules: localRules,
  },
]
