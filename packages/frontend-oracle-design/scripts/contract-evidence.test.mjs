import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- actual public CLI acceptance boundary.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { fullProductFixture } from '../test-fixtures/full-product/fixture.mjs'

const scripts = new URL('../skills/frontend-oracle-design/scripts/', import.meta.url)
const loader = `data:text/javascript,${encodeURIComponent("export async function resolve(s,c,n){if(/oracle-(package|model|adequacy|discovery)\\.mjs$|ensure-bend\\.mjs$/.test(s))throw Error('FORMAL_IMPORT_DENIED:'+s);return n(s,c)}")}`
const environment = { ...process.env, NODE_OPTIONS: `--experimental-loader=${loader}` }
delete environment.NODE_TEST_CONTEXT
const run = (script, ...args) => spawnSync(process.execPath, [new URL(script, scripts).pathname, ...args], { encoding: 'utf8', env: environment })
const ok = (result) => { assert.equal(result.status, 0, result.stderr); return result }

function fixture() {
  const storage = mkdtempSync(join(tmpdir(), 'contract-evidence-'))
  const root = join(storage, 'alias')
  const target = join(storage, 'actual')
  mkdirSync(target)
  symlinkSync(target, root, 'dir')
  const directory = join(root, '.ai/oracles/evidence')
  const src = join(root, 'src')
  mkdirSync(directory, { recursive: true })
  mkdirSync(src)
  const data = fullProductFixture()
  const oracle = join(directory, 'oracle.md')
  writeFileSync(oracle, `${data.render()}\n## Verification Profile\n\n- Profile: contract/v1\n`)
  ok(run('oracle-stage.mjs', 'begin', '--dir', directory, '--profile', 'contract/v1'))
  for (const to of ['CHECKED', 'DRAFTED']) ok(run('oracle-stage.mjs', 'advance', '--dir', directory, '--to', to))
  const lock = join(directory, 'oracle.lock.json')
  ok(run('oracle-lock.mjs', 'create', '--oracle', oracle, '--lock', lock))
  writeFileSync(join(src, 'product.mjs'), 'export const result = (x) => x\nexport const trace = events => [...events].reverse()\n')
  return { root, storage, directory, src, data, oracle, lock }
}

function producers(root, src) {
  mkdirSync(join(root, 'node_modules'))
  for (const [name, location] of [['typescript', 'typescript@5.9.3'], ['fast-check', 'fast-check@4.10.2'], ['type-fest', 'type-fest@4.41.0']]) symlinkSync(fileURLToPath(new URL(`../../../node_modules/.pnpm/${location}/node_modules/${name}`, import.meta.url)), join(root, 'node_modules', name))
  writeFileSync(join(src, 'product.d.mts'), 'export function result(x: number): number\n')
  writeFileSync(join(src, 'positive.mts'), "import type {IsEqual} from 'type-fest'\nimport {result} from './product.mjs'\nconst equal: IsEqual<ReturnType<typeof result>,number> = true\n")
  writeFileSync(join(src, 'negative.mts'), "import type {IsEqual} from 'type-fest'\nimport {result} from './product.mjs'\nconst equal: IsEqual<ReturnType<typeof result>,string> = true\n")
  writeFileSync(join(src, 'property.mjs'), "import fc from 'fast-check'\nimport {result} from './product.mjs'\nexport const domain = 'integer 0..10, approved fixture S1'\nexport const seed = 42\nexport const numRuns = 20\nexport const property = fc.property(fc.integer({min:0,max:10}), x => result(x) === x)\n")
  writeFileSync(join(src, 'witness.test.mjs'), `import test from 'node:test'\ntest('compiler',t=>t.diagnostic('oracle-contract/v1 '+JSON.stringify({name:'compiler',kind:'type-contract',positive:'positive.mts',negative:'negative.mts'})))\ntest('property',t=>t.diagnostic('oracle-contract/v1 '+JSON.stringify({name:'property',kind:'fast-check',module:'property.mjs'})))\n`)
}

function caseName(record, data) {
  const identity = { id: record.frame, scenario: record.scenario.id, tuple: record.tuple, dimensionRevision: data.generated.dimensionRevision, constraintRevision: data.generated.constraintRevision }
  return `case [${record.frame}] oracle-case:${Buffer.from(JSON.stringify(identity)).toString('base64url')}`
}

test('Contract status and actual case coverage reject label-only and stale reporter identities', () => {
  const f = fixture()
  try {
    const names = f.data.records.map((record) => caseName(record, f.data))
    const path = join(f.src, 'product.test.mjs')
    const cases = names.map((name, index) => `test(${JSON.stringify(name)},()=>assert.deepEqual(trace(${JSON.stringify(f.data.records[index].scenario.when)}),${JSON.stringify(f.data.records[index].scenario.when)}))`).join('\n')
    writeFileSync(path, `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport {trace} from './product.mjs'\n${cases}\n`)
    producers(f.root, f.src)
    const propertyBytes = readFileSync(join(f.src, 'property.mjs'))
    writeFileSync(join(f.src, 'unregistered.mjs'), propertyBytes)
    writeFileSync(join(f.src, 'unregistered.test.mjs'), "import test from 'node:test'\ntest('unregistered property',t=>t.diagnostic('oracle-contract/v1 '+JSON.stringify({name:'unregistered property',kind:'fast-check',module:'unregistered.mjs'})))\n")
    symlinkSync('positive.mts', join(f.src, 'positive-alias.mts'))
    writeFileSync(join(f.src, 'same-file.test.mjs'), "import test from 'node:test'\ntest('same compiler file',t=>t.diagnostic('oracle-contract/v1 '+JSON.stringify({name:'same compiler file',kind:'type-contract',positive:'positive.mts',negative:'positive-alias.mts'})))\n")
    ok(run('oracle-run.mjs', 'init', '--dir', f.directory, '--lock', f.lock, '--scan-root', f.src, ...['positive.mts', 'negative.mts', 'product.d.mts', 'property.mjs', 'witness.test.mjs'].flatMap((path) => ['--harness-path', path]), ...['contract-cases:reported', 'type-contract:reported', 'fast-check:reported'].flatMap((label) => ['--required-label', label])))
    const status = () => JSON.parse(ok(run('oracle-run.mjs', 'status', '--dir', f.directory, '--json')).stdout)
    assert.equal(status().verification.formalVerification, 'not-performed')
    assert.equal(status().verification.N_executed_unique, null)
    const map = { schemaVersion: 1, rows: { O1: { kind: 'test', name: names[0] } }, frames: Object.fromEntries(f.data.records.map((record, index) => [record.frame, { kind: 'test', name: names[index], tuple: record.tuple, scenario: record.scenario.id, dimensionRevision: f.data.generated.dimensionRevision, constraintRevision: f.data.generated.constraintRevision }])), sequence: { kind: 'test', name: names[0] } }
    const mapPath = join(f.directory, 'evidence.json')
    writeFileSync(mapPath, JSON.stringify(map))
    ok(run('oracle-run.mjs', 'exec', '--dir', f.directory, '--label', 'contract-cases:reported', '--adapter', 'node-test', '--report', join(f.directory, 'red.ndjson'), '--', process.execPath, '--test', path))
    assert.equal(JSON.parse(readFileSync(join(f.directory, 'runs.jsonl'), 'utf8').trim().split('\n').at(-1)).exitCode, 1)
    ok(run('oracle-run.mjs', 'transition', '--dir', f.directory, '--to', 'VALID_RED', '--run', 'r-001', '--evidence', mapPath, '--row', 'O1'))
    writeFileSync(join(f.src, 'product.mjs'), 'export const result = (x) => x\nexport const trace = events => [...events]\n')
    for (let pass = 0; pass < 2; pass += 1) ok(run('oracle-run.mjs', 'exec', '--dir', f.directory, '--label', 'contract-cases:reported', '--adapter', 'node-test', '--report', join(f.directory, `green-${pass}.ndjson`), '--', process.execPath, '--test', path))
    const verify = (runId = 'r-003') => run('oracle-verify.mjs', 'evidence', '--oracle', f.oracle, '--map', mapPath, '--ledger', join(f.directory, 'runs.jsonl'), '--run', runId, '--phase', 'green')
    const labelOnly = verify()
    assert.equal(labelOnly.status, 1)
    assert.match(labelOnly.stderr, /CONTRACT_EXECUTION_REQUIRED/)
    for (const label of ['type-contract:reported', 'fast-check:reported']) ok(run('oracle-run.mjs', 'exec', '--dir', f.directory, '--label', label, '--adapter', 'node-test', '--report', join(f.directory, `labels-only-${label.split(':')[0]}.ndjson`), '--', process.execPath, '--test', path))
    assert.match(verify().stderr, /CONTRACT_EXECUTION_REQUIRED.*missing actual producer output/)
    const beforeRefusal = ['run-state.json', 'runs.jsonl'].map((file) => readFileSync(join(f.directory, file)))
    const noProducerGreen = run('oracle-run.mjs', 'transition', '--dir', f.directory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-003', '--evidence', mapPath)
    assert.equal(noProducerGreen.status, 1)
    assert.match(noProducerGreen.stderr, /CONTRACT_EXECUTION_REQUIRED/)
    for (const [index, file] of ['run-state.json', 'runs.jsonl'].entries()) assert.deepEqual(readFileSync(join(f.directory, file)), beforeRefusal[index])
    for (const label of ['type-contract:reported', 'fast-check:reported']) ok(run('oracle-run.mjs', 'exec', '--dir', f.directory, '--label', label, '--adapter', 'node-test', '--report', join(f.directory, `${label.split(':')[0]}.ndjson`), '--', process.execPath, '--test', join(f.src, 'witness.test.mjs')))
    const accepted = ok(verify())
    const disguised = run('oracle-run.mjs', 'exec', '--dir', f.directory, '--label', 'type-contract:reported', '--adapter', 'node-test', '--report', join(f.directory, 'same-file.ndjson'), '--', process.execPath, '--test', join(f.src, 'same-file.test.mjs'))
    assert.equal(disguised.status, 1, disguised.stdout)
    assert.match(disguised.stderr, /REPORT_NONPASSING/)
    const sameFile = verify()
    assert.equal(sameFile.status, 1, sameFile.stdout)
    assert.match(sameFile.stderr, /CONTRACT_EXECUTION_REQUIRED/)
    ok(run('oracle-run.mjs', 'exec', '--dir', f.directory, '--label', 'type-contract:reported', '--adapter', 'node-test', '--report', join(f.directory, 'compiler-again.ndjson'), '--', process.execPath, '--test', join(f.src, 'witness.test.mjs')))
    ok(run('oracle-run.mjs', 'exec', '--dir', f.directory, '--label', 'fast-check:reported', '--adapter', 'node-test', '--report', join(f.directory, 'unregistered.ndjson'), '--', process.execPath, '--test', join(f.src, 'unregistered.test.mjs')))
    const unregistered = verify()
    assert.equal(unregistered.status, 1, unregistered.stdout)
    assert.match(unregistered.stderr, /CONTRACT_EXECUTION_REQUIRED.*source-bound/)
    ok(run('oracle-run.mjs', 'exec', '--dir', f.directory, '--label', 'fast-check:reported', '--adapter', 'node-test', '--report', join(f.directory, 'registered-again.ndjson'), '--', process.execPath, '--test', join(f.src, 'witness.test.mjs')))
    ok(verify())
    // Identical bytes cannot disguise a retargeted registered symlink or an escape.
    for (const destination of [join(f.src, 'property-other.mjs'), join(f.storage, 'property-outside.mjs')]) {
      writeFileSync(destination, propertyBytes)
      rmSync(join(f.src, 'property.mjs'))
      symlinkSync(destination, join(f.src, 'property.mjs'))
      try {
        const refused = verify()
        assert.equal(refused.status, 1, refused.stdout)
        assert.match(refused.stderr, /CONTRACT_EXECUTION_REQUIRED|EVIDENCE_STALE/)
        const transition = run('oracle-run.mjs', 'transition', '--dir', f.directory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-003', '--evidence', mapPath)
        assert.equal(transition.status, 1, transition.stdout)
      } finally {
        rmSync(join(f.src, 'property.mjs'))
        writeFileSync(join(f.src, 'property.mjs'), propertyBytes)
        rmSync(destination)
      }
    }
    ok(verify())
    const mutationFailures = []
    for (const file of ['product.mjs', 'positive.mts', 'negative.mts', 'property.mjs', 'product.d.mts', 'witness.test.mjs', f.lock]) {
      const target = file === f.lock ? file : join(f.src, file)
      const bytes = readFileSync(target)
      const unchanged = ['run-state.json', 'runs.jsonl'].map((name) => readFileSync(join(f.directory, name)))
      try {
        writeFileSync(target, Buffer.concat([bytes, Buffer.from('\n')]))
        const stale = verify()
        assert.equal(stale.status, 1, `current mutation accepted: ${file}\n${stale.stdout}`)
        assert.match(stale.stderr, /EVIDENCE_STALE|LOCK_MANIFEST_CHANGED/)
        const transition = run('oracle-run.mjs', 'transition', '--dir', f.directory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-003', '--evidence', mapPath)
        assert.equal(transition.status, 1)
        for (const [index, name] of ['run-state.json', 'runs.jsonl'].entries()) assert.deepEqual(readFileSync(join(f.directory, name)), unchanged[index])
      } catch (error) { mutationFailures.push(error.message) } finally { writeFileSync(target, bytes) }
    }
    assert.deepEqual(mutationFailures, [])
    const authorityPath = join(f.directory, 'run-state.json')
    const authorityBytes = readFileSync(authorityPath)
    const authorityLedger = readFileSync(join(f.directory, 'runs.jsonl'))
    try {
      rmSync(authorityPath)
      const absent = verify()
      assert.equal(absent.status, 1)
      assert.match(absent.stderr, /STATE_INVALID/)
      assert.equal(existsSync(authorityPath), false)
      assert.deepEqual(readFileSync(join(f.directory, 'runs.jsonl')), authorityLedger)
    } finally { writeFileSync(authorityPath, authorityBytes) }
    ok(run('oracle-run.mjs', 'transition', '--dir', f.directory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-003', '--evidence', mapPath))
    const report = JSON.parse(accepted.stdout.trim().split('\n').at(-1))
    assert.equal(report.verificationProfile, 'contract/v1')
    assert.equal(report.N_executed_unique, 12)
    assert.equal(report.formalVerification, 'not-performed')
    assert.equal(status().verification.N_executed_unique, 12)
    const stateBytes = readFileSync(join(f.directory, 'run-state.json'))
    const ledgerBytes = readFileSync(join(f.directory, 'runs.jsonl'))
    const claims = join(f.directory, 'report.md')
    writeFileSync(claims, 'Status: IMPLEMENTED_GREEN\nProfile: contract/v1\nCoverage: full-product\nExecuted unique: 12\nPassed unique: 12\nFormal verification: not-performed\nr-003 exit 0\n')
    ok(run('oracle-run.mjs', 'status', '--dir', f.directory, '--check-report', claims))
    assert.deepEqual(readFileSync(join(f.directory, 'run-state.json')), stateBytes)
    assert.deepEqual(readFileSync(join(f.directory, 'runs.jsonl')), ledgerBytes)
    map.frames[f.data.records[0].frame].name = names[1]
    writeFileSync(mapPath, JSON.stringify(map))
    assert.equal(verify().status, 1)
    writeFileSync(claims, 'Status: ORACLE_READY\nProfile: formal-bend/v1\n')
    assert.equal(run('oracle-run.mjs', 'status', '--dir', f.directory, '--check-report', claims).status, 1)
    const first = f.data.records[0]
    const identity = { id: first.frame, scenario: first.scenario.id, tuple: first.tuple, dimensionRevision: f.data.generated.dimensionRevision, constraintRevision: f.data.generated.constraintRevision }
    for (const delta of [{ dimensionRevision: 'old' }, { constraintRevision: 'old' }, { scenario: 'old' }, { tuple: { ...first.tuple, history: 'prior' } }]) {
      const name = `case [${first.frame}] oracle-case:${Buffer.from(JSON.stringify({ ...identity, ...delta })).toString('base64url')}`
      const changedCases = cases.replace(JSON.stringify(names[0]), JSON.stringify(name))
      writeFileSync(path, `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport {trace} from './product.mjs'\n${changedCases}\n`)
      map.frames[first.frame].name = name
      map.rows.O1.name = name
      map.sequence.name = name
      writeFileSync(mapPath, JSON.stringify(map))
      const observed = ok(run('oracle-run.mjs', 'exec', '--dir', f.directory, '--label', 'contract-cases:reported', '--adapter', 'node-test', '--report', join(f.directory, `stale-${Object.keys(delta)[0]}.ndjson`), '--', process.execPath, '--test', path))
      const rejected = verify(observed.stdout.match(/RUN_RECORDED (r-\d+)/)[1])
      assert.equal(rejected.status, 1)
      assert.match(rejected.stderr, /EVIDENCE_STALE.*reporter executed another tuple\/scenario\/revision/)
    }
  } finally { rmSync(f.storage, { recursive: true, force: true }) }
})

for (const dependency of ['typescript', 'fast-check', 'type-fest']) test(`public RED refuses missing Contract producer ${dependency} in a mixed nonzero run`, () => {
  const f = fixture()
  try {
    producers(f.root, f.src)
    rmSync(join(f.root, 'node_modules', dependency))
    const request = dependency === 'fast-check'
      ? { name: 'missing compiler', kind: 'fast-check', module: 'property.mjs' }
      : { name: 'missing compiler', kind: 'type-contract', positive: 'positive.mts', negative: 'negative.mts' }
    const path = join(f.src, 'missing.test.mjs')
    const isolatedPath = join(f.src, 'isolated.test.mjs')
    writeFileSync(isolatedPath, `import test from 'node:test'\ntest('missing compiler',t=>t.diagnostic('oracle-contract/v1 '+JSON.stringify(${JSON.stringify(request)})))\n`)
    writeFileSync(path, `import test from 'node:test'\nimport assert from 'node:assert/strict'\ntest('missing compiler',t=>t.diagnostic('oracle-contract/v1 '+JSON.stringify(${JSON.stringify(request)})))\ntest('unrelated failure',()=>assert.equal(1,2))\n`)
    ok(run('oracle-run.mjs', 'init', '--dir', f.directory, '--lock', f.lock, '--scan-root', f.src, ...['contract-cases:reported', 'type-contract:reported', 'fast-check:reported'].flatMap((label) => ['--required-label', label])))
    const mapPath = join(f.directory, 'evidence.json')
    writeFileSync(mapPath, JSON.stringify({ schemaVersion: 1, rows: { O1: { kind: 'test', name: 'missing compiler' } } }))
    const initialState = readFileSync(join(f.directory, 'run-state.json'))
    const isolated = run('oracle-run.mjs', 'exec', '--dir', f.directory, '--label', 'contract-cases:reported', '--adapter', 'node-test', '--report', join(f.directory, 'isolated.ndjson'), '--', process.execPath, '--test', isolatedPath)
    assert.equal(isolated.status, 1)
    assert.match(isolated.stderr, /REPORT_NONPASSING/)
    const isolatedRecord = JSON.parse(readFileSync(join(f.directory, 'runs.jsonl'), 'utf8').trim().split('\n').at(-1))
    assert.equal(isolatedRecord.exitCode, 0)
    assert.equal(isolatedRecord.tests.find((entry) => entry.name === 'missing compiler').cause, 'infra')
    assert.deepEqual(readFileSync(join(f.directory, 'run-state.json')), initialState)
    ok(run('oracle-run.mjs', 'exec', '--dir', f.directory, '--label', 'contract-cases:reported', '--adapter', 'node-test', '--report', join(f.directory, 'missing.ndjson'), '--', process.execPath, '--test', path))
    const record = JSON.parse(readFileSync(join(f.directory, 'runs.jsonl'), 'utf8').trim().split('\n').at(-1))
    assert.equal(record.exitCode, 1)
    const before = ['run-state.json', 'runs.jsonl'].map((name) => readFileSync(join(f.directory, name)))
    const verifierRefused = run('oracle-verify.mjs', 'red', '--oracle', f.oracle, '--map', mapPath, '--ledger', join(f.directory, 'runs.jsonl'), '--run', record.runId, '--row', 'O1')
    assert.equal(verifierRefused.status, 1)
    assert.match(verifierRefused.stderr, /RED_CAUSE_INFRA/)
    for (const [index, name] of ['run-state.json', 'runs.jsonl'].entries()) assert.deepEqual(readFileSync(join(f.directory, name)), before[index])
    const refused = run('oracle-run.mjs', 'transition', '--dir', f.directory, '--to', 'VALID_RED', '--run', record.runId, '--evidence', mapPath, '--row', 'O1')
    assert.equal(refused.status, 1, refused.stdout)
    assert.match(refused.stderr, /RED_CAUSE_INFRA/)
    assert.equal(record.tests.find((entry) => entry.name === 'missing compiler').cause, 'infra')
    assert.match(record.tests.find((entry) => entry.name === 'missing compiler').contractEvidence.error, /typescript|fast-check|type-fest|Cannot find module/)
    for (const [index, name] of ['run-state.json', 'runs.jsonl'].entries()) assert.deepEqual(readFileSync(join(f.directory, name)), before[index])
  } finally { rmSync(f.storage, { recursive: true, force: true }) }
})

test('trusted Node reporter executes compiler witnesses and fast-check rather than counting labels', () => {
  const root = mkdtempSync(join(tmpdir(), 'contract-producers-'))
  try {
    writeFileSync(join(root, 'product.mjs'), 'export const result = x => x\n')
    producers(root, root)
    const path = join(root, 'witness.test.mjs')
    writeFileSync(path, `import test from 'node:test'\ntest('compiler',t=>t.diagnostic('oracle-contract/v1 '+JSON.stringify({name:'compiler',kind:'type-contract',positive:'positive.mts',negative:'negative.mts'})))\ntest('property',t=>t.diagnostic('oracle-contract/v1 '+JSON.stringify({name:'property',kind:'fast-check',module:'property.mjs'})))\n`)
    const output = join(root, 'report.ndjson')
    const executed = spawnSync(process.execPath, ['--test', `--test-reporter=${new URL('oracle-node-reporter.mjs', scripts).pathname}`, `--test-reporter-destination=${output}`, path], { encoding: 'utf8', env: { ...environment, ORACLE_VERIFICATION_PROFILE: 'contract/v1' } })
    assert.equal(executed.status, 0, executed.stderr)
    const events = readFileSync(output, 'utf8').trim().split('\n').map(JSON.parse)
    const compiler = events.find(({ data }) => data.name === 'compiler').data.contractEvidence
    assert.equal(compiler.positive.exitCode, 0)
    assert.notEqual(compiler.negative.exitCode, 0)
    assert.match(compiler.negative.diagnostics, /TS2322/)
    const property = events.find(({ data }) => data.name === 'property').data.contractEvidence
    assert.equal(property.numRuns, 20)
    assert.equal(property.seed, 42)
    assert.equal(property.failed, false)
    assert.ok(property.sourceSha256)
    writeFileSync(join(root, 'product.mjs'), 'export const result = x => x + 1\n')
    const failureOutput = join(root, 'failure.ndjson')
    const failed = spawnSync(process.execPath, ['--test', `--test-reporter=${new URL('oracle-node-reporter.mjs', scripts).pathname}`, `--test-reporter-destination=${failureOutput}`, path], { encoding: 'utf8', env: { ...environment, ORACLE_VERIFICATION_PROFILE: 'contract/v1' } })
    assert.equal(failed.status, 0, failed.stderr)
    const failure = readFileSync(failureOutput, 'utf8').trim().split('\n').map(JSON.parse).find(({ data }) => data.name === 'property').data
    assert.equal(failure.status, 'failed')
    assert.equal(failure.cause, 'assertion')
    assert.equal(failure.contractEvidence.failed, true)
    assert.ok(failure.contractEvidence.numRuns > 0)
    assert.ok(Number.isSafeInteger(failure.contractEvidence.numShrinks))
    assert.equal(typeof failure.contractEvidence.counterexamplePath, 'string')
    assert.ok(Array.isArray(failure.contractEvidence.counterexample))
    writeFileSync(join(root, 'product.d.mts'), 'export function result(x: number): string\n')
    const compilerFailureOutput = join(root, 'compiler-failure.ndjson')
    const compilerFailed = spawnSync(process.execPath, ['--test', `--test-reporter=${new URL('oracle-node-reporter.mjs', scripts).pathname}`, `--test-reporter-destination=${compilerFailureOutput}`, path], { encoding: 'utf8', env: { ...environment, ORACLE_VERIFICATION_PROFILE: 'contract/v1' } })
    assert.equal(compilerFailed.status, 0, compilerFailed.stderr)
    const compilerFailure = readFileSync(compilerFailureOutput, 'utf8').trim().split('\n').map(JSON.parse).find(({ data }) => data.name === 'compiler').data
    assert.equal(compilerFailure.status, 'failed')
    assert.equal(compilerFailure.cause, 'assertion')
    assert.notEqual(compilerFailure.contractEvidence.positive.exitCode, 0)
    assert.match(compilerFailure.contractEvidence.positive.diagnostics, /TS2322/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
