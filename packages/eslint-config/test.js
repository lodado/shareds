/* eslint-disable @lodado/local-rules/no-console-log -- test progress output */
/**
 * Smoke test for the presets. Each one is linted the way it is meant to be used -
 * layered on top of the base preset - so a missing plugin, a bad `extends` entry,
 * or a preset that breaks parsing shows up as a failure instead of a silent message.
 */
const assert = require('assert')
const path = require('path')
const { ESLint } = require('eslint')

const BASE = path.join(__dirname, 'index.js')
const OPTIONAL_PRESETS = ['react', 'next', 'a11y', 'turbo', 'local-rules']

const SAMPLE = 'export const answer = 42\n'

const lint = async (extendsList, code = SAMPLE, fileName = 'sample.tsx') => {
  const eslint = new ESLint({
    useEslintrc: false,
    cwd: __dirname,
    baseConfig: { extends: extendsList },
  })

  const [result] = await eslint.lintText(code, { filePath: path.join(__dirname, fileName) })
  return result
}

const assertNoFatal = (result, label) => {
  const fatal = result.messages.filter((message) => message.fatal)
  assert.strictEqual(fatal.length, 0, `${label}: ${fatal.map((message) => message.message).join(', ')}`)
}

const main = async () => {
  const base = await lint([BASE])
  assertNoFatal(base, 'base')
  assert.strictEqual(base.messages.length, 0, `base: unexpected messages ${JSON.stringify(base.messages)}`)
  console.log('ok  base preset lints clean')

  for (const preset of OPTIONAL_PRESETS) {
    // eslint-disable-next-line no-await-in-loop
    const result = await lint([BASE, path.join(__dirname, `${preset}.js`)])
    assertNoFatal(result, preset)
    assert.strictEqual(result.messages.length, 0, `${preset}: unexpected messages ${JSON.stringify(result.messages)}`)
    console.log(`ok  base + ${preset}`)
  }

  const combined = await lint([BASE, ...OPTIONAL_PRESETS.map((preset) => path.join(__dirname, `${preset}.js`))])
  assertNoFatal(combined, 'combined')
  assert.strictEqual(combined.messages.length, 0, `combined: unexpected messages ${JSON.stringify(combined.messages)}`)
  console.log('ok  every preset combined')

  // no-console-log is the one rule we ship ourselves - assert it actually fires.
  const reported = await lint(
    [BASE, path.join(__dirname, 'local-rules.js')],
    'console.log("hi")\n',
    'sample-console.tsx',
  )
  assert.ok(
    reported.messages.some((message) => message.ruleId === '@lodado/local-rules/no-console-log'),
    'local-rules: no-console-log did not report on console.log',
  )
  console.log('ok  local-rules/no-console-log reports')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
