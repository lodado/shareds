import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { devNull, tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- standalone package contract checks.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  BEND_VERSION,
  generatePlan,
  validatePlan,
} from '../skills/reference-driven-figma-design/scripts/design-grammar.mjs'

// Low risk: pure composition/validation; process and output probes use disposable local fixtures.
// Expected compositions come from the approved reading/comparison pilot, not runner internals.
const skill = new URL('../skills/reference-driven-figma-design/', import.meta.url)
const fixtures = new URL('assets/bend-design/', skill)
const model = fileURLToPath(new URL('research.bend', fixtures))
const bindings = fileURLToPath(new URL('bindings.json', fixtures))
const args = fileURLToPath(new URL('reading.json', fixtures))
const runner = fileURLToPath(new URL('scripts/design-grammar.mjs', skill))
const inventory = JSON.parse(await readFile(bindings, 'utf8'))
const schema = JSON.parse(await readFile(new URL('references/schemas/design-plan.schema.json', skill), 'utf8'))
// Reuse the installed transitive Ajv, as schema-contract.test.mjs does; no runtime dependency.
const cliRequire = createRequire(import.meta.resolve('@commitlint/cli'))
const loadRequire = createRequire(cliRequire.resolve('@commitlint/load'))
const validatorRequire = createRequire(loadRequire.resolve('@commitlint/config-validator'))
const Ajv = validatorRequire('ajv/dist/2020.js')
const ajv = new Ajv({ strict: false, allErrors: true })
const checkSchema = ajv.compile(schema)
const checkInventory = ajv.compile({ $defs: schema.$defs, $ref: '#/$defs/inventory' })

function minimalPlan() {
  return {
    schema_version: '1.0',
    viewport: { width: 390, height: 844 },
    state: 'reference-selected',
    axes: [{ id: 'energy', value: 'quiet', scope: 'heading' }],
    root: {
      kind: 'stack',
      id: 'screen',
      role: 'research library',
      width: 390,
      direction: 'vertical',
      gap: 'space.none',
      padding: 'space.none',
      surface: 'surface.page',
      axes: [],
      rules: [],
      children: [
        {
          kind: 'asset',
          id: 'heading',
          role: 'page heading',
          width: 390,
          source: 'heading.quiet',
          bindings: [{ property: 'Title', content: 'page-title' }],
          axes: ['energy'],
          rules: [],
        },
      ],
    },
  }
}

async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'design-grammar-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function generateInstalled() {
  try {
    return await generatePlan({ model, args, bindings })
  } catch (error) {
    if (!error.message.startsWith('design-grammar: ENOENT:')) throw error
    return null
  }
}

test('real Bend generates reading, comparison and mobile compositions with isolated axis effects', async (t) => {
  const reading = await generateInstalled()
  if (!reading) {
    t.skip('Bend unavailable; real generation cannot be verified at another layer')
    return
  }
  const directory = await temporary(t)
  const initialBindings = await readFile(bindings, 'utf8')
  const comparison = await generatePlan({ model, args: fileURLToPath(new URL('comparison.json', fixtures)), bindings })
  const mobile = await generatePlan({ model, args: fileURLToPath(new URL('reading-mobile.json', fixtures)), bindings })
  for (const result of [reading, comparison, mobile]) {
    assert.equal(result.provenance.bend_version, BEND_VERSION)
    assert.equal(checkSchema(result.plan), true, JSON.stringify(checkSchema.errors))
    assert.equal(result.provenance.bindings_sha256, createHash('sha256').update(initialBindings).digest('hex'))
  }
  assert.deepEqual(reading.plan.viewport, { width: 1280, height: 900 })
  assert.equal(reading.plan.root.children[1].direction, 'horizontal')
  assert.deepEqual(
    reading.plan.root.children[1].children.map(({ id, width }) => ({ id, width })),
    [
      { id: 'collection', width: 344 },
      { id: 'detail', width: 864 },
    ],
  )
  assert.deepEqual(comparison.plan.viewport, reading.plan.viewport)
  assert.equal(comparison.plan.root.children[1].direction, 'vertical')
  assert.deepEqual(
    comparison.plan.root.children[1].children.map(({ id, width }) => ({ id, width })),
    [
      { id: 'collection', width: 1232 },
      { id: 'notes', width: 1232 },
    ],
  )
  assert.deepEqual(mobile.plan.viewport, { width: 390, height: 844 })
  assert.deepEqual(
    mobile.plan.root.children[1].children.map(({ id, width }) => ({ id, width })),
    [{ id: 'detail', width: 358 }],
  )
  assert.deepEqual(
    mobile.plan.axes.map(({ id }) => id),
    ['task', 'energy'],
  )

  const variants = [
    { name: 'comfortable', input: ['Read', 'Comfortable', 'Calm', 'Desktop'], axis: 'density', value: 'comfortable' },
    { name: 'expressive', input: ['Read', 'Dense', 'Expressive', 'Desktop'], axis: 'energy', value: 'focal' },
  ]
  for (const variant of variants) {
    const path = join(directory, `${variant.name}.json`)
    await writeFile(path, JSON.stringify(variant.input.map(($) => ({ $ }))))
    const result = await generatePlan({ model, args: path, bindings })
    const expected = structuredClone(reading.plan)
    expected.axes.find(({ id }) => id === variant.axis).value = variant.value
    if (variant.axis === 'density') expected.root.children[1].children[0].source = 'reference-list.comfortable'
    else expected.root.children[0].source = 'heading.expressive'
    assert.deepEqual(result.plan, expected, `${variant.name}: unrelated composition changed`)
    assert.equal(result.provenance.bindings_sha256, reading.provenance.bindings_sha256)
  }
  assert.equal(
    await readFile(bindings, 'utf8'),
    initialBindings,
    'generation must not rewrite content or asset bindings',
  )
})

test('valid public composition and binding schema agree with the runtime validator', () => {
  const plan = minimalPlan()
  assert.equal(checkSchema(plan), true, JSON.stringify(checkSchema.errors))
  assert.equal(checkInventory(inventory), true, JSON.stringify(checkInventory.errors))
  assert.deepEqual(validatePlan(plan, inventory), plan)
})

test('runtime and JSON Schema count Unicode code points at the name length boundary', () => {
  for (const length of [255, 256, 257]) {
    const plan = minimalPlan()
    plan.root.role = '🎨'.repeat(length)
    const accepted = length <= 256
    assert.equal(checkSchema(plan), accepted, `${length} Unicode code points`)
    if (accepted) assert.deepEqual(validatePlan(plan, inventory), plan)
    else assert.throws(() => validatePlan(plan, inventory))
  }
})

test('an axis cannot be realized by a sibling outside its declared scope', () => {
  const plan = minimalPlan()
  const collection = { ...plan.root.children[0], id: 'collection' }
  const detail = { ...plan.root.children[0], id: 'detail', axes: [] }
  plan.root.children = [collection, detail]
  plan.axes[0].scope = 'collection'
  assert.deepEqual(validatePlan(plan, inventory), plan)
  plan.axes[0].scope = 'detail'
  assert.equal(checkSchema(plan), true, JSON.stringify(checkSchema.errors))
  assert.throws(() => validatePlan(plan, inventory), /scope/)
})

test('schema and runtime both reject malformed shapes, scalar bounds and unknown own fields', () => {
  const cases = [
    ['absent plan', () => null],
    ['unknown plan field', (plan) => ({ ...plan, extra: true })],
    [
      'missing required field',
      (plan) => {
        delete plan.state
        return plan
      },
    ],
    [
      'unsupported schema version',
      (plan) => {
        plan.schema_version = '2.0'
        return plan
      },
    ],
    [
      'empty name',
      (plan) => {
        plan.state = ''
        return plan
      },
    ],
    [
      'name beyond limit',
      (plan) => {
        plan.state = 'x'.repeat(257)
        return plan
      },
    ],
    [
      'zero width',
      (plan) => {
        plan.viewport.width = 0
        return plan
      },
    ],
    [
      'fractional width',
      (plan) => {
        plan.viewport.width = 390.5
        return plan
      },
    ],
    [
      'width beyond limit',
      (plan) => {
        plan.viewport.width = 10001
        return plan
      },
    ],
    [
      'empty axes',
      (plan) => {
        plan.axes = []
        return plan
      },
    ],
    [
      'empty children',
      (plan) => {
        plan.root.children = []
        return plan
      },
    ],
    [
      'unknown node kind',
      (plan) => {
        plan.root.kind = 'text'
        return plan
      },
    ],
    [
      'unknown direction',
      (plan) => {
        plan.root.direction = 'diagonal'
        return plan
      },
    ],
    [
      'duplicate node-axis reference',
      (plan) => {
        plan.root.children[0].axes.push('energy')
        return plan
      },
    ],
  ]
  for (const key of ['__proto__', 'constructor', 'toString']) {
    cases.push([`unknown own field ${key}`, (plan) => ({ ...plan, [key]: true })])
  }
  for (const [name, change] of cases) {
    const plan = change(minimalPlan())
    assert.equal(checkSchema(plan), false, name)
    assert.throws(() => validatePlan(plan, inventory), undefined, name)
  }
  for (const change of [
    (value) => {
      value.tokens['space.none'].value = -1
    },
    (value) => {
      value.tokens['surface.page'].value = 'red'
    },
    (value) => {
      value.assets['heading.quiet'].properties.push('Title')
    },
    (value) => {
      value.assets['heading.quiet'].extra = true
    },
  ]) {
    const value = structuredClone(inventory)
    change(value)
    assert.equal(checkInventory(value), false)
    assert.throws(() => validatePlan(minimalPlan(), value))
  }
})

test('well-shaped plans reject unresolved references, inert axes, duplicate IDs and overflow', () => {
  const cases = [
    [
      'unknown asset',
      (plan) => {
        plan.root.children[0].source = 'missing'
      },
      /unknown asset/,
    ],
    [
      'unknown token',
      (plan) => {
        plan.root.gap = 'missing'
      },
      /unknown token/,
    ],
    [
      'wrong spacing token kind',
      (plan) => {
        plan.root.gap = 'surface.page'
      },
      /gap.*spacing token/,
    ],
    [
      'wrong surface token kind',
      (plan) => {
        plan.root.surface = 'space.none'
      },
      /surface.*color token/,
    ],
    [
      'unknown content',
      (plan) => {
        plan.root.children[0].bindings[0].content = 'missing'
      },
      /unknown content/,
    ],
    [
      'unknown asset property',
      (plan) => {
        plan.root.children[0].bindings[0].property = 'Missing'
      },
      /unsupported asset property/,
    ],
    [
      'duplicate property',
      (plan) => {
        plan.root.children[0].bindings.push({ property: 'Title', content: 'page-title' })
      },
      /duplicate asset property/,
    ],
    [
      'duplicate node ID',
      (plan) => {
        plan.root.children[0].id = 'screen'
      },
      /duplicate node ID/,
    ],
    [
      'duplicate axis ID',
      (plan) => {
        plan.axes.push({ ...plan.axes[0] })
      },
      /duplicate axis ID/,
    ],
    [
      'unknown node axis',
      (plan) => {
        plan.root.children[0].axes = ['missing']
      },
      /unknown axis/,
    ],
    [
      'unknown axis scope',
      (plan) => {
        plan.axes[0].scope = 'missing'
      },
      /unknown axis scope/,
    ],
    [
      'unrealized axis',
      (plan) => {
        plan.root.children[0].axes = []
      },
      /axis has no realization/,
    ],
    [
      'root viewport mismatch',
      (plan) => {
        plan.root.width = 389
      },
      /root width must match viewport/,
    ],
    [
      'vertical overflow',
      (plan) => {
        plan.root.children[0].width = 391
      },
      /width exceeds available area/,
    ],
    [
      'horizontal gap overflow',
      (plan) => {
        plan.root.direction = 'horizontal'
        plan.root.gap = 'space.group'
        plan.root.children[0].width = 195
        plan.root.children.push({ ...plan.root.children[0], id: 'second' })
      },
      /horizontal children overflow/,
    ],
  ]
  for (const key of ['__proto__', 'constructor', 'toString']) {
    cases.push(
      [
        `unknown prototype asset ${key}`,
        (plan) => {
          plan.root.children[0].source = key
        },
        /unknown asset/,
      ],
      [
        `unknown prototype token ${key}`,
        (plan) => {
          plan.root.gap = key
        },
        /unknown token/,
      ],
      [
        `unknown prototype content ${key}`,
        (plan) => {
          plan.root.children[0].bindings[0].content = key
        },
        /unknown content/,
      ],
    )
  }
  for (const [name, change, error] of cases) {
    const plan = minimalPlan()
    change(plan)
    assert.equal(checkSchema(plan), true, `${name}: schema should leave semantic checks to runtime`)
    assert.throws(() => validatePlan(plan, inventory), error, name)
  }
})

test('runner reports missing Bend and refuses unsupported compiler versions', async (t) => {
  const directory = await temporary(t)
  await assert.rejects(generatePlan({ model, args, bindings, bend: join(directory, 'missing-bend') }), /ENOENT/)
  const binary = join(directory, 'wrong-bend')
  await writeFile(binary, '#!/bin/sh\nprintf "bend 0.0.0\\n"\n', { mode: 0o700 })
  await assert.rejects(generatePlan({ model, args, bindings, bend: binary }), /unsupported Bend version: bend 0\.0\.0/)
})

test('runner permits exactly 1 MiB but rejects oversized input before compiler execution', async (t) => {
  const directory = await temporary(t)
  const source = join(directory, 'bounded.bend')
  const bend = join(directory, 'must-not-execute')
  await writeFile(source, ' '.repeat(1024 * 1024))
  await assert.rejects(generatePlan({ model: source, args, bindings, bend }), /ENOENT/)
  await writeFile(source, ' '.repeat(1024 * 1024 + 1))
  await assert.rejects(generatePlan({ model: source, args, bindings, bend }), /exceeds 1 MiB/)
})

test('runner rejects non-regular input instead of passing device content to compilation', async (t) => {
  const directory = await temporary(t)
  await assert.rejects(
    generatePlan({ model: devNull, args, bindings, bend: join(directory, 'must-not-execute') }),
    /regular file/,
  )
})

test('pure-source guard rejects imports and unsafe definitions before attempting compilation', async (t) => {
  const directory = await temporary(t)
  for (const source of [
    'import Other\n',
    '@unsafe\ndef generate(): 0\n',
    'def generate?(): 0\n',
    'def generate() -> IO: 0\n',
  ]) {
    const unsafe = join(directory, 'unsafe.bend')
    await writeFile(unsafe, source)
    await assert.rejects(
      generatePlan({ model: unsafe, args, bindings, bend: join(directory, 'must-not-execute') }),
      /only import Base|unsafe Bend|pure, safe Bend/,
    )
  }
})

test('CLI never overwrites an existing output even when generation succeeds', async (t) => {
  if (!(await generateInstalled())) {
    t.skip('Bend unavailable; real CLI generation cannot be verified at another layer')
    return
  }
  const directory = await temporary(t)
  const output = join(directory, 'plan.json')
  await writeFile(output, 'preserve this user artifact\n')
  const result = spawnSync(
    process.execPath,
    [runner, '--model', model, '--args', args, '--bindings', bindings, '--out', output],
    { encoding: 'utf8' },
  )
  assert.equal(result.status, 1, result.stderr)
  assert.match(result.stderr, /EEXIST/)
  assert.equal(await readFile(output, 'utf8'), 'preserve this user artifact\n')
})
