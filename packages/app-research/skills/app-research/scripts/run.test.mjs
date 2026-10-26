import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { main, parseArgs } from './cli.mjs'
import { initRun, status } from './run.mjs'
import { loadRun } from './state.mjs'
import { newRun, screen, tempDir, writeSnapshot } from './test-helpers.mjs'

const base = async () => ({
  target: 'https://example.com/app',
  platform: 'web',
  'output-dir': join(await tempDir(), 'out'),
})

test('initRun as a minimal request', async () => {
  const { runDir, run } = await initRun(await base(), new Date('2026-10-26T09:30:00Z'))
  assert.match(run.runId, /^20261026T093000Z-[\da-f]{4}$/)
  assert.deepEqual(
    {
      app: run.app,
      mode: run.mode,
      scope: run.scope,
      locale: run.locale,
      targetVersion: run.targetVersion,
      maxActions: run.maxActions,
      maxDepth: run.maxDepth,
      testSession: run.testSession,
    },
    {
      app: 'https-example-com-app',
      mode: 'interactive',
      scope: 'all',
      locale: 'en-US',
      targetVersion: 'unknown',
      maxActions: 60,
      maxDepth: 4,
      testSession: 'none',
    },
  )
  assert.equal(await readFile(join(runDir, '.gitignore'), 'utf8'), 'screenshots/\nsnapshots/\n')
  assert.deepEqual(JSON.parse(await readFile(join(runDir, 'run.json'), 'utf8')), run)
  assert.deepEqual((await loadRun(runDir)).screens, [])
})

test('initRun as no credential fields', async () => {
  const { run } = await initRun({ ...(await base()), password: 'hunter2', 'test-session': 'human-prepared' })
  assert.equal(JSON.stringify(run).includes('hunter2'), false)
  assert.equal(run.testSession, 'human-prepared')
})

test('initRun as two runs of the same app', async () => {
  const input = await base()
  const first = await initRun(input)
  const second = await initRun({ ...input, 'target-version': '2.0.0' })
  assert.notEqual(first.runDir, second.runDir)
  assert.equal(first.run.targetVersion, 'unknown')
  assert.equal((await readdir(join(first.runDir, '..'))).length, 2)
})

test('initRun as invalid input', async () => {
  const input = await base()
  await assert.rejects(initRun({ platform: input.platform, 'output-dir': input['output-dir'] }), /--target is required/)
  await assert.rejects(initRun({ ...input, platform: 'windows' }), /--platform must be one of ios, android, web/)
  await assert.rejects(initRun({ ...input, scope: 'everything' }), /--scope must be one of/)
  await assert.rejects(initRun({ ...input, scope: 'custom' }), /--scope-note/)
  await assert.rejects(initRun({ ...input, mode: 'yolo' }), /--mode must be one of/)
  await assert.rejects(initRun({ ...input, 'max-actions': '0' }), /--max-actions must be an integer from 1 to 500/)
  await assert.rejects(initRun({ ...input, 'max-depth': '2.5' }), /--max-depth/)
  await assert.rejects(initRun({ ...input, 'test-session': 'shared-login' }), /--test-session must be one of/)
})

test('status as a researched run', async () => {
  const { root, runDir } = await newRun()
  const { observe } = await import('./observe.mjs')
  await observe(runDir, { anchor: true, snapshot: await writeSnapshot(root, 'a', screen('Home', ['Go'])) })
  assert.deepEqual(await status(runDir), {
    runId: (await loadRun(runDir)).run.runId,
    target: 'com.example.app',
    mode: 'interactive',
    budget: { used: 0, max: 60 },
    observations: 1,
    screens: 1,
    transitions: 0,
    blocked: 0,
    humanActionsPending: 0,
  })
})

test('parseArgs as flags in every form', () => {
  assert.deepEqual(parseArgs(['--run', 'dir', '--anchor', '--label=Sign in', '--note', '']), {
    run: 'dir',
    anchor: true,
    label: 'Sign in',
    note: '',
  })
  assert.throws(() => parseArgs(['stray']), /Unexpected argument stray/)
})

test('main as a full session through the command line entry', async () => {
  const root = await tempDir()
  const out = join(root, 'out')
  const { runDir } = await main([
    'init',
    '--target',
    'com.example',
    '--platform',
    'android',
    '--output-dir',
    out,
    '--max-actions',
    '5',
  ])
  const snap = (name, tree) => writeSnapshot(root, name, tree)
  await main(['observe', '--run', runDir, '--anchor', '--snapshot', await snap('a', screen('Home', ['Settings']))])
  const step = await main(['next', '--run', runDir])
  assert.deepEqual(
    step.candidates.map((c) => c.label),
    ['Settings'],
  )
  const receipt = await main([
    'gate',
    '--run',
    runDir,
    '--action',
    'tap',
    '--label',
    'Settings',
    '--role',
    'button',
    '--id',
    'btn-Settings',
  ])
  assert.equal(receipt.decision, 'allow')
  const seen = await main([
    'observe',
    '--run',
    runDir,
    '--gate',
    receipt.gateId,
    '--snapshot',
    await snap('b', screen('Settings', [])),
  ])
  assert.equal(seen.classification, 'new-screen')
  assert.deepEqual(await main(['lint', '--run', runDir]), { ok: true, errors: [] })
  assert.equal((await main(['render', '--run', runDir])).files.length, 9)
  assert.equal((await main(['status', '--run', runDir])).budget.used, 1)
})

test('main as a bad command line', async () => {
  await assert.rejects(main(['dance']), /Usage: cli\.mjs/)
  await assert.rejects(main(['gate']), /--run <run directory> is required/)
  await assert.rejects(main(['status', '--run', join(await tempDir(), 'missing')]), /Missing file/)
})
