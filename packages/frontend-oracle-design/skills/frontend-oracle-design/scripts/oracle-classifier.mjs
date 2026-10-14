// Cross-check classifiers own two different reuse boundaries: exact-input results
// for one run, and fresh argument copies for the last immutable stepper tuple.
// Neither boundary merges model histories or authorizes a skipped proof.
import { isDeepStrictEqual } from 'node:util'
import { deserialize, serialize } from 'node:v8'
import { sha256, stableStringify } from './oracle-fs.mjs'
import { toPlain } from './oracle-types.mjs'

/** A run-local cache. Digests select buckets, never establish value equality. */
export function memoizeClassifier(classify) {
  const keys = new WeakMap()
  const keyOf = (value) => {
    const digest = () => sha256(stableStringify(toPlain(value)))
    if (value === null || typeof value !== 'object') return digest()
    if (!keys.has(value)) keys.set(value, digest())
    return keys.get(value)
  }
  const classifications = new Map()
  return (def, ...args) => {
    if (!classifications.has(def)) classifications.set(def, new Map())
    const results = classifications.get(def)
    const key = args.map(keyOf).join(':')
    if (!results.has(key)) results.set(key, [])
    const bucket = results.get(key)
    const known = bucket.find((entry) => isDeepStrictEqual(entry.args, args))
    if (known) return known.value
    const value = classify(def, ...args)
    bucket.push({ args, value })
    return value
  }
}

function snapshotTemplate(value) {
  if (!Array.isArray(value)) return Object.getPrototypeOf(value) === Object.prototype ? { ...value } : null
  // Array.slice preserves holes, but not extra properties. Keep V8 for those.
  const indexed = Object.keys(value).every((key) => {
    const index = Number(key)
    const inRange = Number.isInteger(index) && index >= 0 && index < value.length
    return inRange && String(index) === key
  })
  return indexed ? value.slice() : null
}

// Compile only V8-normalized records/arrays, not arbitrary host objects or
// accessors. References become edges, so each replay preserves cycles/aliases
// within an argument but shares no mutable nodes with another call or argument.
function snapshotPlan(root) {
  if (root === null || typeof root !== 'object') return null
  const ids = new Map([[root, 0]])
  const values = [root]
  const templates = []
  const edges = []
  for (let index = 0; index < values.length; index += 1) {
    const template = snapshotTemplate(values[index])
    if (!template) return null
    for (const [key, field] of Object.entries(template)) {
      if (field === null || typeof field !== 'object') continue
      if (!ids.has(field)) {
        ids.set(field, values.length)
        values.push(field)
      }
      // The spread/slice created an own data property, including __proto__.
      template[key] = null
      edges.push([index, key, ids.get(field)])
    }
    templates.push(template)
  }
  return () => {
    const copies = templates.map((template) => Array.isArray(template) ? template.slice() : { ...template })
    for (const [from, key, to] of edges) copies[from][key] = copies[to]
    return copies[0]
  }
}

function argumentSnapshot(value) {
  let encoded = serialize(value)
  let calls = 0
  let replay = null
  return () => {
    if (replay) return replay()
    // V8's host-object reader may return typed views into its input buffer.
    // Every decode therefore owns its bytes, even on the cold/fallback path.
    const fresh = deserialize(Uint8Array.from(encoded))
    calls += 1
    if (calls === 2) {
      replay = snapshotPlan(fresh)
      // Single-use tuples pay no plan cost. A successful plan replaces, rather
      // than retains, the encoding. Host types continue through V8 unchanged.
      if (replay) encoded = null
    }
    return fresh
  }
}

/** Pure compiled Bend classifiers over immutable stepper snapshots, not a mutable-object memoizer. */
export function isolatedClassifier(exported, source) {
  let previous = null
  let snapshots = []
  return (def, ...args) => {
    if (typeof exported[def] !== 'function')
      throw Object.assign(new Error(`${source} does not define ${def}`), { code: 'CROSS_CHECK_DEF' })
    if (!previous || previous.length !== args.length || args.some((arg, index) => !Object.is(arg, previous[index]))) {
      snapshots = args.map(argumentSnapshot)
      previous = args
    }
    return exported[def](...snapshots.map((copy) => copy()))?.$ ?? null
  }
}
