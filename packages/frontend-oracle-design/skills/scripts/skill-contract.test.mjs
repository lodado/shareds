import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const skillDirectory = dirname(dirname(fileURLToPath(import.meta.url)))

async function read(relativePath) {
  return readFile(join(skillDirectory, relativePath), 'utf8')
}

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

test('carries the locked revision through tests and independent review without a direct browser loop', async () => {
  const [skill, implementationLoop, subagentReview] = await Promise.all([
    read('SKILL.md'),
    read('references/implementation-loop.md'),
    read('references/subagent-review.md'),
  ])

  assert.doesNotMatch(skill, /browser-verification\.md|BROWSER_VERIFIED|브라우저 검증·자가개선/)
  assert.doesNotMatch(implementationLoop, /browser scenario/)
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

  for (const intakeItem of [
    'evidence',
    'screenshot strictness',
    'baseline authority',
    'naming',
    'designer',
    'direct-browser',
  ]) {
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

test('locks approved visual results with complementary deterministic evidence', async () => {
  const visualDesign = await read('references/visual-design.md')

  assert.match(visualDesign, /semantic DOM snapshot/)
  assert.match(visualDesign, /computed style whitelist/)
  assert.match(visualDesign, /relative layout snapshot/)
  assert.match(visualDesign, /exact screenshot/)
  assert.match(visualDesign, /Chromium.*OS.*font.*viewport.*theme.*reduced motion/s)
  assert.match(visualDesign, /raw HTML.*CSS source bytes.*잠그지 않는다/s)
  assert.match(visualDesign, /baseline.*변경 전후 diff.*사용자.*명시적 승인/s)
  assert.match(visualDesign, /approved baseline.*read×1.*write×0/s)
  assert.match(visualDesign, /승인 근거가\s+없으면.*update.*거부/s)
  assert.match(visualDesign, /기존 revision.*보존/s)
  assert.doesNotMatch(visualDesign, /baseline을 쓰지 않는다/)
  assert.match(visualDesign, /headless.*`\*\.style\.(?:test|spec)/s)
  assert.doesNotMatch(visualDesign, /BROWSER_VERIFIED/)
})

test('names visual contract tests without bypassing repository discovery', async () => {
  const visualDesign = await read('references/visual-design.md')

  assert.match(visualDesign, /`\*\.style\.test\.ts`.*`\*\.style\.test\.tsx`/s)
  assert.match(visualDesign, /`\*\.style\.spec\.ts`/)
  assert.match(visualDesign, /실제 test command가 수집/)
  assert.match(visualDesign, /naming만을 위해.*test 설정.*변경하지 않는다/s)
  assert.match(visualDesign, /소유 대상 가까이/)
})

test('requires independent design review only for judgment or baseline changes', async () => {
  const [visualDesign, subagentReview] = await Promise.all([
    read('references/visual-design.md'),
    read('references/subagent-review.md'),
  ])

  assert.match(visualDesign, /`JUDGMENT`.*baseline 변경.*`designer`/s)
  assert.match(
    subagentReview,
    /`JUDGMENT` 행 또는 visual baseline 변경.*Oracle revision.*baseline.*actual screenshot.*diff/s,
  )
  assert.match(subagentReview, /Oracle revision.*baseline.*actual screenshot.*diff/s)
  assert.match(subagentReview, /정책.*baseline.*수정.*승인.*금지/s)
  assert.match(subagentReview, /deterministic comparison.*그대로 통과.*N\/A/s)
})
