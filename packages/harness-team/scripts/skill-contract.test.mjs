import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryDirectory = dirname(dirname(packageDirectory))
const read = (path) => readFile(join(packageDirectory, path), 'utf8')

test('keeps plugin release metadata versions aligned', async () => {
  const [packageJson, claudePluginJson, codexPluginJson, marketplaceJson] = await Promise.all([
    read('package.json'),
    read('.claude-plugin/plugin.json'),
    read('.codex-plugin/plugin.json'),
    readFile(join(repositoryDirectory, '.claude-plugin/marketplace.json'), 'utf8'),
  ])
  const version = JSON.parse(packageJson).version
  const codexPlugin = JSON.parse(codexPluginJson)
  const entry = JSON.parse(marketplaceJson).plugins.find(({ name }) => name === 'harness-team')

  assert.equal(JSON.parse(claudePluginJson).version, version)
  assert.equal(codexPlugin.version, version)
  assert.equal(codexPlugin.skills, './skills/')
  assert.equal(entry?.version, version)
  assert.equal(entry?.source, './packages/harness-team')
})

test('keeps the five roles, the goal rule, the review cap and the carry-over ledger', async () => {
  const skill = await read('skills/harness-team/SKILL.md')

  assert.match(skill, /^name: harness-team$/m)
  assert.match(skill, /^description: Use at the start of every work task/m)
  assert.match(
    skill,
    /^> ai 5명이 하네스팀으로 작업하고 마지막 검수는 집착이 심한 완벽함을 추구하는 성격이야 팀장은 목표를 묻지 않고\n> 완결후에 다음작업에서 전 작업에서 실수한거 수정하는 성격으로해$/m,
  )
  for (const role of ['Lead', 'Scout', 'Builder', 'Verifier', 'Final Reviewer']) {
    assert.match(skill, new RegExp(`^\\d\\. \\*\\*${role} \\(`, 'm'), role)
  }
  assert.match(skill, /never\s+asks\s+the\s+user\s+what\s+the\s+goal\s+is/)
  assert.match(skill, /obsessive\s+perfectionist/)
  assert.match(skill, /Always\s+its\s+own\s+agent/)
  assert.match(skill, /never\s+the\s+author\s+of\s+the\s+change/)
  assert.match(skill, /Review-only\s+request:\s+nobody\s+edits\s+files/)
  assert.match(skill, /\*\*Carry-over\s+first\.\*\*/)
  assert.match(skill, /two\s+rounds\s+plus\s+one\s+blocker-only\s+confirmation/)
  assert.match(skill, /After\s+round\s+2,\s+fix\s+only\s+blockers/)
  assert.match(skill, /never\s+more\s+than\s+four\s+subagents/)
  assert.match(skill, /Return\s+`PERFECT`\s+only\s+when\s+nothing\s+remains/)
  assert.match(skill, /named\s+`harness-carry-over`/)
})
