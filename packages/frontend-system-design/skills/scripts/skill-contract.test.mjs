import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const skillDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const referenceDirectory = join(skillDirectory, 'references')
const packageDirectory = dirname(skillDirectory)
const repositoryDirectory = dirname(dirname(packageDirectory))

const REQUIRED_SECTIONS = [
  '## 1. 언제 읽는가',
  '## 2. 권장 구조',
  '## 3. 구현',
  '## 4. 판단이 갈리는 지점',
  '## 5. 함정',
  '## 6. 남길 검증',
  '## 7. 배치',
  '## 8. 근거',
]

const CHOICE_HEADER = /^\|\s*선택\s*\|\s*추천안 \(정책 아님\)\s*\|\s*다른 선택이 맞는 때\s*\|/
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

test('every reference follows the eight-section guide shape', async () => {
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

test('every reference is subordinate to the active Oracle contract', async () => {
  for (const { name, body } of await readReferences()) {
    assert.match(body, /> \*\*Oracle 우선:\*\*/, `${name}: Oracle 우선 계약이 없다`)
    assert.match(body, /frontend-oracle-design/, `${name}: 선행 스킬 이름이 없다`)
    assert.match(body, /ORACLE_READY/, `${name}: Oracle 준비 상태를 요구하지 않는다`)
    assert.match(body, /정책 출처가 아니다/, `${name}: 추천을 정책과 구분하지 않는다`)
    assert.match(body, /구현 선택지/, `${name}: 예제 코드의 권한이 불명확하다`)
    assert.doesNotMatch(body, /기본값이 있지만/, `${name}: 추천안을 기본 정책처럼 표현한다`)
  }
})

test('every reference ships structural implementation code, not just prose', async () => {
  for (const { name, body } of await readReferences()) {
    const implementation = sectionOf(body, '## 3. 구현', name)
    const blocks = implementation.match(/```(ts|tsx)\n[\s\S]*?```/g) ?? []

    assert.ok(blocks.length >= 2, `${name}: 구현 섹션의 코드 블록이 ${blocks.length}개뿐이다`)

    const longest = Math.max(...blocks.map((block) => block.split('\n').length))
    assert.ok(longest >= 8, `${name}: 구현 코드가 구조를 보여주기에 너무 짧다`)
  }
})

test('every reference maps material claims to official or upstream sources', async () => {
  for (const { name, body } of await readReferences()) {
    const sources = sectionOf(body, '## 8. 근거', name)
    const sourceRows = sources.split('\n').filter((line) => /\[S\d+\]/.test(line))
    const sourceIds = new Set()

    assert.ok(sourceRows.length > 0, `${name}: 근거 식별자가 없다`)
    for (const row of sourceRows) {
      const match = row.match(/^\|\s*\[S(\d+)\]\s*\|\s*(표준|공식|upstream)\s*\|.*https:\/\//i)
      assert.ok(match, `${name}: 근거 행 '${row}'에 등급 또는 URL이 없다`)
      sourceIds.add(match[1])
    }

    const citations = [...body.slice(0, body.indexOf('\n## 8. 근거\n')).matchAll(/\[S(\d+)\]/g)]
    assert.ok(citations.length > 0, `${name}: 본문의 주장이 근거에 연결되지 않는다`)
    for (const [, id] of citations) {
      assert.ok(sourceIds.has(id), `${name}: 본문의 [S${id}]에 해당하는 근거 행이 없다`)
    }
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
      // 추천안은 정책이 아니지만, 비교할 구체안이 없으면 유용한 설계 참고서가 아니다.
      assert.ok(row[1].length > 0, `${name}: 선택 '${row[0]}'에 비교할 추천안이 없다`)
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

test('SKILL.md is an Oracle-dependent companion and defers to the target repo', async () => {
  const skill = await read('SKILL.md')

  assert.match(skill, /검증된 구현 방법/)
  assert.match(skill, /레포가 우선이다/)
  assert.match(skill, /설치된\n?\s*버전의 문서로 확인/)
  assert.match(skill, /그대로 붙여 넣는 스니펫이\n?\s*아니라/)
  assert.match(skill, /frontend-oracle-design/)
  assert.match(skill, /frontend-oracle-design.*먼저/s)
  assert.match(skill, /ORACLE_READY/)
  assert.match(skill, /NEEDS_DECISION/)
  assert.match(skill, /VALID_RED/)
  assert.match(skill, /단독으로 실행하지 않는다/)
  assert.doesNotMatch(skill, /단독으로 써도 된다/)
  assert.doesNotMatch(skill, /나머지는 기본값대로 진행/)

  for (const section of REQUIRED_SECTIONS) {
    assert.match(skill, new RegExp(section.replace('## ', '').replace(/\./g, '\\.')))
  }
})

test('SKILL.md defines the compact result returned after a reference is loaded', async () => {
  const skill = await read('SKILL.md')

  for (const label of ['로드한 reference', '필수 정책 질문', '구현 불변식', '버전 확인', 'Oracle 증거 매핑', '근거']) {
    assert.match(skill, new RegExp(label), `SKILL.md에 '${label}' 로드 결과 항목이 없다`)
  }
})

test('the Oracle remains the orchestrator when it loads system-design references', async () => {
  const oracleSkill = await readFile(
    join(repositoryDirectory, 'packages/frontend-oracle-design/skills/SKILL.md'),
    'utf8',
  )

  assert.match(oracleSkill, /frontend-system-design/)
  assert.match(oracleSkill, /policy candidate/)
  assert.match(oracleSkill, /Oracle\s+intake and control|Oracle's orchestration/)
  assert.doesNotMatch(oracleSkill, /기본 추천과 다를 항목만/)
})

test('plugin metadata publishes the Oracle-first contract under a new cache identity', async () => {
  const packageJson = JSON.parse(await readFile(join(packageDirectory, 'package.json'), 'utf8'))
  const codexPlugin = JSON.parse(await readFile(join(packageDirectory, '.codex-plugin/plugin.json'), 'utf8'))
  const claudePlugin = JSON.parse(await readFile(join(packageDirectory, '.claude-plugin/plugin.json'), 'utf8'))
  const marketplace = JSON.parse(await readFile(join(repositoryDirectory, '.claude-plugin/marketplace.json'), 'utf8'))
  const listing = marketplace.plugins.find((plugin) => plugin.name === 'frontend-system-design')

  assert.equal(packageJson.version, '0.2.1')
  assert.equal(codexPlugin.version, '0.2.1')
  assert.equal(claudePlugin.version, '0.2.1')
  assert.equal(listing?.version, '0.2.1')

  for (const description of [
    packageJson.description,
    codexPlugin.description,
    claudePlugin.description,
    listing?.description,
  ]) {
    assert.match(description, /Oracle/i)
  }
})

test('pins the load-bearing techniques that must never drift out', async () => {
  const reference = Object.fromEntries(
    (await readReferences()).map(({ name, body }) => [name.replace('.md', ''), body]),
  )

  assert.match(reference['infinite-scroll'], /cursor를 쓴다/)
  assert.match(reference['infinite-scroll'], /IntersectionObserver/)
  assert.match(reference['infinite-scroll'], /useSuspenseInfiniteQuery/)
  assert.match(reference['infinite-scroll'], /onLoadMore/)
  assert.match(reference['infinite-scroll'], /새 `status` union으로 재포장하지 않는다/)
  assert.match(
    reference['infinite-scroll'],
    /query\.hasNextPage\s*&&\s*!query\.isFetchingNextPage\s*&&\s*!query\.isFetchNextPageError/,
  )
  assert.match(reference['infinite-scroll'], /QueryErrorResetBoundary/)
  assert.match(reference['infinite-scroll'], /Error Boundary/)
  assert.match(
    reference['infinite-scroll'],
    /`enabled`,[\s\S]*placeholder[\s\S]*취소 계약[\s\S]*일반 `useInfiniteQuery`/,
  )
  assert.match(reference['infinite-scroll'], /더 보기\n\s*<\/button>/)

  assert.match(reference['search-typeahead'], /query key에 넣는다/)
  assert.match(reference['search-typeahead'], /compositionstart|onCompositionStart/)
  assert.match(reference['search-typeahead'], /normalize\('NFC'\)/)
  assert.match(reference['search-typeahead'], /aria-expanded/)

  assert.match(reference.feed, /델타가 아니라 원하는 최종 상태/)
  assert.match(reference.feed, /cancelQueries/)
  assert.match(reference.feed, /최신 의도/)
  assert.match(reference.feed, /context\?\.intent === latestIntent\.current/)
  assert.match(reference.feed, /await queryClient\.cancelQueries\([\s\S]*intent !== latestIntent\.current/)
  assert.match(reference.feed, /이전 요청의 실패가 최신 의도를 덮지 않는지/)

  assert.match(reference.chat, /clientId/)
  assert.match(reference.chat, /mergeIncoming/)

  assert.match(reference['media-upload'], /fetch`로는 안 된다|fetch`는 업로드 진행 이벤트를 주지 않는다/)
  assert.match(reference['media-upload'], /imageOrientation: 'from-image'/)
  assert.match(reference['media-upload'], /revokeObjectURL/)
  assert.match(reference['media-upload'], /addEventListener\('abort'/)
  assert.match(reference['media-upload'], /signal\?\.aborted/)

  // 결제 문서는 이중 결제를 막는 기법이 사라지면 안 된다.
  assert.match(reference['payment-flow'], /`성공`·`실패` 두 개로 만들지 않는다/)
  assert.match(reference['payment-flow'], /unconfirmed/)
  assert.match(reference['payment-flow'], /재시도에도 같은 값을 유지/)
  assert.match(reference['payment-flow'], /단방향으로만 전이/)
  assert.match(reference['payment-flow'], /새로고침·복귀를 견디는 저장소/)
  assert.match(reference['payment-flow'], /확정된 결과는 다시 바뀌지 않는다/)
  assert.match(reference['payment-flow'], /nextPollDelay/)
  assert.match(reference['payment-flow'], /2 \*\* attempt/)
  assert.match(reference['payment-flow'], /이 목록은 축약 대상이 아니다/)

  assert.match(reference['notification-realtime'], /visibilityState/)
  assert.match(reference['notification-realtime'], /BroadcastChannel/)

  assert.match(reference['map-location'], /normalizeBounds/)
  assert.match(reference['map-location'], /주소에 남기지 않는다/)

  assert.match(reference['commerce-cart'], /델타가 아니라 최종 수량/)
  assert.match(reference['commerce-cart'], /결제 진입 시 재검증|결제로 넘어갈 때 한 번/)
  assert.match(reference['commerce-cart'], /최신 의도/)
  assert.match(reference['commerce-cart'], /latestIntents\.current\.get\(lineId\)/)
  assert.match(
    reference['commerce-cart'],
    /await queryClient\.cancelQueries\([\s\S]*intent !== latestIntents\.current\.get\(lineId\)/,
  )
  assert.match(reference['commerce-cart'], /이전 요청의 실패가 최신 의도를 덮지 않는지/)

  assert.match(reference['multi-step-form'], /현재 단계를 주소로 표현한다/)
  assert.match(reference['multi-step-form'], /민감한 값은 주소에 넣지 않는다/)
  assert.match(reference['multi-step-form'], /STEPS\.includes/)
})
