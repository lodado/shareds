import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const skillDirectory = join(packageDirectory, 'skills/test')
const repositoryDirectory = dirname(dirname(packageDirectory))

test('ships the frontend test contract with its required BVA reference', async () => {
  const [skill, bundledBva, oracleBva] = await Promise.all([
    readFile(join(skillDirectory, 'SKILL.md'), 'utf8'),
    readFile(join(skillDirectory, 'references/bva.md'), 'utf8'),
    readFile(join(repositoryDirectory, 'packages/frontend-oracle-design/skills/references/bva.md'), 'utf8'),
  ])

  assert.match(skill, /name: test/)
  assert.match(skill, /references\/bva\.md/)
  assert.match(skill, /VALID_RED 술어/)
  assert.equal(bundledBva, oracleBva)
})

test('O31: records runs through the oracle ledger and blocks weakened tests', async () => {
  const skill = await readFile(join(skillDirectory, 'SKILL.md'), 'utf8')

  assert.match(skill, /oracle-run\.mjs exec/)
  assert.match(skill, /runId/)
  assert.match(skill, /--report/)
  assert.match(skill, /budget --spend harness/)
  assert.doesNotMatch(skill, /maxDiffPixels/)
  assert.match(skill, /TEST_WEAKENED/)
})

test('keeps behavior tests here and delegates screenshot or direct-browser QA', async () => {
  const skill = await readFile(join(skillDirectory, 'SKILL.md'), 'utf8')

  assert.match(skill, /\$frontend-visual-qa/)
  assert.match(skill, /screenshot.*직접 브라우저.*위임/s)
  assert.doesNotMatch(skill, /headless.*`\*\.style\.(?:test|spec)/s)
  assert.match(skill, /BROWSER_VERIFIED.*발급하지 않는다/s)
})
