import assert from 'node:assert/strict'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { gate } from './gate.mjs'
import { observe } from './observe.mjs'
import { loadRun } from './state.mjs'
import { act, anchor, newRun, screen, writeSnapshot } from './test-helpers.mjs'

const home = () => screen('Home', ['Settings', 'Profile'])
const settings = () => screen('Settings', ['Notifications'])

test('observe as the first screen of a run', async () => {
  const { root, runDir } = await newRun()
  const result = await anchor(root, runDir, home())
  assert.equal(result.classification, 'new-screen')
  assert.equal(result.screenId, 'S-001')
  const state = await loadRun(runDir)
  assert.equal(state.screens[0].depth, 0)
  assert.equal(state.screens[0].parent, null)
  assert.deepEqual(
    state.screens[0].candidates.map((c) => c.label),
    ['Settings', 'Profile'],
  )
  assert.equal(state.observations[0].anchor, true)
  assert.equal(state.observations[0].gateId, null)
  assert.deepEqual(state.observations[0].limitations, ['screenshot-missing'])
})

test('observe as an action that opens a new screen', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  const result = await act(root, runDir, { action: 'tap', label: 'Settings', id: 'btn-Settings' }, settings())
  assert.deepEqual(
    {
      classification: result.classification,
      screenId: result.screenId,
      transitionId: result.transitionId,
      result: result.result,
    },
    { classification: 'new-screen', screenId: 'S-002', transitionId: 'T-001', result: 'ok' },
  )
  const state = await loadRun(runDir)
  assert.equal(state.screens[1].depth, 1)
  assert.deepEqual(state.screens[1].parent, { screenId: 'S-001', observationId: 'O-0002' })
  assert.deepEqual(
    { from: state.transitions[0].from, to: state.transitions[0].to, label: state.transitions[0].action.label },
    { from: 'S-001', to: 'S-002', label: 'Settings' },
  )
  assert.equal(state.gates[0].consumedBy, 'O-0002')
})

test('observe as the same screen with a spinner', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  // a spinner appearing is a state change on the same screen, not a new screen
  const spinner = home()
  spinner.children[1].children.push({ role: 'activityindicator' })
  const result = await act(root, runDir, { action: 'tap', label: 'Settings', id: 'btn-Settings' }, spinner)
  assert.equal(result.classification, 'new-state')
  assert.equal(result.screenId, 'S-001')
  assert.equal(result.stateId, 'S-001.2')
  const state = await loadRun(runDir)
  assert.equal(state.screens.length, 1)
  assert.equal(state.screens[0].states[1].kind, 'loading')
  assert.equal(state.transitions[0].from, state.transitions[0].to, 'a state change is a self transition')
})

test('observe as an action that changes nothing', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  const result = await act(root, runDir, { action: 'tap', label: 'Profile', id: 'btn-Profile' }, home())
  assert.equal(result.result, 'no-change')
  assert.equal(result.transitionId, null)
  assert.equal(result.classification, 'known')
  assert.equal((await loadRun(runDir)).transitions.length, 0)
})

test('observe as an action that fails on the device', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  const result = await act(root, runDir, { action: 'tap', label: 'Settings', id: 'btn-Settings' }, settings(), {
    result: 'timeout',
  })
  assert.equal(result.result, 'timeout')
  assert.equal(result.transitionId, null, 'a failed action is never a transition')
  assert.equal((await loadRun(runDir)).observations[1].result, 'timeout')
})

test('observe as a repeated transition', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  await act(root, runDir, { action: 'tap', label: 'Settings', id: 'btn-Settings' }, settings())
  await act(root, runDir, { action: 'back' }, home())
  await act(root, runDir, { action: 'tap', label: 'Settings', id: 'btn-Settings' }, settings())
  const { transitions } = await loadRun(runDir)
  const open = transitions.find((t) => t.action.label === 'Settings')
  assert.equal(open.count, 2)
  assert.deepEqual(open.observationIds, ['O-0002', 'O-0004'])
  assert.equal(transitions.length, 2)
})

test('observe as a shorter path to a known screen', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  await act(root, runDir, { action: 'tap', label: 'Profile', id: 'btn-Profile' }, screen('Profile', ['Settings']))
  await act(root, runDir, { action: 'tap', label: 'Settings', id: 'btn-Settings' }, settings())
  assert.equal((await loadRun(runDir)).screens[2].depth, 2)
  await act(root, runDir, { action: 'back' }, home())
  await act(root, runDir, { action: 'tap', label: 'Settings', id: 'btn-Settings' }, settings())
  assert.equal((await loadRun(runDir)).screens[2].depth, 1)
})

test('observe as a blocked gate receipt', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, screen('Home', ['Pay now']))
  const verdict = await gate(runDir, { action: 'tap', label: 'Pay now', role: 'button' })
  const snapshot = await writeSnapshot(root, 'after', home())
  await assert.rejects(observe(runDir, { gate: verdict.gateId, snapshot }), /was blocked \(payment\)/)
  assert.equal((await loadRun(runDir)).observations.length, 1)
})

test('observe as a receipt used twice', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  const verdict = await gate(runDir, { action: 'tap', label: 'Settings', role: 'button', id: 'btn-Settings' })
  const snapshot = await writeSnapshot(root, 'after', settings())
  await observe(runDir, { gate: verdict.gateId, snapshot })
  await assert.rejects(observe(runDir, { gate: verdict.gateId, snapshot }), /already used by O-0002/)
})

test('observe as a receipt replaced by a newer one', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  const first = await gate(runDir, { action: 'tap', label: 'Settings', role: 'button', id: 'btn-Settings' })
  const second = await gate(runDir, { action: 'tap', label: 'Profile', role: 'button', id: 'btn-Profile' })
  const snapshot = await writeSnapshot(root, 'after', settings())
  await assert.rejects(observe(runDir, { gate: first.gateId, snapshot }), /superseded/)
  assert.equal((await observe(runDir, { gate: second.gateId, snapshot })).screenId, 'S-002')
})

test('observe as an unknown receipt or no receipt', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  const snapshot = await writeSnapshot(root, 'after', settings())
  await assert.rejects(observe(runDir, { gate: 'G-0099', snapshot }), /Unknown gate/)
  await assert.rejects(observe(runDir, { snapshot }), /exactly one of --anchor/)
  await assert.rejects(observe(runDir, { anchor: true, gate: 'G-0001', snapshot }), /exactly one of --anchor/)
})

test('observe as a missing snapshot file', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  const verdict = await gate(runDir, { action: 'tap', label: 'Settings', role: 'button', id: 'btn-Settings' })
  await assert.rejects(
    observe(runDir, { gate: verdict.gateId, snapshot: join(root, 'nope.json') }),
    /--snapshot is not a readable file/,
  )
  await assert.rejects(
    observe(runDir, {
      gate: verdict.gateId,
      snapshot: await writeSnapshot(root, 'ok', settings()),
      screenshot: join(root, 'nope.png'),
    }),
    /--screenshot is not a readable file/,
  )
  const state = await loadRun(runDir)
  assert.equal(state.observations.length, 1, 'a rejected observation changes nothing')
  assert.equal(state.gates[0].consumedBy, undefined, 'and leaves the receipt usable')
})

test('observe as evidence files', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  const verdict = await gate(runDir, { action: 'tap', label: 'Settings', role: 'button', id: 'btn-Settings' })
  const shot = join(root, 'shot.png')
  await writeFile(shot, 'png-bytes')
  await observe(runDir, {
    gate: verdict.gateId,
    snapshot: await writeSnapshot(root, 'after', settings()),
    screenshot: shot,
  })
  assert.equal(await readFile(join(runDir, 'screenshots/O-0002.png'), 'utf8'), 'png-bytes')
  assert.deepEqual((await readdir(join(runDir, 'snapshots'))).sort(), ['O-0001.json', 'O-0002.json'])
  const last = (await loadRun(runDir)).observations[1]
  assert.deepEqual(
    {
      screenshotPath: last.screenshotPath,
      snapshotPath: last.snapshotPath,
      limitations: last.limitations,
      targetVersion: last.targetVersion,
    },
    {
      screenshotPath: 'screenshots/O-0002.png',
      snapshotPath: 'snapshots/O-0002.json',
      limitations: [],
      targetVersion: 'unknown',
    },
  )
})

test('observe as a thin snapshot adjudicated by the agent', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  const thin = { role: 'window', children: [{ role: 'button', label: 'Go' }] }
  const forced = await act(root, runDir, { action: 'tap', label: 'Settings', id: 'btn-Settings' }, thin, {
    'screen-id': 'S-001',
  })
  assert.equal(forced.screenId, 'S-001')
  assert.deepEqual(forced.limitations, ['screenshot-missing', 'low-confidence-fingerprint', 'agent-adjudicated-screen'])
  const split = await act(root, runDir, { action: 'tap', label: 'Settings', id: 'btn-Settings' }, home(), {
    'new-screen': true,
  })
  assert.equal(split.classification, 'new-screen')
  assert.equal(split.screenId, 'S-002')
  await assert.rejects(act(root, runDir, { action: 'back' }, home(), { 'screen-id': 'S-099' }), /does not exist/)
  await assert.rejects(
    act(root, runDir, { action: 'back' }, home(), { 'screen-id': 'S-001', 'new-screen': true }),
    /conflict/,
  )
})

test('observe as repeated relaunch anchors', async () => {
  const { root, runDir } = await newRun()
  for (let i = 0; i < 5; i++) await anchor(root, runDir, home())
  await assert.rejects(anchor(root, runDir, home()), /Anchor limit 5/)
})

test('observe as a gated action with no first screen', async () => {
  const { root, runDir } = await newRun()
  await assert.rejects(
    observe(runDir, { gate: 'G-0001', snapshot: await writeSnapshot(root, 'x', home()) }),
    /observe --anchor/,
  )
})

test('observe as a run in public mode', async () => {
  const { root, runDir } = await newRun({ mode: 'public' })
  await assert.rejects(
    observe(runDir, { anchor: true, snapshot: await writeSnapshot(root, 'x', home()) }),
    /records no device observations/,
  )
})

test('observe as a state kind outside the list', async () => {
  const { root, runDir } = await newRun()
  await assert.rejects(
    observe(runDir, { anchor: true, 'state-kind': 'weird', snapshot: await writeSnapshot(root, 'x', home()) }),
    /--state-kind must be one of/,
  )
})
