import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

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

test('drives the browser through Playwright or a connected browser MCP only', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /Playwright 또는 이미 연결된 browser MCP/)
  assert.match(skill, /둘 다 없으면 `NEEDS_DECISION`/)
  assert.match(skill, /driver\(playwright\|mcp:<name>\)/)
  assert.match(skill, /certifiable visual `PASS` producer.*oracle-run --adapter node-test/s)
  assert.match(skill, /locked test가 Playwright를 호출하고 schema-v3 artifact를 발행/)
  assert.match(skill, /standalone Playwright adapter는\s*지원하지 않는다/)
  assert.match(skill, /Browser MCP.*pending.*non-verifying/s)
  assert.match(skill, /Browser MCP는 observation artifact를 수집할 수 있지만/)
})

test('keeps Visual QA plugin release metadata versions aligned', async () => {
  const [packageJson, claudePluginJson, codexPluginJson, marketplaceJson] = await Promise.all([
    readFile(join(packageDirectory, 'package.json'), 'utf8'),
    readFile(join(packageDirectory, '.claude-plugin/plugin.json'), 'utf8'),
    readFile(join(packageDirectory, '.codex-plugin/plugin.json'), 'utf8'),
    readFile(join(repositoryDirectory, '.claude-plugin/marketplace.json'), 'utf8'),
  ])
  const version = JSON.parse(packageJson).version
  const marketplaceVersion = JSON.parse(marketplaceJson).plugins.find(
    ({ name }) => name === 'frontend-visual-qa',
  )?.version

  assert.equal(JSON.parse(claudePluginJson).version, version)
  assert.equal(JSON.parse(codexPluginJson).version, version)
  assert.equal(marketplaceVersion, version)
})

test('exposes its contract checks through the package lint task', async () => {
  const packageJson = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8'))

  assert.equal(typeof packageJson.scripts.lint, 'string')
  assert.notEqual(packageJson.scripts.lint.trim(), '')
  assert.match(packageJson.scripts.lint, /(?:eslint|node --test)/)
})

test('returns append-only artifacts compatible with Oracle evidence', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /\.ai\/oracles\/<oracle-id>\/visual-qa\/<run-id>/)
  assert.match(skill, /기존 run을 덮어쓰지 않는다/)
  assert.match(skill, /evidence\.json/)
  assert.match(skill, /"kind": "visual"/)
  assert.match(skill, /"schemaVersion": 3/)
  assert.match(skill, /oracleSha256/)
  assert.match(skill, /"producerRun"/)
  assert.match(skill, /worktreeSha256/)
  assert.match(skill, /"status": "passed"/)
  assert.match(skill, /"journey"/)
  assert.match(skill, /"tool": "playwright"/)
  assert.match(skill, /"scenario"/)
  assert.match(skill, /"checks"/)
  assert.match(skill, /"artifacts"/)
  assert.match(skill, /"status": "passed"/)
  assert.match(skill, /"path": "not-applicable\.md"/)
  assert.match(skill, /"sha256": "<64-hex-digest>"/)
  assert.match(skill, /"mediaType": "text\/markdown"/)
  assert.match(skill, /"status": "not-applicable"/)
  assert.match(skill, /"reason"/)
  assert.match(skill, /"source": "S1"/)
  assert.match(skill, /VISUAL_VERIFIED/)
  assert.match(skill, /BROWSER_VERIFIED/)
})

test('treats an approved Oracle visual authorization as an explicit request', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /Visual QA authorization: approved/)
  assert.match(skill, /명시적 요청으로 인정/)
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
