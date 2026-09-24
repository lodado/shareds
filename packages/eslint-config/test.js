/* eslint-disable no-console -- test progress output */
/**
 * Smoke test for the presets. Each one is linted the way it is meant to be used -
 * layered on top of the base preset - so a missing plugin, a bad config entry,
 * or a preset that breaks parsing shows up as a failure instead of a silent message.
 */
const assert = require('node:assert')
const path = require('node:path')
const process = require('node:process')
const { ESLint } = require('eslint')

const PRESETS = {
  react: require('./react.mjs').default,
  next: require('./next.js'),
  a11y: require('./a11y.js'),
  turbo: require('./turbo.js'),
  'local-rules': require('./local-rules.js'),
  testing: require('./testing.js'),
  query: require('./query.js'),
  quality: require('./quality.js'),
  fsd: require('./fsd.mjs').default,
  interaction: require('./interaction.js'),
  tailwind: require('./tailwind.js'),
  ai: require('./ai.js'),
  design: require('./design.mjs').default,
}

const SAMPLE = 'export const answer = 42\n'

const lint = async (configs, code = SAMPLE, fileName = 'sample.tsx') => {
  const eslint = new ESLint({
    cwd: __dirname,
    overrideConfigFile: true,
    overrideConfig: configs,
  })

  const [result] = await eslint.lintText(code, { filePath: path.join(__dirname, fileName) })
  return result
}

const assertNoFatal = (result, label) => {
  const fatal = result.messages.filter((message) => message.fatal)
  assert.strictEqual(fatal.length, 0, `${label}: ${fatal.map((message) => message.message).join(', ')}`)
}

const main = async () => {
  const { default: BASE } = await import('./index.mjs')

  assert.ok(
    BASE.some((config) => config.name === 'antfu/javascript/rules'),
    'base preset should be powered by Antfu',
  )

  const base = await lint(BASE)
  assertNoFatal(base, 'base')
  assert.strictEqual(base.messages.length, 0, `base: unexpected messages ${JSON.stringify(base.messages)}`)
  console.log('ok  base preset lints clean')

  for (const [preset, configs] of Object.entries(PRESETS)) {
    const result = await lint([...BASE, ...configs])
    assertNoFatal(result, preset)
    assert.strictEqual(result.messages.length, 0, `${preset}: unexpected messages ${JSON.stringify(result.messages)}`)
    console.log(`ok  base + ${preset}`)
  }

  const combined = await lint([...BASE, ...Object.values(PRESETS).flat()])
  assertNoFatal(combined, 'combined')
  assert.strictEqual(combined.messages.length, 0, `combined: unexpected messages ${JSON.stringify(combined.messages)}`)
  console.log('ok  every preset combined')

  // The base lints Markdown, JSON and YAML too; a preset's JS rules must stay on source files.
  const { default: functional } = await import('./functional.mjs')
  const { hookTiers } = await import('./hook-tiers.mjs')
  const scoped = { ...PRESETS, functional, 'hook-tiers': hookTiers() }
  const baseOnly = new ESLint({ cwd: __dirname, overrideConfigFile: true, overrideConfig: BASE })
  for (const [file, text] of [
    ['README.md', '# Title\n\ntext\n'],
    ['sample.json', '{ "a": 1 }\n'],
    ['sample.yaml', 'a: 1\n'],
  ]) {
    const filePath = path.join(__dirname, file)
    const baseRules = (await baseOnly.calculateConfigForFile(filePath)).rules
    for (const [preset, configs] of Object.entries(scoped)) {
      const eslint = new ESLint({ cwd: __dirname, overrideConfigFile: true, overrideConfig: [...BASE, ...configs] })
      const added = Object.keys((await eslint.calculateConfigForFile(filePath)).rules).filter(
        (rule) => !(rule in baseRules),
      )
      assert.deepStrictEqual(added, [], `${preset} runs JS rules on ${file}`)
      const [result] = await eslint.lintText(text, { filePath })
      assertNoFatal(result, `${preset} on ${file}`)
    }
  }
  console.log('ok  presets stay on source files')

  // local-rules does not list the rules fsd and interaction turn on, so spread order cannot switch them off.
  const ordered = new ESLint({
    cwd: __dirname,
    overrideConfigFile: true,
    overrideConfig: [...BASE, ...PRESETS.fsd, ...PRESETS.interaction, ...PRESETS['local-rules']],
  })
  const orderedRules = (await ordered.calculateConfigForFile(path.join(__dirname, 'sample.tsx'))).rules
  for (const rule of ['fsd-layer-direction', 'fsd-no-deep-import', 'interaction-pattern-contract']) {
    assert.strictEqual(
      orderedRules[`@lodado/local-rules/${rule}`]?.[0],
      2,
      `${rule} is switched off by a later local-rules spread`,
    )
  }
  console.log('ok  local-rules spread order keeps fsd and interaction on')

  // Base owns console diagnostics; the local preset must not add a second report.
  const reported = await lint([...BASE, ...PRESETS['local-rules']], 'console.log("hi")\n', 'sample-console.tsx')
  assert.ok(
    reported.messages.some((message) => message.ruleId === 'no-console'),
    'base: no-console did not report on console.log',
  )
  console.log('ok  base/no-console reports')

  // Judgement calls remain warnings under the explicit preset policy.
  const effect = await lint([...BASE, ...PRESETS['local-rules']], 'useEffect(() => {}, [])\n', 'sample-effect.tsx')
  const annotation = effect.messages.find(
    (message) => message.ruleId === '@lodado/local-rules/require-effect-annotation',
  )
  assert.ok(annotation, 'local-rules: require-effect-annotation did not report on an undocumented effect')
  assert.strictEqual(annotation.severity, 1, 'local-rules: require-effect-annotation should be a warning')
  console.log('ok  local-rules severity follows explicit severity policy')

  // Opt-in rules ship off, so a repo with its own test-file convention is not flooded.
  const optIn = await lint([...BASE, ...PRESETS['local-rules']], 'export const x = 1\n', 'sample-optin.test.tsx')
  assert.ok(
    !optIn.messages.some((message) => message.ruleId === '@lodado/local-rules/scenario-test-filename'),
    'local-rules: scenario-test-filename should be off by default',
  )
  console.log('ok  local-rules opt-in rules stay off')

  // The testing preset routes by file path - unit rules and Playwright rules must land separately.
  const assertReports = async (configs, code, fileName, ruleId) => {
    const result = await lint(configs, code, fileName)
    assert.ok(
      result.messages.some((message) => message.ruleId === ruleId),
      `${ruleId} did not report on ${fileName}: ${JSON.stringify(result.messages)}`,
    )
    console.log(`ok  ${ruleId} reports on ${fileName}`)
  }

  await assertReports(
    [...BASE, ...PRESETS.a11y],
    'export const Banner = () => <img src="/hero.png" />\n',
    'sample-a11y.tsx',
    'jsx-a11y-x/alt-text',
  )
  await assertReports(
    [...BASE, ...PRESETS.next],
    'export const Hero = () => <img src="/hero.png" alt="" />\n',
    'sample-next.tsx',
    '@next/next/no-img-element',
  )

  const TESTING = [...BASE, ...PRESETS.testing]
  await assertReports(TESTING, 'test.only("submits", () => {})\n', 'sample.test.tsx', 'test/no-focused-tests')
  await assertReports(
    TESTING,
    'test("submits", async ({ page }) => { await page.waitForTimeout(1000) })\n',
    'e2e/sample.spec.ts',
    'playwright/no-wait-for-timeout',
  )
  await assertReports(
    TESTING,
    "test('submits', async ({ page }) => { await page.locator('.btn-primary').click() })\n",
    'e2e/sample.spec.ts',
    'playwright/no-raw-locators',
  )
  await assertReports(
    [...BASE, ...PRESETS.query],
    // The rule only inspects query calls inside a component or hook, not module scope.
    'export function Item({ id }) {\n  return useQuery({ queryKey: ["item"], queryFn: () => fetchItem(id) })\n}\n',
    'sample-query.tsx',
    '@tanstack/query/exhaustive-deps',
  )
  // Base no-self-compare owns a self comparison; sonarjs/no-identical-expressions steps aside.
  const selfCompare = await lint(
    [...BASE, ...PRESETS.quality],
    'export const same = (value) => value < value\n',
    'sample-quality.js',
  )
  assert.deepStrictEqual(
    selfCompare.messages.map((message) => message.ruleId),
    ['no-self-compare'],
    `quality: a self comparison should report once: ${JSON.stringify(selfCompare.messages)}`,
  )
  console.log('ok  quality defers self comparison to base')
  await assertReports(
    [...BASE, ...PRESETS.quality],
    "import value from 'ai-hallucinated-package'\nexport { value }\n",
    'sample-quality-dependency.ts',
    'sonarjs/no-implicit-dependencies',
  )
  // Undeclared names belong to base no-undef in JS and to tsc in TS, never to sonarjs as well.
  const undeclared = await lint(
    [...BASE, ...PRESETS.quality],
    'export const answer = undeclaredAnswer\n',
    'sample-quality-reference.js',
  )
  assert.deepStrictEqual(
    undeclared.messages.map((message) => message.ruleId),
    ['no-undef'],
    'quality: an undeclared name should report once, from no-undef',
  )
  const typeNamespace = await lint(
    [...BASE, ...PRESETS.quality],
    'export function View(): React.ReactNode { return null }\n',
    'sample-quality-reference.tsx',
  )
  assert.ok(
    !typeNamespace.messages.some((message) => message.ruleId === 'sonarjs/no-reference-error'),
    `quality: a global type namespace is not a ReferenceError: ${JSON.stringify(typeNamespace.messages)}`,
  )
  console.log('ok  undeclared names report once')

  const incompleteBranch = await lint(
    [...BASE, ...PRESETS.quality],
    'export function classify(value) { if (value === 1) return 1; else if (value === 2) return 2 }\n',
    'sample-quality-branch.ts',
  )
  const missingElse = incompleteBranch.messages.find((message) => message.ruleId === 'sonarjs/elseif-without-else')
  assert.ok(missingElse, 'quality: elseif-without-else did not report on an incomplete branch chain')
  assert.strictEqual(missingElse.severity, 1, 'quality: reviewability rules should remain warnings')
  console.log('ok  quality reviewability rules stay warnings')

  // The react preset's effect discipline - deriving state inside an effect must
  // fire both the compiler rule without a duplicate derived-state report.
  const REACT = [...BASE, ...PRESETS.react]
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

  // The state-modeling rules read TS type nodes through the base preset's parser.
  await assertReports(
    [...BASE, ...PRESETS['local-rules']],
    "type Save = { status: 'idle' | 'saving'; error?: string }\n",
    'sample-state.tsx',
    '@lodado/local-rules/require-discriminated-state',
  )
  await assertReports(
    [...BASE, ...PRESETS['local-rules']],
    'export const payload = (await response.json()) as Payment\n',
    'sample-boundary.tsx',
    '@lodado/local-rules/no-response-type-assertion',
  )
  await assertReports(
    [...BASE, ...PRESETS['local-rules']],
    "export const failed = { status: 'failure', retry: () => undefined }\n",
    'sample-action-state.tsx',
    '@lodado/local-rules/no-action-in-state',
  )
  await assertReports(
    [...BASE, ...PRESETS['local-rules']],
    "export type Table = { status: 'ready'; rows: Row[] } | { status: 'paging'; rows: Row[] }\n",
    'sample-derived-state.tsx',
    '@lodado/local-rules/no-derived-state-member',
  )

  // strict-types needs type information, so it lints a real on-disk fixture file.
  const strictFixture = path.join(__dirname, 'strict-types-fixture')
  const strictEslint = new ESLint({
    cwd: strictFixture,
    overrideConfigFile: true,
    overrideConfig: [
      ...BASE,
      ...require('./strict-types.js'),
      {
        languageOptions: {
          parserOptions: { project: path.join(strictFixture, 'tsconfig.json'), tsconfigRootDir: strictFixture },
        },
      },
    ],
  })
  const [strictResult] = await strictEslint.lintFiles([path.join(strictFixture, 'sample.ts')])
  assert.ok(
    strictResult.messages.some((message) => message.ruleId === 'ts/switch-exhaustiveness-check'),
    `strict-types: switch-exhaustiveness-check did not report: ${JSON.stringify(strictResult.messages)}`,
  )
  console.log('ok  strict-types/switch-exhaustiveness-check reports')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
