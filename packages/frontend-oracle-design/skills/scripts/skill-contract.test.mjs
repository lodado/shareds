import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const skillDirectory = dirname(dirname(fileURLToPath(import.meta.url)))

async function read(relativePath) {
  return readFile(join(skillDirectory, relativePath), 'utf8')
}

test('O26: backs reported verification with a run ledger, machine transitions and counted budgets', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /scripts\/oracle-run\.mjs exec/)
  assert.match(skill, /append-only\s*\n?\s*ledger에 기록되고 보고는 자유 서술 대신 runId를 인용한다/)
  assert.match(skill, /ledger에 없는 실행을\s*\n?\s*통과로 보고하지 않는다/)
  assert.match(skill, /scripts\/oracle-run\.mjs transition`으로만 기록한다/)
  assert.match(skill, /oracle-run\.mjs budget`이 계수한다/)
  assert.match(skill, /scripts\/oracle-verify\.mjs evidence`로 실제/)
  assert.match(skill, /runs: 인용한 ledger runId/)
  assert.match(skill, /상태 기계: 기록된 전이와 마지막 상태/)
})

test('O27: lints the card structure and initializes run artifacts around the lock', async () => {
  const oracleCard = await read('references/oracle-card.md')

  assert.match(oracleCard, /oracle-verify\.mjs card/)
  assert.match(oracleCard, /CARD_LINT_FAILED/)
  assert.match(oracleCard, /자동 추가 TC.*실제 계약 행 또는 출처 있는 N\/A/s)
  assert.match(oracleCard, /User Confirmation/)
  assert.match(oracleCard, /Draft Oracle/)
  assert.match(oracleCard, /새 카드.*revision.*사용자.*확인/s)
  assert.match(oracleCard, /정책 ID.*행 ID.*양방향/s)
  assert.match(oracleCard, /oracle-run\.mjs init/)
  assert.match(oracleCard, /--required-label/)
  assert.match(oracleCard, /run-state\.json/)
  assert.match(oracleCard, /runs\.jsonl/)
  assert.match(oracleCard, /상태 파일이 이미 있으면 `init`은 실패한다/)
  assert.match(oracleCard, /`oracle-verify\.mjs card` lint와 revision lock 검증이 통과함/)
})

test('O28: routes delivery runs through exec and gates GREEN on flakiness and test strength', async () => {
  const implementationLoop = await read('references/implementation-loop.md')

  assert.match(implementationLoop, /oracle-run\.mjs exec/)
  assert.match(implementationLoop, /oracle-run\.mjs transition/)
  assert.match(implementationLoop, /PRODUCTION_TOUCHED_BEFORE_RED/)
  assert.match(implementationLoop, /FLAKINESS_GATE/)
  assert.match(implementationLoop, /Low 1회, Medium 2회, High 3회/)
  assert.match(implementationLoop, /TEST_WEAKENED/)
  assert.match(implementationLoop, /ENV_DRIFT/)
  assert.match(implementationLoop, /evidence\.json/)
  assert.match(implementationLoop, /oracle-verify\.mjs red/)
  assert.match(implementationLoop, /EVIDENCE_REQUIRED/)
  assert.match(implementationLoop, /REQUIRED_RUN_MISSING/)
  assert.match(implementationLoop, /oracle-verify\.mjs review/)
  assert.match(implementationLoop, /EVIDENCE_NOT_IN_RUN/)
  assert.match(implementationLoop, /EVIDENCE_UNVERIFIABLE/)
  assert.match(implementationLoop, /oracle-verify\.mjs scan/)
  assert.match(implementationLoop, /oracle:nondeterminism/)
  assert.match(implementationLoop, /ledger를 거치지 않은 실행을 증거로 보고/)
})

test('O29: gives reviewers raw run evidence and a validated finding schema', async () => {
  const subagentReview = await read('references/subagent-review.md')

  assert.match(subagentReview, /ledger\s*\n?\s*runId/)
  assert.match(subagentReview, /oracle-verify\.mjs findings/)
  assert.match(subagentReview, /--intersect/)
  assert.match(subagentReview, /독립 리뷰를 2회\*\* 실행한다/)
  assert.match(subagentReview, /critical.*high.*단독.*blocking/s)
  assert.match(subagentReview, /medium.*low.*교집합/s)
  assert.match(subagentReview, /FINDINGS_INVALID/)
  assert.match(subagentReview, /medium\/low finding은 `NON_ORACLE_OPINION`으로 강등/)
  assert.match(subagentReview, /행이 없는 critical\/high.*blocking/s)
  assert.match(subagentReview, /grade가 `reported`인가/)
})

test('O30: delegates screenshot and direct-browser execution to a separate skill', async () => {
  const [skill, visualDesign] = await Promise.all([read('SKILL.md'), read('references/visual-design.md')])

  assert.match(skill, /\$frontend-visual-qa/)
  assert.match(skill, /명시적으로 요청.*호출/s)
  assert.match(visualDesign, /\$frontend-visual-qa/)
  assert.match(visualDesign, /screenshot.*직접 브라우저.*소유/s)
  assert.doesNotMatch(skill, /BROWSER_VERIFIED/)
})

test('requires automatic deterministic locking at delivery boundaries', async () => {
  const [skill, oracleCard] = await Promise.all([read('SKILL.md'), read('references/oracle-card.md')])

  assert.match(skill, /scripts\/oracle-lock\.mjs/)
  assert.match(skill, /각 단계 직전 revision lock을 자동 검증/)
  assert.match(oracleCard, /\.ai\/oracles\/<oracle-id>/)
  assert.match(oracleCard, /사용자에게 명령 실행을 요청하지 않는다/)
  assert.match(oracleCard, /ORACLE_CHANGED/)
  assert.match(oracleCard, /SOURCE_CHANGED/)
  assert.match(oracleCard, /LOCK_INVALID/)
})

test('locks all approved Delivery sources once instead of extending an existing lock', async () => {
  const [skill, oracleCard, implementationLoop] = await Promise.all([
    read('SKILL.md'),
    read('references/oracle-card.md'),
    read('references/implementation-loop.md'),
  ])

  assert.match(skill, /Delivery.*lock.*미룬다/s)
  assert.match(skill, /architecture.*backend.*final lock.*1회/s)
  assert.match(oracleCard, /Design-only.*Delivery.*새 revision/s)
  assert.match(implementationLoop, /모든 결과 변경.*final lock을 1회/s)
  assert.doesNotMatch(`${skill}\n${oracleCard}`, /add-source/)
})

test('keeps feedback routing and evidence tied to the locked revision', async () => {
  const [skill, implementationLoop] = await Promise.all([read('SKILL.md'), read('references/implementation-loop.md')])

  for (const classification of [
    'POLICY_GAP',
    'EVIDENCE_GAP',
    'HARNESS_DEFECT',
    'PRODUCT_DEFECT',
    'ENVIRONMENT_DEFECT',
    'NON_ORACLE_OPINION',
  ]) {
    assert.match(skill, new RegExp(classification))
    assert.match(implementationLoop, new RegExp(classification))
  }

  assert.match(implementationLoop, /evidence manifest/)
  assert.match(implementationLoop, /revision mismatch/)
})

test('carries the locked revision through tests and review without owning visual QA', async () => {
  const [skill, implementationLoop, subagentReview] = await Promise.all([
    read('SKILL.md'),
    read('references/implementation-loop.md'),
    read('references/subagent-review.md'),
  ])

  assert.match(skill, /\$frontend-visual-qa/)
  assert.doesNotMatch(skill, /browser-verification\.md|BROWSER_VERIFIED|브라우저 검증·자가개선/)
  assert.doesNotMatch(implementationLoop, /browser scenario|BROWSER_VERIFIED/)
  assert.match(subagentReview, /Oracle SHA-256/)
  assert.match(subagentReview, /마지막 verify/)
  assert.match(subagentReview, /NON_ORACLE_OPINION/)
  await assert.rejects(read('references/browser-verification.md'), { code: 'ENOENT' })
})

test('starts TDD with MSW and colocates handlers in the nearest owning boundary', async () => {
  const [skill, implementationLoop, fsd] = await Promise.all([
    read('SKILL.md'),
    read('references/implementation-loop.md'),
    read('references/fsd.md'),
  ])

  assert.match(skill, /MSW를 최대한 쓴다/)
  assert.match(skill, /가장 가까운 곳에 두고/)
  assert.match(implementationLoop, /MSW handler로 세운다/)
  assert.match(implementationLoop, /fsd\.md/)
  assert.match(fsd, /<slice>\/api\/__mocks__\//)
  assert.match(fsd, /<slice>\/__mocks__\//)
})

test('explicitly invokes $test before writing frontend tests', async () => {
  const [skill, implementationLoop] = await Promise.all([read('SKILL.md'), read('references/implementation-loop.md')])

  assert.match(skill, /테스트 파일을 작성하기 직전에 `\$test` 스킬을 이름으로 명시적으로 로드·호출/)
  assert.match(skill, /테스트 파일 작성 직전에 `\$test` 스킬을 명시적으로 호출/)
  assert.match(implementationLoop, /테스트 파일을 작성하기 직전에 설치된 `\$test` 스킬을 이름으로 명시적으로 로드·호출/)
  assert.match(implementationLoop, /파일을 참고만 하는 것으로 대체하지 않으며/)
})

test('batches delivery decisions and parallelizes only across safe gates', async () => {
  const implementationLoop = await read('references/implementation-loop.md')

  for (const intakeItem of ['policy', 'architecture', 'evidence', 'naming', 'review']) {
    assert.match(implementationLoop, new RegExp(intakeItem))
  }

  assert.match(implementationLoop, /read-only.*병렬/s)
  assert.match(implementationLoop, /모든.*결정.*뒤.*final lock.*1회/s)
  assert.match(implementationLoop, /`VALID_RED` 전.*production.*수정하지 않는다/s)
  assert.match(implementationLoop, /겹치지 않는 파일.*worker.*최대 2/s)
  assert.match(implementationLoop, /targeted GREEN.*1회/s)
  assert.match(implementationLoop, /root test.*lint.*format.*독립 review.*병렬/s)
  assert.match(implementationLoop, /모든 결과.*합류.*final verify/s)
})

test('defines the FSD contract and wires it through loading, architecture, implementation, and review', async () => {
  const [skill, fsd, architectureContract, frontendImplementation, subagentReview, backend] = await Promise.all([
    read('SKILL.md'),
    read('references/fsd.md'),
    read('references/architecture-contract.md'),
    read('references/frontend-implementation.md'),
    read('references/subagent-review.md'),
    read('references/backend.md'),
  ])

  assert.match(skill, /references\/fsd\.md/)
  assert.match(skill, /Feature-Sliced Design/)
  assert.match(skill, /제안·설계·리뷰하기 전/)
  assert.match(skill, /설치된 `\$test` 스킬을 이름으로 명시적으로 로드·호출/)
  assert.match(fsd, /app → pages → widgets → features → entities → shared/)
  assert.match(fsd, /`components`, `hooks`, `utils`는 FSD segment가 아니다/)
  assert.match(fsd, /ui\|model\|api\|lib\/__test__\//)
  assert.match(fsd, /deep import하지 않는다/)
  assert.match(fsd, /steiger/)
  assert.match(fsd, /pnpm add -D steiger @feature-sliced\/steiger-plugin/)
  assert.match(fsd, /'fsd\/typo-in-layer-name': 'off'/)
  assert.match(fsd, /`@lodado\/eslint-config`.*이미.*사용/s)
  assert.match(fsd, /NEEDS_DECISION/)
  assert.match(fsd, /Server 코드 배치/)
  assert.match(fsd, /`src\/server\/` 루트로 빼지 않는다/)
  assert.match(fsd, /server-only/)
  assert.match(fsd, /Pages-first/)
  assert.match(fsd, /widgets layer는 신규 채택을 비권장/)
  assert.match(fsd, /shared\/auth/)
  assert.match(fsd, /Cross-import 해결/)
  assert.match(fsd, /`_app\/`·`_pages\/`/)
  assert.match(fsd, /technical-role/)
  assert.match(architectureContract, /fsd\.md/)
  assert.match(architectureContract, /steiger/)
  assert.match(backend, /fsd\.md/)
  assert.match(backend, /Server 코드 배치/)
  assert.match(frontendImplementation, /fsd\.md/)
  assert.match(subagentReview, /fsd\.md/)
})

test('gates approved hook encapsulation and reviews UI/business responsibility boundaries', async () => {
  const [skill, architectureContract, frontendImplementation, subagentReview] = await Promise.all([
    read('SKILL.md'),
    read('references/architecture-contract.md'),
    read('references/frontend-implementation.md'),
    read('references/subagent-review.md'),
  ])

  assert.match(skill, /Hook Encapsulation/)
  assert.match(frontendImplementation, /eslint-plugin-use-encapsulation/)
  assert.match(frontendImplementation, /use-encapsulation\/prefer-custom-hooks/)
  assert.match(frontendImplementation, /allow.*block/s)
  assert.match(frontendImplementation, /응집도.*증명하지/s)
  assert.match(architectureContract, /orchestration-only/)
  assert.match(architectureContract, /target glob.*rule ID.*allow.*block.*lint command/s)
  assert.match(architectureContract, /hook-encapsulation/)
  assert.match(frontendImplementation, /UI.*비즈니스 로직/s)
  assert.match(subagentReview, /micro-hook.*UI.*비즈니스 로직/s)
  assert.match(subagentReview, /trivial wrapper.*거대 hook/s)
  assert.doesNotMatch(subagentReview, /lint|hook-encapsulation|eslint-disable/)
})

test('keeps Oracle control while consuming optional system-design references', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /frontend-system-design/)
  assert.match(skill, /설치돼 있으면 Oracle intake와 제어권을 유지한 채/)
  assert.match(skill, /모든 선택은 정책 후보/)
  assert.match(skill, /POLICY_GAP.*NEEDS_DECISION/s)
  assert.match(skill, /구현 선택지이며 Oracle의 오케스트레이션/)
  assert.doesNotMatch(skill, /references\/(infinite-scroll|search-typeahead)\.md/)
})

test('loads visual design guidance only for UI-shaping work and carries its contract through delivery', async () => {
  const [skill, visualDesign, oracleCard, frontendImplementation, subagentReview] = await Promise.all([
    read('SKILL.md'),
    read('references/visual-design.md'),
    read('references/oracle-card.md'),
    read('references/frontend-implementation.md'),
    read('references/subagent-review.md'),
  ])

  assert.match(skill, /references\/visual-design\.md/)
  assert.match(skill, /behavior-only/)
  assert.match(skill, /identity-shaping/)
  assert.match(skill, /Design Change Confirmation/)
  assert.match(visualDesign, /Design Proposal/)
  assert.match(visualDesign, /Design Intent/)
  assert.match(visualDesign, /Design Change Confirmation/)
  assert.match(visualDesign, /local[\s\S]*identity-shaping[\s\S]*명시적 사용자 확인/)
  assert.match(visualDesign, /HARD/)
  assert.match(visualDesign, /RELATIONAL/)
  assert.match(visualDesign, /JUDGMENT/)
  assert.match(oracleCard, /Design Intent/)
  assert.match(oracleCard, /Design Change Confirmation/)
  assert.match(frontendImplementation, /Design Intent/)
  assert.match(subagentReview, /designer/)
  assert.match(subagentReview, /출처 있는 미적 요구/)
  assert.match(subagentReview, /Design Change Confirmation/)
})

test('keeps visual policy in Oracle while delegating visual execution details', async () => {
  const visualDesign = await read('references/visual-design.md')

  assert.match(visualDesign, /HARD/)
  assert.match(visualDesign, /RELATIONAL/)
  assert.match(visualDesign, /JUDGMENT/)
  assert.match(visualDesign, /baseline.*사용자.*명시적 승인/s)
  assert.match(visualDesign, /\$frontend-visual-qa/)
  assert.doesNotMatch(visualDesign, /`\*\.style\.(?:test|spec)/)
  assert.doesNotMatch(visualDesign, /BROWSER_VERIFIED/)
})

test('requires independent design review for judgment while visual QA owns baseline execution', async () => {
  const [visualDesign, subagentReview] = await Promise.all([
    read('references/visual-design.md'),
    read('references/subagent-review.md'),
  ])

  assert.match(visualDesign, /`JUDGMENT`.*`designer`/s)
  assert.match(subagentReview, /`JUDGMENT` 행.*승인 기준.*Design Intent/s)
  assert.match(subagentReview, /\$frontend-visual-qa.*artifact/s)
})
