import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'

import a11y from './a11y.js'
import { hookTiers, OWNERS } from './hook-tiers.mjs'
import base from './index.mjs'
import localRules from './local-rules.js'
import react from './react.mjs'
import strict, { verifyStrictProject } from './strict.mjs'

const configDir = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const example = path.join(configDir, 'examples/hook-tiers')
const fixtures = path.join(configDir, 'test-fixtures/hook-tiers')
// ESLint reports real paths and macOS tmpdir is a symlink, so resolve it before building policies.
const temp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lodado-hook-tiers-')))
after(() => fs.rmSync(temp, { recursive: true, force: true }))

const TIER_RULES = ['no-restricted-imports', 'no-restricted-syntax', 'no-restricted-globals']
const UI_BOUNDARY = '@lodado/local-rules/strict-ui-boundary'
const FSD_BOUNDARY = '@lodado/local-rules/fsd-strict-boundaries'
const recipe = [...base, ...react, ...a11y, ...localRules]

const workspace = (name, layers) => {
  const root = path.join(temp, name)
  for (const layer of layers) fs.cpSync(layer, root, { recursive: true })
  return root
}

/** Counts `rules` per file; every file outside `expected` must produce no message at all. */
const verdicts = (root, results, rules, expected) => {
  const actual = {}
  for (const result of results) {
    const file = path.relative(root, result.filePath)
    for (const message of result.messages) {
      const counted = file in expected ? rules.includes(message.ruleId) : true
      if (!counted) continue
      const rule = message.ruleId ?? 'fatal'
      actual[file] = { ...actual[file], [rule]: (actual[file]?.[rule] ?? 0) + 1 }
    }
  }
  return actual
}

test('the shipped example lints clean through the package exports', () => {
  const consumer = workspace('consumer', [example])
  fs.mkdirSync(path.join(consumer, 'node_modules/@lodado'), { recursive: true })
  fs.symlinkSync(configDir, path.join(consumer, 'node_modules/@lodado/eslint-config'), 'junction')
  const eslintBin = path.join(path.dirname(require.resolve('eslint/package.json', { paths: [configDir] })), 'bin/eslint.js')
  const lint = spawnSync(process.execPath, [eslintBin, '--max-warnings', '0', 'src'], { cwd: consumer, encoding: 'utf8', timeout: 120000 })
  assert.equal(lint.status, 0, `${lint.stdout}\n${lint.stderr}`)
})

test('every tier violation reports exactly once while canonical files stay clean', async () => {
  const root = workspace('cases', [path.join(example, 'src'), path.join(fixtures, 'cases/src')])
  const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: [...recipe, ...hookTiers()] })
  const expected = {
    'components/BadPanel.tsx': { 'no-restricted-imports': 4 },
    'components/Dialog/useBadViewHook.ts': { 'no-restricted-imports': 1 },
    'hooks/useBad/index.ts': { 'no-restricted-syntax': 2 },
    'hooks/useBad/useBad.ts': { 'no-restricted-imports': 2, 'no-restricted-syntax': 5 },
    'hooks/useBad/useBadView.tsx': { 'no-restricted-syntax': 1 },
    'hooks/useBad/useLeak/useLeak.ts': { 'no-restricted-imports': 1, 'no-restricted-syntax': 1, 'no-restricted-globals': 1 },
    'hooks/useBad/useLeak/useTooDeep/useTooDeep.ts': { 'no-restricted-syntax': 1 },
    'hooks/useBad/useSibling/useSibling.ts': { 'no-restricted-imports': 1 },
    'hooks/useDouble/useDouble.ts': { 'no-restricted-syntax': 1 },
    'hooks/useMixed/useMixed.ts': { 'no-restricted-syntax': 2 },
    'store/cartStore.ts': { 'no-restricted-imports': 1 },
  }
  const results = await eslint.lintFiles(['.'])
  assert.deepEqual(verdicts(root, results, TIER_RULES, expected), expected)
})

test('with strict, tier placement adds to strict-ui-boundary without reporting a defect twice', async () => {
  const root = workspace('fsd', [path.join(fixtures, 'fsd'), path.join(fixtures, 'fsd-cases')])
  fs.symlinkSync(path.join(configDir, 'node_modules'), path.join(root, 'node_modules'), 'junction')
  const policy = { cwd: root, tsconfig: path.join(root, 'tsconfig.json'), roots: [{ path: 'src' }], rendering: ['src/**/ui/**/*.tsx', 'src/app/**/*.tsx'] }
  const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: [...base, ...strict(policy), ...hookTiers({ strict: true })] })
  const files = await verifyStrictProject(eslint, policy)
  const expected = {
    'src/features/checkout/model/useCheckout/useLoyalty/useLoyalty.ts': { 'no-restricted-imports': 1 },
    'src/features/checkout/model/useFlatCart.ts': { 'no-restricted-imports': 1 },
    'src/features/checkout/ui/BadApi.tsx': { [UI_BOUNDARY]: 1 },
    'src/features/checkout/ui/CouponBadge.tsx': { 'no-restricted-imports': 1 },
  }
  const results = await eslint.lintFiles(files)
  assert.deepEqual(verdicts(root, results, [UI_BOUNDARY, FSD_BOUNDARY, ...TIER_RULES], expected), expected)
})

test('routers stay out of the owner list until a repo adds them', async () => {
  const code = [
    "import { useRouter } from 'next/navigation'",
    '',
    'export function Back(): React.ReactNode {',
    '  const router = useRouter()',
    '  return <button type="button" onClick={() => router.back()}>Back</button>',
    '}',
    '',
  ].join('\n')
  const lint = async (tiers) => {
    const eslint = new ESLint({ cwd: temp, overrideConfigFile: true, overrideConfig: [...base, ...react, ...tiers] })
    const [result] = await eslint.lintText(code, { filePath: path.join(temp, 'src/components/Back.tsx') })
    return result.messages.filter((message) => message.ruleId === 'no-restricted-imports')
  }
  assert.deepEqual(await lint(hookTiers()), [])
  assert.equal((await lint(hookTiers({ owners: [...OWNERS, 'next/navigation'] }))).length, 1)
})

test('a component fetch reports once, through no-fetch-in-component', async () => {
  const eslint = new ESLint({ cwd: temp, overrideConfigFile: true, overrideConfig: [...recipe, ...hookTiers()] })
  const [result] = await eslint.lintText(
    "export function Feed(): React.ReactNode {\n  fetch('/feed').catch(() => undefined)\n  return null\n}\n",
    { filePath: path.join(temp, 'src/components/Feed.tsx') },
  )
  const fetchReports = result.messages.filter((message) => ['@lodado/local-rules/no-fetch-in-component', 'no-restricted-globals'].includes(message.ruleId))
  assert.deepEqual(fetchReports.map((message) => message.ruleId), ['@lodado/local-rules/no-fetch-in-component'])
})

test('tier blocks keep the base syntax restrictions', async () => {
  const eslint = new ESLint({ cwd: temp, overrideConfigFile: true, overrideConfig: [...base, ...react, ...hookTiers()] })
  for (const file of ['src/components/Panel.tsx', 'src/hooks/useCart/useCart.ts', 'src/hooks/useCart/useTotal/useTotal.ts']) {
    const config = await eslint.calculateConfigForFile(path.join(temp, file))
    assert.ok(config.rules['no-restricted-syntax'].includes('TSEnumDeclaration[const=true]'), file)
  }
})
