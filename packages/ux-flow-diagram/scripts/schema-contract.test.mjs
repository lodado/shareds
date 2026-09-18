import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package uses Node's built-in test runner.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { analyzeFlow } from '../skills/ux-flow-diagram/scripts/analyze.mjs'
import { normalizeInput, validateInput } from '../skills/ux-flow-diagram/scripts/input.mjs'
import { normalizeFigma, validateFlow } from '../skills/ux-flow-diagram/scripts/normalize.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const loadJson = async (relative) => JSON.parse(await readFile(join(root, relative), 'utf8'))
const cliRequire = createRequire(import.meta.resolve('@commitlint/cli'))
const loadRequire = createRequire(cliRequire.resolve('@commitlint/load'))
const validatorRequire = createRequire(loadRequire.resolve('@commitlint/config-validator'))
const Ajv = validatorRequire('ajv/dist/2020.js')
const ajv = new Ajv({ strict: false, allErrors: true })
ajv.addFormat('uri', (value) => URL.canParse(value))
const flowSchema = await loadJson('skills/ux-flow-diagram/references/schemas/flow.schema.json')
const inputSchema = await loadJson('skills/ux-flow-diagram/references/schemas/input.schema.json')
const validateFlowSchema = ajv.compile(flowSchema)
const validateInputSchema = ajv.compile(inputSchema)
const fixture = await loadJson('skills/ux-flow-diagram/evals/codebase-flow.json')
const figmaFixtures = JSON.parse(await readFile(join(root, 'skills/ux-flow-diagram/evals/fixtures.json'), 'utf8'))

test('codebase fixture is valid source-independent Flow IR', () => {
  assert.ok(validateFlowSchema(fixture), JSON.stringify(validateFlowSchema.errors))
  assert.equal(validateFlow(fixture), true)
  assert.equal(validateFlowSchema(analyzeFlow(fixture)), true)
})

test('all authored Figma fixtures normalize, analyze, and satisfy the schema', () => {
  for (const { name, snapshot } of figmaFixtures) {
    const result = analyzeFlow(normalizeFigma(snapshot))
    assert.ok(validateFlowSchema(result), `${name}: ${JSON.stringify(validateFlowSchema.errors)}`)
  }
})

test('schema rejects missing evidence, invalid actions, views, and sources', () => {
  for (const mutate of [
    (value) => { delete value.nodes[0].evidenceRefs },
    (value) => { value.interactions[0].actions[0].type = 'bogus' },
    (value) => { value.view = 'verified' },
    (value) => { value.source.type = 'unknown' },
  ]) {
    const invalid = structuredClone(fixture)
    mutate(invalid)
    assert.equal(validateFlowSchema(invalid), false)
  }
})

test('input schema supports non-Figma sources and the real input helper rejects impersonating Figma URLs', () => {
  assert.ok(validateInputSchema({ source: 'codebase', analysis: { mode: 'auto' } }))
  assert.ok(validateInputSchema({ source: 'requirements', outputs: { mermaid: true } }))
  assert.ok(validateInputSchema({ figma: { url: 'https://www.figma.com/design/file/page' } }))
  assert.equal(validateInputSchema({ figma: { url: 'https://www.figma.com.evil.test/design/file/page' } }), false)
  assert.equal(validateInput({ figma: { url: 'https://www.figma.com/design/file/page' } }).options.screenshots, 'auto')
  assert.throws(() => validateInput({ figma: { url: 'https://www.figma.com.evil.test/design/file/page' } }))
  assert.equal(validateInput({ source: 'codebase' }).outputs.figjam, false)
  const original = { source: 'requirements' }
  normalizeInput(original)
  assert.deepEqual(original, { source: 'requirements' })
})
