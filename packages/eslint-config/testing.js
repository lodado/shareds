/**
 * Testing preset (flat). Unit/component rules apply to `*.test.*` / `*.spec.*`, Playwright
 * rules to e2e specs - the two rule sets contradict each other, so they never share a file.
 *
 * The base registers @vitest/eslint-plugin as `test/`; this preset turns its rules on under that
 * same id rather than registering the plugin a second time, so one defect reports once. Spread it
 * after the base.
 */
const vitest = require('@vitest/eslint-plugin')
const playwright = require('eslint-plugin-playwright')
const testingLibrary = require('eslint-plugin-testing-library')

const E2E_TESTS = [
  '**/e2e/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
  '**/*.e2e.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
  '**/playwright/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
]

const asTest = (rules) =>
  Object.fromEntries(Object.entries(rules).map(([id, value]) => [id.replace(/^vitest\//u, 'test/'), value]))
const EXACT = 'Assert the exact value; this matcher passes for almost anything.'

module.exports = [
  {
    name: 'lodado/testing-unit',
    files: ['**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
    ignores: E2E_TESTS,
    plugins: { 'testing-library': testingLibrary },
    rules: {
      ...asTest(vitest.configs.recommended.rules),
      ...testingLibrary.configs['flat/react'].rules,

      'test/no-focused-tests': 'error',
      'test/no-only-tests': 'off', // test/no-focused-tests also catches `{ only: true }`
      // An early return skips the rest of a test as surely as `.skip`.
      'test/no-conditional-in-test': 'error',
      // A skip is fine when it is explained - @lodado/local-rules/require-skip-reason owns that call.
      'test/no-disabled-tests': 'off',

      // Weak matchers and self-rewriting snapshots let any output count as correct.
      'test/no-restricted-matchers': [
        'error',
        { toBeTruthy: EXACT, toBeFalsy: EXACT, toBeDefined: EXACT, 'not.toBeUndefined': EXACT, 'not.toBeNull': EXACT },
      ],
      'test/require-to-throw-message': 'error',
      'test/prefer-snapshot-hint': ['error', 'always'],
      'test/no-large-snapshots': ['error', { maxSize: 50, inlineMaxSize: 10 }],
      'test/no-restricted-vi-methods': [
        'error',
        { setConfig: 'Raising testTimeout hides a race; fix the wait instead.' },
      ],
      // Playwright specs belong to the e2e route, where the Playwright rules apply.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@playwright/*'],
              message: 'Playwright specs live under e2e/, playwright/ or *.e2e.* so the Playwright rules apply.',
            },
          ],
        },
      ],

      // Assert what the user can observe, not the tree the component happens to render.
      'testing-library/no-container': 'error',
      'testing-library/no-node-access': 'error',
      'testing-library/prefer-screen-queries': 'error',
      'testing-library/no-debugging-utils': 'error',
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
      // Markup-coupled selectors break when the markup is regenerated; a justified one carries a
      // described eslint-disable, which base already requires.
      'playwright/no-raw-locators': 'error',
      'playwright/prefer-locator': 'error',
      'playwright/prefer-native-locators': 'off', // playwright/no-raw-locators reports the same selectors
      'playwright/no-skipped-test': 'off',
      'playwright/no-focused-test': 'error',
      'playwright/expect-expect': 'error',
      'test/no-only-tests': 'off', // playwright/no-focused-test owns `.only` in e2e specs
      'playwright/no-force-option': 'error',
      // A longer action timeout or a slowed test hides a race instead of fixing it.
      'playwright/no-action-timeout': 'error',
      'playwright/no-slowed-test': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: ['vitest'],
          patterns: [
            {
              group: ['@testing-library/*'],
              message: 'Unit and component tests live in *.test.* / *.spec.* outside e2e/.',
            },
          ],
        },
      ],
    },
  },
]
