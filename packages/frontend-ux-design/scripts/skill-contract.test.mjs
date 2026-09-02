import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const skillDirectory = join(packageDirectory, 'skills/frontend-ux-design')

const read = (relativePath) => readFile(join(skillDirectory, relativePath), 'utf8')

test('decides top-down: primary task before visual treatment, and gates every treatment on a rung', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /name: frontend-ux-design/)
  assert.match(
    skill,
    /1\.\s+primary task[\s\S]*2\.\s+information hierarchy[\s\S]*3\.\s+interaction[\s\S]*4\.\s+feedback[\s\S]*5\.\s+visual treatment/,
  )
  assert.match(skill, /visual treatment gate/)
  assert.match(skill, /1–4단 중 어느 것을 돕는지/)
  assert.match(skill, /말할 수\s+없으면 지운다/)
})

test('ships every reference the workflow links to', async () => {
  const skill = await read('SKILL.md')
  const references = [
    'decision-ladder',
    'ui-checklist',
    'ux-checklist',
    'reference-study',
    'review',
    'fidelity',
    'interface-rules',
  ]

  for (const name of references) {
    assert.match(skill, new RegExp(`references/${name}\\.md`))
    await read(`references/${name}.md`)
  }
})

test('reviews through the funnel lens and requires a rationale with an unverified assumption', async () => {
  const [ux, review] = await Promise.all([read('references/ux-checklist.md'), read('references/review.md')])

  for (const stage of ['## Funnel', '## Impression', '## Interaction', '## Conversion', '## Retention']) {
    assert.ok(ux.includes(stage), `missing stage ${stage}`)
  }
  assert.match(review, /review: T\d H\d S\d E\d R\d X\d/)
  assert.match(review, /7\. 검증 필요 가정/)
  assert.match(review, /3 미만이 하나라도 있으면 고치고 다시 매긴다/)
})

test('separates shared patterns from single-brand choices in reference study', async () => {
  const study = await read('references/reference-study.md')

  assert.match(study, /2개 이상에서 반복 → \*\*패턴\*\*/)
  assert.match(study, /1개에만 있음 → \*\*브랜드 선택\*\*/)
  assert.match(study, /픽셀 · 카피 · 에셋 · 폰트 이름을 복제하지 않는다/)
})

test('defers risky behavior policy and verification to sibling skills', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /`frontend-oracle-design`이\s+소유한다/)
  assert.match(skill, /`frontend-visual-qa`/)
  assert.match(skill, /`test`가 맡는다/)
})

test('follows an owned source verbatim and only creates when no source exists, delegating to installed skills', async () => {
  const [skill, fidelity, ui] = await Promise.all([
    read('SKILL.md'),
    read('references/fidelity.md'),
    read('references/ui-checklist.md'),
  ])

  assert.match(skill, /\*\*Fidelity\*\*[\s\S]*\*\*Creation\*\*/)
  assert.match(skill, /창작은 소스가 없을 때의 마지막 수단이다/)
  assert.match(skill, /## 위임/)
  for (const delegate of [
    'kill-ai-slop',
    'frontend-design',
    'figma:figma-design-to-code',
    'design-motion-principles',
  ]) {
    assert.ok(skill.includes(`\`${delegate}\``), `missing delegate ${delegate}`)
  }
  assert.match(fidelity, /소스에 없는 것을 더하지 않는다/)
  assert.match(fidelity, /이 표에 없는 이탈은 사용자에게 묻는다/)
  assert.match(ui, /`kill-ai-slop`이 설치돼 있으면 이 절 대신/)
})

test('vendors Vercel interface rules with a pinned upstream sha and folds cognitive load into the UX review', async () => {
  const [rules, ui, ux, skill] = await Promise.all([
    read('references/interface-rules.md'),
    read('references/ui-checklist.md'),
    read('references/ux-checklist.md'),
    read('SKILL.md'),
  ])

  assert.match(rules, /Upstream commit: [0-9a-f]{40}/)
  assert.match(rules, /NEVER: `outline: none` without visible focus replacement/)
  assert.match(ui, /interface-rules\.md/)
  assert.match(ui, /## Browser surfaces/)
  assert.match(ux, /intrinsic[\s\S]*extraneous[\s\S]*germane/)
  assert.match(ux, /`blocker`/)
  assert.match(skill, /\*\*2–3개만\*\* 묻는다/)
  assert.match(skill, /`baseline-ui`/)
  assert.match(skill, /`DESIGN\.md`가 있으면 그것이 잠긴 시스템/)
})
