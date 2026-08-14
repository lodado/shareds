import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const skillDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const referenceDirectory = join(skillDirectory, 'references')

const REQUIRED_SECTIONS = [
  '## 1. 언제 읽는가',
  '## 2. 권장 구조',
  '## 3. 구현',
  '## 4. 판단이 갈리는 지점',
  '## 5. 함정',
  '## 6. 남길 검증',
  '## 7. 배치',
]

const CHOICE_HEADER = /^\|\s*선택\s*\|\s*기본 추천\s*\|\s*다른 선택이 맞는 때\s*\|/
const PITFALL_HEADER = /^\|\s*증상\s*\|\s*원인\s*\|\s*교정\s*\|/

async function read(relativePath) {
  return readFile(join(skillDirectory, relativePath), 'utf8')
}

async function readReferences() {
  const names = (await readdir(referenceDirectory)).filter((name) => name.endsWith('.md')).sort()

  assert.ok(names.length > 0, 'references 디렉터리에 문서가 없다')

  return Promise.all(
    names.map(async (name) => ({ name, body: await readFile(join(referenceDirectory, name), 'utf8') })),
  )
}

function sectionOf(body, heading, name) {
  const start = body.indexOf(`\n${heading}\n`)
  assert.notEqual(start, -1, `${name}: '${heading}' 섹션이 없다`)

  const rest = body.slice(start + heading.length)
  const end = rest.indexOf('\n## ')
  return end === -1 ? rest : rest.slice(0, end)
}

function tableRows(section, headerPattern, name, label) {
  const lines = section.split('\n')
  const headerIndex = lines.findIndex((line) => headerPattern.test(line))

  assert.notEqual(headerIndex, -1, `${name}: ${label} 표 헤더를 찾지 못했다`)

  const rows = []
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.startsWith('|')) break
    rows.push(
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    )
  }

  return rows
}

test('every reference follows the seven-section guide shape', async () => {
  for (const { name, body } of await readReferences()) {
    let searchFrom = 0

    for (const section of REQUIRED_SECTIONS) {
      const index = body.indexOf(`\n${section}\n`, searchFrom)
      assert.notEqual(index, -1, `${name}: '${section}' 섹션이 없거나 순서가 어긋났다`)
      searchFrom = index + section.length
    }
  }
})

test('every reference opens with the core difficulty it exists to solve', async () => {
  for (const { name, body } of await readReferences()) {
    assert.match(body, /^# .+ 구현 가이드\n\n\*\*핵심 어려움\*\*:/, `${name}: 핵심 어려움 요약으로 시작하지 않는다`)
  }
})

test('every reference ships runnable code, not just prose', async () => {
  for (const { name, body } of await readReferences()) {
    const implementation = sectionOf(body, '## 3. 구현', name)
    const blocks = implementation.match(/```(ts|tsx)\n[\s\S]*?```/g) ?? []

    assert.ok(blocks.length >= 2, `${name}: 구현 섹션의 코드 블록이 ${blocks.length}개뿐이다`)

    const longest = Math.max(...blocks.map((block) => block.split('\n').length))
    assert.ok(longest >= 8, `${name}: 구현 코드가 구조를 보여주기에 너무 짧다`)
  }
})

test('every reference explains the reasoning behind its recommended structure', async () => {
  for (const { name, body } of await readReferences()) {
    const structure = sectionOf(body, '## 2. 권장 구조', name)
    const claims = structure.match(/\*\*[^*]+\*\*/g) ?? []

    assert.ok(claims.length >= 3, `${name}: 권장 구조의 지침이 ${claims.length}개뿐이다`)
    assert.ok(structure.split('\n').length >= 12, `${name}: 권장 구조에 근거 설명이 없다`)
  }
})

test('every reference separates product choices from failure modes', async () => {
  for (const { name, body } of await readReferences()) {
    const choices = tableRows(sectionOf(body, '## 4. 판단이 갈리는 지점', name), CHOICE_HEADER, name, '선택')
    const pitfalls = tableRows(sectionOf(body, '## 5. 함정', name), PITFALL_HEADER, name, '함정')

    assert.ok(choices.length >= 5, `${name}: 갈리는 선택이 ${choices.length}개뿐이다`)
    assert.ok(pitfalls.length >= 5, `${name}: 함정이 ${pitfalls.length}개뿐이다`)

    for (const row of choices) {
      assert.equal(row.length, 3, `${name}: 선택 행 '${row[0]}'의 열이 3개가 아니다`)
      // 기본 추천이 비어 있으면 가이드가 아니라 질문지다.
      assert.ok(row[1].length > 0, `${name}: 선택 '${row[0]}'에 기본 추천이 없다`)
      assert.ok(row[2].length > 0, `${name}: 선택 '${row[0]}'에 예외 조건이 없다`)
    }

    for (const row of pitfalls) {
      assert.equal(row.length, 3, `${name}: 함정 행 '${row[0]}'의 열이 3개가 아니다`)
      assert.ok(row[2].length > 0, `${name}: 함정 '${row[0]}'에 교정 방법이 없다`)
    }
  }
})

test('every reference keeps its verification and placement duties', async () => {
  for (const { name, body } of await readReferences()) {
    assert.match(body, /MSW handler로 세운다/, `${name}: MSW 경계 규칙이 없다`)
    assert.match(body, /임의 sleep으로 GREEN을 만들지 않는다/, `${name}: sleep 금지 규칙이 없다`)
    assert.match(body, /<slice>\/api\/__mocks__\//, `${name}: mock 배치 규칙이 없다`)
    assert.match(body, /새 폴더 규칙을\s+발명하지 않는다/, `${name}: 비 FSD 레포 매핑 규칙이 없다`)
    assert.match(body, /응답 순서 역전/, `${name}: 응답 순서 역전 검증 의무가 없다`)
    assert.match(body, /\*\*총 횟수\*\*|\*\*총 1회\*\*/, `${name}: 요청 횟수 검증 의무가 없다`)
  }
})

test('the routing table and the reference directory stay in sync', async () => {
  const skill = await read('SKILL.md')
  const references = await readReferences()

  for (const { name } of references) {
    assert.match(skill, new RegExp(`references/${name.replace('.', '\\.')}`), `SKILL.md 라우팅에 ${name}이 없다`)
  }

  const routed = [...skill.matchAll(/references\/([\w-]+\.md)/g)].map((match) => match[1])
  const known = new Set(references.map(({ name }) => name))

  for (const name of routed) {
    assert.ok(known.has(name), `SKILL.md가 존재하지 않는 ${name}을 가리킨다`)
  }
})

test('SKILL.md presents itself as a guide and defers to the target repo', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /검증된 구현 방법/)
  assert.match(skill, /레포가 우선이다/)
  assert.match(skill, /설치된\n?\s*버전의 문서로 확인/)
  assert.match(skill, /그대로 붙여 넣는 스니펫이\n?\s*아니라/)
  assert.match(skill, /frontend-oracle-design/)

  for (const section of REQUIRED_SECTIONS) {
    assert.match(skill, new RegExp(section.replace('## ', '').replace(/\./g, '\\.')))
  }
})

test('pins the load-bearing techniques that must never drift out', async () => {
  const reference = Object.fromEntries(
    (await readReferences()).map(({ name, body }) => [name.replace('.md', ''), body]),
  )

  assert.match(reference['infinite-scroll'], /cursor를 쓴다/)
  assert.match(reference['infinite-scroll'], /IntersectionObserver/)

  assert.match(reference['search-typeahead'], /query key에 넣는다/)
  assert.match(reference['search-typeahead'], /compositionstart|onCompositionStart/)
  assert.match(reference['search-typeahead'], /normalize\('NFC'\)/)

  assert.match(reference.feed, /델타가 아니라 원하는 최종 상태/)
  assert.match(reference.feed, /cancelQueries/)

  assert.match(reference.chat, /clientId/)
  assert.match(reference.chat, /mergeIncoming/)

  assert.match(reference['media-upload'], /fetch`로는 안 된다|fetch`는 업로드 진행 이벤트를 주지 않는다/)
  assert.match(reference['media-upload'], /imageOrientation: 'from-image'/)
  assert.match(reference['media-upload'], /revokeObjectURL/)

  // 결제 문서는 이중 결제를 막는 기법이 사라지면 안 된다.
  assert.match(reference['payment-flow'], /`성공`·`실패` 두 개로 만들지 않는다/)
  assert.match(reference['payment-flow'], /unconfirmed/)
  assert.match(reference['payment-flow'], /재시도에도 같은 값을 유지/)
  assert.match(reference['payment-flow'], /단방향으로만 전이/)
  assert.match(reference['payment-flow'], /이 목록은 축약 대상이 아니다/)

  assert.match(reference['notification-realtime'], /visibilityState/)
  assert.match(reference['notification-realtime'], /BroadcastChannel/)

  assert.match(reference['map-location'], /normalizeBounds/)
  assert.match(reference['map-location'], /주소에 남기지 않는다/)

  assert.match(reference['commerce-cart'], /델타가 아니라 최종 수량/)
  assert.match(reference['commerce-cart'], /결제 진입 시 재검증|결제로 넘어갈 때 한 번/)

  assert.match(reference['multi-step-form'], /현재 단계를 주소로 표현한다/)
  assert.match(reference['multi-step-form'], /민감한 값은 주소에 넣지 않는다/)
})
