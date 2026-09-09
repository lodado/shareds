import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { scanSourceText } from '../skills/frontend-interface-design/scripts/render.mjs'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const skillDirectory = join(packageDirectory, 'skills/frontend-interface-design')

const read = (relativePath) => readFile(join(skillDirectory, relativePath), 'utf8')

test('reference reconstruction has a conditional entry and a traceable handoff', async () => {
  const [skill, fidelity, rebuild] = await Promise.all([
    read('SKILL.md'),
    read('references/fidelity.md'),
    read('references/reference-rebuild.md'),
  ])
  assert.match(skill, /references\/reference-rebuild\.md/)
  assert.match(fidelity, /reference-rebuild\.md/)
  for (const field of [
    'surface/state',
    'trigger',
    'observation',
    'confidence',
    'provenance',
    'classification',
    'open question',
  ]) {
    assert.ok(rebuild.includes(field), `missing evidence field: ${field}`)
  }
  for (const boundary of [
    'observed',
    'adapted',
    'unsupported',
    'evidence-only',
    'pending',
    'frontend-visual-qa',
    'frontend-oracle-design',
  ]) {
    assert.ok(rebuild.includes(boundary), `missing boundary: ${boundary}`)
  }
  assert.match(rebuild, /브랜드 이름만/)
  assert.match(rebuild, /스크린샷만/)
  assert.match(rebuild, /역방향/)
  assert.match(rebuild, /중간/)
  assert.match(fidelity, /관측한 state를 옮긴다/)
  assert.doesNotMatch(fidelity, /ui-checklist 기본값으로 채운다/)
  assert.match(fidelity, /자기 사이트의 `clone-website` 경로를 사용하지 않는다/)
  assert.match(skill, /motion 기본값/)
})

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
  'compositions/pack-developer-platform.html',
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
  assert.match(skill, /정보 이해·조작·합의된 브랜드 표현/)
  assert.match(skill, /craft\.md[\s\S]*기본값/)
  assert.match(skill, /핵심 작업·접근성·읽기를 해치지/)
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
  assert.ok(lines <= 180, `SKILL.md has ${lines} lines; budget is 180`)
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
    'one-shot',
    'reference-pack',
    'reference-rebuild',
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
  assert.match(skill, /최종 시각 시스템은 하나, 섹션 구성의 출처는 여러 개/)
  assert.doesNotMatch(skill, /\*\*Creation\*\*/)

  for (const lineage of LINEAGES) assert.match(adaptation, new RegExp(`lineages/${lineage}\\.md`))
  assert.match(adaptation, /노브 3개/)
  assert.match(adaptation, /anchor hue|노브 3개|시각 방향/)
  assert.match(adaptation, /이식 테스트/)
  assert.match(adaptation, /npx --yes @google\/design\.md lint DESIGN\.md/)
  assert.match(adaptation, /흔한 답/)
  assert.match(adaptation, /\.design\/log\.json/)
  assert.match(adaptation, /체크리스트 10문항/)
  assert.match(adaptation, /확정된 스타일|섹션 구성|Fidelity|Adaptation/)
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
  const [skill, look, review] = await Promise.all([
    read('SKILL.md'),
    read('references/look.md'),
    read('references/review.md'),
  ])

  assert.match(skill, /5\. \*\*Look \(필수\)\.\*\*/)
  assert.match(skill, /scripts\/render\.mjs/)
  // Code output keeps the renderer gate; design/prototype output is reviewed in its agreed
  // editing environment and must not fabricate code metrics.
  assert.match(skill, /Look \(필수\)/)
  assert.match(look, /코드.*정적 하네스|정적 하네스.*코드/)
  assert.match(look, /디자인\/프로토타입.*편집 환경/)
  assert.match(review, /없는 metrics를 만들어 채우지 않는다/)
  assert.match(look, /\*\*반드시\*\* 돈다/)
  assert.match(look, /scripts\/render\.mjs --in/)
  assert.match(look, /gates\.json/)
  assert.match(look, /yes\/no로만/)
  // Adoption is a three-condition rule, not a count comparison: a genuine fix that costs one
  // unrelated check must still be adoptable, and a critical regression hidden inside a higher
  // total must still be rejected.
  assert.match(look, /하드 게이트/)
  assert.match(look, /하드 게이트[^\n]*모든 항목[^\n]*통과/)
  assert.doesNotMatch(look, /실패 수가 늘지 않는다/)
  assert.match(look, /치명적 무퇴행/)
  assert.match(look, /겨눈 결함이 실제로 고쳐졌거나/)
  assert.match(look, /총점에 숨은 치명적 회귀는 개선이 아니다/)
  assert.doesNotMatch(look, /통과 수가 늘었을 때만 r2를 채택/)
  // The loop finishes inside one user request instead of asking to continue.
  assert.match(look, /첫 렌더 1회 \+ 보수 최대 2회/)
  assert.match(look, /2라운드 연속[^\n]*정지/)
  // A static harness and a running app are not the same evidence.
  assert.match(look, /validated: actual-app/)
  assert.match(look, /validated: surrogate/)
  assert.match(look, /`VERIFIED`를 발급하지 않고/)
  assert.match(look, /impeccable critique[\s\S]*두 번째 의견/)
})

test('source ownership and route scope bound reference reuse without banning licensed materials', async () => {
  const [skill, oneShot, reference] = await Promise.all([
    read('SKILL.md'),
    read('references/one-shot.md'),
    read('references/reference-pack.md'),
  ])
  const firstRule = sectionOf(skill, '## 상시 규칙 12').split(/\n2\. /)[0]
  assert.match(firstRule, /사용자 소유 소스[\s\S]*Fidelity/)
  assert.match(oneShot, /scope=full/)
  assert.match(oneShot, /라이선스가 허용/)
  assert.match(reference, /라이선스가 허용/)
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
  // Values a component would otherwise hardcode (the kbd scrim, the modal backdrop) live here.
  assert.match(tokens, /--scrim:/)
  assert.match(tokens, /--backdrop:/)
})

test('exemplars reference tokens only — no literal colors in component markup', async () => {
  for (const exemplar of EXEMPLARS.filter((file) => file.endsWith('.html'))) {
    const html = await read(`exemplars/${exemplar}`)
    assert.match(html, /tokens\.css/, `${exemplar}: must link tokens.css`)
    assert.doesNotMatch(html, /#[0-9a-f]{6}\b/i, `${exemplar}: hex color literal`)
    assert.doesNotMatch(html, /\b(rgb|hsl)a?\(/, `${exemplar}: rgb/hsl literal`)
    assert.match(html, /var\(--/, `${exemplar}: must use tokens`)
    assert.match(html, /<html lang="(ko|en)"/, `${exemplar}: must declare its language`)
    // The contract the render actually enforces: colour and font literals may live in a
    // :root/.dark token block and nowhere else. `oklch(from var(--token) …)` is derivation, not a
    // literal, so it does not count.
    const scan = scanSourceText(html)
    assert.equal(scan.colors, 0, `${exemplar}: ${scan.colors} colour literal(s) outside the token block`)
    assert.equal(scan.fontFamilies, 0, `${exemplar}: font-family literal outside the token block`)
    assert.ok(scan.tokenReferences > 0, `${exemplar}: must reference tokens`)
  }

  // Literal px radii are a known, measured defect in the older compositions: the render's
  // literalRatio gate reads 0.107 / 0.055 / 0.087 for them today. The pack-built composition shows
  // the target state at 0.000. This pin fails if a composition regresses, and fails equally if one
  // is fixed without updating the number, so the debt cannot drift quietly.
  const ratios = {}
  for (const exemplar of EXEMPLARS.filter((file) => file.startsWith('compositions/'))) {
    const scan = scanSourceText(await read(`exemplars/${exemplar}`))
    ratios[exemplar] = Number((scan.literalValues / (scan.literalValues + scan.tokenReferences || 1)).toFixed(3))
  }
  assert.deepEqual(ratios, {
    'compositions/app-shell.html': 0.044,
    'compositions/fintech-home.html': 0.107,
    'compositions/marketing-hero.html': 0.087,
    // Built entirely from a Reference Pack: every value is a token, so nothing is left over.
    'compositions/pack-developer-platform.html': 0,
  })
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
  // The measurable loop-line requirement is code-only; design/prototype output records observed
  // frame/preview evidence instead of invented metrics.
  assert.match(review, /코드 결과는[\s\S]*loop:[\s\S]*디자인 결과는[\s\S]*프레임\/미리보기/)
  assert.match(review, /검증 필요 가정|remaining uncertainty|미확정/)
  assert.doesNotMatch(review, /review: T\d H\d/)
  for (const stage of ['## Funnel', '## Impression', '## Interaction', '## Conversion', '## Retention']) {
    assert.ok(ux.includes(stage), `missing stage ${stage}`)
  }
})

test('starts builds from exemplars and composite blocks instead of a blank div', async () => {
  const [skill, study] = await Promise.all([read('SKILL.md'), read('references/reference-study.md')])

  assert.match(skill, /실제 콘텐츠|복수 섹션|섹션 구성/)
  assert.match(skill, /실제 콘텐츠|복수 섹션|섹션 구성/)
  assert.match(study, /실제 콘텐츠|복수 섹션|섹션 구성/)
  assert.match(study, /원본|스타일|slop|유지할|조정할/)
  assert.match(study, /반복|패턴|공통/)
  assert.match(study, /한 개|브랜드|선택|출처/)
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

test('routes a named brand through an evidence-graded pack and never through the name alone', async () => {
  const [skill, pack] = await Promise.all([read('SKILL.md'), read('references/reference-pack.md')])

  assert.match(skill, /\*\*Reference-informed\*\*/)
  assert.match(skill, /pack\.mjs --route/)
  assert.match(skill, /\*\*브랜드 이름은 증거가 아니다\*\*/)
  for (const grade of ['`observed`', '`estimated`', '`unverified`']) assert.ok(pack.includes(grade), grade)
  assert.match(pack, /이름은 증거가 아니다/)
  assert.match(pack, /브랜드 충실도를 주장하지 않는다/)
  assert.match(pack, /우회하지 않는다/)
  assert.match(pack, /scripts\/observe\.mjs/)
  assert.match(pack, /하나의 시각 시스템|섹션 출처는 여러 개|여러 팩/)
  assert.match(pack, /라이선스\(SPDX\) · 버전/)
})

test('diversity applies only to unlocked screens, so a locked system may repeat its macro structure', async () => {
  const [adaptation, oneShot] = await Promise.all([read('references/adaptation.md'), read('references/one-shot.md')])

  // The old text forbade repeating a macro structure while also locking the system that produces
  // it. The rule now keys on `locked`, and the knob list no longer claims to own macro structure.
  assert.match(adaptation, /`locked: true`면 \*\*매크로구조를 반복해도 된다/)
  assert.match(adaptation, /`locked: false`[\s\S]{0,300}매크로구조가 같은 이유를 확인/)
  assert.match(adaptation, /노브 밖|상태색|시각 방향/)
  assert.doesNotMatch(adaptation, /모든 섹션에 부적합한 구도를 강제/)
  assert.match(adaptation, /"locked"/)
  assert.match(oneShot, /잠금과 다양성|하나의 스타일|여러 출처/)
})

test('one-shot fixes a precedence order, answers without asking, and scopes states per component', async () => {
  const [skill, oneShot] = await Promise.all([read('SKILL.md'), read('references/one-shot.md')])

  assert.match(skill, /one-shot\.md/)
  // Safety and accessibility outrank the reference; the reference outranks the lineage; craft
  // defaults are last, so an observed value is not overruled by a taste rule.
  const order = [
    '안전 · 권한 · 법',
    '접근성 하한',
    '사용자 소유 소스',
    'Reference Pack의 observed',
    '계보(lineage)의 기본값',
    'craft 기본값',
  ]
  let cursor = oneShot.indexOf('## 1.')
  for (const step of order) {
    const index = oneShot.indexOf(step, cursor)
    assert.ok(index > cursor, `precedence out of order at ${step}`)
    cursor = index
  }
  assert.match(oneShot, /5–7단은 법이 아니라 기본값이다/)
  assert.match(oneShot, /필수 정보와 시각 방향을 확정|중요한 미확정 정보는 질문/)
  assert.match(oneShot, /NEEDS_DECISION/)
  // States belong to component roles, not to every element.
  assert.match(oneShot, /## 5\. 상태\(state\)는 컴포넌트마다 다르다/)
  assert.match(oneShot, /정적 텍스트 · 이미지 · 배지 \| 없음/)
  assert.doesNotMatch(skill, /상태 8종/)
  // Palette and font limits count families and roles, not raw token counts.
  assert.match(oneShot, /## 6\. 색 · 폰트 수 — 개수가 아니라 가족과 역할/)
  assert.match(skill, /hue 가족 3–5/)
})

test('composition workflow exposes adaptive discovery and an autonomous handoff', async () => {
  const [skill, discovery, artDirection, composition, cases] = await Promise.all([
    read('SKILL.md'),
    read('references/discovery.md'),
    read('references/art-direction.md'),
    read('references/section-composition.md'),
    readFile(join(skillDirectory, 'evals/interaction-cases.json'), 'utf8'),
  ])
  for (const reference of ['discovery.md', 'art-direction.md', 'section-composition.md']) {
    assert.match(skill, new RegExp(reference.replace('.', '\\.')))
  }
  assert.match(discovery, /grill|adaptive|적응형/i)
  assert.match(discovery, /질문|question/i)
  assert.match(discovery, /미확정|unknown|unresolved/i)
  assert.match(artDirection, /무드보드|moodboard/i)
  assert.match(artDirection, /2[–-]3|2 ~ 3|2~3/)
  assert.match(composition, /섹션|section/i)
  assert.match(composition, /MCP|컴포넌트|component/i)
  assert.match(composition, /공통|shared|token/i)

  const scenarios = JSON.parse(cases)
  assert.equal(scenarios.version, 1)
  assert.ok(scenarios.cases.length >= 6)
  for (const scenario of scenarios.cases) {
    assert.match(scenario.id, /^[a-z0-9-]+$/)
    assert.ok(scenario.reply, `${scenario.id}: user reply is required`)
    assert.ok(scenario.expected, `${scenario.id}: observable outcome is required`)
    assert.ok(scenario.setup?.workspace, `${scenario.id}: isolated setup is required`)
    assert.ok(Array.isArray(scenario.setup?.facts), `${scenario.id}: setup facts are required`)
    assert.ok(Array.isArray(scenario.setup?.artifacts), `${scenario.id}: setup artifacts are required`)
  }
  const ids = new Set(scenarios.cases.map(({ id }) => id))
  for (const id of [
    'reply-changes-direction',
    'delegated-direction',
    'unresolved-fact',
    'exact-fidelity',
    'mixed-sections',
    'mcp-code-only',
    'korean-mobile',
  ]) {
    assert.ok(ids.has(id), `missing behavioral case ${id}`)
  }
})

test('composition workflow treats brand, output permissions, and feedback as explicit contracts', async () => {
  const [skill, discovery, brand, inputTemplate, oneShot, cases] = await Promise.all([
    read('SKILL.md'),
    read('references/discovery.md'),
    read('references/brand-intake.md'),
    read('references/design-input-template.md'),
    read('references/one-shot.md'),
    readFile(join(skillDirectory, 'evals/interaction-cases.json'), 'utf8'),
  ])

  for (const reference of ['brand-intake.md', 'design-input-template.md']) {
    assert.match(skill, new RegExp(reference.replace('.', '\\.')), `${reference} is not wired into SKILL.md`)
  }
  assert.match(brand, /원본.*버전|버전.*원본/)
  assert.match(brand, /provided|extracted|none|proposal-needs-approval|N\/A/)
  assert.match(brand, /관찰된 사실|승인된 정책|approved|authoritative/i)
  assert.match(brand, /충돌.*사용자|사용자.*충돌/)
  assert.match(discovery, /읽기|쓰기|read|write/i)
  assert.match(discovery, /편집 가능|editable|결과물.*위치|location/i)
  assert.match(discovery, /대체하지|몰래.*대체|silently substitute/i)
  assert.match(oneShot, /이미.*승인|승인.*실행|반복.*묻지|permission loop/i)
  assert.match(inputTemplate, /토큰|자산|결과물|편집/)

  const scenarios = JSON.parse(cases)
  const ids = new Set(scenarios.cases.map(({ id }) => id))
  for (const id of [
    'brand-conflict',
    'no-token-system',
    'editable-target-unavailable',
    'prior-approval-execution',
    'scoped-feedback',
  ]) {
    assert.ok(ids.has(id), `missing behavioral case ${id}`)
  }
})

// These checks cover the published contract and fixture coverage, not live visual quality.
test('content-fit review separates delivery readiness from revision improvement', async () => {
  const [look, composition, sources, rawCases] = await Promise.all([
    read('references/look.md'),
    read('references/section-composition.md'),
    read('references/reference-sources.md'),
    readFile(join(skillDirectory, 'evals/interaction-cases.json'), 'utf8'),
  ])
  for (const status of ['technical:', 'design-self-review:', 'user-acceptance:']) {
    assert.ok(look.includes(status), `missing independent result field ${status}`)
  }
  assert.ok(composition.includes('reference-sources.md'))
  assert.ok(sources.includes('document-only'))
  const cases = JSON.parse(rawCases).cases
  assert.equal(new Set(cases.map(({ id }) => id)).size, cases.length)
  for (const id of [
    'content-without-images',
    'essential-image-unavailable',
    'approved-whitespace',
    'demo-consent-only',
    'structure-rejected',
    'budget-exhausted-structure',
  ]) {
    assert.ok(
      cases.some((entry) => entry.id === id),
      `missing regression scenario ${id}`,
    )
  }
})

// Document/fixture coverage only; live clone execution is evaluated separately.
test('multi-site clone study has a routed, bounded proposal and distinct evidence outputs', async () => {
  const [sources, study, rawCases] = await Promise.all([
    read('references/reference-sources.md'),
    read('references/clone-study.md'),
    readFile(join(skillDirectory, 'evals/interaction-cases.json'), 'utf8'),
  ])
  assert.ok(sources.includes('clone-study.md'))
  for (const field of ['source-observation', 'reference-clone', 'content-variant', 'final-composition']) {
    assert.ok(study.includes(field), `missing distinct artifact role ${field}`)
  }
  const cases = JSON.parse(rawCases).cases
  for (const id of [
    'multi-site-study-proposal',
    'approved-clone-study',
    'clone-tool-unavailable',
    'clone-fit-mismatch',
  ]) {
    assert.ok(
      cases.some((entry) => entry.id === id),
      `missing behavioral case ${id}`,
    )
  }
})
