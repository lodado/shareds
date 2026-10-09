import assert from 'node:assert/strict'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { diffPaths, randomOf, sweep } from './oracle-sweep.mjs'

/** 모델 test double — Bend 없이 스윕 엔진만 시험한다. 카운터: Inc는 3에서 멈추고, Dec는 0에서 멈추고, Reset은 0으로 돌린다. */
const EVENTS = [{ $: 'Inc' }, { $: 'Dec' }, { $: 'Reset' }]
const MODEL = {
  init: () => 0,
  step: (count, event) => {
    if (event.$ === 'Inc') return Math.min(3, count + 1)
    if (event.$ === 'Dec') return Math.max(0, count - 1)
    return 0
  },
  observe: (count) => ({ count, high: count >= 2 }),
  next: () => EVENTS.reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' }),
}
const call = (name, ...args) => MODEL[name](...args)
const label = (event) => event.$
const within = async (value) => value

/** 제품 test double — `bugs`에 든 결함만 가진 카운터. high는 제품이 따로 들고 있는 상태다. */
function product(bugs = []) {
  const shown = (count) => ({ count, high: count >= 2 })
  return {
    init: () => shown(0),
    step: (state, event) => {
      if (event.$ === 'Inc') return shown(Math.min(3, state.count + 1))
      if (event.$ === 'Dec') return shown(bugs.includes('dec-below-zero') ? state.count - 1 : Math.max(0, state.count - 1))
      return { count: 0, high: bugs.includes('reset-keeps-high') ? state.high : false }
    },
    observe: (state) => ({ count: state.count, high: state.high }),
  }
}

const run = (adapter, options = {}) =>
  sweep({ adapter, call, toPlain: (value) => value, within, eventLabel: label, walks: 120, steps: 25, seed: 7, ...options })

test('diffPaths names every leaf that differs and treats a different length as one difference', () => {
  assert.deepEqual(diffPaths({ a: 1, b: { c: [1, 2] } }, { a: 1, b: { c: [1, 2] } }), [])
  assert.deepEqual(diffPaths({ a: 1, b: { c: [1, 2] } }, { a: 2, b: { c: [1, 3] } }), ['$.a', '$.b.c[1]'])
  assert.deepEqual(diffPaths([1, 2], [1, 2, 3]), ['$.length'])
  assert.deepEqual(diffPaths({ a: 1 }, { a: 1, extra: true }), ['$.extra'])
  assert.deepEqual(diffPaths(null, { a: 1 }), ['$'])
})

test('the same seed walks the same walks, and the generator stays inside [0, 1)', () => {
  const left = randomOf(5)
  const right = randomOf(5)
  const drawn = Array.from({ length: 200 }, () => left())
  assert.deepEqual(drawn, Array.from({ length: 200 }, () => right()))
  assert.ok(drawn.every((value) => value >= 0 && value < 1))
  assert.notDeepEqual(drawn.slice(0, 5), Array.from({ length: 5 }, randomOf(6)))
})

test('a product that matches the model on every walk reports no divergence and shows which events it walked', async () => {
  const report = await run(product())
  assert.deepEqual(report.clusters, [])
  assert.equal(report.aborted, undefined)
  assert.ok(report.stepsRun > 120, 'the walks went past one step')
  assert.deepEqual(Object.keys(report.events), ['Dec', 'Inc', 'Reset'])
})

test('two defects come back together as two groups, each with its own shortest trace, in one run', async () => {
  const report = await run(product(['dec-below-zero', 'reset-keeps-high']))
  assert.deepEqual(
    report.clusters.map(({ key }) => key).sort(),
    ['Dec → $.count', 'Reset → $.high'],
  )
  const dec = report.clusters.find(({ key }) => key.startsWith('Dec'))
  assert.deepEqual(dec.shortest.trace, [{ $: 'Dec' }], 'a decrement from zero is the shortest way to the first defect')
  assert.equal(dec.shortest.expected, '{"count":0,"high":false}')
  assert.equal(dec.shortest.observed, '{"count":-1,"high":false}')
  const reset = report.clusters.find(({ key }) => key.startsWith('Reset'))
  assert.equal(reset.shortest.at, 3, 'two increments reach the high flag, the reset then fails to clear it')
  assert.deepEqual(reset.shortest.trace.map(label), ['Inc', 'Inc', 'Reset'])
  assert.ok(dec.count > 1 && reset.count > 1)
  assert.ok(dec.walks.length <= 3 && dec.walks.every((walk) => Number.isInteger(walk)))
  // the same seed and walk count find the same groups with the same counts
  assert.deepEqual(await run(product(['dec-below-zero', 'reset-keeps-high'])), report)
})

test('a walk stops at its first divergence: a defect never shows up as a chain of later ones', async () => {
  const report = await run(product(['dec-below-zero']))
  assert.equal(report.clusters.length, 1)
  assert.equal(report.clusters[0].shortest.at, 1)
  assert.ok(report.clusters.every(({ shortest }) => shortest.trace.at(-1).$ === 'Dec'))
})

test('a product that throws, or whose first observation is wrong, is a group of its own', async () => {
  const throwing = product()
  const boom = await run({ ...throwing, step: (state, event) => (event.$ === 'Reset' ? Promise.reject(new Error('boom\n  at stack')) : throwing.step(state, event)) })
  assert.deepEqual(boom.clusters.map(({ key }) => key), ['Reset → throws: boom'])

  const badStart = await run({ ...throwing, observe: (state) => ({ ...throwing.observe(state), count: state.count + 1 }) }, { walks: 5 })
  assert.deepEqual(badStart.clusters.map(({ key, count }) => [key, count]), [['init → $.count', 5]])
  assert.deepEqual(badStart.clusters[0].shortest.trace, [])
})

test('an adapter that never settles stops the sweep after three timeouts instead of walking all the walks', async () => {
  // the generated file's `within` rejects a call that outlives CASE_TIMEOUT; the double rejects the step call at once
  const slow = { ...product(), step: () => new Promise(() => {}) }
  const timeout = async (value, where) => {
    if (where.startsWith('step')) throw new Error(`ADAPTER_TIMEOUT: ${where}`)
    return value
  }
  const report = await run(slow, { within: timeout, walks: 50 })
  assert.match(report.aborted, /^ADAPTER_TIMEOUT 3 times/)
  assert.equal(report.clusters.reduce((total, { count }) => total + count, 0), 3)
})

test('the adapter is disposed after every walk, also after a divergence', async () => {
  let live = 0
  let opened = 0
  const adapter = {
    ...product(['dec-below-zero']),
    init: () => {
      live += 1
      opened += 1
      return product().init()
    },
    dispose: () => {
      live -= 1
    },
  }
  await run(adapter, { walks: 30 })
  assert.equal(opened, 30)
  assert.equal(live, 0)
})
