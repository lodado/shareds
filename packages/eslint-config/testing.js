/**
 * Testing preset (flat). Unit/component rules apply to `*.test.*` / `*.spec.*`, Playwright
 * rules to e2e specs - the two rule sets contradict each other, so they never share a file.
 */
const vitest = require('@vitest/eslint-plugin')
const playwright = require('eslint-plugin-playwright')
const testingLibrary = require('eslint-plugin-testing-library')

const E2E_TESTS = ['**/e2e/**/*.{js,ts}', '**/*.e2e.{js,ts}', '**/playwright/**/*.{js,ts}']

module.exports = [
  {
    name: 'lodado/testing-unit',
    files: ['**/*.{test,spec}.{js,jsx,ts,tsx}'],
    ignores: E2E_TESTS,
    plugins: {
      vitest,
      'testing-library': testingLibrary,
    },
    rules: {
      ...vitest.configs.recommended.rules,
      ...testingLibrary.configs['flat/react'].rules,

      'vitest/no-focused-tests': 'error',
      'vitest/no-conditional-in-test': 'warn',
      // A skip is fine when it is explained - @lodado/local-rules/require-skip-reason owns that call.
      'vitest/no-disabled-tests': 'off',

      // Assert what the user can observe, not the tree the component happens to render.
      'testing-library/no-container': 'error',
      'testing-library/no-node-access': 'error',
      'testing-library/prefer-screen-queries': 'error',
    },
  },
  {
    name: 'lodado/testing-e2e',
    files: E2E_TESTS,
    plugins: { playwright },
    rules: {
      ...playwright.configs['flat/recommended'].rules,

      // Waiting on the clock instead of a condition is how a suite turns flaky.
      'playwright/no-wait-for-timeout': 'error',
      // `.first()` / `.nth()` hide a locator that resolved to the wrong number of elements.
      'playwright/no-nth-methods': 'error',
      'playwright/prefer-native-locators': 'warn',
      'playwright/no-skipped-test': 'off',
    },
  },
]
