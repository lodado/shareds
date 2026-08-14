/**
 * Testing preset. Unit/component rules apply to `*.test.*` / `*.spec.*`, Playwright rules to e2e
 * specs - the two rule sets contradict each other, so they never share a file.
 */
const E2E_TESTS = ['**/e2e/**/*.{js,ts}', '**/*.e2e.{js,ts}', '**/playwright/**/*.{js,ts}']

module.exports = {
  overrides: [
    {
      files: ['**/*.{test,spec}.{js,jsx,ts,tsx}'],
      excludedFiles: E2E_TESTS,
      extends: ['plugin:vitest/legacy-recommended', 'plugin:testing-library/react'],
      rules: {
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
      files: E2E_TESTS,
      extends: ['plugin:playwright/recommended'],
      rules: {
        // Waiting on the clock instead of a condition is how a suite turns flaky.
        'playwright/no-wait-for-timeout': 'error',
        // `.first()` / `.nth()` hide a locator that resolved to the wrong number of elements.
        'playwright/no-nth-methods': 'error',
        'playwright/prefer-native-locators': 'warn',
        'playwright/no-skipped-test': 'off',
      },
    },
  ],
}
