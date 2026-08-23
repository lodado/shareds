const sonarjs = require('eslint-plugin-sonarjs')

/** General code-quality preset (flat): SonarJS recommended plus AI-output reliability checks. */
module.exports = [
  sonarjs.configs.recommended,
  {
    name: 'lodado/sonarjs-ai-reliability',
    rules: {
      // Deterministic defects and attempts to bypass analysis block delivery.
      'sonarjs/declarations-in-global-scope': 'error',
      'sonarjs/for-in': 'error',
      'sonarjs/no-built-in-override': 'error',
      'sonarjs/no-for-in-iterable': 'error',
      'sonarjs/no-function-declaration-in-block': 'error',
      'sonarjs/no-implicit-dependencies': 'error',
      'sonarjs/no-inconsistent-returns': 'error',
      'sonarjs/no-incorrect-string-concat': 'error',
      'sonarjs/no-reference-error': 'error',
      'sonarjs/no-sonar-comments': 'error',
      'sonarjs/no-undefined-assignment': 'error',
      'sonarjs/no-variable-usage-before-declaration': 'error',
      'sonarjs/non-number-in-arithmetic-expression': 'error',
      'sonarjs/operation-returning-nan': 'error',
      'sonarjs/unicode-aware-regex': 'error',
      'sonarjs/values-not-convertible-to-numbers': 'error',

      // Reviewability heuristics remain warnings because thresholds are contextual.
      'sonarjs/cyclomatic-complexity': 'warn',
      'sonarjs/elseif-without-else': 'warn',
      'sonarjs/expression-complexity': 'warn',
      'sonarjs/max-lines': 'warn',
      'sonarjs/max-lines-per-function': 'warn',
      'sonarjs/max-union-size': 'warn',
      'sonarjs/nested-control-flow': 'warn',
      'sonarjs/no-commented-code': 'warn',
      'sonarjs/no-duplicate-string': 'warn',
      'sonarjs/no-nested-incdec': 'warn',
      'sonarjs/no-nested-switch': 'warn',
      'sonarjs/no-return-type-any': 'warn',
      'sonarjs/no-unused-function-argument': 'warn',
      'sonarjs/no-wildcard-import': 'warn',
      'sonarjs/prefer-immediate-return': 'warn',
      'sonarjs/too-many-break-or-continue-in-loop': 'warn',
    },
  },
]
