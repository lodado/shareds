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
  assert.match(contract, /integration request is not grounds/i)
  assert.match(contract, /incomplete vs complete[\s\S]*no re-paste/i)
  assert.match(contract, /No rebuilding another template around a failure/i)
  assert.match(contract, /Component linkage success is no evidence of design fidelity or completeness/i)
  for (const term of [
    'Source gate',
    'Fidelity gate',
    'Content gate',
    'Layout gate',
    'Pasting',
    'read-back',
    'Noto',
    'unverified',
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
