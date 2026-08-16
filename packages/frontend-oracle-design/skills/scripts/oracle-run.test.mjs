import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const script = join(scriptDirectory, 'oracle-run.mjs')
const lockScript = join(scriptDirectory, 'oracle-lock.mjs')

function run(args, environment) {
  // 바깥 `node --test`가 남긴 NODE_TEST_CONTEXT를 물려주면 자식 node --test가
  // test-child 모드로 돌아 exit code와 reporter 출력을 내지 않는다.
  const { NODE_TEST_CONTEXT, ...cleanEnvironment } = process.env

  return spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...cleanEnvironment, ...environment },
  })
}

async function ledgerLines(oracleDirectory) {
  const raw = await readFile(join(oracleDirectory, 'runs.jsonl'), 'utf8')
  return raw.split('\n').filter(Boolean)
}

async function state(oracleDirectory) {
  return JSON.parse(await readFile(join(oracleDirectory, 'run-state.json'), 'utf8'))
}

/** 명령이 실제로 실행됐는지 세는 부작용 카운터 — 실행마다 marker 파일에 한 줄을 붙인다. */
function appendMarker(markerPath, exitCode) {
  return ['-e', `require('node:fs').appendFileSync(${JSON.stringify(markerPath)}, 'x\\n'); process.exit(${exitCode})`]
}

/** scan-root 전체의 `상대경로 → sha256` 스냅샷. 부작용 횟수 검증에 쓴다. */
async function snapshotOf(root, prefix = '') {
  const entries = await readdir(join(root, prefix), { withFileTypes: true })
  const digests = {}

  for (const entry of entries) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name

    if (entry.isDirectory()) Object.assign(digests, await snapshotOf(root, path))
    else if (entry.isFile()) digests[path] = createHash('sha256').update(await readFile(join(root, path))).digest('hex')
  }

  return digests
}

async function markerCount(markerPath) {
  try {
    const raw = await readFile(markerPath, 'utf8')
    return raw.split('\n').filter(Boolean).length
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
}

async function workspace(t, { risk = 'medium', git = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-run-'))
  t.after(() => rm(root, { recursive: true, force: true }))

  if (git) {
    const initialized = spawnSync('git', ['init', '-q', root], { encoding: 'utf8' })
    if (initialized.status !== 0) return null
    await writeFile(join(root, '.gitignore'), 'node_modules/\n')
  }

  const oracleDirectory = join(root, '.ai', 'oracles', 'sample')
  await mkdir(oracleDirectory, { recursive: true })
  await mkdir(join(root, 'src'), { recursive: true })

  const oracle = join(oracleDirectory, 'oracle.md')
  const lock = join(oracleDirectory, 'oracle.lock.json')
  await writeFile(oracle, '# Oracle\n')

  const locked = spawnSync(process.execPath, [lockScript, 'create', '--oracle', oracle, '--lock', lock], {
    encoding: 'utf8',
  })
  assert.equal(locked.status, 0, locked.stderr)

  const initialized = run(['init', '--dir', oracleDirectory, '--lock', lock, '--risk', risk, '--scan-root', root])
  assert.equal(initialized.status, 0, initialized.stderr)

  return { root, oracleDirectory, oracle, lock, marker: join(root, 'marker.txt') }
}

test('O1: exec는 명령을 한 번 실행하고 ledger에 한 줄을 남긴다', async (t) => {
  const { root, oracleDirectory, marker } = await workspace(t)
  const before = await snapshotOf(root)

  const executed = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red-1',
    '--',
    process.execPath,
    ...appendMarker(marker, 0),
  ])

  assert.equal(executed.status, 0, executed.stderr)
  assert.match(executed.stdout, /^RUN_RECORDED r-001 exit:0 grade:exit-only\n$/)
  assert.equal(await markerCount(marker), 1)

  const lines = await ledgerLines(oracleDirectory)
  assert.equal(lines.length, 1)

  const record = JSON.parse(lines[0])
  assert.equal(record.runId, 'r-001')
  assert.equal(record.label, 'red-1')
  assert.equal(record.exitCode, 0)
  assert.equal(record.grade, 'exit-only')
  assert.equal(record.command[0], process.execPath)
  assert.match(record.lockSha256, /^[a-f0-9]{64}$/)
  assert.match(record.worktreeSha256, /^[a-f0-9]{64}$/)
  assert.equal(typeof record.env.node, 'string')
  assert.match(record.at, /^\d{4}-\d{2}-\d{2}T/)

  // product write×0 — oracle artifact와 실행 marker 외에는 어떤 파일도 바뀌지 않는다.
  const changed = Object.entries(await snapshotOf(root)).filter(([path, digest]) => before[path] !== digest)
  assert.deepEqual(
    changed.map(([path]) => path).sort(),
    ['.ai/oracles/sample/runs.jsonl', 'marker.txt'],
  )
})

test('O2: lock mismatch면 명령을 실행하지 않고 ORACLE_CHANGED로 멈춘다', async (t) => {
  const { oracleDirectory, oracle, marker } = await workspace(t)
  await writeFile(oracle, '# Tampered Oracle\n')

  const executed = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red-1',
    '--',
    process.execPath,
    ...appendMarker(marker, 0),
  ])

  assert.equal(executed.status, 1)
  assert.match(executed.stderr, /^ORACLE_CHANGED: /)
  assert.equal(await markerCount(marker), 0)
  await assert.rejects(ledgerLines(oracleDirectory), { code: 'ENOENT' })
})

test('O3: reporter JSON이 있으면 테스트 이름과 상태를 기록하고 grade는 reported다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)

  const vitestReport = join(root, 'vitest.json')
  await writeFile(
    vitestReport,
    JSON.stringify({
      testResults: [
        {
          assertionResults: [
            { fullName: 'save > pending 표시', status: 'passed' },
            { fullName: 'save > POST 1회', status: 'failed' },
          ],
        },
      ],
    }),
  )

  const vitestRun = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red-1',
    '--report',
    vitestReport,
    '--',
    process.execPath,
    '-e',
    'process.exit(1)',
  ])
  assert.equal(vitestRun.status, 0, vitestRun.stderr)
  assert.match(vitestRun.stdout, /^RUN_RECORDED r-001 exit:1 grade:reported\n$/)

  const nodeReport = join(root, 'node-report.ndjson')
  await writeFile(
    nodeReport,
    [
      JSON.stringify({ type: 'test:pass', data: { name: 'ledger는 한 줄을 남긴다' } }),
      JSON.stringify({ type: 'test:fail', data: { name: 'lock mismatch를 막는다' } }),
      '',
    ].join('\n'),
  )

  const nodeRun = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'green-1',
    '--report',
    nodeReport,
    '--',
    process.execPath,
    '-e',
    'process.exit(0)',
  ])
  assert.equal(nodeRun.status, 0, nodeRun.stderr)
  assert.match(nodeRun.stdout, /^RUN_RECORDED r-002 exit:0 grade:reported\n$/)

  const playwrightReport = join(root, 'playwright.json')
  await writeFile(
    playwrightReport,
    JSON.stringify({
      suites: [
        {
          title: 'hero.style.spec.ts',
          specs: [{ title: '320px 스냅샷', ok: true }],
          suites: [{ title: 'dark', specs: [{ title: 'contrast', ok: false }] }],
        },
      ],
    }),
  )

  const playwrightRun = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'green-2',
    '--report',
    playwrightReport,
    '--',
    process.execPath,
    '-e',
    'process.exit(0)',
  ])
  assert.equal(playwrightRun.status, 0, playwrightRun.stderr)
  assert.match(playwrightRun.stdout, /^RUN_RECORDED r-003 exit:0 grade:reported\n$/)

  const [first, second, third] = (await ledgerLines(oracleDirectory)).map((line) => JSON.parse(line))
  assert.deepEqual(first.tests, [
    { name: 'save > pending 표시', status: 'passed' },
    { name: 'save > POST 1회', status: 'failed' },
  ])
  assert.deepEqual(second.tests, [
    { name: 'ledger는 한 줄을 남긴다', status: 'passed' },
    { name: 'lock mismatch를 막는다', status: 'failed' },
  ])
  assert.deepEqual(third.tests, [
    { name: 'hero.style.spec.ts > 320px 스냅샷', status: 'passed' },
    { name: 'hero.style.spec.ts > dark > contrast', status: 'failed' },
  ])
})

test('O3: 번들 node reporter로 실행하면 실제 테스트 이름이 ledger에 기록된다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  const reporter = join(scriptDirectory, 'oracle-node-reporter.mjs')
  const target = join(root, 'sample.test.mjs')
  const report = join(root, 'report.ndjson')

  await writeFile(
    target,
    [
      "import assert from 'node:assert/strict'",
      "import test from 'node:test'",
      "test('통과하는 계약', () => assert.equal(1, 1))",
      "test('실패하는 계약', () => assert.equal(1, 2))",
      '',
    ].join('\n'),
  )

  const executed = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red-1',
    '--report',
    report,
    '--',
    process.execPath,
    '--test',
    `--test-reporter=${reporter}`,
    `--test-reporter-destination=${report}`,
    target,
  ])

  assert.equal(executed.status, 0, executed.stderr)
  assert.match(executed.stdout, /^RUN_RECORDED r-001 exit:1 grade:reported\n$/)

  const [record] = (await ledgerLines(oracleDirectory)).map((line) => JSON.parse(line))
  assert.deepEqual(record.tests, [
    { name: '통과하는 계약', status: 'passed' },
    { name: '실패하는 계약', status: 'failed' },
  ])
})

test('O4: reporter를 읽거나 파싱할 수 없으면 exit-only로 격하하고 exit code를 보존한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)

  const missingReport = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red-1',
    '--report',
    join(root, 'absent.json'),
    '--',
    process.execPath,
    '-e',
    'process.exit(3)',
  ])
  assert.equal(missingReport.status, 0, missingReport.stderr)
  assert.match(missingReport.stdout, /^RUN_RECORDED r-001 exit:3 grade:exit-only\n$/)

  const unknownShape = join(root, 'unknown.json')
  await writeFile(unknownShape, JSON.stringify({ totals: { passed: 12 } }))
  const unknownReport = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red-2',
    '--report',
    unknownShape,
    '--',
    process.execPath,
    '-e',
    'process.exit(4)',
  ])
  assert.equal(unknownReport.status, 0, unknownReport.stderr)
  assert.match(unknownReport.stdout, /^RUN_RECORDED r-002 exit:4 grade:exit-only\n$/)

  const records = (await ledgerLines(oracleDirectory)).map((line) => JSON.parse(line))
  assert.equal(records[0].tests, null)
  assert.equal(records[1].tests, null)
  assert.equal(records[0].reportError.length > 0, true)
})

test('O5: 테스트 파일만 바뀐 상태의 non-zero run은 VALID_RED로 전이된다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")

  const executed = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red-1',
    '--',
    process.execPath,
    '-e',
    'process.exit(1)',
  ])
  assert.equal(executed.status, 0, executed.stderr)

  const transitioned = run(['transition', '--dir', oracleDirectory, '--to', 'VALID_RED', '--run', 'r-001'])
  assert.equal(transitioned.status, 0, transitioned.stderr)
  assert.match(transitioned.stdout, /^STATE_VALID_RED run:r-001\n$/)

  const current = await state(oracleDirectory)
  assert.equal(current.state, 'VALID_RED')
  assert.equal(current.history.length, 2)
  assert.equal(Object.keys(current.testFiles).length, 1)
  assert.equal(current.testFiles['src/save.test.mjs'].assertions, 1)
})

test('O6: RED 전에 production 파일이 바뀌면 PRODUCTION_TOUCHED_BEFORE_RED로 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = () => null\n')

  run(['exec', '--dir', oracleDirectory, '--label', 'red-1', '--', process.execPath, '-e', 'process.exit(1)'])
  const transitioned = run(['transition', '--dir', oracleDirectory, '--to', 'VALID_RED', '--run', 'r-001'])

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^PRODUCTION_TOUCHED_BEFORE_RED: /)
  assert.match(transitioned.stderr, /src\/save\.mjs/)
  assert.doesNotMatch(transitioned.stderr, /src\/save\.test\.mjs/)
  assert.equal((await state(oracleDirectory)).state, 'ORACLE_READY')
})

test('O6: git 레포에서 gitignore된 파일은 production 변경으로 세지 않는다', async (t) => {
  const created = await workspace(t, { git: true })
  if (!created) return t.skip('git 미설치 — git 경로를 판정할 수 없다')
  const { root, oracleDirectory } = created

  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  await mkdir(join(root, 'node_modules', 'later'), { recursive: true })
  await writeFile(join(root, 'node_modules', 'later', 'index.js'), 'module.exports = 2\n')

  run(['exec', '--dir', oracleDirectory, '--label', 'red-1', '--', process.execPath, '-e', 'process.exit(1)'])
  const transitioned = run(['transition', '--dir', oracleDirectory, '--to', 'VALID_RED', '--run', 'r-001'])

  assert.equal(transitioned.status, 0, transitioned.stderr)
  assert.equal(Object.keys((await state(oracleDirectory)).testFiles).length, 1)
})

test('O6: run-state를 지우고 다시 init해도 기준선과 예산을 되살리지 못한다', async (t) => {
  const { root, oracleDirectory, lock } = await workspace(t)
  run(['exec', '--dir', oracleDirectory, '--label', 'red-1', '--', process.execPath, '-e', 'process.exit(1)'])
  assert.equal(run(['budget', '--dir', oracleDirectory, '--spend', 'product', '--reason', 'r1']).status, 0)

  await rm(join(oracleDirectory, 'run-state.json'))
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = () => null\n')

  const reinitialized = run(['init', '--dir', oracleDirectory, '--lock', lock, '--risk', 'medium', '--scan-root', root])

  assert.equal(reinitialized.status, 1)
  assert.match(reinitialized.stderr, /^RUN_ARTIFACTS_EXIST: /)
  assert.match(reinitialized.stderr, /runs\.jsonl/)
  assert.doesNotMatch(reinitialized.stderr, /remove it/)
})

test('O11: exec 없이 예산만 쓴 뒤 run-state를 지워도 예산을 되살리지 못한다', async (t) => {
  const { root, oracleDirectory, lock } = await workspace(t)
  assert.equal(run(['budget', '--dir', oracleDirectory, '--spend', 'product', '--reason', 'r1']).status, 0)

  await rm(join(oracleDirectory, 'run-state.json'))
  const reinitialized = run(['init', '--dir', oracleDirectory, '--lock', lock, '--risk', 'medium', '--scan-root', root])

  assert.equal(reinitialized.status, 1)
  assert.match(reinitialized.stderr, /^RUN_ARTIFACTS_EXIST: /)
})

test('O11: 예산 기록은 run 번호를 소비하지 않는다', async (t) => {
  const { oracleDirectory } = await workspace(t)
  assert.equal(run(['budget', '--dir', oracleDirectory, '--spend', 'harness', '--reason', 'h1']).status, 0)

  const executed = run([
    'exec',
    '--dir',
    oracleDirectory,
    '--label',
    'red-1',
    '--',
    process.execPath,
    '-e',
    'process.exit(1)',
  ])

  assert.match(executed.stdout, /^RUN_RECORDED r-001 /)
  const entries = (await ledgerLines(oracleDirectory)).map((line) => JSON.parse(line))
  assert.deepEqual(
    entries.map((entry) => entry.type),
    ['budget', 'run'],
  )
})

test('O7: exit 0 run으로는 VALID_RED로 전이하지 못한다', async (t) => {
  const { oracleDirectory } = await workspace(t)
  run(['exec', '--dir', oracleDirectory, '--label', 'red-1', '--', process.execPath, '-e', 'process.exit(0)'])

  const transitioned = run(['transition', '--dir', oracleDirectory, '--to', 'VALID_RED', '--run', 'r-001'])

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^RUN_NOT_RED: /)
  assert.equal((await state(oracleDirectory)).state, 'ORACLE_READY')
})

async function reachValidRed(oracleDirectory, root) {
  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  run(['exec', '--dir', oracleDirectory, '--label', 'red-1', '--', process.execPath, '-e', 'process.exit(1)'])
  const transitioned = run(['transition', '--dir', oracleDirectory, '--to', 'VALID_RED', '--run', 'r-001'])
  assert.equal(transitioned.status, 0, transitioned.stderr)
}

function greenRun(oracleDirectory, label, environment) {
  return run(
    ['exec', '--dir', oracleDirectory, '--label', label, '--', process.execPath, '-e', 'process.exit(0)'],
    environment,
  )
}

test('O8: 연속 통과 횟수를 채운 GREEN 전이는 lock을 재검증하고 통과한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = run(['transition', '--dir', oracleDirectory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-003'])

  assert.equal(transitioned.status, 0, transitioned.stderr)
  assert.match(transitioned.stdout, /^STATE_IMPLEMENTED_GREEN run:r-003\n$/)
  assert.equal((await state(oracleDirectory)).state, 'IMPLEMENTED_GREEN')
})

test('O8: GREEN 전이 직전 lock mismatch면 ORACLE_CHANGED로 멈춘다', async (t) => {
  const { root, oracleDirectory, oracle } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')
  await writeFile(oracle, '# Tampered Oracle\n')

  const transitioned = run(['transition', '--dir', oracleDirectory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-003'])

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^ORACLE_CHANGED: /)
  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')
})

test('O9: 연속 통과가 risk 필요 횟수보다 적으면 FLAKINESS_GATE로 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')

  const transitioned = run(['transition', '--dir', oracleDirectory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-002'])

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^FLAKINESS_GATE: /)
  assert.match(transitioned.stderr, /required 2/)
  assert.match(transitioned.stderr, /consecutive 1/)
  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')
})

test('O9: High risk는 연속 통과 3회를 요구한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t, { risk: 'high' })
  await reachValidRed(oracleDirectory, root)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const blocked = run(['transition', '--dir', oracleDirectory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-003'])
  assert.equal(blocked.status, 1)
  assert.match(blocked.stderr, /required 3/)

  greenRun(oracleDirectory, 'green-3')
  const transitioned = run(['transition', '--dir', oracleDirectory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-004'])
  assert.equal(transitioned.status, 0, transitioned.stderr)
})

test('O10: assertion이 줄면 TEST_WEAKENED로 GREEN을 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(
    join(root, 'src', 'save.test.mjs'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\nassert.equal(2, 2)\n",
  )
  run(['exec', '--dir', oracleDirectory, '--label', 'red-1', '--', process.execPath, '-e', 'process.exit(1)'])
  assert.equal(run(['transition', '--dir', oracleDirectory, '--to', 'VALID_RED', '--run', 'r-001']).status, 0)

  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = run(['transition', '--dir', oracleDirectory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-003'])

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^TEST_WEAKENED: /)
  assert.match(transitioned.stderr, /src\/save\.test\.mjs/)
  assert.match(transitioned.stderr, /assertions 2 → 1/)
  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')
})

test('O10: 금지 토큰이 새로 들어오면 TEST_WEAKENED로 GREEN을 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)

  await writeFile(
    join(root, 'src', 'save.test.mjs'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\ntest.skip('later', () => {})\n",
  )
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = run(['transition', '--dir', oracleDirectory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-003'])

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^TEST_WEAKENED: /)
  assert.match(transitioned.stderr, /test\.skip/)
})

test('O10: screenshot 허용치를 올리면 TEST_WEAKENED로 GREEN을 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(
    join(root, 'src', 'hero.style.test.ts'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\n// maxDiffPixels: 0\n",
  )
  run(['exec', '--dir', oracleDirectory, '--label', 'red-1', '--', process.execPath, '-e', 'process.exit(1)'])
  assert.equal(run(['transition', '--dir', oracleDirectory, '--to', 'VALID_RED', '--run', 'r-001']).status, 0)

  await writeFile(
    join(root, 'src', 'hero.style.test.ts'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\n// maxDiffPixels: 0\n// maxDiffPixelRatio: 0.2\n",
  )
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = run(['transition', '--dir', oracleDirectory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-003'])

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /maxDiffPixelRatio/)
})

test('O10: 토큰 수를 늘리지 않고 screenshot 허용치 값만 올려도 TEST_WEAKENED로 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(
    join(root, 'src', 'hero.style.test.ts'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\nawait expectScreenshot({ maxDiffPixels: 10 })\n",
  )
  run(['exec', '--dir', oracleDirectory, '--label', 'red-1', '--', process.execPath, '-e', 'process.exit(1)'])
  assert.equal(run(['transition', '--dir', oracleDirectory, '--to', 'VALID_RED', '--run', 'r-001']).status, 0)

  // 토큰 수는 그대로 1회, 값만 상향한다.
  await writeFile(
    join(root, 'src', 'hero.style.test.ts'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\nawait expectScreenshot({ maxDiffPixels: 99999 })\n",
  )
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = run(['transition', '--dir', oracleDirectory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-003'])

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^TEST_WEAKENED: /)
  assert.match(transitioned.stderr, /maxDiffPixels 10 → 99999/)
  assert.equal((await state(oracleDirectory)).state, 'VALID_RED')
})

test('O10: 허용치를 낮추거나 유지하면 GREEN을 막지 않는다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(
    join(root, 'src', 'hero.style.test.ts'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\nawait expectScreenshot({ maxDiffPixels: 10 })\n",
  )
  run(['exec', '--dir', oracleDirectory, '--label', 'red-1', '--', process.execPath, '-e', 'process.exit(1)'])
  assert.equal(run(['transition', '--dir', oracleDirectory, '--to', 'VALID_RED', '--run', 'r-001']).status, 0)

  await writeFile(
    join(root, 'src', 'hero.style.test.ts'),
    "import assert from 'node:assert'\nassert.equal(1, 1)\nawait expectScreenshot({ maxDiffPixels: 0 })\n",
  )
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = run(['transition', '--dir', oracleDirectory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-003'])

  assert.equal(transitioned.status, 0, transitioned.stderr)
})

test('O10: RED에 기록된 테스트 파일이 사라지면 TEST_WEAKENED로 GREEN을 거부한다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await reachValidRed(oracleDirectory, root)

  await rm(join(root, 'src', 'save.test.mjs'))
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = run(['transition', '--dir', oracleDirectory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-003'])

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^TEST_WEAKENED: /)
  assert.match(transitioned.stderr, /deleted/)
})

test('O11: 예산은 한도까지만 사용되고 초과 요청은 BUDGET_EXHAUSTED로 거부한다', async (t) => {
  const { oracleDirectory } = await workspace(t)

  for (const round of [1, 2, 3]) {
    const spent = run(['budget', '--dir', oracleDirectory, '--spend', 'product', '--reason', `round-${round}`])
    assert.equal(spent.status, 0, spent.stderr)
    assert.equal(spent.stdout, `BUDGET_SPENT product ${round}/3\n`)
  }

  const exhausted = run(['budget', '--dir', oracleDirectory, '--spend', 'product', '--reason', 'round-4'])

  assert.equal(exhausted.status, 1)
  assert.match(exhausted.stderr, /^BUDGET_EXHAUSTED: /)
  assert.equal((await state(oracleDirectory)).budgets.product.spent, 3)
  assert.equal((await state(oracleDirectory)).budgets.harness.spent, 0)
})

test('O12: RED와 GREEN의 env fingerprint가 다르면 전이는 통과하되 ENV_DRIFT를 남긴다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(join(root, 'src', 'save.test.mjs'), "import assert from 'node:assert'\nassert.equal(1, 1)\n")
  run(
    ['exec', '--dir', oracleDirectory, '--label', 'red-1', '--', process.execPath, '-e', 'process.exit(1)'],
    { TZ: 'UTC' },
  )
  assert.equal(run(['transition', '--dir', oracleDirectory, '--to', 'VALID_RED', '--run', 'r-001']).status, 0)

  greenRun(oracleDirectory, 'green-1', { TZ: 'Asia/Seoul' })
  greenRun(oracleDirectory, 'green-2', { TZ: 'Asia/Seoul' })

  const transitioned = run(['transition', '--dir', oracleDirectory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-003'])

  assert.equal(transitioned.status, 0, transitioned.stderr)
  assert.match(transitioned.stdout, /ENV_DRIFT/)
  assert.match(transitioned.stdout, /Asia\/Seoul/)
  assert.equal((await state(oracleDirectory)).envDrift.length, 1)
})

test('O13: 허용되지 않는 전이는 TRANSITION_NOT_ALLOWED로 거부한다', async (t) => {
  const { oracleDirectory } = await workspace(t)
  run(['exec', '--dir', oracleDirectory, '--label', 'green-1', '--', process.execPath, '-e', 'process.exit(0)'])

  const skipped = run(['transition', '--dir', oracleDirectory, '--to', 'REVIEW_VERIFIED', '--run', 'r-001'])

  assert.equal(skipped.status, 1)
  assert.match(skipped.stderr, /^TRANSITION_NOT_ALLOWED: /)
  assert.match(skipped.stderr, /ORACLE_READY/)
  assert.equal((await state(oracleDirectory)).state, 'ORACLE_READY')
})

test('O14: ledger에 없는 runId를 인용하면 RUN_NOT_FOUND로 거부한다', async (t) => {
  const { oracleDirectory } = await workspace(t)

  const transitioned = run(['transition', '--dir', oracleDirectory, '--to', 'VALID_RED', '--run', 'r-009'])

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^RUN_NOT_FOUND: /)
  assert.equal((await state(oracleDirectory)).state, 'ORACLE_READY')
})

test('O15: exec 두 번은 ledger 두 줄이며 첫 줄은 그대로 유지된다', async (t) => {
  const { oracleDirectory } = await workspace(t)

  run(['exec', '--dir', oracleDirectory, '--label', 'red-1', '--', process.execPath, '-e', 'process.exit(1)'])
  const [afterFirst] = await ledgerLines(oracleDirectory)
  run(['exec', '--dir', oracleDirectory, '--label', 'red-2', '--', process.execPath, '-e', 'process.exit(1)'])

  const lines = await ledgerLines(oracleDirectory)
  assert.equal(lines.length, 2)
  assert.equal(lines[0], afterFirst)
  assert.equal(JSON.parse(lines[1]).runId, 'r-002')
})

test('O16: production 변경이 없으면 사유와 함께 RED 없이 GREEN으로 전이한다', async (t) => {
  const { oracleDirectory } = await workspace(t)
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const withoutReason = run(['transition', '--dir', oracleDirectory, '--to', 'IMPLEMENTED_GREEN', '--run', 'r-002'])
  assert.equal(withoutReason.status, 1)
  assert.match(withoutReason.stderr, /^MISSING_REASON: /)

  const transitioned = run([
    'transition',
    '--dir',
    oracleDirectory,
    '--to',
    'IMPLEMENTED_GREEN',
    '--run',
    'r-002',
    '--reason',
    '기존 구현이 카드를 이미 충족함',
  ])

  assert.equal(transitioned.status, 0, transitioned.stderr)
  const current = await state(oracleDirectory)
  assert.equal(current.state, 'IMPLEMENTED_GREEN')
  assert.equal(current.history.at(-1).reason, '기존 구현이 카드를 이미 충족함')
})

test('O16: production이 바뀐 상태에서는 RED 없이 GREEN으로 갈 수 없다', async (t) => {
  const { root, oracleDirectory } = await workspace(t)
  await writeFile(join(root, 'src', 'save.mjs'), 'export const save = () => null\n')
  greenRun(oracleDirectory, 'green-1')
  greenRun(oracleDirectory, 'green-2')

  const transitioned = run([
    'transition',
    '--dir',
    oracleDirectory,
    '--to',
    'IMPLEMENTED_GREEN',
    '--run',
    'r-002',
    '--reason',
    '기존 구현이 카드를 이미 충족함',
  ])

  assert.equal(transitioned.status, 1)
  assert.match(transitioned.stderr, /^PRODUCTION_TOUCHED_BEFORE_RED: /)
  assert.equal((await state(oracleDirectory)).state, 'ORACLE_READY')
})
