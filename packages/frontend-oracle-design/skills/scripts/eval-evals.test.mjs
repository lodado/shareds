import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { toEvals } from '../evals/to-skill-creator-evals.mjs'

const evalDirectory = join(dirname(dirname(fileURLToPath(import.meta.url))), 'evals')

test('evals.json is the skill-creator projection of the blackbox corpus and stays in sync', async () => {
  const corpus = JSON.parse(await readFile(join(evalDirectory, 'blackbox-corpus.json'), 'utf8'))
  const heldOut = JSON.parse(await readFile(join(evalDirectory, 'held-out.json'), 'utf8'))
  const boundary = JSON.parse(await readFile(join(evalDirectory, 'boundary-cases.json'), 'utf8'))
  const evals = toEvals(corpus, heldOut, { cases: [] }, boundary)

  assert.equal(evals.skill_name, 'frontend-oracle-design')
  assert.equal(evals.evals.length, corpus.cases.length + heldOut.cases.length + boundary.cases.length)

  const semantic = evals.evals.filter((entry) => entry.category === 'boundary-semantic')
  assert.equal(semantic.length, 17)
  assert.ok(semantic.every((entry) => entry.assertions.length >= 2))
  for (const entry of semantic) {
    const fixture = boundary.cases.find(({ id }) => id === entry.name)
    assert.equal(fixture.manualReviewOnly, true)
    assert.equal(entry.manualReviewOnly, true)
    assert.deepEqual(entry.assertions, fixture.assertions)
    assert.equal(entry.expected_output, fixture.expected_output)
    if (fixture.fixtureRef) assert.equal(entry.fixtureRef, fixture.fixtureRef)
    assert.doesNotMatch(
      entry.assertions.join('\n'),
      /The first line of the response is the lane header|The reported terminal state is GREEN|The verification report cites actual runs/,
    )
  }

  // held-out: 정답 출처가 저자가 아니라 실제 escape — mandela #4(verifier = designer)의 완화
  const r11b = evals.evals.find((entry) => entry.name === 'fod-ho-r11b')
  assert.equal(r11b.category, 'held-out-escape')
  assert.equal(r11b.assertions.length, 6)
  assert.ok(r11b.assertions.some((line) => /StrictMode/.test(line)))
  assert.ok(r11b.assertions.some((line) => /initialOffset/.test(line)))
  assert.ok(
    heldOut.cases.every((entry) => entry.source && entry.escapes.every((escape) => escape.class && escape.assertion)),
  )
  for (const entry of evals.evals) {
    assert.ok(entry.prompt.length > 0, `${entry.name} prompt`)
    assert.ok(entry.assertions.length >= (entry.category === 'boundary-semantic' ? 2 : 3), `${entry.name} assertions`)
    if (entry.category !== 'boundary-semantic')
      assert.match(entry.assertions[0], /^The first line of the response is the lane header/)
  }
  const oracleCase = evals.evals.find((entry) => entry.name === 'fod-bb-03')
  assert.ok(oracleCase.assertions.some((line) => /one user confirmation resolves and approves the card/.test(line)))
  const lowCase = evals.evals.find((entry) => entry.name === 'fod-bb-01')
  assert.ok(!lowCase.assertions.some((line) => /Draft Oracle/.test(line)))

  const checked = spawnSync(process.execPath, [join(evalDirectory, 'to-skill-creator-evals.mjs'), '--check'], {
    encoding: 'utf8',
  })
  assert.equal(checked.status, 0, checked.stderr)
})
