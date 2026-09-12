import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
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
  assert.match(composition, /합의 범위의 1–3개 section/)
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
    minItems: 1,
    maxItems: 3,
    uniqueItems: true,
  })

  assert.ok(delivery.properties.status.enum.includes('FIGMA_READY'))
  assert.equal(delivery.properties.figma.properties.code_generated.const, false)
  const readyGate = delivery.allOf[0].then.properties
  assert.equal(readyGate.figma.properties.editable.const, true)
  assert.equal(readyGate.critique.properties.iteration_count.minimum, 1)
  assert.equal(readyGate.critique.properties.iteration_count.maximum, undefined)
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
  assert.equal(codexManifest.version, packageManifest.version)
  assert.equal(claudeManifest.version, packageManifest.version)
  // Marketplace metadata belongs to the monorepo, not an individual installed plugin.
  const repositoryDirectory = dirname(dirname(packageDirectory))
  if (packageDirectory === join(repositoryDirectory, 'packages/frontend-interface-design')) {
    const marketplace = JSON.parse(await readFile(join(repositoryDirectory, '.claude-plugin/marketplace.json'), 'utf8'))
    assert.equal(marketplace.plugins.find(({ name }) => name === codexManifest.name)?.version, packageManifest.version)
  }
  assert.equal(codexManifest.interface.displayName, 'Reference-Driven Figma Design')
  assert.match(codexManifest.description, /editable Figma/)
  assert.equal(claudeManifest.name, 'frontend-interface-design')
  assert.equal(packageManifest.name, '@lodado/frontend-interface-design-plugin')
  assert.match(openai, /value: figma/)
  assert.match(openai, /\$reference-driven-figma-design/)

  const legacyDirectory = join(packageDirectory, 'skills/frontend-interface-design')
  const legacy = await readFile(join(legacyDirectory, 'SKILL.md'), 'utf8')
  assert.match(legacy, /name: frontend-interface-design/)
  const target = legacy.match(/\]\(([^)]+)\)/)?.[1]
  assert.ok(target, 'Legacy invocation must resolve to the canonical skill')
  assert.equal(resolve(legacyDirectory, target), join(skillDirectory, 'SKILL.md'))
  await access(resolve(legacyDirectory, target))
})

test('behavior cases cover tool truthfulness, reuse, adaptation, critique, and promotion boundaries', async () => {
  const { cases, schema_version: schemaVersion } = JSON.parse(await readSkillFile('evals/behavior-cases.json'))
  const ids = cases.map(({ id }) => id)

  assert.equal(schemaVersion, '1.0')
  assert.equal(cases.length, 27)
  assert.equal(new Set(ids).size, cases.length)
  for (const entry of cases) {
    assert.ok(entry.prompt.trim(), `${entry.id}: missing prompt`)
    assert.ok(entry.expected_invariants.length >= 3, `${entry.id}: weak expected contract`)
    assert.ok(entry.forbidden.length >= 2, `${entry.id}: weak forbidden contract`)
  }
})

test('requires taxonomy interpretation, separate screen evidence, adaptation and pilot comparison', async () => {
  const main = await readSkillFile('SKILL.md')
  const workflow = await readSkillFile('references/taxonomy-reference-workflow.md')
  assert.match(main, /references\/taxonomy-reference-workflow\.md/)
  for (const heading of [
    '## 1. 사전 해석과 무결성',
    '## 2. 키워드를 검색 의도로 변환',
    '## 3. 화면 근거와 컴포넌트 출처를 분리',
    '## 4. 능동적인 응용의 범위',
    '## 5. 비교 파일럿과 완료 게이트',
  ]) {
    assert.ok(workflow.includes(heading), heading)
  }
  assert.match(workflow, /taxonomy는 시각 증거가 아니고, UI Kit import는 화면 구성의 근거가 아니다/)
  assert.match(workflow, /로컬 파생 컴포넌트/)
  assert.match(workflow, /HOLD/)
  assert.match(workflow, /INCOMPLETE/)
  assert.match(workflow, /작은 수정은 기존 근거를 재사용/)
  assert.match(workflow, /프롬프트 실행 계약/)
  assert.match(workflow, /실제 Figma 실행·시각 품질이 검증됐다는 뜻이 아니다/)
  for (const file of ['research-selection.md', 'figma-composition.md', 'critique-refinement.md', 'delivery-contract.md']) {
    const content = await readSkillFile(`references/${file}`)
    assert.ok(content.includes('taxonomy-reference-workflow.md'), file)
  }
  for (const match of workflow.matchAll(/\]\(([^)]+)\)/g)) {
    const destination = match[1].split('#')[0]
    if (destination && !/^[a-z]+:/i.test(destination)) {
      await access(resolve(skillDirectory, 'references', destination))
    }
  }
})

test('ships source fingerprints and local resolution without redistributing dictionary text', async () => {
  const legacy = await readFile(join(packageDirectory, 'skills/frontend-interface-design/SKILL.md'), 'utf8')
  assert.match(legacy, /\.\.\/reference-driven-figma-design\/references\/taxonomy-reference-workflow\.md/)
  const manifest = JSON.parse(await readSkillFile('references/dictionary-sources.json'))
  assert.equal(manifest.source_index, 'https://vibedesignlab.net/dictionary')
  assert.match(manifest.usage, /Local use only/)
  const names = manifest.files.map(({ name, sha256 }) => {
    assert.match(name, /^[\w.-]+\.md$/)
    assert.match(sha256, /^[\da-f]{64}$/)
    return name
  })
  assert.equal(names.length, 13)
  assert.equal(new Set(names).size, 13)
  assert.equal(names.filter((name) => name.endsWith('taxonomy.md')).length, 8)
  await access(join(skillDirectory, 'scripts/resolve_dictionary.py'))
  const workflow = await readSkillFile('references/taxonomy-reference-workflow.md')
  assert.match(workflow, /Git이나 플러그인 패키지에 원문을 넣지 않는다/)
  assert.match(workflow, /FIGMA_DESIGN_DICTIONARY/)
  const repositoryDirectory = dirname(dirname(packageDirectory))
  if (packageDirectory === join(repositoryDirectory, 'packages/frontend-interface-design')) {
    const dictionaryPaths = ['frontend-interface-design', 'reference-driven-figma-design'].map(
      (skill) => `packages/frontend-interface-design/skills/${skill}/references/dictionary/`,
    )
    const options = { cwd: repositoryDirectory, encoding: 'utf8' }
    assert.equal(execFileSync('git', ['ls-files', '--', ...dictionaryPaths], options).trim(), '')
    const probes = dictionaryPaths.map((path) => `${path}taxonomy.md`)
    assert.deepEqual(execFileSync('git', ['check-ignore', '--no-index', '--', ...probes], options).trim().split('\n'), probes)
  }
})
