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

test('carries the locked revision through browser and independent review', async () => {
  const [browserVerification, subagentReview] = await Promise.all([
    read('references/browser-verification.md'),
    read('references/subagent-review.md'),
  ])

  assert.match(browserVerification, /oracle-lock\.mjs verify/)
  assert.match(browserVerification, /NON_ORACLE_OPINION/)
  assert.match(subagentReview, /Oracle SHA-256/)
  assert.match(subagentReview, /마지막 verify/)
  assert.match(subagentReview, /NON_ORACLE_OPINION/)
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

test('loads visual design guidance only for UI-shaping work and carries its contract through delivery', async () => {
  const [skill, visualDesign, oracleCard, frontendImplementation, browserVerification, subagentReview] =
    await Promise.all([
      read('SKILL.md'),
      read('references/visual-design.md'),
      read('references/oracle-card.md'),
      read('references/frontend-implementation.md'),
      read('references/browser-verification.md'),
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
  assert.match(browserVerification, /Design Intent/)
  assert.match(subagentReview, /designer/)
  assert.match(subagentReview, /출처 있는 미적 요구/)
  assert.match(subagentReview, /Design Change Confirmation/)
})
