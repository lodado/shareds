import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package uses Node's built-in test runner
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (file) => readFile(join(root, file), 'utf8')

test('plugin metadata is explicit-only and points at the shared skill directory', async () => {
  const codex = JSON.parse(await read('.codex-plugin/plugin.json'))
  const claude = JSON.parse(await read('.claude-plugin/plugin.json'))
  assert.equal(codex.name, 'ux-flow-diagram')
  assert.equal(codex.skills, './skills/')
  assert.equal(claude.name, codex.name)
  assert.equal(claude.version, codex.version)
})

test('skill contract documents explicit invocation and read-only boundaries', async () => {
  const skill = await read('skills/ux-flow-diagram/SKILL.md')
  assert.match(skill, /\$ux-flow-diagram/)
  assert.match(skill, /read-only/i)
  assert.match(skill, /Prototype reactions/i)
  assert.match(skill, /static code tracing is not runtime verification/i)
  assert.match(skill, /disable-model-invocation: true/)
})

test('behavior cases cover source modes and mutation guard', async () => {
  const cases = JSON.parse(await read('skills/ux-flow-diagram/evals/behavior-cases.json'))
  assert.ok(cases.cases.length >= 5)
  for (const item of cases.cases) {
    assert.ok(item.id && item.prompt)
    assert.ok(Array.isArray(item.expected_invariants))
    assert.ok(Array.isArray(item.forbidden))
  }
  const text = JSON.stringify(cases)
  assert.match(text, /figma-reactions-before-inference/)
  assert.match(text, /proposed-flow-separation/)
  assert.match(text, /Modify reactions/)
})
