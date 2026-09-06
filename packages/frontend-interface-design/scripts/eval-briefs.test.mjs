import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const evalDirectory = join(packageDirectory, 'skills/frontend-interface-design/evals')

async function readJson(name) {
  return JSON.parse(await readFile(join(evalDirectory, name), 'utf8'))
}

const TYPES = [
  'saas-dashboard',
  'marketing-landing',
  'commerce-pdp',
  'admin-form',
  'content-reading',
  'fintech-mobile-home',
  'data-table-tool',
  'onboarding',
]
// The output contract forbids invented statistics; a brief that carries them would license slop.
const INVENTED_STATS = [/\d+%/, /\d+k\+/i, /×/]

test('briefs cover the eight agreed screen types, half in korean and half in english, with unique ids', async () => {
  const corpus = await readJson('briefs.json')

  assert.equal(corpus.version, 1)
  assert.equal(corpus.briefs.length, 8)
  assert.equal(new Set(corpus.briefs.map((brief) => brief.id)).size, 8)
  assert.deepEqual(corpus.briefs.map((brief) => brief.type).sort(), [...TYPES].sort())
  assert.equal(corpus.briefs.filter((brief) => brief.lang === 'ko').length, 4)
  assert.equal(corpus.briefs.filter((brief) => brief.lang === 'en').length, 4)
})

test('every brief carries audience, three mood words, one memorable element, references and ten yes/no checks', async () => {
  const corpus = await readJson('briefs.json')

  for (const brief of corpus.briefs) {
    assert.match(brief.id, /^b\d{2}-[a-z-]+-(?:ko|en)$/, `${brief.id}: id shape`)
    assert.ok(brief.id.endsWith(`-${brief.lang}`), `${brief.id}: id suffix must match lang`)
    assert.equal(typeof brief.title, 'string')
    assert.ok(brief.prompt.trim().length > 200, `${brief.id}: prompt too short to brief a screen`)
    assert.equal(typeof brief.audience, 'string')
    assert.equal(brief.mood.length, 3, `${brief.id}: mood must be three words`)
    assert.equal(typeof brief.memorable, 'string')
    assert.ok(brief.references.length >= 3, `${brief.id}: references`)
    assert.equal(brief.checklist.length, 10, `${brief.id}: checklist must have ten questions`)
    for (const question of brief.checklist)
      assert.match(question, /[?？]$/, `${brief.id}: "${question}" is not a question`)
    if (brief.lang === 'ko')
      assert.ok(
        brief.checklist.some((question) => /한글/.test(question)),
        `${brief.id}: ko brief must check hangul line breaking`,
      )
  }
})

test('no brief prompt smuggles in invented statistics', async () => {
  const corpus = await readJson('briefs.json')

  for (const brief of corpus.briefs) {
    for (const pattern of INVENTED_STATS)
      assert.doesNotMatch(brief.prompt, pattern, `${brief.id}: prompt contains an invented stat`)
    assert.match(brief.prompt, /placeholder/i, `${brief.id}: prompt must ask for placeholder content`)
  }
})

test('gate overrides only name gates that gates.json defines, with the same max/min kind', async () => {
  const [corpus, defaults] = await Promise.all([readJson('briefs.json'), readJson('gates.json')])

  assert.equal(defaults.version, 1)
  for (const [name, gate] of Object.entries(defaults.gates)) {
    const shape = typeof gate === 'number' ? { max: gate } : gate
    assert.ok(Number.isFinite(shape.max) || Number.isFinite(shape.min), `gates.json ${name}: needs max or min`)
    if (shape.whenLang) assert.ok(['ko', 'en'].includes(shape.whenLang), `gates.json ${name}: whenLang`)
  }
  for (const brief of corpus.briefs) {
    for (const [name, override] of Object.entries(brief.gates ?? {})) {
      assert.ok(Object.hasOwn(defaults.gates, name), `${brief.id}: unknown gate ${name}`)
      if (typeof override === 'object') {
        assert.ok(
          Number.isFinite(override.max) || Number.isFinite(override.min),
          `${brief.id}: gate ${name} needs max or min`,
        )
      }
      const reference = defaults.gates[name]
      if (typeof reference === 'object' && reference.whenLang)
        assert.equal(brief.lang, reference.whenLang, `${brief.id}: ${name} is a ${reference.whenLang}-only gate`)
    }
  }
})
