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
  assert.match(skill, /가능한 기존 테스트가 있다면 재활용한다/)
  assert.match(skill, /describe `as`, it `to be` 패턴/)
  assert.equal(bundledBva, oracleBva)
})

test('writes type witnesses on the shared boundary axes and treats 30 as a split signal', async () => {
  const [skill, bva] = await Promise.all([
    readFile(join(skillDirectory, 'SKILL.md'), 'utf8'),
    readFile(join(skillDirectory, 'references/bva.md'), 'utf8'),
  ])

  // 축은 bva.md가 소유하고, 스킬은 카드가 닫는 축만 번역한다
  assert.match(bva, /## 5\. 타입 경계/)
  assert.match(bva, /닫지 않는 축에는 witness를 만들지 않는다/)
  assert.match(skill, /bva\.md 타입 경계 축마다/)

  // 30은 채우는 목표가 아니라 분리 신호다 — 분리 판단은 정책이므로 oracle로 올린다
  assert.match(bva, /30은 채워야 할 목표가 아니라 표면이 너무 넓다는 설계 실격선이다/)
  assert.match(skill, /30개를 넘으면 케이스를 늘리지 말고 API 분리를\s*\n?\s*NEEDS_DECISION으로 올린다/)
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
