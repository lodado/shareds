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

test('reference handoff does not grant QA or baseline authority', async () => {
  const skill = await read('SKILL.md')
  assert.match(skill, /## 레퍼런스 재현 인계/)
  assert.match(skill, /증거 패킷은 QA 실행 승인이나 baseline 승인이 아니다/)
  assert.match(skill, /중간 진행/)
  assert.match(skill, /역방향/)
  assert.match(skill, /unsupported/)
})

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

test('stresses content length without inventing a truncation policy', async () => {
  const skill = await read('SKILL.md')
  const environment = skill.match(/## 3\. 공통 환경 고정\n[\s\S]*?(?=\n## )/)?.[0]
  assert.ok(environment, 'missing ## 3. 공통 환경 고정')

  for (const condition of ['긴 문자열', '큰 숫자', '번역 길이', '좁은 컨테이너', 'RTL']) {
    assert.match(environment, new RegExp(`^- ${condition}: \\S`, 'm'), condition)
  }
  assert.match(environment, /RTL: 앱이 RTL을 지원할 때만/)
  assert.match(environment, /잘림·말줄임·줄바꿈 중 무엇이 맞는지는\s+정책이다/)
  assert.match(environment, /나머지는\s+`QUESTION`\s+후보로 남긴다/)
  // Stress rows widen scope only when the request or approval names them.
  assert.match(environment, /승인된 SPEC에 들어 있는 조건만 실행하고,\s+빠진 조건은 `남은 것`에 미검증으로 적는다/)
  assert.match(environment, /맞는 fixture가 없으면 값을 지어내지 않고 미검증으로 남긴다/)
})

test('ranks findings P0–P3 without letting severity change the verdict', async () => {
  const skill = await read('SKILL.md')
  const severity = skill.match(/### 심각도\n[\s\S]*?(?=\n## )/)?.[0]
  assert.ok(severity, 'missing ### 심각도 under ## 7')
  const position = skill.indexOf('### 심각도')
  assert.ok(skill.indexOf('## 7. 판정과 라우팅') < position && position < skill.indexOf('## 8. Artifact'), 'severity sits under ## 7')

  for (const level of ['P0', 'P1', 'P2', 'P3']) assert.match(severity, new RegExp(`^- \\*\\*${level}\\*\\* — \\S`, 'm'))
  assert.match(severity, /`UNSOURCED_OPINION`은 P3를 넘지 않는다/)
  assert.match(severity, /심각도는 판정과 라우팅을 바꾸지 않는다/)
  assert.match(skill, /^발견: P0~P3 · 위치 · 검증 상태 · 기준 출처 · 사용자 영향/m)
  assert.match(skill, /expected\/actual·심각도\(§7\)/)
})

test('allows agent-browser observations without changing trusted PASS producers', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /Playwright, agent-browser 또는 이미 연결된 browser MCP/)
  assert.match(skill, /모두 없으면 `QUESTION`/)
  assert.match(skill, /driver\(playwright\|agent-browser\|mcp:<name>\)/)
  assert.match(skill, /certifiable visual `PASS` producer는 `fod\.mjs run green <id>`가 기록한 통과 run뿐이다/)
  assert.match(skill, /`command`\)이 그 Playwright test를 실행하는 명령이어야 한다/)
  assert.match(skill, /기록 없이 따로\s+돌린 Playwright 실행은 관찰이다/)
  assert.match(skill, /agent-browser와 Browser MCP.*pending.*non-verifying/s)
  assert.match(skill, /agent-browser.*Playwright test 실행 기록으로 바꾸지 않는다/s)
  assert.match(skill, /snapshot -i/)
  assert.match(skill, /ref.*다시.*snapshot/s)
})

test('reuses bounded exploration for dogfood with reproducible, non-verifying findings', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /## 6\. 탐색 phase — bounded exploration \(dogfood\)/)
  assert.match(skill, /사용자가 탐색을 명시적으로 요청했을 때만/)
  assert.match(skill, /상호작용 30회 또는 10분/)
  assert.match(skill, /핵심 journey 1~3개/)
  assert.match(skill, /재현 단계.*expected\/actual.*스크린샷/s)
  assert.match(skill, /`UNSOURCED_OPINION`/)
  assert.match(skill, /`VERIFIED` 판정에 영향을 주지 않는다/)
  assert.match(skill, /토큰.*개인정보.*마스킹/s)
  assert.match(skill, /dogfood.*자동 설치하지 않는다/s)
  assert.match(skill, /production\/live.*submit·삭제·결제.*부작용을 만들지 않는다/s)
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

test('returns append-only artifacts bound to the approved spec and the recorded green run', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /\.ai\/oracles\/<id>\/visual-qa\/<run-id>/)
  assert.match(skill, /\.ai\/visual-qa\/<run-id>\//)
  assert.match(skill, /기존 run을 덮어쓰지 않는다/)
  assert.match(skill, /evidence\.json/)
  assert.match(skill, /"schemaVersion": 4/)
  assert.match(skill, /"specSha256"/)
  assert.match(skill, /"producerRun"/)
  assert.match(skill, /"phase": "green"/)
  assert.match(skill, /"command": "<run\.jsonl의 command>"/)
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

test('runs only on an explicit user request and speaks the six-step vocabulary', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /다른 스킬이 필요성을 추측해 자동 실행하지 않는다/)
  assert.doesNotMatch(skill, /authorization: approved/)
  assert.doesNotMatch(skill, /\b(?:Oracle Card|ORACLE_READY|VALID_RED|NEEDS_DECISION|POLICY_GAP|NON_ORACLE_OPINION|oracle-run|IMPLEMENTED_GREEN|REVIEW_VERIFIED)\b/)
})

test('is referenced as a separate responsibility by Oracle and behavior test skills', async () => {
  const [oracleSkill, testSkill] = await Promise.all([
    readFile(join(repositoryDirectory, 'packages/frontend-oracle-design/skills/frontend-oracle-design/SKILL.md'), 'utf8'),
    readFile(join(repositoryDirectory, 'packages/test/skills/test/SKILL.md'), 'utf8'),
  ])

  assert.match(oracleSkill, /\$frontend-visual-qa/)
  assert.match(testSkill, /\$frontend-visual-qa/)
  assert.doesNotMatch(oracleSkill, /BROWSER_VERIFIED/)
  assert.doesNotMatch(testSkill, /headless.*`\*\.style\.(?:test|spec)/s)
})

test('serves as the standing QA step of an implementation loop without minting VERIFIED', async () => {
  const skill = await read('SKILL.md')
  const loop = skill.match(/## 구현 루프 QA\n[\s\S]*?(?=\n## )/)?.[0]
  assert.ok(loop, 'missing ## 구현 루프 QA')

  // A standing host rule is the request; it never widens into exploration.
  assert.match(skill, /or\s+when\s+a\s+standing\s+host\s+rule\s+makes\s+browser\s+QA\s+a\s+step/)
  assert.match(skill, /상시\s+단계로\s+정했으면\s+그\s+규칙이\s+사용자의\s+명시적\s+요청이다/)
  assert.match(skill, /상시\s+단계는\s+탐색\s+phase\s+요청이\s+아니다/)
  // The plan and the passing tests stand in for a spec on this path only.
  assert.match(skill, /구현\s+루프\s+QA에서만\s+그\s+작업의\s+기획과\s+통과한\s+테스트를/)
  assert.match(loop, /완료\s+기준과\s+통과한\s+테스트를\s+쓴다/)
  assert.match(loop, /기획과\s+테스트가\s+모두\s+없으면\s+승인\s+source가\s+없는\s+것이다/)
  assert.match(loop, /기획과\s+테스트가\s+서로\s+어긋나면\s+`QUESTION`이다/)
  assert.match(loop, /agent-browser가\s+설치돼\s+있으면\s+그것을\s+먼저\s+쓴다/)
  // What the change leaves outside the screen is checked on the output itself.
  assert.match(loop, /화면이\s+아니라\s+그\s+결과물을\s+확인한다/)
  // The loop verdict is separate from the trusted VERIFIED producers.
  assert.match(loop, /P0·P1\s+발견,\s+uncaught\s+exception,\s+console\s+error,/)
  assert.match(loop, /실패한\s+network\s+응답이\s+없으면\s+`LOOP_PASS`다/)
  assert.match(loop, /`LOOP_FAIL`이고/)
  assert.match(loop, /`LOOP_PASS`는\s+`VERIFIED`가\s+아니다/)
  assert.match(loop, /`evidence\.json`은\s+만들지\s+않는다/)
  assert.match(loop, /탐색\s+phase는\s+이\s+경로에\s+없다/)
  assert.match(skill, /^루프: LOOP_PASS \| LOOP_FAIL \| LOOP_BLOCKED \| N\/A$/m)
  assert.match(skill, /`LOOP_PASS`를\s+`VERIFIED`나\s+baseline\s+승인으로\s+보고/)
})

test('keeps the loop verdict honest: evidence per item, blocked runs apart, old errors proven', async () => {
  const skill = await read('SKILL.md')
  const loop = skill.match(/## 구현 루프 QA\n[\s\S]*?(?=\n## )/)?.[0]
  assert.ok(loop, 'missing ## 구현 루프 QA')

  // A pass needs an artifact per item, and a run with nothing to observe is not a pass.
  assert.match(loop, /artifact가\s+없는\s+PASS\s+항목은\s+`EVIDENCE_GAP`이고\s+`LOOP_PASS`가\s+아니다/)
  assert.match(loop, /그래도\s+없으면\s+`LOOP_BLOCKED`다/)
  assert.match(loop, /N\/A가\s+아닌\s+항목이\s+전부\s+기대\s+결과와\s+일치하고/)
  assert.match(loop, /항목이\s+전부\s+N\/A면\s+`루프:\s+N\/A`다/)
  // Only a product mismatch goes back to the tests; a blocked run does not.
  assert.match(loop, /driver\s+없음은\s+`LOOP_BLOCKED`다/)
  assert.match(loop, /`LOOP_BLOCKED`는\s+테스트\s+단계로\s+돌려보내지\s+않는다/)
  assert.match(loop, /둘\s+다\s+해당하면\s+`LOOP_FAIL`을\s+적고/)
  assert.match(loop, /변경\s+전\s+commit에서\s+같은\s+오류를\s+재현했을\s+때만/)
  // The path names its own exceptions to the invariants instead of contradicting them.
  assert.match(loop, /이\s+절이\s+정한\s+것\s+외에는/)
  assert.match(skill, /구현\s+루프\s+QA만\s+그\s+절의\s+driver\s+순서를\s+따른다/)
  assert.match(skill, /구현\s+루프\s+QA면\s+기획의\s+완료\s+기준/)
  assert.match(loop, /기획이\s+정하지\s+않은\s+화면\s+결과는/)
})
