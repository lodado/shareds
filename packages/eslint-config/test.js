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
const OPTIONAL_PRESETS = ['react', 'next', 'a11y', 'turbo', 'local-rules', 'testing', 'query']

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

  // Severity comes from each rule's meta.docs.recommended - judgement calls stay warnings.
  const effect = await lint(
    [BASE, path.join(__dirname, 'local-rules.js')],
    'useEffect(() => {}, [])\n',
    'sample-effect.tsx',
  )
  const annotation = effect.messages.find(
    (message) => message.ruleId === '@lodado/local-rules/require-effect-annotation',
  )
  assert.ok(annotation, 'local-rules: require-effect-annotation did not report on an undocumented effect')
  assert.strictEqual(annotation.severity, 1, 'local-rules: require-effect-annotation should be a warning')
  console.log('ok  local-rules severity follows meta.docs.recommended')

  // Opt-in rules ship off, so a repo with its own test-file convention is not flooded.
  const optIn = await lint(
    [BASE, path.join(__dirname, 'local-rules.js')],
    'export const x = 1\n',
    'sample-optin.test.tsx',
  )
  assert.ok(
    !optIn.messages.some((message) => message.ruleId === '@lodado/local-rules/scenario-test-filename'),
    'local-rules: scenario-test-filename should be off by default',
  )
  console.log('ok  local-rules opt-in rules stay off')

  // The testing preset routes by file path - unit rules and Playwright rules must land separately.
  const assertReports = async (extendsList, code, fileName, ruleId) => {
    const result = await lint(extendsList, code, fileName)
    assert.ok(
      result.messages.some((message) => message.ruleId === ruleId),
      `${ruleId} did not report on ${fileName}: ${JSON.stringify(result.messages)}`,
    )
    console.log(`ok  ${ruleId} reports on ${fileName}`)
  }

  const TESTING = [BASE, path.join(__dirname, 'testing.js')]
  await assertReports(TESTING, 'test.only("submits", () => {})\n', 'sample.test.tsx', 'vitest/no-focused-tests')
  await assertReports(
    TESTING,
    'test("submits", async ({ page }) => { await page.waitForTimeout(1000) })\n',
    'e2e/sample.spec.ts',
    'playwright/no-wait-for-timeout',
  )
  await assertReports(
    [BASE, path.join(__dirname, 'query.js')],
    // The rule only inspects query calls inside a component or hook, not module scope.
    'export function Item({ id }) {\n  return useQuery({ queryKey: ["item"], queryFn: () => fetchItem(id) })\n}\n',
    'sample-query.tsx',
    '@tanstack/query/exhaustive-deps',
  )

  // The react preset's effect discipline - deriving state inside an effect must
  // fire both the compiler rule and the you-might-not-need-an-effect rule.
  const REACT = [BASE, path.join(__dirname, 'react.js')]
  const derivedEffect = [
    "import { useEffect, useState } from 'react'",
    'export const Count = ({ items }) => {',
    '  const [count, setCount] = useState(0)',
    '  useEffect(() => { setCount(items.length) }, [items])',
    '  return count',
    '}',
    '',
  ].join('\n')
  await assertReports(REACT, derivedEffect, 'sample-derived-effect.tsx', 'react-hooks/set-state-in-effect')
  await assertReports(
    REACT,
    derivedEffect,
    'sample-derived-effect.tsx',
    'react-you-might-not-need-an-effect/no-derived-state',
  )

  // The state-modeling rules read TS type nodes through the base preset's parser.
  await assertReports(
    [BASE, path.join(__dirname, 'local-rules.js')],
    "type Save = { status: 'idle' | 'saving'; error?: string }\n",
    'sample-state.tsx',
    '@lodado/local-rules/require-discriminated-state',
  )
  await assertReports(
    [BASE, path.join(__dirname, 'local-rules.js')],
    'export const payload = (await response.json()) as Payment\n',
    'sample-boundary.tsx',
    '@lodado/local-rules/no-response-type-assertion',
  )
  await assertReports(
    [BASE, path.join(__dirname, 'local-rules.js')],
    "export const failed = { status: 'failure', retry: () => undefined }\n",
    'sample-action-state.tsx',
    '@lodado/local-rules/no-action-in-state',
  )

  // strict-types needs type information, so it lints a real on-disk fixture file.
  const strictFixture = path.join(__dirname, 'strict-types-fixture')
  const strictEslint = new ESLint({
    useEslintrc: false,
    cwd: strictFixture,
    baseConfig: {
      extends: [BASE, path.join(__dirname, 'strict-types.js')],
      parserOptions: { project: path.join(strictFixture, 'tsconfig.json'), tsconfigRootDir: strictFixture },
    },
  })
  const [strictResult] = await strictEslint.lintFiles([path.join(strictFixture, 'sample.ts')])
  assert.ok(
    strictResult.messages.some((message) => message.ruleId === '@typescript-eslint/switch-exhaustiveness-check'),
    `strict-types: switch-exhaustiveness-check did not report: ${JSON.stringify(strictResult.messages)}`,
  )
  console.log('ok  strict-types/switch-exhaustiveness-check reports')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
