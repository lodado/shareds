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
  assert.match(skill, /VALID_RED predicates/)
  assert.match(skill, /If a usable existing test exists, reuse it/)
  assert.match(skill, /describe `as`, it `to be` pattern/)
  assert.equal(bundledBva, oracleBva)
})

test('writes type witnesses on the shared boundary axes and treats 30 as a split signal', async () => {
  const [skill, bva] = await Promise.all([
    readFile(join(skillDirectory, 'SKILL.md'), 'utf8'),
    readFile(join(skillDirectory, 'references/bva.md'), 'utf8'),
  ])

  // 축은 bva.md가 소유하고, 스킬은 카드가 닫는 축만 번역한다
  assert.match(bva, /## 5\. Type boundaries/)
  assert.match(bva, /Do not create a witness on an axis it does not close/)
  assert.match(skill, /each bva\.md type boundary axis/)

  // 30은 채우는 목표가 아니라 분리 신호다 — 분리 판단은 정책이므로 oracle로 올린다
  assert.match(bva, /30 is not a target to fill but a design disqualification line/)
  assert.match(skill, /it exceeds 30, do not add more cases; raise the API split/)
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
  assert.match(skill, /Screenshot comparison[\s\S]{0,80}delegated to/i)
  assert.doesNotMatch(skill, /headless.*`\*\.style\.(?:test|spec)/s)
  assert.match(skill, /does not create a visual baseline or issue `BROWSER_VERIFIED`/)
})
