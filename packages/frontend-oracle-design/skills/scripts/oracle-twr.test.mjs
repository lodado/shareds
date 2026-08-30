import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { parseLog, scoreCommits } from './oracle-twr.mjs'

const RS = '\u001e'

test('parseLog: RS 구분 레코드에서 hash·timestamp·subject·files를 읽는다', () => {
  const raw = `${RS}${'a'.repeat(40)} 1000 fix: null guard\nsrc/a.ts\nsrc/b.ts\n${RS}${'b'.repeat(40)} 2000 feat: add page\nsrc/c.ts\n`

  const commits = parseLog(raw)

  assert.equal(commits.length, 2)
  assert.equal(commits[0].timestamp, 1000)
  assert.deepEqual(commits[0].files, ['src/a.ts', 'src/b.ts'])
  assert.equal(commits[1].subject, 'feat: add page')
})

test('scoreCommits: bug-fix 커밋만 세고 최근 수정이 더 무겁다', () => {
  const commits = [
    { timestamp: 1000, subject: 'fix: old crash', files: ['src/old.ts'] },
    { timestamp: 2000, subject: 'feat: unrelated', files: ['src/feat.ts'] },
    { timestamp: 3000, subject: 'fix: fresh regression', files: ['src/hot.ts'] },
  ]

  const { bugFixCount, scores } = scoreCommits(commits)

  assert.equal(bugFixCount, 2)
  const byFile = new Map(scores.map((entry) => [entry.file, entry.score]))
  assert.equal(byFile.has('src/feat.ts'), false)
  assert.ok(byFile.get('src/hot.ts') > byFile.get('src/old.ts'))
  assert.equal(scores[0].file, 'src/hot.ts')
})

test('scoreCommits: prefix 필터와 bug-fix 0건 케이스', () => {
  const commits = [
    { timestamp: 1000, subject: 'fix: a', files: ['src/a.ts', 'docs/readme.md'] },
    { timestamp: 1000, subject: 'chore: b', files: ['src/b.ts'] },
  ]

  const filtered = scoreCommits(commits, ['src/'])
  assert.deepEqual(
    filtered.scores.map((entry) => entry.file),
    ['src/a.ts'],
  )

  const none = scoreCommits([{ timestamp: 1, subject: 'feat only', files: ['x'] }])
  assert.equal(none.bugFixCount, 0)
  assert.deepEqual(none.scores, [])
})
