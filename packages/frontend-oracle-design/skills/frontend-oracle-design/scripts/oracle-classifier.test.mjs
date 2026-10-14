import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { deserialize, serialize } from 'node:v8'
import { isolatedClassifier } from './oracle-discovery.mjs'
import { compileBend } from './oracle-model.mjs'
import { installedBend } from './oracle-test-bend.mjs'

const v8Copy = (value) => deserialize(serialize(value))

test('classifier snapshots preserve cyclic aliases, sparse arrays and own prototype-named fields across repeated calls', () => {
  const payload = Object.fromEntries([['__proto__', { value: 1n }], ['constructor', 'data']])
  const slots = []
  slots.length = 5 // Empty slots, not present undefined values.
  slots[1] = payload
  slots[4] = slots
  const source = { $: 'State', left: payload, right: payload, slots, special: [undefined, -0, NaN, Infinity, -Infinity] }
  source.self = source
  const expected = v8Copy(source)
  const copies = new Set()
  const classify = isolatedClassifier({ inspect: (state, event) => {
    assert.deepEqual(state, expected)
    assert.deepEqual(event, expected)
    assert.equal(state.left, state.right)
    assert.equal(state.left, state.slots[1])
    assert.equal(state.self, state)
    assert.equal(state.slots[4], state.slots)
    assert.equal(Object.hasOwn(state.slots, 0), false)
    assert.equal(Object.hasOwn(state.left, '__proto__'), true)
    assert.equal(Object.getPrototypeOf(state.left), Object.prototype)
    assert.notEqual(state.left, event.left, 'arguments are isolated even when they share a source')
    copies.add(state)
    Object.getOwnPropertyDescriptor(state.left, '__proto__').value.value = 99n
    state.slots.push('changed')
    event.left.constructor = 'changed'
    return { $: 'Exact' }
  } }, 'MODEL.bend')
  for (let call = 0; call < 6; call += 1) assert.equal(classify('inspect', source, source), 'Exact')
  assert.equal(copies.size, 6)
  assert.deepEqual(source, expected)
})

test('classifier snapshots retain V8 semantics for non-record values and arrays with extra properties', () => {
  const array = [1n, { value: 2 }]
  array.extra = { value: 3 }
  Object.defineProperty(array, '__proto__', { value: { value: 4 }, enumerable: true })
  const fixtures = [
    { map: new Map([[{ key: 1 }, new Set([1n, 2n])]]) },
    { date: new Date(0), regexp: /oracle/gi },
    { bytes: new Uint8Array([1, 2, 3]), view: new DataView(new ArrayBuffer(4)), buffer: Buffer.from([4, 5]) },
    { array },
  ]
  for (const source of fixtures) {
    const expected = v8Copy(source)
    const classify = isolatedClassifier({ inspect: (copy) => {
      assert.deepEqual(copy, expected)
      copy.map?.clear()
      copy.date?.setTime(1000)
      if (copy.bytes) copy.bytes[0] = 99
      if (copy.view) copy.view.setUint8(0, 99)
      if (copy.buffer) copy.buffer[0] = 99
      // Mutating the whole backing store must not corrupt the next decode's header.
      if (copy.bytes) new Uint8Array(copy.bytes.buffer).fill(99)
      if (copy.array) copy.array.extra.value = 99
      return { $: 'Exact' }
    } }, 'MODEL.bend')
    for (let call = 0; call < 6; call += 1) assert.equal(classify('inspect', source), 'Exact')
    assert.deepEqual(source, expected)
  }
})

test('classifier snapshots capture getters once, discard descriptors like V8 and keep failures visible', () => {
  let reads = 0
  const source = Object.create(null, {
    field: { enumerable: true, get: () => { reads += 1; return { count: reads } } },
    hidden: { value: 'not enumerable' },
  })
  const classify = isolatedClassifier({ inspect: (copy) => {
    assert.deepEqual(copy, { field: { count: 1 } })
    copy.field.count = 99
    return { $: 'Exact' }
  }, tag: (value) => ({ $: typeof value }) }, 'MODEL.bend')
  for (let call = 0; call < 6; call += 1) assert.equal(classify('inspect', source), 'Exact')
  assert.equal(reads, 1)
  assert.throws(() => classify('missing', source), { code: 'CROSS_CHECK_DEF' })
  for (const invalid of [Symbol('unsupported'), () => null, new WeakMap(), new Proxy({}, {})]) {
    assert.throws(() => classify('tag', invalid), /could not be cloned/)
    assert.equal(classify('inspect', source), 'Exact', 'a failed capture does not poison the last tuple')
  }
  assert.equal(reads, 1)
})

test('classifier snapshots keep arity and primitive identity separate when input tuples change', () => {
  const seen = []
  const classify = isolatedClassifier({ inspect: (...args) => {
    seen.push(args)
    return args.length === 0 ? undefined : { $: 'Seen' }
  } }, 'MODEL.bend')
  const values = [undefined, null, false, 0, -0, NaN, Infinity, -Infinity, 1, 1n, '1']
  assert.equal(classify('inspect'), null)
  for (const value of values) {
    for (let call = 0; call < 4; call += 1) assert.equal(classify('inspect', value), 'Seen')
  }
  assert.deepEqual(seen, [[], ...values.flatMap((value) => Array.from({ length: 4 }, () => [value]))])
})

test('[bend] classifier snapshots isolate actual compiled in-place array updates', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await mkdtemp(join(tmpdir(), 'oracle-classifier-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const entry = join(root, 'MODEL.bend')
  await writeFile(entry, `import Base

type Tag is Data:
  Seen{}

def Probe.tag(xs: Array<U32>) -> Tag:
  Seen{}

def Probe.mutate(xs: Array<U32>) -> Tag:
  xs[0] <- 99
  Probe.tag(xs)
`)
  const { exported } = await compileBend({ entry, bin })
  const raw = [1, 2, 3, 4]
  assert.equal(exported['Probe.mutate'](raw).$, 'Seen')
  assert.deepEqual(raw, [99, 2, 3, 4], 'the compiled function really mutates its input')
  const classify = isolatedClassifier(exported, 'MODEL.bend')
  const source = [1, 2, 3, 4]
  for (let call = 0; call < 6; call += 1) {
    assert.equal(classify('Probe.mutate', source), 'Seen')
    assert.deepEqual(source, [1, 2, 3, 4])
  }
})
