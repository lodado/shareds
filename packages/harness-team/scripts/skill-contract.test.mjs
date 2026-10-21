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

test('describes a single review everywhere the plugin is listed', async () => {
  const [claudePluginJson, codexPluginJson, marketplaceJson] = await Promise.all([
    read('.claude-plugin/plugin.json'),
    read('.codex-plugin/plugin.json'),
    readFile(join(repositoryDirectory, '.claude-plugin/marketplace.json'), 'utf8'),
  ])
  const entry = JSON.parse(marketplaceJson).plugins.find(({ name }) => name === 'harness-team')
  const text = JSON.stringify([JSON.parse(claudePluginJson), JSON.parse(codexPluginJson), entry])

  assert.match(JSON.parse(codexPluginJson).interface.longDescription, /reviews it once/)
  assert.doesNotMatch(text, /two rounds|round 2|re-review/i)
})

test('keeps the drill aimed at the agent with the five roles, the goal rule, the review cap and the carry-over', async () => {
  const skill = await read('skills/harness-team/SKILL.md')

  assert.match(skill, /^name: harness-team$/m)
  assert.match(skill, /^description: 기합 \(discipline\) drill for the agent on every work task/m)
  assert.match(skill, /when it is not already loaded through a global import/)
  assert.match(
    skill,
    /^> ai 5명이 하네스팀으로 작업하고 마지막 검수는 집착이 심한 완벽함을 추구하는 성격이야 팀장은 목표를 묻지 않고\n> 완결후에 다음작업에서 전 작업에서 실수한거 수정하는 성격으로해$/m,
  )
  assert.match(skill, /사용자에게\s+쓰는\s+말투는\s+바꾸지\s+않는다/)
  assert.match(skill, /잡담과\s+개념\s+설명에는\s+적용하지\s+않는다/)
  assert.match(skill, /서브에이전트로\s+띄워졌으면\s+이\s+기합에서\s+맡은\s+역할의\s+규칙만\s+따른다/)
  assert.match(skill, /`Carry-over`\s+절은\s+팀장\s+몫이다/)
  for (const role of ['Lead', 'Scout', 'Builder', 'Verifier', 'Final Reviewer']) {
    assert.match(skill, new RegExp(`^\\d\\. \\*\\*[^*]+ \\(${role}\\)\\*\\*`, 'm'), role)
  }
  assert.match(skill, /^## 기합 1\. 목표를 묻지 마라$/m)
  assert.match(skill, /^## 기합 2\. 지난 실수부터 고쳐라$/m)
  assert.match(skill, /집착하는\s+완벽주의자/)
  assert.match(skill, /항상\s+별도\s+에이전트로,\s+독립\s+컨텍스트에서,\s+호스트가\s+띄울\s+수\s+있는\s+최신\s+모델로/)
  assert.match(skill, /변경\s+작성자가\s+아니고/)
  assert.match(skill, /그\s+역할은\s+네가\s+맡는다/)
  assert.match(skill, /보고에\s+독립\s+검수가\s+아니라고\s+적는다/)
  assert.match(skill, /한\s+파일\s+안에서\s+원인과\s+수정이\s+분명한\s+작업/)
  assert.match(skill, /그\s+외\s+전부/)
  assert.match(skill, /리뷰만\s+요청받았으면\s+고치지\s+말고\s+보고만/)
  assert.match(skill, /리뷰만\s+요청받았으면\s+아무도\s+파일을\s+고치지\s+않는다/)
  assert.match(skill, /서브에이전트는\s+작업당\s+최대\s+넷/)
  assert.match(skill, /검수는\s+한\s+번이다/)
  assert.match(skill, /지적은\s+받는\s+즉시\s+전부\s+반영한다/)
  assert.match(skill, /재검수는\s+하지\s+않는다/)
  assert.match(skill, /리뷰만\s+요청받은\s+작업은\s+검수관의\s+지적이\s+결과물이라\s+반영하지\s+않는다/)
  assert.doesNotMatch(skill, /2라운드|라운드는\s+둘|두\s+라운드|두\s+번|재리뷰|round\s*2|two\s+rounds|re-review/i)
  assert.match(skill, /속으로\s+복창한다\.\s+이\s+목록은\s+답변에\s+출력하지\s+않는다/)
  assert.match(skill, /남은\s+게\s+없을\s+때만\s+`PERFECT`/)
  assert.match(skill, /이름\s+`harness-carry-over`로/)
  assert.match(skill, /^## 복창$/m)
})
