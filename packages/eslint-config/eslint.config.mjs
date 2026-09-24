import base from './index.mjs'
import localRules from './local-rules.js'
import quality from './quality.js'

/** Self-lint: package dogfoods its base, quality and local rules. */
export default [
  { ignores: ['strict-types-fixture/**'] },
  ...base,
  ...quality,
  ...localRules,
  {
    files: ['strict.test.mjs', 'strict-distribution.test.mjs', 'strict-example.test.mjs', 'hook-tiers.test.mjs', 'skill-doc.test.mjs', 'defect-corpus.test.mjs', 'lint-variance.test.mjs'],
    // Integration harnesses use the Node runner, not Vitest.
    rules: { 'test/no-import-node-test': 'off' },
  },
  {
    files: ['feedback.test.mjs', 'strict.test.mjs'],
    // SonarJS cannot follow the parameterized reports() helper to its assert.ok call.
    rules: { 'sonarjs/assertions-in-tests': 'off' },
  },
]
