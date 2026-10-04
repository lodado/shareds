import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- scoped Node fixture selftests.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { generateFromDocument } from '../skills/frontend-oracle-design/scripts/oracle-frames.mjs'
import { resolve as monitor } from '../test-fixtures/contract-v1/deny-formal-loader.mjs'

const fixture = new URL('../test-fixtures/contract-v1/', import.meta.url)
const core = new URL('../skills/frontend-oracle-design/scripts/', import.meta.url)
// Fresh child CLI must not inherit Node's recursive-run suppression.
const childEnvironment = { ...process.env }
delete childEnvironment.NODE_TEST_CONTEXT
const immutable = {
  'oracle.md': 'f3b64b5053b9abe1ce0950f94b2ca11079de7542955aea3279490f9042d15bfc',
  'policy.md': '62ee42b18f402e39aa2ff44c2d4d171acd9e97d394633a1d2e546fbe22410385',
  'product.test.mjs': '24cd2670a4655d80947bed056166e629e1f6e836ae6d20c678603debe6c55725',
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const bytes = (name) => readFileSync(new URL(name, fixture))
const card = bytes('oracle.md').toString()
const generated = generateFromDocument(card)
const records = card.split('\n').filter((line) => /^\| F[0-9a-f]+ \|/.test(line)).map((line) => {
  const [frame, disposition, tuple, scenario] = line.split('|').slice(1, -1).map((cell) => cell.trim())
  return { frame, disposition, tuple: JSON.parse(tuple), scenario: JSON.parse(scenario) }
})
const names = [...bytes('product.test.mjs').toString().matchAll(/test\('([^']+)'/g)].map((match) => match[1])
// Transport binding only. Expectations remain literal real assertions in product.test.mjs.
const evidenceMap = {
  schemaVersion: 1,
  rows: Object.fromEntries(records.map((record, index) => [record.scenario.rows[0], { kind: 'test', name: names[index] }])),
  frames: Object.fromEntries(records.map((record, index) => [record.frame, {
    kind: 'test', name: names[index], tuple: record.tuple, scenario: record.scenario.id,
    dimensionRevision: generated.dimensionRevision, constraintRevision: generated.constraintRevision,
  }])),
}

test('fixture immutable oracle, policy and actual product assertion bytes are pinned', () => {
  for (const [name, expected] of Object.entries(immutable)) assert.equal(digest(bytes(name)), expected, name)
  assert.equal(bytes('product.mjs').toString(), 'export function toggle(enabled) {\n  return enabled\n}\n')
})

test('fixture exhaustive generated frames bind exact rows, scenarios, revisions and real test names', () => {
  assert.equal(generated.caseSpace.coverage, 'full-product')
  assert.equal(generated.rawCount, 2)
  assert.match(card, /- Profile: contract\/v1/)
  assert.equal(records.length, 2)
  assert.equal(names.length, 2)
  assert.equal(new Set(names).size, 2)
  assert.deepEqual(records.map((record) => record.frame), generated.frames.map((frame) => frame.id))
  assert.deepEqual(records.map((record) => record.scenario.given), [{ enabled: false }, { enabled: true }])
  for (const [index, record] of records.entries()) {
    const row = `O${index + 1}`
    assert.equal(record.disposition, `covered(${row})`)
    assert.deepEqual(record.scenario.rows, [row])
    assert.deepEqual(record.scenario.sources, ['S1'])
    assert.deepEqual(record.tuple, generated.frames[index].tuple)
    assert.equal(record.scenario.id, `G-${record.frame}`)
    assert.ok(names[index].includes(`[${record.frame}]`))
    assert.deepEqual(evidenceMap.rows[row], { kind: 'test', name: names[index] })
    assert.equal(evidenceMap.frames[record.frame].scenario, record.scenario.id)
  }
  assert.ok(card.includes(`- Dimension revision: ${generated.dimensionRevision}`))
  assert.ok(card.includes(`- Constraint revision: ${generated.constraintRevision}`))
  assert.match(card, /- Investigated: packages\/frontend-oracle-design\/test-fixtures\/contract-v1\/product.mjs/)
  assert.match(bytes('policy.md').toString(), /not a real consumer user's approval/)
})

test('copied real defective toggle fails twice, exact product-only fix passes unchanged tests', () => {
  const root = mkdtempSync(join(tmpdir(), 'oracle-contract-fixture-'))
  const copied = ['oracle.md', 'policy.md', 'product.mjs', 'product.test.mjs', 'deny-formal-loader.mjs']
  try {
    for (const name of copied) copyFileSync(new URL(name, fixture), join(root, name))
    const original = Object.fromEntries(copied.map((name) => [name, readFileSync(join(root, name))]))
    const run = () => spawnSync(process.execPath, ['--test', '--test-reporter=tap', join(root, 'product.test.mjs')], {
      cwd: root, encoding: 'utf8', timeout: 20000,
      env: { ...childEnvironment, HOME: root, PATH: root, XDG_CACHE_HOME: root, NODE_OPTIONS: `--experimental-loader=${new URL('deny-formal-loader.mjs', fixture).href}` },
    })
    const failed = run()
    assert.equal(failed.error, undefined)
    assert.equal(failed.status, 1, failed.stderr)
    assert.match(failed.stdout, /# tests 2\n/)
    assert.match(failed.stdout, /# pass 0\n/)
    assert.match(failed.stdout, /# fail 2\n/)
    assert.equal((failed.stdout.match(/code: 'ERR_ASSERTION'/g) ?? []).length, 2)
    for (const name of names) assert.ok(failed.stdout.includes(`not ok ${names.indexOf(name) + 1} - ${name}`))
    console.log('OBSERVED defective: exit=1 tests=2 pass=0 fail=2 ERR_ASSERTION=2')
    const product = original['product.mjs'].toString()
    assert.equal(product.split('return enabled').length, 2)
    writeFileSync(join(root, 'product.mjs'), product.replace('return enabled', 'return !enabled'))
    const passed = run()
    assert.equal(passed.error, undefined)
    assert.equal(passed.status, 0, passed.stderr)
    assert.match(passed.stdout, /# tests 2\n/)
    assert.match(passed.stdout, /# pass 2\n/)
    assert.match(passed.stdout, /# fail 0\n/)
    for (const name of names) assert.ok(passed.stdout.includes(`ok ${names.indexOf(name) + 1} - ${name}`))
    for (const name of copied.filter((name) => name !== 'product.mjs')) assert.deepEqual(readFileSync(join(root, name)), original[name], name)
    for (const [name, expected] of Object.entries(immutable)) assert.equal(digest(bytes(name)), expected)
    console.log('OBSERVED exact product-only fix: exit=0 tests=2 pass=2 fail=0 immutable oracle/policy/tests/loader unchanged')
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('deny monitor rejects Formal closure and network/setup ESM, never returns a fake evaluator', async () => {
  for (const name of ['oracle-adequacy.mjs', 'oracle-package.mjs', 'oracle-model.mjs', 'ensure-bend.mjs', 'oracle-projection.mjs', 'oracle-discovery.mjs', 'oracle-cli.mjs', 'oracle-types.mjs', 'install-bend.mjs', 'setup-bend.mjs']) {
    const url = new URL(name, core).href
    await assert.rejects(monitor(url, {}, async () => ({ url })), { code: 'FORMAL_IMPORT_DENIED' })
  }
  for (const name of ['http', 'node:https', 'node:net', 'node:tls', 'node:dns/promises', 'node:http2', 'node:dgram', 'undici', 'https://example.invalid/setup.mjs']) {
    await assert.rejects(monitor(name, {}, async () => { throw new Error('must reject before loading') }), { code: 'NETWORK_IMPORT_DENIED' })
  }
  const allowed = { url: new URL('oracle-space.mjs', core).href }
  assert.equal(await monitor(allowed.url, {}, async () => allowed), allowed)
  // Real loader hook process proves denial before module evaluation, not only a unit predicate.
  for (const specifier of [new URL('oracle-model.mjs', core).href, 'node:https']) {
    const result = spawnSync(process.execPath, ['--experimental-loader', fileURLToPath(new URL('deny-formal-loader.mjs', fixture)), '--input-type=module', '-e', `await import(${JSON.stringify(specifier)})`], { encoding: 'utf8', timeout: 20000, env: childEnvironment })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /(?:FORMAL|NETWORK)_IMPORT_DENIED/)
  }
})
