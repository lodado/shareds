import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryDirectory = dirname(dirname(packageDirectory))
const skillDirectory = join(packageDirectory, 'skills/frontend-visual-qa')

async function read(path) {
  return readFile(join(skillDirectory, path), 'utf8')
}

test('owns explicit screenshot and direct-browser QA without product authority', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /name: frontend-visual-qa/)
  assert.match(skill, /user explicitly requests frontend screenshot comparison/)
  assert.match(skill, /Screenshot/)
  assert.match(skill, /Direct browser/)
  assert.match(skill, /product source.*수정하지 않는다/s)
  assert.match(skill, /사용자가.*명시적으로 요청.*실행/s)
  assert.doesNotMatch(skill, /TODO/)
})

test('requires approved baselines and reproducible browser evidence', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /baseline.*명시적 승인/s)
  assert.match(skill, /자동 update하지 않는다/)
  assert.match(skill, /320px/)
  assert.match(skill, /light\/dark/)
  assert.match(skill, /reduced-motion/)
  assert.match(skill, /focus 이동/)
  assert.match(skill, /network 요청 횟수/)
  assert.match(skill, /console error/)
  assert.match(skill, /임의 sleep을 사용하지 않는다/)
})

test('returns append-only artifacts compatible with Oracle evidence', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /\.ai\/oracles\/<oracle-id>\/visual-qa\/<run-id>/)
  assert.match(skill, /기존 run을 덮어쓰지 않는다/)
  assert.match(skill, /"kind": "reviewer"/)
  assert.match(skill, /"role": "frontend-visual-qa"/)
  assert.match(skill, /VISUAL_VERIFIED/)
  assert.match(skill, /BROWSER_VERIFIED/)
})

test('is referenced as a separate responsibility by Oracle and behavior test skills', async () => {
  const [oracleSkill, testSkill] = await Promise.all([
    readFile(join(repositoryDirectory, 'packages/frontend-oracle-design/skills/SKILL.md'), 'utf8'),
    readFile(join(repositoryDirectory, 'packages/test/skills/test/SKILL.md'), 'utf8'),
  ])

  assert.match(oracleSkill, /\$frontend-visual-qa/)
  assert.match(testSkill, /\$frontend-visual-qa/)
  assert.doesNotMatch(oracleSkill, /BROWSER_VERIFIED/)
  assert.doesNotMatch(testSkill, /headless.*`\*\.style\.(?:test|spec)/s)
})
