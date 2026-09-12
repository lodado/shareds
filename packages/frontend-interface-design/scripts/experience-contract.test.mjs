import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'

const root = new URL('../skills/frontend-interface-design/', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('experience planning is reachable before build and verified at delivery', async () => {
  const skill = await read('SKILL.md')
  const planning = skill.indexOf('references/experience-design.md')
  const build = skill.indexOf('2. **대표 구간을 만든다.**')
  assert.ok(planning >= 0 && build > planning, 'scope transitions before building the representative slice')
  const experience = await read('references/experience-design.md')
  for (const field of ['journey-review', 'reference-translation', 'motion-review', 'unobserved', 'reduced-motion']) {
    assert.ok(experience.includes(field), `missing evidence dimension: ${field}`)
  }
  for (const path of [
    'references/discovery.md',
    'references/look.md',
    'references/review.md',
    'references/ux-checklist.md',
  ]) {
    assert.ok((await read(path)).includes('experience-design.md'), `unreachable experience contract: ${path}`)
  }
})

test('experience regressions specify observable success and failure, not test-count success', async () => {
  const { cases } = JSON.parse(await read('evals/interaction-cases.json'))
  const selected = cases.filter(({ id }) => id.startsWith('experience-'))
  assert.equal(selected.length, 15)
  for (const entry of selected) {
    assert.ok(entry.expected && entry.failure && entry.evidence, `${entry.id}: missing behavioral oracle`)
    assert.ok(entry.setup.workspace && entry.setup.facts.length, `${entry.id}: missing bounded setup`)
  }
})
