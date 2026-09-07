import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import test from 'node:test'
import { pathToFileURL } from 'node:url'

const root = resolve(process.env.SUBJECT_ROOT ?? new URL('./seed/', import.meta.url).pathname)
const { mountBalance } = await import(pathToFileURL(resolve(root, 'status-view.mjs')))
const { toggleDetails } = await import(pathToFileURL(resolve(root, 'toggle.mjs')))
const version = process.env.SDK_VERSION ?? 'v2'
assert.ok(['v1', 'v2'].includes(version), 'supported SDK fixture version')

function setup() {
  let callback
  let subscriptions = 0
  let cancellations = 0
  const frames = []
  const audits = []
  const sdk = {
    watch(listener) {
      callback = listener
      subscriptions += 1
      const cancel = () => {
        cancellations += 1
      }
      return version === 'v1' ? cancel : { cancel }
    },
  }
  const dispose = mountBalance(
    sdk,
    (frame) => frames.push(frame),
    (event) => audits.push(event),
  )
  return {
    frames,
    audits,
    dispose,
    counts: () => ({ subscriptions, cancellations }),
    emit(phase, amount, error) {
      if (version === 'v1') return callback([phase, amount, error])
      if (phase === 'pending') return callback({ type: 'waiting' })
      if (phase === 'ok') return callback({ type: 'settled', payload: { minorUnits: amount } })
      if (phase === 'denied') return callback({ type: 'rejected', code: 'DENIED' })
      if (phase === 'offline') return callback({ type: 'rejected', code: 'OFFLINE' })
      return callback({ type: 'unexpected', error })
    },
  }
}

test('loading and amounts preserve rendering and one audit per success event', () => {
  const run = setup()
  run.emit('pending')
  run.emit('ok', 1234)
  run.emit('ok', 0)
  run.emit('ok', -125)
  assert.deepEqual(run.frames, [
    { kind: 'loading' },
    { kind: 'ready', text: '$12.34' },
    { kind: 'ready', text: '$0.00' },
    { kind: 'ready', text: '$-1.25' },
  ])
  assert.deepEqual(run.audits, ['balance.ready', 'balance.ready', 'balance.ready'])
  assert.deepEqual(run.counts(), { subscriptions: 1, cancellations: 0 })
})

test('approved error distinctions are preserved without success telemetry', () => {
  const run = setup()
  run.emit('denied')
  run.emit('offline')
  assert.deepEqual(run.frames, [
    { kind: 'error', text: 'Not allowed' },
    { kind: 'error', text: 'Try again' },
  ])
  assert.deepEqual(run.audits, [])
})

test('unexpected failure preserves cause rather than inventing a recovery policy', () => {
  const run = setup()
  const error = new Error('vendor failure')
  assert.throws(
    () => run.emit('unexpected', undefined, error),
    (caught) => caught === error,
  )
  assert.deepEqual(run.frames, [])
  assert.deepEqual(run.audits, [])
})

test('dispose is idempotent and late events cannot write or throw', () => {
  const run = setup()
  run.dispose()
  run.dispose()
  run.emit('ok', 999)
  run.emit('unexpected', undefined, new Error('late'))
  assert.deepEqual(run.frames, [])
  assert.deepEqual(run.audits, [])
  assert.deepEqual(run.counts(), { subscriptions: 1, cancellations: 1 })
})

test('toggle changes only open and its label, without mutation', () => {
  const initial = Object.freeze({ open: false, label: 'Details', id: 'balance' })
  const opened = toggleDetails(initial)
  assert.deepEqual(opened, { open: true, label: 'Hide details', id: 'balance' })
  assert.deepEqual(toggleDetails(opened), {
    open: false,
    label: process.env.COPY_VERSION === 'v1' ? 'Show details' : 'Details',
    id: 'balance',
  })
  assert.equal(initial.open, false)
})
