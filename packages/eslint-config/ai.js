/**
 * AI-output preset (flat) - opt-in. `eslint-plugin-ai-guard` targets the defects coding
 * agents produce that still type-check. Most of its rules restate something another
 * preset already judges, usually with type information this plugin does not have, so
 * only the rules with no owner elsewhere are on: one defect must report once.
 *
 * The plugin is an optional peer - install it in the repos that extend this preset.
 * If a repo skips `quality` or `strict-types`, turn the deferred rules back on; the
 * comment beside each one names the preset that owns it.
 */
const aiGuard = require('eslint-plugin-ai-guard')

module.exports = [
  {
    name: 'lodado/ai',
    plugins: { 'ai-guard': aiGuard.default ?? aiGuard },
    rules: {
      // No owner elsewhere.
      'ai-guard/no-async-array-callback': 'error', // .map(async) yields Promise[], not values
      'ai-guard/no-catch-log-rethrow': 'warn',
      'ai-guard/no-unsafe-deserialize': 'warn',
      'ai-guard/no-async-without-await': 'warn',
      'ai-guard/no-await-in-loop': 'warn',
      'ai-guard/no-broad-exception': 'warn',
      'ai-guard/require-auth-middleware': 'warn',
      'ai-guard/require-authz-check': 'warn',

      // Owned by a rule that decides the same question with more information.
      'ai-guard/no-floating-promise': 'off', // strict-types: ts/no-floating-promises
      'ai-guard/no-redundant-await': 'off', // base: unicorn/no-unnecessary-await
      'ai-guard/no-catch-without-use': 'off', // base: unicorn/prefer-optional-catch-binding
      'ai-guard/no-eval-dynamic': 'off', // base: no-eval, quality: sonarjs/code-eval
      'ai-guard/no-empty-catch': 'off', // quality: sonarjs/no-ignored-exceptions
      'ai-guard/no-hardcoded-secret': 'off', // quality: sonarjs/no-hardcoded-passwords
      'ai-guard/no-sql-string-concat': 'off', // quality: sonarjs/sql-queries
      'ai-guard/no-duplicate-logic-block': 'off', // quality: sonarjs/no-identical-functions
      'ai-guard/no-dead-branch': 'off', // strict-types: ts/no-unnecessary-condition
      'ai-guard/no-console-in-handler': 'off', // local-rules: no-console-log
    },
  },
]
