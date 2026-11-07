import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const skill = dirname(dirname(fileURLToPath(import.meta.url)))
const read = (path) => readFileSync(join(skill, path), 'utf8')
const STEPS = readdirSync(join(skill, 'steps')).sort()
const KB = 1024

test('the skill is one entry page and six step documents within their size budgets', () => {
  assert.deepEqual(STEPS, ['1-spec.md', '2-proof.md', '3-generate.md', '4-red.md', '5-green.md', '6-review.md'])
  assert.ok(Buffer.byteLength(read('SKILL.md')) <= 4 * KB, 'SKILL.md stays within 4KB')
  for (const step of STEPS) {
    const limit = step === '2-proof.md' ? 12 * KB : 8 * KB
    assert.ok(Buffer.byteLength(read(`steps/${step}`)) <= limit, `${step} stays within ${limit / KB}KB`)
  }
  // what one run reads: the entry page, every step, and the Bend reference step 2 requires
  const run = ['SKILL.md', ...STEPS.map((step) => `steps/${step}`), 'references/bend-proof.md']
  const total = run.reduce((sum, path) => sum + Buffer.byteLength(read(path)), 0)
  assert.ok(total <= 45 * KB, `one run reads ${Math.round(total / KB)}KB, within 45KB`)
})

test('every problem code the scripts report is documented in exactly the step that reports it', () => {
  const scripts = ['fod.mjs', 'fod-spec.mjs'].map((name) => read(`scripts/${name}`)).join('\n')
  const reported = new Set([
    ...[...scripts.matchAll(/finding\(\s*'([A-Z_]+)'/g)].map((match) => match[1]),
    ...[...read('scripts/fod.mjs').matchAll(/^ {2}([A-Z_]+): '/gm)].map((match) => match[1]),
  ])
  assert.ok(reported.size >= 25, `found ${reported.size} codes`)
  const docs = Object.fromEntries(STEPS.map((step) => [step, read(`steps/${step}`)]))
  for (const code of reported) {
    const where = STEPS.filter((step) => new RegExp(`\`${code}\``).test(docs[step]))
    assert.equal(where.length, 1, `${code} is documented in ${where.join(', ') || 'no step'}`)
  }
})

test('the documents use the six-step vocabulary, not the retired workflow', () => {
  const retired = /\b(?:Oracle Card|oracle\.md|ORACLE_READY|VALID_RED|IMPLEMENTED_GREEN|REVIEW_VERIFIED|lane=|oracle-step|oracle-run|oracle-lock|ledger|contract\/v1|Case space|NEEDS_DECISION|POLICY_GAP|Outcome Brief)\b/i
  const files = ['SKILL.md', ...STEPS.map((step) => `steps/${step}`), 'templates/SPEC.md',
    ...readdirSync(join(skill, 'references')).filter((name) => name.endsWith('.md')).map((name) => `references/${name}`)]
  for (const path of files) {
    const hit = read(path).match(retired)
    assert.equal(hit, null, `${path} mentions ${hit?.[0]}`)
  }
})

test('every relative link in the skill documents resolves', () => {
  const files = ['SKILL.md', ...STEPS.map((step) => `steps/${step}`), 'references/bend-proof.md', 'references/model-patterns.md']
  for (const path of files) {
    for (const [, target] of read(path).matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/.test(target)) continue
      const full = resolve(dirname(join(skill, path)), target)
      assert.ok(existsSync(full) && statSync(full).isFile(), `${path} links to missing ${target}`)
    }
  }
})

test('starting conditions are written into the model, since only model traces are tested', () => {
  assert.match(read('steps/1-spec.md'), /Starting conditions are tested only through the model/)
  assert.match(read('steps/1-spec.md'), /a start written only in this table is\s+never tested/)
  assert.match(read('steps/2-proof.md'), /Entry and Data starting conditions as the first events\s+`next\(\[\]\)` offers/)
})

test('the bend-proof skill points at step 2 and the shared reference', () => {
  const text = readFileSync(join(skill, '..', 'bend-proof', 'SKILL.md'), 'utf8')
  assert.match(text, /\.\.\/frontend-oracle-design\/steps\/2-proof\.md/)
  assert.match(text, /\.\.\/frontend-oracle-design\/references\/bend-proof\.md/)
})
