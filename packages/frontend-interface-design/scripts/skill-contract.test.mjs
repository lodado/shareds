import assert from 'node:assert/strict'
import { access, readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package contract tests run with node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const skillDirectory = join(packageDirectory, 'skills/reference-driven-figma-design')
const readSkillFile = (path) => readFile(join(skillDirectory, path), 'utf8')

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? walk(path) : [path]
    }),
  )
  return nested.flat()
}

test('routes only Figma-first design requests and forbids silent code or image substitution', async () => {
  const skill = await readSkillFile('SKILL.md')

  assert.match(skill, /name: reference-driven-figma-design/)
  assert.match(skill, /editable Figma product or landing designs/)
  assert.match(skill, /React, HTML\/CSS, Tailwind, Next\.js/)
  assert.match(skill, /PNG, 설명 문서, 코드, 이미지 생성물은 편집 가능한 Figma를 대신하지 못한다/)
  assert.match(skill, /Figma read\/write가 필수/)
  assert.match(skill, /Figma write가 없으면 상태를 BLOCKED/)
  assert.doesNotMatch(skill, /\[TODO:/)
})

test('preserves the source hierarchy and separates visual system from composition', async () => {
  const skill = await readSkillFile('SKILL.md')
  const authority = [
    'PRD / Product Requirements',
    '승인된 Brand Direction',
    '기존 내부 Design Assets',
    '선택된 Figma Base Template',
    '기존 Figma Variables / Components',
    '승인된 이전 디자인 패턴',
    'Refero References',
    'Aside/Browser로 조사한 외부 References',
    '새로운 디자인 결정',
  ]

  let cursor = -1
  for (const item of authority) {
    const index = skill.indexOf(item)
    assert.ok(index > cursor, `missing or out-of-order authority: ${item}`)
    cursor = index
  }

  assert.match(skill, /Visual System.*내부 시스템.*Figma Base Template/s)
  assert.match(skill, /Composition.*Refero.*외부 사례/s)
  assert.match(skill, /외부의 색·폰트·radius·shadow를 함께 복사하지 않는다/)
})

test('runs internal-first research, a three-section pilot, bounded critique, and asset promotion', async () => {
  const [skill, research, composition, critique, learning] = await Promise.all([
    readSkillFile('SKILL.md'),
    readSkillFile('references/research-selection.md'),
    readSkillFile('references/figma-composition.md'),
    readSkillFile('references/critique-refinement.md'),
    readSkillFile('references/asset-learning.md'),
  ])

  assert.match(research, /Existing Component Catalog[\s\S]*Existing Figma Library[\s\S]*Refero/)
  assert.match(research, /preview-only[\s\S]*structure-inspected[\s\S]*editable-verified/)
  assert.match(composition, /정확히 3개 section/)
  assert.match(skill, /가장 영향이 큰 문제 3개/)
  assert.match(critique, /2–4회의 의미 있는 반복/)
  assert.match(critique, /전체 page를 다시 생성하지 않는다/)
  assert.match(learning, /Experiment → Real Page Usage → Visual Critique → Reuse Evaluation → Approved Pattern/)
  assert.match(learning, /Component Name/)
  assert.match(learning, /Avoid When/)
})

test('ships valid input and output JSON schemas with an editable-Figma completion gate', async () => {
  const request = JSON.parse(await readSkillFile('references/schemas/design-request.schema.json'))
  const delivery = JSON.parse(await readSkillFile('references/schemas/design-delivery.schema.json'))

  assert.equal(request.$schema, 'https://json-schema.org/draft/2020-12/schema')
  assert.equal(request.properties.deliverable.properties.format.const, 'editable-figma')
  assert.equal(request.properties.deliverable.properties.code_generation_allowed.const, false)
  assert.deepEqual(request.properties.scope.properties.pilot_sections, {
    type: 'array',
    items: { type: 'string', minLength: 1 },
    minItems: 3,
    maxItems: 3,
    uniqueItems: true,
  })

  assert.ok(delivery.properties.status.enum.includes('FIGMA_READY'))
  assert.equal(delivery.properties.figma.properties.code_generated.const, false)
  const readyGate = delivery.allOf[0].then.properties
  assert.equal(readyGate.figma.properties.editable.const, true)
  assert.equal(readyGate.critique.properties.iteration_count.minimum, 2)
  assert.equal(readyGate.critique.properties.iteration_count.maximum, 4)
  assert.equal(readyGate.verification.properties.preview_inspected.const, true)
})

test('all local references resolve and code-oriented exemplar assets are gone', async () => {
  const skill = await readSkillFile('SKILL.md')
  const links = [...skill.matchAll(/\]\(([^)]+)\)/g)].map((match) => match[1])

  for (const link of links) {
    if (/^[a-z]+:/i.test(link)) continue
    await access(resolve(skillDirectory, link))
  }

  const files = await walk(skillDirectory)
  const prohibited = files.filter((file) => ['.html', '.css', '.jsx', '.tsx'].includes(extname(file)))
  assert.deepEqual(prohibited, [])
})

test('plugin identity stays upgrade-compatible while UI and skill routing become Figma-specific', async () => {
  const [codexManifest, claudeManifest, packageManifest, openai] = await Promise.all([
    readFile(join(packageDirectory, '.codex-plugin/plugin.json'), 'utf8').then(JSON.parse),
    readFile(join(packageDirectory, '.claude-plugin/plugin.json'), 'utf8').then(JSON.parse),
    readFile(join(packageDirectory, 'package.json'), 'utf8').then(JSON.parse),
    readSkillFile('agents/openai.yaml'),
  ])

  assert.equal(codexManifest.name, 'frontend-interface-design')
  assert.equal(codexManifest.version, '1.0.0')
  assert.equal(codexManifest.interface.displayName, 'Reference-Driven Figma Design')
  assert.match(codexManifest.description, /editable Figma/)
  assert.equal(claudeManifest.name, 'frontend-interface-design')
  assert.equal(packageManifest.name, '@lodado/frontend-interface-design-plugin')
  assert.match(openai, /value: figma/)
  assert.match(openai, /\$reference-driven-figma-design/)
})

test('behavior cases cover tool truthfulness, reuse, adaptation, critique, and promotion boundaries', async () => {
  const { cases, schema_version: schemaVersion } = JSON.parse(await readSkillFile('evals/behavior-cases.json'))
  const ids = cases.map(({ id }) => id)

  assert.equal(schemaVersion, '1.0')
  assert.equal(cases.length, 8)
  assert.equal(new Set(ids).size, cases.length)
  for (const entry of cases) {
    assert.ok(entry.prompt.trim(), `${entry.id}: missing prompt`)
    assert.ok(entry.expected_invariants.length >= 3, `${entry.id}: weak expected contract`)
    assert.ok(entry.forbidden.length >= 2, `${entry.id}: weak forbidden contract`)
  }
})
