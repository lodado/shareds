#!/usr/bin/env node
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants, readFileSync } from 'node:fs'
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

export const BEND_VERSION = '2.0.34'
const script = fileURLToPath(import.meta.url)
const schema = JSON.parse(
  await readFile(new URL('../references/schemas/design-plan.schema.json', import.meta.url), 'utf8'),
)
const MAX_BYTES = 1024 * 1024
const hash = (value) => createHash('sha256').update(value).digest('hex')

function matches(value, rule) {
  try {
    check(value, rule)
    return true
  } catch (error) {
    if (error instanceof assert.AssertionError) return false
    throw error
  }
}

function checkObject(value, rule, path) {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), `${path}: expected object`)
  for (const key of rule.required ?? []) assert.ok(Object.hasOwn(value, key), `${path}: missing ${key}`)
  for (const [key, child] of Object.entries(value)) {
    const properties = rule.properties ?? {}
    if (Object.hasOwn(properties, key)) check(child, properties[key], `${path}.${key}`)
    else if (typeof rule.additionalProperties === 'object') check(child, rule.additionalProperties, `${path}.${key}`)
    else assert.notEqual(rule.additionalProperties, false, `${path}: unsupported field ${key}`)
  }
}

// Only the vocabulary used by the bundled schema, not a general JSON Schema implementation.
function check(value, rule, path = 'plan') {
  if (rule.$ref) {
    check(value, schema.$defs[rule.$ref.slice('#/$defs/'.length)], path)
    return
  }
  if (rule.oneOf) {
    assert.equal(rule.oneOf.filter((option) => matches(value, option)).length, 1, `${path}: unsupported shape`)
    return
  }
  if (Object.hasOwn(rule, 'const')) assert.equal(value, rule.const, `${path}: expected ${rule.const}`)
  if (rule.enum) assert.ok(rule.enum.includes(value), `${path}: unsupported value`)
  switch (rule.type) {
    case 'object':
      checkObject(value, rule, path)
      break
    case 'array':
      assert.ok(Array.isArray(value), `${path}: expected array`)
      assert.ok(
        value.length >= (rule.minItems ?? 0) && value.length <= (rule.maxItems ?? Infinity),
        `${path}: array length`,
      )
      if (rule.uniqueItems)
        assert.equal(new Set(value.map((item) => JSON.stringify(item))).size, value.length, `${path}: duplicates`)
      for (const [index, item] of value.entries()) check(item, rule.items, `${path}[${index}]`)
      break
    case 'integer':
      assert.ok(Number.isSafeInteger(value) && value >= rule.minimum && value <= rule.maximum, `${path}: integer range`)
      break
    case 'string': {
      assert.equal(typeof value, 'string', `${path}: expected string`)
      const length = Array.from(value).length
      assert.ok(length >= (rule.minLength ?? 0) && length <= (rule.maxLength ?? Infinity), `${path}: string length`)
      if (rule.pattern) assert.ok(new RegExp(rule.pattern, 'u').test(value), `${path}: string format`)
      break
    }
    default:
      assert.equal(rule.type, undefined, `${path}: unsupported schema type`)
  }
}

function reference(registry, name, description) {
  assert.ok(Object.hasOwn(registry, name), `unknown ${description}: ${name}`)
  return registry[name]
}

/** Validate structure and local references; this does not authenticate Figma assets or approval. */
export function validatePlan(plan, bindings) {
  const pending = [{ node: plan?.root, depth: 0 }]
  const declaredIds = new Set()
  let count = 0
  while (pending.length) {
    const { node, depth } = pending.pop()
    declaredIds.add(node?.id)
    count += 1
    assert.ok(depth <= 32 && count <= 1000, 'composition exceeds node/depth limit')
    if (Array.isArray(node?.children)) {
      for (const child of node.children) pending.push({ node: child, depth: depth + 1 })
    }
  }
  check(plan, schema)
  assert.equal(declaredIds.size, count, 'duplicate node ID')
  check(bindings, schema.$defs.inventory, 'bindings')
  const axes = new Map(plan.axes.map((axis) => [axis.id, axis]))
  assert.equal(axes.size, plan.axes.length, 'duplicate axis ID')
  for (const axis of plan.axes) assert.ok(declaredIds.has(axis.scope), `unknown axis scope: ${axis.scope}`)
  const usedAxes = new Set()
  const visit = (node, parentWidth, ancestors) => {
    const scopes = [...ancestors, node.id]
    assert.ok(node.width <= parentWidth, `${node.id}: width exceeds available area`)
    for (const axis of node.axes) {
      assert.ok(axes.has(axis), `${node.id}: unknown axis ${axis}`)
      assert.ok(scopes.includes(axes.get(axis).scope), `${node.id}: realization outside axis scope: ${axis}`)
      usedAxes.add(axis)
    }
    if (node.kind === 'stack') {
      const gap = reference(bindings.tokens, node.gap, 'token')
      const padding = reference(bindings.tokens, node.padding, 'token')
      assert.equal(gap.kind, 'spacing', `${node.id}: gap must be a spacing token`)
      assert.equal(padding.kind, 'spacing', `${node.id}: padding must be a spacing token`)
      assert.equal(
        reference(bindings.tokens, node.surface, 'token').kind,
        'color',
        `${node.id}: surface must be a color token`,
      )
      const inner = node.width - 2 * padding.value
      if (node.direction === 'horizontal') {
        const total =
          node.children.reduce((sum, child) => sum + child.width, 0) + (node.children.length - 1) * gap.value
        assert.ok(total <= inner, `${node.id}: horizontal children overflow`)
      }
      for (const child of node.children) visit(child, inner, scopes)
    } else {
      const asset = reference(bindings.assets, node.source, 'asset')
      const properties = new Set()
      for (const binding of node.bindings) {
        assert.ok(
          asset.properties.includes(binding.property),
          `${node.id}: unsupported asset property ${binding.property}`,
        )
        assert.ok(!properties.has(binding.property), `${node.id}: duplicate asset property`)
        properties.add(binding.property)
        reference(bindings.content, binding.content, 'content')
      }
    }
  }
  assert.equal(plan.root.width, plan.viewport.width, 'root width must match viewport')
  visit(plan.root, plan.viewport.width, [])
  for (const axis of plan.axes) {
    assert.ok(usedAxes.has(axis.id), `axis has no realization: ${axis.id}`)
  }
  return plan
}

function plain(value, depth = 0) {
  assert.ok(depth <= 64, 'Bend output exceeds depth limit')
  if (value === null || typeof value !== 'object') {
    assert.ok(['string', 'number', 'boolean'].includes(typeof value) || value === null, 'unsupported Bend output value')
    if (typeof value === 'number') assert.ok(Number.isFinite(value), 'non-finite Bend output')
    return value
  }
  if (value.$ === 'Nil' || value.$ === 'Con') {
    const items = []
    let cursor = value
    while (cursor.$ === 'Con') {
      assert.ok(items.length < 1000, 'Bend list exceeds item limit')
      items.push(plain(cursor.head, depth + 1))
      cursor = cursor.tail
    }
    assert.equal(cursor.$, 'Nil', 'malformed Bend list')
    return items
  }
  const fields = Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== '$')
      .map(([key, child]) => [key, plain(child, depth + 1)]),
  )
  if (value.$ === 'Stack') return { kind: 'stack', ...fields }
  if (value.$ === 'Asset') return { kind: 'asset', ...fields }
  return fields
}

function run(bin, args, options = {}) {
  const result = spawnSync(bin, args, {
    encoding: 'utf8',
    timeout: 30000,
    maxBuffer: MAX_BYTES,
    env: { ...process.env, BEND_NO_TELEMETRY: '1' },
    ...options,
  })
  if (result.error) throw new Error(`design-grammar: ${result.error.code}: ${result.error.message}`)
  if (result.status !== 0)
    throw new Error(`design-grammar: process failed (${result.status}): ${result.stderr || result.stdout}`)
  return result.stdout
}

async function readBounded(path) {
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK)
  try {
    const info = await file.stat()
    assert.ok(info.isFile(), `${path}: expected regular file`)
    assert.ok(info.size <= MAX_BYTES, `${path}: file exceeds 1 MiB`)
    const chunks = []
    let bytes = 0
    for await (const chunk of file.createReadStream({ autoClose: false, start: 0, end: MAX_BYTES })) {
      bytes += chunk.length
      assert.ok(bytes <= MAX_BYTES, `${path}: file exceeds 1 MiB`)
      chunks.push(chunk)
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally {
    await file.close()
  }
}

/** Execute only reviewed local source. Conservative source checks and child limits are NOT a sandbox. */
export async function generatePlan({ model, args, bindings, bend = 'bend' }) {
  const source = await readBounded(model)
  const rawArgs = await readBounded(args)
  const rawBindings = await readBounded(bindings)
  const input = JSON.parse(rawArgs)
  const inventory = JSON.parse(rawBindings)
  assert.ok(Array.isArray(input) && input.length <= 32, 'args must be an array of at most 32 Bend-JS values')
  check(inventory, schema.$defs.inventory, 'bindings')
  // ponytail: single-file pure models only; review transitive imports before adding module support.
  for (const line of source.split('\n')) {
    if (/^\s*import\b/u.test(line)) assert.match(line, /^\s*import Base\s*(?:#.*)?$/u, 'only import Base is supported')
    const definition = line.trimStart().split('(')[0]
    assert.ok(!(definition.startsWith('def ') && definition.includes('?')), 'unsafe Bend definitions are unsupported')
  }
  assert.ok(!/@unsafe|\bIO\b/u.test(source), 'only reviewed pure, safe Bend definitions are supported')
  const version = run(bend, ['version']).trim()
  assert.equal(version, `bend ${BEND_VERSION}`, `unsupported Bend version: ${version}`)
  const directory = await mkdtemp(join(tmpdir(), 'bend-design-'))
  try {
    const entry = join(directory, 'DESIGN.bend')
    const output = join(directory, 'design.mjs')
    await writeFile(entry, source)
    run(bend, [entry, '-o', output], { cwd: directory })
    const plan = JSON.parse(
      run(process.execPath, ['--max-old-space-size=128', script, '--evaluate', output], {
        input: rawArgs,
        timeout: 10000,
        cwd: directory,
      }),
    )
    validatePlan(plan, inventory)
    return {
      schema_version: '1.0',
      provenance: {
        bend_version: BEND_VERSION,
        model_sha256: hash(source),
        args_sha256: hash(rawArgs),
        bindings_sha256: hash(rawBindings),
      },
      plan,
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function main() {
  if (process.argv[2] === '--evaluate') {
    const { default: generated } = await import(pathToFileURL(resolve(process.argv[3])).href)
    assert.equal(typeof generated.generate, 'function', 'Bend model must export generate')
    const args = JSON.parse(readFileSync(0, 'utf8'))
    process.stdout.write(JSON.stringify(plain(generated.generate(...args))))
    return
  }
  const { values } = parseArgs({
    options: {
      model: { type: 'string' },
      args: { type: 'string' },
      bindings: { type: 'string' },
      out: { type: 'string' },
      bend: { type: 'string', default: 'bend' },
      help: { type: 'boolean' },
    },
  })
  if (values.help) {
    process.stdout.write(
      'design-grammar --model DESIGN.bend --args args.json --bindings bindings.json [--out plan.json] [--bend binary]\n',
    )
    return
  }
  assert.ok(values.model && values.args && values.bindings, '--model, --args and --bindings are required')
  const result = `${JSON.stringify(await generatePlan(values), null, 2)}\n`
  if (values.out) await writeFile(values.out, result, { flag: 'wx' })
  else process.stdout.write(result)
}

if (process.argv[1] && resolve(process.argv[1]) === script) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
