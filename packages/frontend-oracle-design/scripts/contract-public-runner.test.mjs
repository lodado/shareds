import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- focused public CLI integration test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const core = new URL('../skills/frontend-oracle-design/scripts/', import.meta.url)
const fixture = new URL('../test-fixtures/contract-v1/', import.meta.url)
const scripts = Object.fromEntries(['stage', 'frames', 'verify', 'lock', 'run'].map((name) => [name, fileURLToPath(new URL(`oracle-${name}.mjs`, core))]))
const loader = fileURLToPath(new URL('deny-formal-loader.mjs', fixture))
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const lines = (path) => readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))

// No review receipts or transition bypasses. This is synthetic fixture Delivery,
// not independent review, native skill activation, or an OS-level sandbox.
test('actual Contract toggle public RED and two reported Medium passes preserve immutable evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'oracle-contract-public-'))
  const directory = join(root, '.ai/oracles/contract-smoke')
  const source = join(root, 'product/src')
  const home = join(root, 'home')
  const bin = join(root, 'bin')
  const cache = join(root, 'cache')
  for (const path of [directory, source, home, bin, cache]) mkdirSync(path, { recursive: true })
  symlinkSync('/usr/bin/git', join(bin, 'git'))
  symlinkSync(process.execPath, join(bin, 'node'))
  const env = { HOME: home, PATH: bin, TMPDIR: root, XDG_CACHE_HOME: cache, npm_config_cache: cache, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', NODE_OPTIONS: `--experimental-loader=${loader}` }
  delete env.NODE_TEST_CONTEXT
  const execute = (executable, args) => {
    const result = spawnSync(executable, args, { cwd: root, env, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 })
    console.log(JSON.stringify({ command: [executable, ...args], exit: result.status, stdout: result.stdout, stderr: result.stderr }))
    assert.equal(result.error, undefined)
    return result
  }
  const cli = (name, ...args) => execute(process.execPath, [scripts[name], ...args])
  const ok = (result) => assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
  const oracle = join(directory, 'oracle.md')
  const policy = join(directory, 'policy.md')
  const lock = join(directory, 'oracle.lock.json')
  const state = join(directory, 'run-state.json')
  const ledger = join(directory, 'runs.jsonl')
  const evidence = join(directory, 'evidence.json')
  const product = join(source, 'product.mjs')
  const tests = join(source, 'product.test.mjs')
  try {
    for (const name of ['oracle.md', 'policy.md']) copyFileSync(new URL(name, fixture), join(directory, name))
    const registeredPolicy = join(root, 'packages/frontend-oracle-design/test-fixtures/contract-v1/policy.md')
    mkdirSync(join(root, 'packages/frontend-oracle-design/test-fixtures/contract-v1'), { recursive: true })
    copyFileSync(new URL('policy.md', fixture), registeredPolicy)
    for (const name of ['product.mjs', 'product.test.mjs']) copyFileSync(new URL(name, fixture), join(source, name))
    const immutable = Object.fromEntries([oracle, policy, registeredPolicy, tests].map((path) => [path, readFileSync(path)]))
    const defective = readFileSync(product, 'utf8')
    assert.equal(defective, 'export function toggle(enabled) {\n  return enabled\n}\n')
    ok(execute('/usr/bin/git', ['init', '--quiet', root]))
    assert.equal(existsSync(join(bin, 'bend')), false)
    for (const executable of ['bend', 'npm', 'curl']) {
      const denied = spawnSync(executable, ['--version'], { cwd: root, env, encoding: 'utf8' })
      assert.equal(denied.error?.code, 'ENOENT')
      console.log(`PATH_DENIAL ${executable} ENOENT`)
    }
    for (const [specifier, code] of [[new URL('oracle-model.mjs', core).href, 'FORMAL_IMPORT_DENIED'], ['node:https', 'NETWORK_IMPORT_DENIED']]) {
      const denied = execute(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(specifier)})`])
      assert.equal(denied.status, 1)
      assert.ok(denied.stderr.includes(code))
    }
    ok(cli('stage', 'begin', '--dir', directory, '--profile', 'contract/v1'))
    const cardCheck = cli('verify', 'card', '--oracle', oracle, '--case-space')
    ok(cardCheck)
    const declared = JSON.parse(cardCheck.stdout)
    assert.equal(declared.ready, true)
    assert.equal(declared.N_valid, 2)
    assert.equal(declared.N_executed_unique, null)
    const frames = cli('frames', '--oracle', oracle, '--json')
    ok(frames)
    const generated = JSON.parse(frames.stdout)
    assert.equal(generated.rawCount, 2)
    assert.equal(generated.frames.length, 2)
    console.log(`FRAME_OUTPUT ${JSON.stringify(generated)}`)
    for (const to of ['CHECKED', 'DRAFTED']) ok(cli('stage', 'advance', '--dir', directory, '--to', to, '--profile', 'contract/v1'))
    ok(cli('lock', 'create', '--oracle', oracle, '--lock', lock, '--source', 'packages/frontend-oracle-design/test-fixtures/contract-v1/policy.md', '--profile', 'contract/v1'))
    const locked = readFileSync(lock)
    const refused = cli('run', 'init', '--dir', directory, '--lock', lock, '--scan-root', source, '--required-label', 'unit:reported')
    assert.notEqual(refused.status, 0)
    assert.match(refused.stderr, /CONTRACT_CASES_LABEL_REQUIRED/)
    assert.equal(existsSync(state), false)
    assert.equal(existsSync(ledger), false)
    ok(cli('run', 'init', '--dir', directory, '--lock', lock, '--scan-root', source, '--required-label', 'contract-cases:reported', '--harness-path', 'product.test.mjs'))
    const card = immutable[oracle].toString()
    const records = card.split('\n').filter((line) => /^\| F[0-9a-f]+ \|/.test(line)).map((line) => {
      const [frame, , tuple, scenario] = line.split('|').slice(1, -1).map((cell) => cell.trim())
      return { frame, tuple: JSON.parse(tuple), scenario: JSON.parse(scenario) }
    })
    const names = [...immutable[tests].toString().matchAll(/test\('([^']+)'/g)].map((match) => match[1])
    const dimensionRevision = /- Dimension revision: (\w+)/.exec(card)[1]
    const constraintRevision = /- Constraint revision: (\w+)/.exec(card)[1]
    assert.equal(dimensionRevision, generated.dimensionRevision)
    assert.equal(constraintRevision, generated.constraintRevision)
    assert.deepEqual(records.map((record) => record.frame), generated.frames.map((frame) => frame.id))
    writeFileSync(evidence, JSON.stringify({ schemaVersion: 1,
      rows: Object.fromEntries(records.map((record, index) => [record.scenario.rows[0], { kind: 'test', name: names[index] }])),
      frames: Object.fromEntries(records.map((record, index) => [record.frame, { kind: 'test', name: names[index], tuple: record.tuple, scenario: record.scenario.id, dimensionRevision, constraintRevision }])),
    }))
    const mapBytes = readFileSync(evidence)
    const command = [process.execPath, '--test', tests]
    const run = (phase, suffix) => cli('run', phase, '--dir', directory, '--label', 'contract-cases:reported', '--adapter', 'node-test', '--report', join(directory, `${suffix}.ndjson`), '--evidence', evidence, ...(phase === 'red' ? ['--row', 'O1'] : []), '--', ...command)
    const actual = (suffix, status) => {
      const events = lines(join(directory, `${suffix}.ndjson`))
      assert.equal(events.length, 2)
      assert.deepEqual(events.map((event) => event.data.name).sort(), [...names].sort())
      assert.ok(events.every((event) => event.data.test && event.data.status === status))
      const entry = lines(ledger).filter((entry) => entry.type === 'run').at(-1)
      assert.equal(entry.label, 'contract-cases:reported')
      assert.equal(entry.adapter, 'node-test')
      assert.deepEqual(entry.command, command)
      assert.match(entry.worktreeSha256, /^[0-9a-f]{64}$/)
      assert.match(entry.lockManifestSha256, /^[0-9a-f]{64}$/)
      assert.match(entry.productionSha256, /^[0-9a-f]{64}$/)
      assert.equal(entry.exitCode, status === 'failed' ? 1 : 0)
      assert.equal(entry.tests.length, 2)
      assert.deepEqual(entry.tests.map((entry) => entry.name).sort(), [...names].sort())
      assert.ok(entry.tests.every((entry) => entry.status === status))
      if (status === 'failed') assert.ok(events.every((event) => event.data.cause !== 'infra'))
      console.log(`ACTUAL_RUN ${JSON.stringify(entry)}`)
      return entry
    }
    ok(run('red', 'red'))
    const red = actual('red', 'failed')
    assert.equal(json(state).state, 'VALID_RED')
    writeFileSync(product, defective.replace('return enabled', 'return !enabled'))
    ok(run('exec', 'pass-1'))
    const first = actual('pass-1', 'passed')
    assert.equal(json(state).state, 'VALID_RED')
    // A changed snapshot cannot borrow the previous Medium pass.
    writeFileSync(product, `${defective.replace('return enabled', 'return !enabled')}\n`)
    const stale = run('green', 'changed-snapshot')
    assert.notEqual(stale.status, 0)
    assert.match(stale.stderr, /FLAKINESS_GATE/)
    assert.equal(json(state).state, 'VALID_RED')
    writeFileSync(product, defective.replace('return enabled', 'return !enabled'))
    // A weakened test cannot advance acceptance. Restore the exact frozen bytes.
    writeFileSync(tests, immutable[tests].toString().replace('assert.equal(toggle(false), true)', 'assert.ok(true)'))
    const weakened = run('green', 'weakened-test')
    assert.notEqual(weakened.status, 0)
    assert.match(weakened.stderr, /TEST_WEAKENED|HARNESS_CHANGED|TEST_CHANGED/)
    assert.equal(json(state).state, 'VALID_RED')
    writeFileSync(tests, immutable[tests])
    ok(run('exec', 'pass-2'))
    const second = actual('pass-2', 'passed')
    ok(run('green', 'green'))
    const green = actual('green', 'passed')
    assert.equal(json(state).state, 'IMPLEMENTED_GREEN')
    assert.equal(new Set([red.runId, first.runId, green.runId]).size, 3)
    assert.equal(second.worktreeSha256, green.worktreeSha256)
    assert.equal(second.lockManifestSha256, green.lockManifestSha256)
    assert.equal(first.worktreeSha256, green.worktreeSha256)
    assert.equal(first.lockManifestSha256, green.lockManifestSha256)
    ok(cli('verify', 'evidence', '--oracle', oracle, '--map', evidence, '--ledger', ledger, '--run', green.runId, '--phase', 'green'))
    assert.deepEqual(readFileSync(lock), locked)
    assert.deepEqual(readFileSync(evidence), mapBytes)
    for (const [path, bytes] of Object.entries(immutable)) assert.deepEqual(readFileSync(path), bytes)
    assert.equal(readFileSync(product, 'utf8'), defective.replace('return enabled', 'return !enabled'))
    assert.notEqual(hash(readFileSync(product)), hash(defective))
    console.log(`NARROW_DELIVERY ${JSON.stringify({ state: json(state).state, red: red.runId, passes: [second.runId, green.runId], lockSha256: hash(locked), productionOnlyChange: 'product/src/product.mjs' })}`)
  } finally {
    console.log(`FINAL_ARTIFACTS ${JSON.stringify({ stage: existsSync(join(directory, 'stage.json')) ? json(join(directory, 'stage.json')) : null, lock: existsSync(lock), runState: existsSync(state) ? json(state).state : null, ledger: existsSync(ledger), productSha256: existsSync(product) ? hash(readFileSync(product)) : null, testSha256: existsSync(tests) ? hash(readFileSync(tests)) : null })}`)
    rmSync(root, { recursive: true, force: true })
  }
})
