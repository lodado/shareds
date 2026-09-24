const sonarjs = require('eslint-plugin-sonarjs')
const { CODE_FILES } = require('./code-files')

const TEST_FILES = ['**/*.{test,spec,e2e}.?([cm])[jt]s?(x)', '**/{e2e,playwright}/**/*.?([cm])[jt]s?(x)']

/**
 * General code-quality preset (flat): SonarJS recommended plus AI-output reliability checks.
 * Where a SonarJS rule restates a rule another preset already runs, it is off and the owner is
 * named beside it - one defect reports once. A repo that skips `react` or `testing` turns the
 * matching rules back on.
 */
module.exports = [
  { ...sonarjs.configs.recommended, files: CODE_FILES, ignores: ['**/*.md/**', '**/*.mdx/**'] },
  {
    name: 'lodado/sonarjs-ai-reliability',
    files: CODE_FILES,
    ignores: ['**/*.md/**', '**/*.mdx/**'],
    rules: {
      // Base owns these diagnostics; avoid reporting the same defect twice.
      'sonarjs/block-scoped-var': 'off',
      'sonarjs/no-useless-catch': 'off',
      'sonarjs/no-unused-vars': 'off',
      'sonarjs/no-control-regex': 'off',
      'sonarjs/no-delete-var': 'off',
      'sonarjs/no-fallthrough': 'off',
      'sonarjs/no-labels': 'off',
      'sonarjs/no-misleading-character-class': 'off',
      'sonarjs/no-regex-spaces': 'off',
      'sonarjs/no-empty-character-class': 'off',
      'sonarjs/no-empty-group': 'off',
      'sonarjs/no-invalid-regexp': 'off',
      'sonarjs/no-nested-conditional': 'off', // base: no-nested-ternary
      'sonarjs/no-reference-error': 'off', // base: no-undef in JS; tsc owns unresolved names in TS
      'sonarjs/code-eval': 'off', // base: no-eval
      'sonarjs/no-identical-expressions': 'off', // base: no-self-compare
      'sonarjs/no-primitive-wrappers': 'off', // base: no-new-wrappers
      'sonarjs/constructor-for-side-effects': 'off', // base: no-new
      'sonarjs/array-callback-without-return': 'off', // base: array-callback-return
      'sonarjs/prefer-default-last': 'off', // base: default-case-last
      'sonarjs/duplicates-in-character-class': 'off', // base: regexp/no-dupe-characters-character-class
      'sonarjs/slow-regex': 'off', // base: regexp/no-super-linear-backtracking
      'sonarjs/single-char-in-character-classes': 'off', // base: regexp/no-useless-character-class
      'sonarjs/concise-regex': 'off', // base: regexp/prefer-d
      'sonarjs/no-empty-alternatives': 'off', // base: regexp/no-empty-alternative, raised to error below
      'regexp/no-empty-alternative': 'error',
      'sonarjs/no-unused-function-argument': 'off', // base: unused-imports/no-unused-vars
      'sonarjs/no-exclusive-tests': 'off', // base: test/no-only-tests
      'sonarjs/no-duplicate-test-title': 'off', // base: test/no-identical-title
      'sonarjs/no-hook-setter-in-body': 'off', // react: react-hooks/set-state-in-render
      // Deterministic defects and attempts to bypass analysis block delivery.
      'sonarjs/declarations-in-global-scope': 'error',
      'sonarjs/for-in': 'error',
      'sonarjs/no-built-in-override': 'error',
      'sonarjs/no-for-in-iterable': 'error',
      'sonarjs/no-function-declaration-in-block': 'error',
      'sonarjs/no-implicit-dependencies': 'error',
      'sonarjs/no-inconsistent-returns': 'error',
      'sonarjs/no-incorrect-string-concat': 'error',
      'sonarjs/no-sonar-comments': 'error',
      'sonarjs/no-undefined-assignment': 'error',
      'sonarjs/no-variable-usage-before-declaration': 'error',
      'sonarjs/non-number-in-arithmetic-expression': 'error',
      'sonarjs/operation-returning-nan': 'error',
      'sonarjs/unicode-aware-regex': 'error',
      'sonarjs/values-not-convertible-to-numbers': 'error',

      // Reviewability heuristics remain warnings because thresholds are contextual.
      'sonarjs/cognitive-complexity': 'warn',
      'sonarjs/cyclomatic-complexity': 'off', // cognitive-complexity owns function complexity
      'sonarjs/elseif-without-else': 'warn',
      'sonarjs/expression-complexity': 'warn',
      'sonarjs/max-lines': 'off',
      'sonarjs/max-lines-per-function': 'off',
      'sonarjs/max-union-size': 'warn',
      'sonarjs/nested-control-flow': 'warn',
      'sonarjs/no-commented-code': 'warn',
      'sonarjs/no-duplicate-string': 'off',
      'sonarjs/no-nested-incdec': 'warn',
      'sonarjs/no-nested-switch': 'warn',
      'sonarjs/no-return-type-any': 'warn',
      'sonarjs/no-wildcard-import': 'warn',
      'sonarjs/prefer-immediate-return': 'warn',
      'sonarjs/too-many-break-or-continue-in-loop': 'warn',
    },
  },
  {
    name: 'lodado/sonarjs-test-owners',
    files: TEST_FILES,
    // testing: the Vitest, Testing Library and Playwright rules own these test defects.
    rules: {
      'sonarjs/assertions-in-tests': 'off', // testing: test/expect-expect, playwright/expect-expect
      'sonarjs/no-empty-test-title': 'off', // testing: test/valid-title
      'sonarjs/no-debug-commands-in-ui-tests': 'off', // testing: testing-library/no-debugging-utils
      'sonarjs/no-fixed-wait-in-tests': 'off', // testing: playwright/no-wait-for-timeout
      'sonarjs/no-networkidle-wait': 'off', // testing: playwright/no-networkidle
      'sonarjs/no-forced-browser-interaction': 'off', // testing: playwright/no-force-option
    },
  },
]
