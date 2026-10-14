// Reproducible cross-check benchmark, not an acceptance claim for a consumer app.
// Optional argument selects a preserved baseline scripts directory. Run the same
// file under the same Node executable before and after a change, without parallel jobs.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { deserialize, serialize } from 'node:v8'

const safeV8 = process.argv.includes('--safe-v8')
const scripts = resolve(process.argv.slice(2).find((arg) => arg !== '--safe-v8') ?? fileURLToPath(new URL('../skills/frontend-oracle-design/scripts/', import.meta.url)))
const { crossCheckSpace, isolatedClassifier } = await import(pathToFileURL(`${scripts}/oracle-discovery.mjs`))
const rounds = 5
const workloads = [
  { name: 'single-classifier', rows: 1024, traces: 256, dimensions: 1 },
  { name: 'two-classifiers', rows: 1024, traces: 256, dimensions: 2 },
  { name: 'three-classifiers', rows: 1024, traces: 256, dimensions: 3 },
  { name: 'repeated-classifiers', rows: 1024, traces: 256, dimensions: 17 },
  { name: 'small-state', rows: 1, traces: 1024, dimensions: 17 },
  { name: 'sparse-array', rows: 8192, traces: 128, dimensions: 17, shape: 'sparse' },
  { name: 'linked-adt', rows: 128, traces: 128, dimensions: 17, shape: 'linked' },
  { name: 'late-host-fallback', rows: 1024, traces: 128, dimensions: 17, shape: 'host' },
]

// Reference isolation without graph planning. Unlike the old implementation it
// cannot expose cached serialization bytes through a classifier's typed views.
function safeV8Classifier(exported) {
  let previous = null
  let encoded = []
  return (def, ...args) => {
    if (!previous || previous.length !== args.length || args.some((arg, index) => !Object.is(arg, previous[index]))) {
      encoded = args.map((arg) => serialize(arg))
      previous = args
    }
    return exported[def](...encoded.map((bytes) => deserialize(Uint8Array.from(bytes))))?.$ ?? null
  }
}

function payloadFor(rows, shape) {
  const payload = Array.from({ length: rows }, (_, index) => ({ $: 'Row', id: BigInt(index), active: true }))
  if (shape === 'sparse') {
    const sparse = []
    sparse.length = rows
    sparse[rows - 1] = payload[0]
    return sparse
  }
  if (shape === 'linked') return payload.reduceRight((tail, head) => ({ $: 'Cons', head, tail }), { $: 'Nil' })
  if (shape === 'host') payload.push(new Uint8Array([1, 2, 3]))
  return payload
}

function inputsFor({ rows, traces, dimensions, shape }) {
  const payload = payloadFor(rows, shape)
  const names = Array.from({ length: dimensions }, (_, index) => `axis${index}`)
  const exported = Object.fromEntries(names.map((name, index) => [`Bench.${name}`, (state, event) => ({
    $: (Number(state.count) + event.bit + index) % 2 === 0 ? 'Even' : 'Odd',
  })]))
  return {
    exported,
    inputs: {
      caseSpace: { families: names.map((dimension) => ({
        family: 'Order', dimension, choices: ['Even', 'Odd'].map((value) => ({ value, error: false })),
      })) },
      mapping: { dimensions: Object.fromEntries(names.map((name) => [name, {
        classify: `Bench.${name}`, values: { Even: 'Even', Odd: 'Odd' },
      }])) },
      worlds: [],
      traces: Array.from({ length: traces }, (_, index) => {
        const before = { $: 'State', count: BigInt(index), payload }
        const event = { $: 'Event', bit: index % 3 }
        return {
          label: `trace${index}`, trace: [event], observations: [index],
          steps: [{ before, event, after: before, label: `event${index}` }],
        }
      }),
    },
  }
}

for (const workload of workloads) {
  const { inputs, exported } = inputsFor(workload)
  const times = []
  let expected = null
  let resultDigest = null
  for (let round = 0; round <= rounds; round += 1) {
    const isolated = safeV8 ? safeV8Classifier(exported) : isolatedClassifier(exported, 'benchmark')
    let calls = 0
    const start = performance.now()
    const result = crossCheckSpace({ ...inputs, classify: (...args) => {
      calls += 1
      return isolated(...args)
    } })
    const elapsedMs = performance.now() - start
    assert.equal(calls, workload.traces * workload.dimensions)
    if (expected) assert.deepEqual(result, expected)
    expected = result
    resultDigest = createHash('sha256').update(JSON.stringify(result)).digest('hex')
    if (round > 0) times.push(elapsedMs)
  }
  const medianMs = [...times].sort((left, right) => left - right)[Math.floor(rounds / 2)]
  console.log(JSON.stringify({ ...workload, node: process.version, safeV8, rounds, medianMs, times, resultDigest,
    classifierCalls: workload.traces * workload.dimensions, rssBytes: process.memoryUsage().rss }))
}
