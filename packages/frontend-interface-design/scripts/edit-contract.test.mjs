import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
// eslint-disable-next-line test/no-import-node-test -- static skill regression checks.
import test from 'node:test'

const root = new URL('../skills/reference-driven-figma-design/', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('edit contract is reachable and separates preservation from redesign', async () => {
  const contract = await read('references/edit-contract.md')
  for (const mode of ['ASSEMBLE', 'LOCALIZE', 'FIDELITY', 'RESKIN', 'REDESIGN']) {
    assert.ok(contract.includes(mode), mode)
  }
  assert.match(contract, /통합 요청 자체는 그 근거가 아니다/)
  assert.match(contract, /미완료·완료를 구분하지 못하는 동안 다시 붙여넣지 않는다/)
  assert.match(contract, /전송 실패를 다른 템플릿 재제작으로 우회하지 않는다/)
  assert.match(contract, /컴포넌트 연결 성공은 원본 디자인 충실도나 제품 완성도의 증거가 아니다/)
  for (const term of [
    'Source gate',
    'Fidelity gate',
    'Content gate',
    'Layout gate',
    'Pasting',
    'read-back',
    'Noto',
    '미검증',
  ]) {
    assert.ok(contract.includes(term), term)
  }
  for (const path of [
    'SKILL.md',
    'references/request-contract.md',
    'references/figma-composition.md',
    'references/delivery-contract.md',
  ]) {
    assert.match(await read(path), /edit-contract\.md/, path)
  }
})

test('regression prompts cover assembly, transfer, fidelity, localization and scope correction', async () => {
  const { cases } = JSON.parse(await read('evals/behavior-cases.json'))
  for (const id of [
    'assemble-preserves-approved-sections',
    'stalled-paste-is-not-redesign',
    'template-fidelity-over-reskin',
    'localize-preserves-type-hierarchy',
    'footer-only-edit-scope',
    'global-feedback-corrects-scope',
  ]) {
    assert.ok(
      cases.some((entry) => entry.id === id),
      id,
    )
  }
})
