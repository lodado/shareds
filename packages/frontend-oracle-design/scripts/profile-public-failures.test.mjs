import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- focused actual public CLI acceptance.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { resolveExecutable } from '../skills/frontend-oracle-design/scripts/resolve-executable.mjs'
import { fullProductFixture } from '../test-fixtures/full-product/fixture.mjs'

const core = new URL('../skills/frontend-oracle-design/scripts/', import.meta.url)
const fixture = new URL('../test-fixtures/contract-v1/', import.meta.url)
const formalFixture = new URL('../test-fixtures/stale-search/', import.meta.url)
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const json = (path) => JSON.parse(readFileSync(path, 'utf8'))
const entries = (path) => readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse)
const ok = (result) => assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`)
const entryDigest = (path) => {
  if (!path || !path.endsWith('.mjs') || !existsSync(path)) return null
  return digest(readFileSync(path))
}
const provenance = () => Object.fromEntries(['run', 'profile', 'stage', 'lock', 'package', 'verify', 'projection', 'adapters'].map((name) => [name, digest(readFileSync(new URL(`oracle-${name}.mjs`, core)))]))
console.log(`RUNTIME_PROVENANCE_INITIAL ${JSON.stringify(provenance())}`)
test.after(() => console.log(`RUNTIME_PROVENANCE_FINAL ${JSON.stringify(provenance())}`))

function workspace(t, { formal = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'oracle-public-failures-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const directory = join(root, '.ai/oracles/acceptance')
  const source = join(root, 'product/src')
  const home = join(root, 'home')
  const bin = join(root, 'bin')
  for (const path of [directory, source, home, bin]) mkdirSync(path, { recursive: true })
  symlinkSync('/usr/bin/git', join(bin, 'git'))
  symlinkSync(process.execPath, join(bin, 'node'))
  const env = { HOME: home, PATH: bin, TMPDIR: root, XDG_CACHE_HOME: join(root, 'cache'), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', BEND_NO_TELEMETRY: '1' }
  if (!formal) env.NODE_OPTIONS = `--experimental-loader=${fileURLToPath(new URL('deny-formal-loader.mjs', fixture))}`
  const execute = (executable, args, overrides = {}) => {
    const result = spawnSync(executable, args, { cwd: root, env: { ...env, ...overrides }, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024 })
    console.log(JSON.stringify({ command: [executable, ...args], entrySha256: entryDigest(args[0]), exit: result.status, error: result.error?.code, stdout: result.stdout, stderr: result.stderr }))
    assert.equal(result.error, undefined)
    return result
  }
  const cli = (name, ...args) => execute(process.execPath, [fileURLToPath(new URL(`oracle-${name}.mjs`, core)), ...args])
  ok(execute('/usr/bin/git', ['init', '--quiet', root]))
  const oracle = join(directory, 'oracle.md')
  const lock = join(directory, 'oracle.lock.json')
  const state = join(directory, 'run-state.json')
  const ledger = join(directory, 'runs.jsonl')
  const product = join(source, 'product.mjs')
  const tests = join(source, 'product.test.mjs')
  const evidence = join(directory, 'evidence.json')
  for (const name of ['oracle.md', 'policy.md']) copyFileSync(new URL(name, fixture), join(directory, name))
  for (const name of ['product.mjs', 'product.test.mjs']) copyFileSync(new URL(name, fixture), join(source, name))
  // Bind real reporter names to frame IDs in isolated setup before harness freeze.
  const cardText = readFileSync(oracle, 'utf8')
  const records = cardText.split('\n').filter((line) => /^\| F[0-9a-f]+ \|/.test(line)).map((line) => {
    const [id, , tuple, scenario] = line.split('|').slice(1, -1).map((cell) => cell.trim())
    return { id, tuple: JSON.parse(tuple), scenario: JSON.parse(scenario).id, dimensionRevision: /- Dimension revision: (\w+)/.exec(cardText)[1], constraintRevision: /- Constraint revision: (\w+)/.exec(cardText)[1] }
  })
  let caseIndex = 0
  writeFileSync(tests, readFileSync(tests, 'utf8').replace(/test\('([^']+)'/g, (_all, name) => {
    const identity = records[caseIndex]
    caseIndex += 1
    const tokens = [...name.matchAll(/oracle-case:(\S+)/g)]
    assert.equal(tokens.length, 1, 'copied actual test name must have exactly one observed identity')
    assert.deepEqual(JSON.parse(Buffer.from(tokens[0][1], 'base64url').toString('utf8')), identity)
    return _all
  }))
  assert.equal(caseIndex, records.length)
  const registered = 'packages/frontend-oracle-design/test-fixtures/contract-v1/policy.md'
  mkdirSync(join(root, 'packages/frontend-oracle-design/test-fixtures/contract-v1'), { recursive: true })
  copyFileSync(new URL('policy.md', fixture), join(root, registered))
  const author = () => {
    ok(cli('stage', 'begin', '--dir', directory, '--profile', 'contract/v1'))
    for (const to of ['CHECKED', 'DRAFTED']) ok(cli('stage', 'advance', '--dir', directory, '--to', to))
    ok(cli('lock', 'create', '--oracle', oracle, '--lock', lock, '--source', registered, '--profile', 'contract/v1'))
    assert.deepEqual(json(join(directory, 'stage.json')).history.map((entry) => entry.stage), ['DISCOVERING', 'CHECKED', 'DRAFTED', 'ORACLE_READY'])
  }
  const init = () => {
    ok(cli('run', 'init', '--dir', directory, '--lock', lock, '--scan-root', source, '--required-label', 'contract-cases:reported', '--harness-path', 'product.test.mjs'))
    const card = readFileSync(oracle, 'utf8')
    const names = [...readFileSync(tests, 'utf8').matchAll(/test\('([^']+)'/g)].map((match) => match[1])
    const records = card.split('\n').filter((line) => /^\| F[0-9a-f]+ \|/.test(line)).map((line) => {
      const [frame, , tuple, scenario] = line.split('|').slice(1, -1).map((cell) => cell.trim())
      return { frame, tuple: JSON.parse(tuple), scenario: JSON.parse(scenario) }
    })
    writeFileSync(evidence, JSON.stringify({ schemaVersion: 1,
      rows: Object.fromEntries(records.map((record, i) => [record.scenario.rows[0], { kind: 'test', name: names[i] }])),
      frames: Object.fromEntries(records.map((record, i) => [record.frame, { kind: 'test', name: names[i], tuple: record.tuple, scenario: record.scenario.id, dimensionRevision: /- Dimension revision: (\w+)/.exec(card)[1], constraintRevision: /- Constraint revision: (\w+)/.exec(card)[1] }])),
    }))
  }
  const run = (phase, command = [process.execPath, '--test', tests], extra = []) => cli('run', phase, '--dir', directory, '--label', 'contract-cases:reported', '--adapter', 'node-test', '--report', join(directory, `${phase}.ndjson`), '--evidence', evidence, ...(phase === 'red' ? ['--row', 'O1'] : []), ...extra, '--', ...command)
  return { root, directory, source, env, bin, cli, execute, oracle, lock, state, ledger, product, tests, evidence, author, init, run }
}

// Negative gate execution is current regression evidence, not invented historical RED.
test('required Contract runner unavailable cannot publish VALID_RED or GREEN', (t) => {
  const w = workspace(t)
  w.author()
  w.init()
  const baseline = readFileSync(w.product)
  const locked = readFileSync(w.lock)
  const stateBytes = readFileSync(w.state)
  const ledgerBytes = readFileSync(w.ledger)
  for (const phase of ['red', 'green']) {
    const unavailableRunner = join(w.bin, 'absent/vitest')
    const result = w.cli('run', phase, '--dir', w.directory, '--label', 'contract-cases:reported', '--adapter', 'vitest', '--report', join(w.directory, `${phase}.ndjson`), '--evidence', w.evidence, ...(phase === 'red' ? ['--row', 'O1'] : []), '--', unavailableRunner, 'run', w.tests)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /COMMAND_UNRUNNABLE:.*ENOENT/)
    assert.doesNotMatch(result.stderr, /ADAPTER_COMMAND_INVALID/)
    assert.equal(json(w.state).state, 'ORACLE_READY')
    assert.deepEqual(readFileSync(w.lock), locked)
    assert.deepEqual(readFileSync(w.product), baseline)
    assert.deepEqual(readFileSync(w.state), stateBytes)
    assert.deepEqual(readFileSync(w.ledger), ledgerBytes)
    const runs = entries(w.ledger).filter((entry) => entry.type === 'run')
    assert.equal(runs.length, 0)
    console.log(`INFRA_STATE ${JSON.stringify({ phase, state: json(w.state).state, runs })}`)
  }
})

test('approval and Design-only authoring write no product tests, tampered card and lock cannot resume acceptance', (t) => {
  const w = workspace(t)
  const bytes = Object.fromEntries([w.product, w.tests].map((path) => [path, readFileSync(path)]))
  const card = readFileSync(w.oracle, 'utf8')
  writeFileSync(w.oracle, card.replace('- Status: approved', '- Status: pending'))
  ok(w.cli('stage', 'begin', '--dir', w.directory, '--profile', 'contract/v1'))
  const before = readFileSync(join(w.directory, 'stage.json'))
  assert.notEqual(w.cli('stage', 'advance', '--dir', w.directory, '--to', 'CHECKED').status, 0)
  assert.deepEqual(readFileSync(join(w.directory, 'stage.json')), before)
  assert.equal(existsSync(w.lock), false)
  assert.notEqual(w.cli('lock', 'create', '--oracle', w.oracle, '--lock', w.lock).status, 0)
  assert.equal(existsSync(w.state), false)
  assert.equal(existsSync(w.ledger), false)
  writeFileSync(w.oracle, card)
  for (const to of ['CHECKED', 'DRAFTED']) ok(w.cli('stage', 'advance', '--dir', w.directory, '--to', to))
  ok(w.cli('lock', 'create', '--oracle', w.oracle, '--lock', w.lock, '--source', 'packages/frontend-oracle-design/test-fixtures/contract-v1/policy.md'))
  // Design-only is the approved authoring endpoint, not a invented CLI switch.
  assert.equal(existsSync(w.state), false)
  assert.equal(existsSync(w.ledger), false)
  for (const [path, original] of Object.entries(bytes)) assert.deepEqual(readFileSync(path), original)
  w.init()
  const state = readFileSync(w.state)
  const ledger = readFileSync(w.ledger)
  const lock = readFileSync(w.lock)
  for (const target of ['card', 'lock']) {
    if (target === 'card') writeFileSync(w.oracle, card.replace('contract/v1', 'formal-bend/v1'))
    else writeFileSync(w.lock, JSON.stringify({ ...JSON.parse(lock), verificationProfile: 'formal-bend/v1' }))
    const result = w.cli('run', 'status', '--dir', w.directory, '--json')
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /PROFILE_MISMATCH/)
    assert.deepEqual(readFileSync(w.state), state)
    assert.deepEqual(readFileSync(w.ledger), ledger)
    writeFileSync(w.oracle, card)
    writeFileSync(w.lock, lock)
  }
  ok(w.cli('run', 'status', '--dir', w.directory, '--json'))
  for (const [path, original] of Object.entries(bytes)) assert.deepEqual(readFileSync(path), original)
})

test('already-satisfied real imported product baseline reaches GREEN without a forced product fix', (t) => {
  const w = workspace(t)
  // This is initial fixture setup before init, not an implementation change after RED.
  writeFileSync(w.product, readFileSync(w.product, 'utf8').replace('return enabled', 'return !enabled'))
  w.author()
  w.init()
  const immutable = Object.fromEntries([w.product, w.tests, w.lock, w.oracle, w.evidence].map((path) => [path, readFileSync(path)]))
  const red = w.run('red')
  assert.notEqual(red.status, 0)
  assert.match(red.stderr, /RUN_NOT_RED/)
  assert.equal(json(w.state).state, 'ORACLE_READY')
  ok(w.run('exec'))
  const green = w.run('green', undefined, ['--reason', 'existing implementation already satisfies deterministic rows'])
  ok(green)
  assert.equal(json(w.state).state, 'IMPLEMENTED_GREEN')
  const runs = entries(w.ledger).filter((entry) => entry.type === 'run')
  assert.ok(runs.length >= 2)
  assert.ok(runs.every((entry) => entry.exitCode === 0 && entry.tests.length === 2 && entry.tests.every((item) => item.status === 'passed')))
  for (const [path, original] of Object.entries(immutable)) assert.deepEqual(readFileSync(path), original)
  console.log(`ALREADY_SATISFIED ${JSON.stringify({ state: json(w.state).state, production: digest(readFileSync(w.product)), runs })}`)
})

test('legacy actual public init and read/resume preserve original card and lock bytes without profile promotion', (t) => {
  const w = workspace(t, { formal: true })
  writeFileSync(w.oracle, fullProductFixture().render())
  const locked = w.cli('lock', 'create', '--oracle', w.oracle, '--lock', w.lock)
  ok(locked)
  const card = readFileSync(w.oracle)
  const lock = readFileSync(w.lock)
  ok(w.cli('run', 'init', '--dir', w.directory, '--lock', w.lock, '--scan-root', w.source, '--required-label', 'unit:reported'))
  ok(w.cli('run', 'exec', '--dir', w.directory, '--label', 'unit:reported', '--adapter', 'node-test', '--report', join(w.directory, 'legacy.ndjson'), '--', process.execPath, '--test', w.tests))
  const prior = entries(w.ledger).filter((entry) => entry.type === 'run').at(-1)
  assert.equal(prior.exitCode, 1)
  assert.equal(prior.grade, 'reported')
  assert.equal(prior.tests.length, 2)
  assert.ok(prior.tests.every((item) => item.status === 'failed'))
  assert.equal(Object.hasOwn(prior, 'verificationProfile'), false)
  const state = readFileSync(w.state)
  const ledger = readFileSync(w.ledger)
  for (let i = 0; i < 2; i++) {
    const read = w.cli('run', 'status', '--dir', w.directory, '--json')
    ok(read)
    assert.equal(JSON.parse(read.stdout).verification.profile, 'legacy/unclassified')
  }
  assert.deepEqual(readFileSync(w.state), state)
  assert.deepEqual(readFileSync(w.ledger), ledger)
  assert.equal(Object.hasOwn(json(w.state), 'verificationProfile'), false)
  assert.equal(Object.hasOwn(json(w.lock), 'verificationProfile'), false)
  // Resume reads the actual existing run, rather than initializing a new Contract revision.
  for (const path of [w.oracle, w.lock]) assert.deepEqual(readFileSync(path), path === w.oracle ? card : lock)
  const promoted = w.cli('stage', 'begin', '--dir', w.directory, '--profile', 'contract/v1')
  assert.notEqual(promoted.status, 0)
  assert.match(promoted.stderr, /PROFILE_MISMATCH/)
  assert.deepEqual(readFileSync(w.state), state)
  assert.deepEqual(readFileSync(w.ledger), ledger)
})

function formalCopy(w) {
  cpSync(formalFixture, w.directory, { recursive: true })
  // Repository-relative source paths and package paths retain the source fixture's exact content.
  for (const name of ['README.md', 'MODEL.bend', 'LAWS.bend', 'PROOF.bend', 'World.bend', 'Metamorphic.bend', 'oracle.package.json']) copyFileSync(new URL(name, formalFixture), join(w.root, name))
  writeFileSync(w.oracle, '# Explicit Formal acceptance\n\n## Verification Profile\n\n- Profile: formal-bend/v1\n')
}

test('Formal unavailable Bend fails with genuine download cause and cannot fall back to Contract', (t) => {
  const w = workspace(t, { formal: true })
  formalCopy(w)
  // Reject actual download attempts, without replacing any Formal module or proof result.
  const preload = join(w.root, 'deny-download.mjs')
  writeFileSync(preload, "globalThis.fetch = async () => { throw Error('ACCEPTANCE_NETWORK_DENIED: Bend unavailable') }\n")
  w.env.NODE_OPTIONS = `--import=${preload}`
  ok(w.cli('stage', 'begin', '--dir', w.directory, '--profile', 'formal-bend/v1'))
  ok(w.cli('stage', 'advance', '--dir', w.directory, '--to', 'MODELED'))
  const before = readFileSync(join(w.directory, 'stage.json'))
  const failed = w.cli('stage', 'advance', '--dir', w.directory, '--to', 'CHECKED')
  assert.notEqual(failed.status, 0)
  assert.match(failed.stderr, /BEND_DOWNLOAD_FAILED.*ACCEPTANCE_NETWORK_DENIED/)
  assert.deepEqual(readFileSync(join(w.directory, 'stage.json')), before)
  assert.equal(json(join(w.directory, 'stage.json')).verificationProfile, 'formal-bend/v1')
  for (const path of [w.lock, w.state, w.ledger]) assert.equal(existsSync(path), false)
})

function prepareFormalWitnesses(w, packagePath, formalTests) {
  const compiler = fileURLToPath(new URL('../../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc', import.meta.url))
  const typeFest = fileURLToPath(new URL('../../../node_modules/.pnpm/type-fest@4.41.0/node_modules/type-fest', import.meta.url))
  assert.ok(existsSync(compiler), 'cached target compiler missing; no installation permitted')
  assert.ok(existsSync(join(typeFest, 'package.json')), 'cached type-fest missing; no installation permitted')
  symlinkSync(typeFest, join(w.root, 'node_modules/type-fest'))
  ok(w.execute(process.execPath, [compiler, '--version']))
  console.log(`TYPE_PROVENANCE ${JSON.stringify({ compiler, compilerSha256: digest(readFileSync(compiler)), typeFest, version: json(join(typeFest, 'package.json')).version })}`)
  const positive = join(w.source, 'positive.mts')
  const negative = join(w.source, 'negative.mts')
  const witnessImports = "import type {IsEqual} from 'type-fest'\nimport {reduceSearch} from './search-reducer.mjs'\nimport type {SearchState} from './search-reducer.mjs'\n"
  writeFileSync(positive, `${witnessImports}const preservesState: IsEqual<ReturnType<typeof reduceSearch>, SearchState> = true\nconst response = {type: 'respond', requestId: 1, items: ['result']} as const\nreduceSearch({latestRequestId: 1, results: null}, response)\n`)
  // No expect-error: the real compiler must reject the false source-backed return relation.
  writeFileSync(negative, `${witnessImports}const preservesState: IsEqual<ReturnType<typeof reduceSearch>, string> = true\n`)
  const worldAdapter = join(formalTests, 'world.adapter.mjs')
  writeFileSync(worldAdapter, readFileSync(new URL('world.adapter.mjs', formalFixture), 'utf8').replace("'./search-reducer.mts'", "'../../search-reducer.mts'").replace("'./search-reducer.mutants.mts'", "'../../search-reducer.mutants.mts'"))
  const mutants = join(w.source, 'search-reducer.mutants.mts')
  copyFileSync(new URL('search-reducer.mutants.mts', formalFixture), mutants)
  const proofDirectory = join(formalTests, 'proof')
  mkdirSync(proofDirectory)
  const proofInputs = ['MODEL.bend', 'LAWS.bend', 'PROOF.bend'].map((name) => {
    const path = join(proofDirectory, name)
    copyFileSync(new URL(name, formalFixture), path)
    return path
  })
  const stack = join(formalTests, 'formal-stack.test.mjs')
  const worldName = '[O1] [O2] [O3] [O5] actual world product correspondence'
  const diagnostics = join(w.directory, 'formal-stack-diagnostics.jsonl')
  const script = (name) => fileURLToPath(new URL(`oracle-${name}.mjs`, core))
  writeFileSync(stack, `import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {appendFileSync} from 'node:fs'
import test from 'node:test'
const execute = (args) => {
  const result = spawnSync(${JSON.stringify(process.execPath)}, args, {cwd: ${JSON.stringify(w.root)}, env: process.env, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024})
  const observation = {command: [${JSON.stringify(process.execPath)}, ...args], exit: result.status, stdout: result.stdout, stderr: result.stderr}
  appendFileSync(${JSON.stringify(diagnostics)}, JSON.stringify(observation) + '\\n')
  console.log(JSON.stringify(observation))
  assert.equal(result.error, undefined)
  return result
}
const publicResult = (args) => {
  const result = execute(args)
  assert.equal(result.status, 0, result.stdout + result.stderr)
  return JSON.parse(result.stdout)
}
test('actual Bend law proofs', () => {
  const result = publicResult(${JSON.stringify([script('model'), 'prove', '--dir', proofDirectory, '--timeout-ms', '60000'])})
  assert.equal(result.status, 'proven')
  assert.deepEqual(result.laws, ['stale_ignored', 'latest_applied', 'issue_advances', 'latest_reachable'])
  assert.match(result.stdout, /ALL PROOFS CHECK/)
})
test('actual adequacy kernel witnesses', () => {
  const result = publicResult(${JSON.stringify([script('adequacy'), 'check', '--package', packagePath, '--timeout-ms', '60000'])})
  assert.equal(result.status, 'proven')
  assert.equal(result.pass, true)
  assert.equal(result.kernel.status, 'proven')
  assert.ok(result.counts.valid > 0)
  assert.ok(result.checks.length > 0 && result.checks.every(check => check.status === 'proven'))
})
test(${JSON.stringify(worldName)}, () => {
  const result = publicResult(${JSON.stringify([script('adequacy'), 'conform', '--package', packagePath, '--adapter', worldAdapter])})
  assert.equal(result.status, 'pass')
  assert.deepEqual(Object.values(result.rowIds).sort(), ['O1', 'O2', 'O3', 'O5'])
  assert.equal(result.verification.executed, 48)
  assert.equal(result.settings.length, 48)
  assert.ok(result.settings.every(setting => setting.status === 'pass'))
})
test('actual type-fest consumer positive and negative compilation', () => {
  const flags = ['--strict', '--noEmit', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022']
  const positive = execute([${JSON.stringify(compiler)}, ...flags, ${JSON.stringify(positive)}])
  assert.equal(positive.status, 0, positive.stdout + positive.stderr)
  const negative = execute([${JSON.stringify(compiler)}, ...flags, ${JSON.stringify(negative)}])
  assert.equal(negative.status, 2)
  assert.match(negative.stdout, /negative\\.mts.*TS2322/)
  assert.match(negative.stdout, /Type 'true' is not assignable to type 'false'/)
})
`)
  return { paths: [positive, negative, worldAdapter, mutants, stack, ...proofInputs, join(formalTests, 'search.adapter.mjs')], stack, worldName, diagnostics }
}

test('explicit Formal real pinned Bend package projection and initialization preserve stack evidence gates', async (t) => {
  const bin = resolveExecutable('bend')
  assert.ok(existsSync(bin), 'cached Bend required; no download permitted')
  const w = workspace(t, { formal: true })
  symlinkSync(bin, join(w.bin, 'bend'))
  // Lean is a real required external kernel, never a fabricated verdict.
  const lean = join(process.env.HOME, '.elan/toolchains/leanprover--lean4---v4.34.0/bin/lean')
  assert.ok(existsSync(lean), 'cached Lean kernel required; no installation permitted')
  assert.ok(existsSync(join(process.env.HOME, '.elan/toolchains/leanprover--lean4---v4.34.0/bin/leanc')), 'cached leanc required; no installation permitted')
  w.env.PATH = `${w.bin}:${join(process.env.HOME, '.elan/toolchains/leanprover--lean4---v4.34.0/bin')}:/usr/bin:/bin`
  symlinkSync(lean, join(w.bin, 'lean'))
  ok(w.execute(lean, ['--version']))
  console.log(`LEAN_PROVENANCE ${JSON.stringify({ lean, sha256: digest(readFileSync(lean)), leancSha256: digest(readFileSync(join(process.env.HOME, '.elan/toolchains/leanprover--lean4---v4.34.0/bin/leanc'))) })}`)
  const version = w.execute(bin, ['version'])
  ok(version)
  assert.equal(version.stdout.trim(), 'bend 2.0.34')
  console.log(`BEND_PROVENANCE ${JSON.stringify({ bin, version: version.stdout.trim(), sha256: digest(readFileSync(bin)) })}`)
  formalCopy(w)
  const packagePath = relative(w.root, join(w.directory, 'oracle.package.json'))
  ok(w.cli('stage', 'begin', '--dir', w.directory, '--profile', 'formal-bend/v1'))
  ok(w.cli('stage', 'advance', '--dir', w.directory, '--to', 'MODELED'))
  const checked = w.cli('stage', 'advance', '--dir', w.directory, '--to', 'CHECKED', '--timeout-ms', '60000')
  if (checked.status !== 0) {
    console.log(`FORMAL_POSITIVE_NOT_RUN ${JSON.stringify({ gate: 'CHECKED', exit: checked.status, stderr: checked.stderr, bin })}`)
    t.skip(`explicit Formal positive blocked at real CHECKED: ${checked.stderr.trim()}`)
    return
  }
  const projected = join(w.directory, 'projected.md')
  ok(w.cli('package', 'project-card', '--package', packagePath, '--out', relative(w.root, projected)))
  let card = readFileSync(projected, 'utf8').replace('- Status: pending', '- Status: approved').replace(/^- Source: none yet.*$/m, '- Source: explicit Task6d synthetic fixture approval, not real consumer approval')
  if (!card.includes('## Verification Profile')) card += '\n## Verification Profile\n\n- Profile: formal-bend/v1\n'
  writeFileSync(w.oracle, card)
  assert.match(card, /- Profile: formal-bend\/v1/)
  ok(w.cli('stage', 'advance', '--dir', w.directory, '--to', 'DRAFTED'))
  const formalTests = join(w.source, '__test__/formal')
  const fastCheck = fileURLToPath(new URL('../node_modules/fast-check', import.meta.url))
  if (!existsSync(fastCheck)) {
    t.skip('Formal product execution NOT RUN: existing fast-check dependency absent; no install permitted')
    return
  }
  mkdirSync(formalTests, { recursive: true })
  mkdirSync(join(w.root, 'node_modules'))
  symlinkSync(fastCheck, join(w.root, 'node_modules/fast-check'))
  const reducer = readFileSync(new URL('search-reducer.mts', formalFixture))
  const reducerPath = join(w.source, 'search-reducer.mts')
  writeFileSync(reducerPath, reducer)
  const adapter = join(formalTests, 'search.adapter.mjs')
  writeFileSync(adapter, readFileSync(new URL('search.adapter.mjs', formalFixture), 'utf8').replace("'./search-reducer.mts'", "'../../search-reducer.mts'"))
  const { emitTrace } = await import(new URL('oracle-projection.mjs', core))
  await emitTrace({ model: join(w.root, 'MODEL.bend'), prefix: 'Search', bound: 4, adapter, out: formalTests, row: 'O4', runs: 100, maxLength: 8, bin, regenerate: 'test' })
  const harness = join(formalTests, 'search.oracle.test.mjs')
  const harnessBytes = readFileSync(harness)
  const witnesses = prepareFormalWitnesses(w, packagePath, formalTests)
  ok(w.cli('lock', 'create', '--oracle', w.oracle, '--lock', w.lock, '--profile', 'formal-bend/v1', ...['README.md', 'MODEL.bend', 'LAWS.bend', 'World.bend', 'Metamorphic.bend', packagePath].flatMap((path) => ['--source', path])))
  const init = (...labels) => w.cli('run', 'init', '--dir', w.directory, '--lock', w.lock, '--scan-root', w.source, ...['__test__/formal/search.oracle.test.mjs', ...witnesses.paths.map((path) => relative(w.source, path))].flatMap((path) => ['--harness-path', path]), ...labels.flatMap((label) => ['--required-label', label]))
  const partial = init('behavior', 'bend-proof:reported', 'bend-adequacy:reported')
  assert.notEqual(partial.status, 0)
  assert.match(partial.stderr, /STACK_LABELS_REQUIRED.*type-contract:reported.*fast-check:reported/)
  assert.equal(existsSync(w.state), false)
  ok(init('behavior', 'bend-proof:reported', 'bend-adequacy:reported', 'type-contract:reported', 'fast-check:reported'))
  assert.equal(json(w.state).verificationProfile, 'formal-bend/v1')
  assert.equal(json(w.state).state, 'ORACLE_READY')
  const lateCase = '[O4] [T8e56dbd72890] Issue · Issue · Respond{id:2} · Respond{id:1}'
  writeFileSync(w.evidence, JSON.stringify({ schemaVersion: 1, sequence: { kind: 'test', name: '[O4] sampled traces (fast-check)' }, rows: { O4: { kind: 'test', name: lateCase }, ...Object.fromEntries(['O1', 'O2', 'O3', 'O5'].map((row) => [row, { kind: 'test', name: witnesses.worldName }])) } }))
  const immutable = Object.fromEntries([w.oracle, w.lock, w.evidence, reducerPath, harness, join(formalTests, 'search.model.mjs'), ...witnesses.paths, ...['MODEL.bend', 'LAWS.bend', 'PROOF.bend', 'World.bend', 'Metamorphic.bend'].map((name) => join(w.root, name))].map((path) => [path, readFileSync(path)]))
  for (const [index, label] of ['behavior', 'behavior', 'fast-check:reported'].entries()) {
    ok(w.cli('run', 'exec', '--dir', w.directory, '--label', label, '--adapter', 'node-test', '--report', join(w.directory, `formal-${index}.ndjson`), '--', process.execPath, '--test', harness))
    const recorded = entries(w.ledger).filter((entry) => entry.type === 'run').at(-1)
    assert.equal(recorded.exitCode, 0)
    assert.equal(recorded.grade, 'reported')
    assert.ok(recorded.tests.length > 0 && recorded.tests.every((item) => item.status === 'passed'))
    assert.ok(recorded.tests.some((item) => item.name === lateCase))
    console.log(`FORMAL_ACTUAL_PRODUCT ${JSON.stringify(recorded)}`)
  }
  // Formal status reads the ledger it has: product runs exist, the kernel proof has not run yet.
  const partialStatus = w.cli('run', 'status', '--dir', w.directory, '--json')
  ok(partialStatus)
  const partialVerification = JSON.parse(partialStatus.stdout).verification
  assert.equal(partialVerification.profile, 'formal-bend/v1')
  assert.equal(partialVerification.coverage, 'model')
  assert.equal(partialVerification.executionStatus, 'incomplete')
  assert.equal(partialVerification.formalVerification, 'not-run')
  assert.equal(partialVerification.labels['fast-check:reported'].status, 'passed')
  const beforeRefusal = { state: readFileSync(w.state), ledger: readFileSync(w.ledger) }
  const refused = w.cli('run', 'transition', '--dir', w.directory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-002', '--evidence', w.evidence, '--reason', 'existing implementation already satisfies deterministic rows')
  assert.notEqual(refused.status, 0)
  assert.match(refused.stderr, /REQUIRED_RUN_MISSING.*bend-proof:reported/)
  assert.equal(json(w.state).state, 'ORACLE_READY')
  assert.deepEqual(readFileSync(w.state), beforeRefusal.state)
  assert.deepEqual(readFileSync(w.ledger), beforeRefusal.ledger)
  assert.deepEqual(readFileSync(harness), harnessBytes)
  for (const [path, bytes] of Object.entries(immutable)) assert.deepEqual(readFileSync(path), bytes)
  console.log(`FORMAL_BOUNDED_POSITIVE ${JSON.stringify({ history: json(join(w.directory, 'stage.json')).history, state: json(w.state).state, lock: digest(readFileSync(w.lock)), product: digest(reducer), completion: 'refused missing real bend-proof:reported receipt', fullDelivery: 'NOT RUN' })}`)
  for (const [label, pattern] of [
    ['bend-proof:reported', '^actual Bend law proofs$'],
    ['bend-adequacy:reported', '^actual adequacy kernel witnesses$'],
    ['type-contract:reported', '^actual type-fest consumer positive and negative compilation$'],
  ]) {
    const before = readFileSync(w.state)
    const result = w.cli('run', 'exec', '--dir', w.directory, '--label', label, '--adapter', 'node-test', '--report', join(w.directory, `${label.split(':')[0]}.ndjson`), '--', process.execPath, '--test', '--test-name-pattern', pattern, witnesses.stack)
    const record = entries(w.ledger).filter((entry) => entry.type === 'run').at(-1)
    console.log(`FORMAL_ACTUAL_STACK ${JSON.stringify(record)}`)
    if (existsSync(witnesses.diagnostics)) console.log(`FORMAL_CHILD_DIAGNOSTICS ${readFileSync(witnesses.diagnostics, 'utf8')}`)
    if (result.status !== 0 || record?.exitCode !== 0) {
      assert.deepEqual(readFileSync(w.state), before)
      for (const [path, bytes] of Object.entries(immutable)) assert.deepEqual(readFileSync(path), bytes)
      ok(w.cli('run', 'status', '--dir', w.directory, '--json'))
      const evidenceCheck = w.cli('verify', 'evidence', '--oracle', w.oracle, '--map', w.evidence, '--ledger', w.ledger, '--run', record.runId)
      assert.notEqual(evidenceCheck.status, 0)
      assert.deepEqual(readFileSync(w.state), before)
      console.log(`FORMAL_DELIVERY_NOT_RUN ${JSON.stringify({ label, command: record?.command, state: json(w.state).state, stateSha256: digest(before), ledgerSha256: digest(readFileSync(w.ledger)), record })}`)
      assert.fail(`real ${label} execution blocked; acceptance state unchanged; GREEN NOT RUN`)
    }
    assert.equal(record.grade, 'reported')
    assert.ok(record.tests.some((item) => item.status === 'passed' && new RegExp(pattern).test(item.name)))
    for (const [path, bytes] of Object.entries(immutable)) assert.deepEqual(readFileSync(path), bytes)
  }
  // Genuine all-row world observations and unchanged generated trace assertions share each run.
  for (let index = 0; index < 2; index++) {
    ok(w.cli('run', 'exec', '--dir', w.directory, '--label', 'behavior', '--adapter', 'node-test', '--report', join(w.directory, `all-rows-${index}.ndjson`), '--', process.execPath, '--test', harness, witnesses.stack))
    const record = entries(w.ledger).filter((entry) => entry.type === 'run').at(-1)
    assert.equal(record.exitCode, 0)
    assert.ok(record.tests.some((item) => item.name === lateCase && item.status === 'passed'))
    assert.ok(record.tests.some((item) => item.name === witnesses.worldName && item.status === 'passed'))
    console.log(`FORMAL_ALL_ROWS ${JSON.stringify(record)}`)
  }
  const current = entries(w.ledger).filter((entry) => entry.type === 'run').at(-1)
  ok(w.cli('run', 'transition', '--dir', w.directory, '--to', 'IMPLEMENTED_GREEN', '--run', current.runId, '--evidence', w.evidence, '--reason', 'existing implementation already satisfies deterministic rows'))
  assert.equal(json(w.state).state, 'IMPLEMENTED_GREEN')
  ok(w.cli('verify', 'evidence', '--oracle', w.oracle, '--map', w.evidence, '--ledger', w.ledger, '--run', current.runId))
  const finalStatus = w.cli('run', 'status', '--dir', w.directory, '--json')
  ok(finalStatus)
  const observed = JSON.parse(finalStatus.stdout)
  assert.equal(observed.currentState, 'IMPLEMENTED_GREEN')
  assert.equal(observed.lockStatus.status, 'valid')
  assert.equal(observed.ledgerStatus.status, 'valid')
  assert.equal(observed.ledgerStatus.headDigest, observed.ledgerStatus.verifiedHeadDigest)
  assert.equal(observed.ledgerStatus.headDigest, json(w.state).ledgerHead)
  assert.equal(observed.evidenceStatus.status, 'verified')
  assert.deepEqual(observed.staleOrMissingRuns, [])
  assert.deepEqual(observed.runIssues, [])
  // The recorded kernel runs, not a retroactive `not-assessed`, decide the Formal verification summary.
  assert.equal(observed.verification.profile, 'formal-bend/v1')
  assert.equal(observed.verification.executionStatus, 'executed')
  assert.equal(observed.verification.formalVerification, 'proven')
  assert.equal(observed.verification.adequacy, 'proven')
  assert.equal(observed.verification.N_passed_unique, observed.verification.N_executed_unique)
  assert.ok(observed.verification.N_executed_unique > 0)
  for (const record of entries(w.ledger).filter((entry) => entry.type === 'run')) {
    assert.equal(record.worktreeSha256, observed.currentSnapshot.worktreeSha256)
    assert.equal(record.productionSha256, observed.currentSnapshot.productionSha256)
    assert.equal(record.lockManifestSha256, observed.currentSnapshot.lockManifestSha256)
  }
  for (const [path, bytes] of Object.entries(immutable)) assert.deepEqual(readFileSync(path), bytes)
  console.log(`FORMAL_FINAL_CHILD_DIAGNOSTICS ${readFileSync(witnesses.diagnostics, 'utf8')}`)
  console.log(`FORMAL_GREEN_SNAPSHOT ${JSON.stringify({ state: json(w.state), stateSha256: digest(readFileSync(w.state)), ledgerSha256: digest(readFileSync(w.ledger)), evidenceSha256: digest(readFileSync(w.evidence)), sources: Object.fromEntries(Object.keys(immutable).map((path) => [relative(w.root, path), digest(readFileSync(path))])), runs: entries(w.ledger).filter((entry) => entry.type === 'run'), independentReview: 'NOT RUN', nativeReviewVerified: 'NOT RUN' })}`)
})
