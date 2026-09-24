/* eslint-disable no-console -- test progress output */
/**
 * The reference implementations under examples/ must satisfy the contracts they demonstrate:
 * jsx-a11y-x strict plus this plugin's interaction rules report nothing. Run with `node examples.test.js`.
 */
const assert = require('node:assert/strict')
const { readdirSync } = require('node:fs')
const { join } = require('node:path')

const { ESLint } = require('eslint')
const jsxA11y = require('eslint-plugin-jsx-a11y-x').default
const tsParser = require('@typescript-eslint/parser')

const plugin = require('./index.js')

const EXAMPLES = join(__dirname, 'examples')

const main = async () => {
  const eslint = new ESLint({
    cwd: __dirname,
    overrideConfigFile: true,
    overrideConfig: [
      jsxA11y.configs.strict,
      {
        files: ['examples/**/*.tsx'],
        languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
        plugins: { '@lodado/local-rules': plugin },
        rules: {
          '@lodado/local-rules/interaction-pattern-contract': 'error',
          '@lodado/local-rules/interaction-hover-needs-focus': 'error',
        },
      },
    ],
  })
  const results = await eslint.lintFiles(['examples/**/*.tsx'])
  const findings = results.flatMap((result) =>
    result.messages.map(
      (message) =>
        `${result.filePath.replace(EXAMPLES, 'examples')}:${message.line} ${message.ruleId} ${message.message}`,
    ),
  )
  assert.equal(findings.length, 0, `examples must be contract-clean:\n${findings.join('\n')}`)

  // Every pattern contract has at least one example directory, and every example directory has a contract.
  const contractPatterns = Object.keys(plugin.contracts).filter((pattern) => pattern !== 'interactive')
  const exampleDirectories = readdirSync(EXAMPLES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  assert.deepEqual(exampleDirectories.sort(), contractPatterns.sort())
  for (const pattern of contractPatterns)
    assert.equal(plugin.contracts[pattern].example, `examples/${pattern}`, `${pattern}.json example field`)

  console.log(`ok  ${results.length} examples contract-clean across ${contractPatterns.length} patterns`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
