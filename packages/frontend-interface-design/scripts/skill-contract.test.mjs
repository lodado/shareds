import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const skillDirectory = join(packageDirectory, 'skills/frontend-interface-design')

const read = (relativePath) => readFile(join(skillDirectory, relativePath), 'utf8')

const LINEAGES = [
  'precision-tool',
  'editorial-marketing',
  'consumer-fintech-ko',
  'dense-data-ops',
  'warm-content',
  'playful-commerce',
]

const EXEMPLARS = [
  'tokens.css',
  'README.md',
  'primitives/button.html',
  'primitives/input.html',
  'primitives/card.html',
  'primitives/table-row.html',
  'primitives/dialog.html',
  'compositions/app-shell.html',
  'compositions/marketing-hero.html',
  'compositions/fintech-home.html',
]

function sectionOf(markdown, heading) {
  const start = markdown.indexOf(heading)
  assert.notEqual(start, -1, `missing section ${heading}`)
  const rest = markdown.slice(start + heading.length)
  const next = rest.search(/\n## /)
  return next === -1 ? rest : rest.slice(0, next)
}

test('decides top-down: primary task before visual treatment, and exempts craft defaults from the gate', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /name: frontend-interface-design/)
  assert.match(
    skill,
    /1\.\s+primary task[\s\S]*2\.\s+information hierarchy[\s\S]*3\.\s+interaction[\s\S]*4\.\s+feedback[\s\S]*5\.\s+visual treatment/,
  )
  assert.match(skill, /visual treatment gate/)
  assert.match(skill, /craft\.md[\s\S]*기본값[\s\S]*근거 없이 쓴다/)
  assert.match(skill, /말할 수 없으면 지운다/)
})

test('keeps exactly twelve always-on rules, hardest first, and stays inside the rule budget', async () => {
  const skill = await read('SKILL.md')
  const rules = sectionOf(skill, '## 상시 규칙 12')
  // A rule may wrap onto indented continuation lines; join them so pins can see the whole rule.
  const numbered = rules
    .split(/\n(?=\d{1,2}\. )/)
    .map((chunk) => chunk.trim().replace(/\n\s+/g, ' '))
    .filter((chunk) => /^\d{1,2}\. /.test(chunk))

  assert.equal(numbered.length, 12)
  assert.match(numbered[0], /DESIGN\.md/)
  assert.match(numbered[1], /토큰만 참조/)
  assert.match(numbered[2], /typography-ko\.md/)
  assert.match(numbered[7], /보지 않은 화면은 완료가 아니다/)
  assert.match(numbered[7], /look\.md/)
  assert.match(numbered[11], /primary action 하나/)

  const lines = skill.split('\n').length
  // 0.3.0 was 208 lines / 18,916 chars always-on. The budget keeps the always-on load near half of that.
  assert.ok(lines <= 150, `SKILL.md has ${lines} lines; budget is 150`)
  assert.ok(skill.length <= 12500, `SKILL.md has ${skill.length} chars; budget is 12500`)
  assert.doesNotMatch(skill, /kill-ai-slop|hallmark|baseline-ui|clone-website|design-motion-principles/)
})

test('ships every reference, lineage and exemplar the workflow links to', async () => {
  const skill = await read('SKILL.md')
  const references = [
    'adaptation',
    'craft',
    'decision-ladder',
    'fidelity',
    'interface-rules',
    'look',
    'reference-study',
    'review',
    'typography-ko',
    'ui-checklist',
    'ux-checklist',
    'visual-system',
  ]

  for (const name of references) {
    assert.match(skill, new RegExp(`${name}\\.md`), `SKILL.md does not mention ${name}.md`)
    await read(`references/${name}.md`)
  }
  for (const lineage of LINEAGES) await read(`references/lineages/${lineage}.md`)
  for (const exemplar of EXEMPLARS) await read(`exemplars/${exemplar}`)

  const lineageFiles = await readdir(join(skillDirectory, 'references/lineages'))
  assert.equal(lineageFiles.filter((file) => file.endsWith('.md')).length, LINEAGES.length)
})

test('replaces Creation with lineage-based Adaptation that locks a DESIGN.md', async () => {
  const [skill, adaptation] = await Promise.all([read('SKILL.md'), read('references/adaptation.md')])

  assert.match(skill, /\*\*Fidelity\*\*[\s\S]*\*\*Adaptation\*\*/)
  assert.match(skill, /계보를 두 개 섞지 않는다/)
  assert.doesNotMatch(skill, /\*\*Creation\*\*/)

  for (const lineage of LINEAGES) assert.match(adaptation, new RegExp(`lineages/${lineage}\\.md`))
  assert.match(adaptation, /노브 3개/)
  assert.match(adaptation, /### ① anchor hue \(필수 교체\)/)
  assert.match(adaptation, /이식 테스트/)
  assert.match(adaptation, /npx --yes @google\/design\.md lint DESIGN\.md/)
  assert.match(adaptation, /흔한 답/)
  assert.match(adaptation, /\.design\/log\.json/)
  assert.match(adaptation, /체크리스트 10문항/)
  assert.match(adaptation, /이후 모든 화면은 \*\*Fidelity\*\*다/)
})

test('every lineage follows the DESIGN.md spec order and carries the adaptation knobs', async () => {
  const order = [
    '## Overview',
    '## Colors',
    '## Typography',
    '## Layout',
    '## Elevation & Depth',
    '## Shapes',
    '## Components',
    "## Do's and Don'ts",
    '## Adaptation',
  ]

  for (const lineage of LINEAGES) {
    const file = await read(`references/lineages/${lineage}.md`)
    assert.match(file, /^---\nversion: alpha\nname: /, `${lineage}: frontmatter`)
    for (const key of ['colors:', '  primary:', 'typography:', 'rounded:', 'spacing:', 'components:']) {
      assert.ok(file.includes(key), `${lineage}: missing ${key}`)
    }
    assert.match(file, /자리표시자/, `${lineage}: placeholder hue warning`)
    // The DESIGN.md linter rejects clamp() as a Dimension; fluid sizes live in prose, tokens carry the max.
    const frontmatter = file.split('\n---\n')[0]
    assert.doesNotMatch(frontmatter, /clamp\(/, `${lineage}: clamp() in frontmatter tokens`)

    let cursor = -1
    for (const heading of order) {
      const index = file.indexOf(heading)
      assert.ok(index > cursor, `${lineage}: ${heading} missing or out of order`)
      cursor = index
    }
    const adaptation = sectionOf(file, '## Adaptation')
    assert.match(adaptation, /① hue/)
    assert.match(adaptation, /② 페어링/)
    assert.match(adaptation, /③ radius/)
    assert.match(adaptation, /매크로구조/)
    assert.match(adaptation, /signature 후보/)
    assert.match(adaptation, /흔한 답/)
    assert.match(adaptation, /typography-ko\.md/)
  }
})

test('makes the screenshot loop mandatory, scored, accept-only-if-better and bounded', async () => {
  const [skill, look] = await Promise.all([read('SKILL.md'), read('references/look.md')])

  assert.match(skill, /5\. \*\*Look \(필수\)\.\*\*/)
  assert.match(skill, /scripts\/render\.mjs/)
  assert.match(skill, /스크린샷 없이 넘어가지 않는다/)
  assert.match(look, /\*\*반드시\*\* 돈다/)
  assert.match(look, /scripts\/render\.mjs --in/)
  assert.match(look, /gates\.json/)
  assert.match(look, /yes\/no로만/)
  assert.match(look, /통과 수가 늘었을 때만 r2를 채택/)
  assert.match(look, /최대 \*\*3라운드\*\*/)
  assert.match(look, /2라운드 연속[^\n]*정지/)
  assert.match(look, /`VERIFIED`를 발급하지 않고/)
  assert.match(look, /impeccable critique[\s\S]*두 번째 의견/)
})

test('ships craft defaults as code, not adjectives, and Korean typography as a deterministic floor', async () => {
  const [craft, ko, tokens] = await Promise.all([
    read('references/craft.md'),
    read('references/typography-ko.md'),
    read('exemplars/tokens.css'),
  ])

  const craftSections = craft.match(/^## \d{1,2}\. /gm) ?? []
  assert.equal(craftSections.length, 12)
  assert.ok((craft.match(/```css/g) ?? []).length >= 8, 'craft.md needs CSS snippets')
  assert.match(craft, /chroma 최소 0\.005/)
  assert.match(craft, /120–200ms/)
  assert.match(craft, /Lucide/)
  assert.match(craft, /광원은 하나/)

  assert.match(ko, /Pretendard Variable/)
  assert.match(ko, /word-break: keep-all/)
  assert.match(ko, /font-synthesis: none/)
  assert.match(ko, /line-height: 1\.6/)
  assert.match(ko, /letter-spacing: -0\.02em/)
  assert.match(ko, /unicode-range/)
  assert.match(ko, /Toss Product Sans는 배포 불가/)
  assert.match(ko, /hangulKeepAllCoverage/)

  assert.match(tokens, /--h: /)
  assert.match(tokens, /\.dark \{/)
  assert.match(tokens, /--shadow-raised:/)
  assert.match(tokens, /word-break: keep-all/)
  assert.match(tokens, /--ease-out: cubic-bezier/)
})

test('exemplars reference tokens only — no literal colors in component markup', async () => {
  for (const exemplar of EXEMPLARS.filter((file) => file.endsWith('.html'))) {
    const html = await read(`exemplars/${exemplar}`)
    assert.match(html, /tokens\.css/, `${exemplar}: must link tokens.css`)
    assert.doesNotMatch(html, /#[0-9a-f]{6}\b/i, `${exemplar}: hex color literal`)
    assert.doesNotMatch(html, /\b(rgb|hsl)a?\(/, `${exemplar}: rgb/hsl literal`)
    assert.match(html, /var\(--/, `${exemplar}: must use tokens`)
    assert.match(html, /lang="ko"/, `${exemplar}: Korean exemplar`)
  }
  const readme = await read('exemplars/README.md')
  for (const exemplar of EXEMPLARS.filter((file) => file !== 'README.md')) {
    assert.ok(readme.includes(exemplar.split('/').at(-1)), `README does not list ${exemplar}`)
  }
})

test('reviews with seven yes/no axes including Craft and requires a loop line, not absolute scores', async () => {
  const [review, ux] = await Promise.all([read('references/review.md'), read('references/ux-checklist.md')])

  for (const axis of ['Task fit', 'Hierarchy', 'States', 'Execution', 'Restraint', 'Craft', 'Explainability']) {
    assert.ok(review.includes(`| ${axis}`), `missing axis ${axis}`)
  }
  assert.match(review, /axes: 7\/7/)
  assert.match(review, /loop: r2 gates/)
  assert.match(review, /`loop:` 줄이 없으면/)
  assert.match(review, /7\. 검증 필요 가정/)
  assert.doesNotMatch(review, /review: T\d H\d/)
  for (const stage of ['## Funnel', '## Impression', '## Interaction', '## Conversion', '## Retention']) {
    assert.ok(ux.includes(stage), `missing stage ${stage}`)
  }
})

test('starts builds from exemplars and composite blocks instead of a blank div', async () => {
  const [skill, study] = await Promise.all([read('SKILL.md'), read('references/reference-study.md')])

  assert.match(skill, /\*\*복사한 뒤\s+DESIGN\.md로\s+재스킨\*\*/)
  assert.match(skill, /빈 div에서 시작하지 않는다/)
  assert.match(study, /### 조합 블록 — Adaptation 모드의 시작점/)
  assert.match(study, /원본 스타일이 남으면 slop/)
  assert.match(study, /2개 이상에서 반복 → \*\*패턴\*\*/)
  assert.match(study, /1개에만 있음 → \*\*브랜드 선택\*\*/)
})

test('repositions Impeccable as a workflow add-on and never as the quality gate', async () => {
  const skill = await read('SKILL.md')
  const delegation = sectionOf(skill, '## 위임')

  assert.match(delegation, /impeccable init/)
  assert.match(delegation, /browser 엔진/)
  assert.match(delegation, /undercount/)
  assert.match(delegation, /finisher/)
  assert.match(delegation, /NEEDS_DECISION/)
  assert.match(skill, /없어도 이 skill만으로 완결된다/)
  assert.doesNotMatch(skill, /npx --yes impeccable detect/)
})

test('defers risky behavior policy and verification to sibling skills', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /`frontend-oracle-design`이\s+소유한다/)
  assert.match(skill, /`frontend-visual-qa`/)
  assert.match(skill, /`test`가 맡는다/)
  assert.match(skill, /`VERIFIED`를 발급하지 않는다/)
})

test('keeps the vendored Vercel rules pinned and moves slop gates into the loop', async () => {
  const [rules, ui, ladder, visual, fidelity] = await Promise.all([
    read('references/interface-rules.md'),
    read('references/ui-checklist.md'),
    read('references/decision-ladder.md'),
    read('references/visual-system.md'),
    read('references/fidelity.md'),
  ])

  assert.match(rules, /Upstream commit: [0-9a-f]{40}/)
  assert.match(rules, /NEVER: `outline: none` without visible focus replacement/)
  assert.match(ui, /## Craft · Slop — 이 절은 Look 루프가 맡는다/)
  assert.doesNotMatch(ui, /kill-ai-slop/)
  assert.match(ladder, /계보\(Adaptation\)/)
  assert.match(ladder, /면제/)
  assert.match(ladder, /## Decision rules/)
  assert.match(visual, /계보가 이긴다/)
  assert.match(fidelity, /Adaptation 모드가 방출/)
})
