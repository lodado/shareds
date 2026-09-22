const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { ESLint } = require('eslint')
const parser = require('@typescript-eslint/parser')
const rule = require('./rules/fsd-strict-boundaries')
const { createProject } = require('./rules/lib/strict-paths')

const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'lodado-fsd-'))
const write = (file, contents = 'export {}') => {
  const target = path.join(cwd, file)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, contents)
}
write('src/entities/user/index.js')
write('src/entities/user/model.js')
write('src/entities/user/@x/order.js')
write('src/features/orders/ui/index.js')
write('src/features/orders/index.js')
write('src/features/orders/ui/Order.js')
write('src/features/payments/ui/index.js')
write('src/features/payments/index.js')
write('src/features/payments/ui/Pay.js')
write('src/features/orders/model/state.js')
write(
  'tsconfig.json',
  JSON.stringify({
    compilerOptions: {
      baseUrl: '.',
      paths: { '@/*': ['src/*'] },
      allowJs: true,
      moduleResolution: 'bundler',
      module: 'ESNext',
    },
  }),
)

const options = {
  cwd,
  tsconfig: path.join(cwd, 'tsconfig.json'),
  roots: [{ path: 'src' }],
  rendering: ['src/**/ui/*.js'],
  allowedSegments: ['ui', 'model', 'api', 'lib', 'config'],
}
const eslint = new ESLint({
  cwd,
  overrideConfigFile: true,
  overrideConfig: [
    {
      languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
      plugins: { local: { rules: { 'fsd-strict-boundaries': rule } } },
      rules: { 'local/fsd-strict-boundaries': ['error', options] },
    },
  ],
})

async function lint(file, code) {
  write(file, code)
  const [result] = await eslint.lintFiles([file])
  assert.equal(result.fatalErrorCount, 0)
  for (const message of result.messages) {
    assert.equal(message.ruleId, 'local/fsd-strict-boundaries')
    assert.equal(message.severity, 2)
    assert.ok(message.line > 0 && message.column > 0)
  }
  return result.messages
}

async function main() {
  let messages = await lint('src/features/orders/model/state.js', "import user from '../../../entities/user/model.js'")
  assert.equal(messages[0].ruleId, 'local/fsd-strict-boundaries')
  assert.equal(messages[0].messageId, 'deepImport')
  messages = await lint('src/features/orders/ui/Order.js', "import Pay from '../../payments/ui/Pay.js'")
  assert.equal(messages[0].messageId, 'siblingSlice')
  messages = await lint(
    'src/features/orders/ui/Order.js',
    "import User from '../../../entities/user/index.js'; export default User",
  )
  assert.equal(messages.length, 0)
  messages = await lint('src/features/orders/index.js', "export * from '../../../entities/user/index.js'")
  assert.equal(messages[0].messageId, 'wildcardPublic')
  const cases = [
    ['src/entities/user/model.js', "import Order from '../../features/orders/index.js'", 'layerDirection'],
    ['src/features/orders/ui/Order.js', "import x from './index.js'", null],
    ['src/features/orders/components/Thing.js', 'export const Thing = 1', 'invalidSegment'],
    ['src/misc/thing.js', 'export const thing = 1', 'unclassifiedFile'],
    ['src/features/empty/ui/View.js', 'export const View = 1', 'missingPublicEntry'],
    ['src/features/orders/ui/Order.js', "import x from './missing.js'", 'unresolved'],
    ['src/features/orders/ui/Order.js', "import x from '@/missing'", 'unresolved'],
    ['src/features/orders/ui/Order.js', "import x from '../../../entities/user/model.js'", 'deepImport'],
    ['src/features/orders/index.js', "import x from './index.js'", 'selfBarrel'],
    ['src/features/orders/ui/Order.js', "const require = () => null; require('./missing.js')", null],
    ['src/features/orders/ui/Order.js', "export * from './index.js'", null],
    ['src/features/orders/ui/Order.js', "import typeOnly from '../../../entities/user/index.js'", null],
    ['src/features/orders/model/state.js', "import View from '../ui/Order.js'", 'modelUi'],
    ['src/features/orders/ui/Order.js', "import x from '../../payments/ui/Pay.js'", 'siblingSlice'],
    ['src/features/orders/ui/Order.js', "import x from '../../../entities/user/@x/order.js'", 'invalidCrossImport'],
    ['src/features/orders/ui/Order.js', "export * from '../../../entities/user/model.js'", 'deepImport'],
    ['src/features/orders/ui/Order.js', "import x from '../../../entities/user/missing.js'", 'unresolved'],
    ['src/features/orders/model/state.js', "export * from '../ui/index.js'", 'modelUi'],
    ['src/features/orders/ui/Order.js', "import x from './components/none.js'", 'unresolved'],
    ['src/features/orders/ui/Order.js', "import x from '../../../entities/user/index.js'; export { x }", null],
  ]
  for (const [file, code, expected] of cases) {
    const result = await lint(file, code)
    if (expected)
      assert.ok(
        result.some((message) => message.messageId === expected),
        `${file} expected ${expected}`,
      )
    else
      assert.equal(
        result.filter((message) => message.ruleId === 'local/fsd-strict-boundaries').length,
        0,
        `${file}: ${result.map((message) => message.messageId).join(',')}`,
      )
  }
  async function contract(file, code, expected, extra = {}) {
    write(file, code)
    const runner = new ESLint({
      cwd,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.{js,ts}'],
          languageOptions: { parser, ecmaVersion: 2022, sourceType: 'module' },
          plugins: { local: { rules: { 'fsd-strict-boundaries': rule } } },
          rules: { 'local/fsd-strict-boundaries': ['error', { ...options, ...extra }] },
        },
      ],
    })
    const results = await runner.lintFiles([file])
    assert.equal(results.length, 1)
    assert.equal(results[0].fatalErrorCount, 0)
    assert.deepEqual(
      results[0].messages.map((message) => message.messageId),
      expected,
      file,
    )
    for (const message of results[0].messages) {
      assert.equal(message.ruleId, 'local/fsd-strict-boundaries')
      assert.equal(message.severity, 2)
      assert.ok(message.line > 0 && message.column > 0)
    }
  }
  await contract('src/features/orders/model/state.js', "import x from '@/entities/user'", [])
  await contract('src/features/orders/model/state.js', "import x from '../ui/Order'", ['modelUi'])
  await contract('src/features/orders/model/types.ts', "import type { Props } from '../ui/Order.js'", ['modelUi'])
  await contract('src/features/orders/ui/Order.js', "await import('../../payments/index.js')", ['siblingSlice'])
  await contract('src/features/orders/ui/Order.js', "require('../../payments/index.js')", ['siblingSlice'])
  await contract('src/features/orders/model/components/data.js', 'export const value = 1', [])
  await contract('src/features/model-only/model/state.js', 'export const value = 1', ['missingPublicEntry'])
  await contract('src/features/api-only/api/request.js', 'export const value = 1', ['missingPublicEntry'])
  await contract('src/features/index.js', 'export const value = 1', ['layerBarrel'])
  await contract('src/app/page.js', "import x from '../features/index.js'", ['layerBarrel'])
  write('src/entities/user/server.js', 'export const secret = 1')
  write('src/entities/user/testing.js', 'export const fixture = 1')
  const entries = {
    publicEntries: [
      { file: 'src/entities/user/server.js', kind: 'server', reason: 'Server data contract' },
      { file: 'src/entities/user/testing.js', kind: 'test', reason: 'Test fixture contract' },
    ],
    server: ['src/app/route.js'],
    test: ['src/app/check.test.js'],
  }
  await contract('src/app/page.js', "import {secret} from '../entities/user/server.js'", ['serverBoundary'], entries)
  await contract('src/app/route.js', "import {secret} from '../entities/user/server.js'", [], entries)
  await contract('src/app/page.js', "import {fixture} from '../entities/user/testing.js'", ['testBoundary'], entries)
  await contract('src/app/check.test.js', "import {fixture} from '../entities/user/testing.js'", [], entries)
  await contract('src/features/orders/__test__/order.js', "import x from '../model/state.js'", [])
  await contract('src/features/orders/__mocks__/order.js', "import x from '../model/state.js'", [])
  await contract('src/features/orders/ui/Order.js', "import x from '../__mocks__/order.js'", ['testBoundary'])
  write('src/shared/ui/button/index.js', "export {label} from './private.js'")
  write('src/shared/ui/button/private.js', 'export const label = "button"')
  const shared = { publicEntries: [{ file: 'src/shared/ui/button/index.js', reason: 'Small UI primitive contract' }] }
  await contract(
    'src/features/orders/ui/Order.js',
    "import {label} from '../../../shared/ui/button/index.js'",
    [],
    shared,
  )
  await contract(
    'src/features/orders/ui/Order.js',
    "import {label} from '../../../shared/ui/button/private.js'",
    ['deepImport'],
    shared,
  )
  await contract('src/shared/ui/button/index.js', "export {label} from './private.js'", [], shared)
  write('src/entities/order/index.js')
  write('src/entities/user/@x/order.js', 'export const user = 1')
  const cross = {
    crossImports: [
      { from: 'src/entities/order', to: 'src/entities/user/@x/order.js', reason: 'Approved user identity contract' },
    ],
  }
  await contract('src/entities/order/model/order.js', "import {user} from '../../user/@x/order.js'", [], cross)
  await contract(
    'src/entities/order/model/order.js',
    "import {user} from '../../user/index.js'",
    ['siblingSlice'],
    cross,
  )
  await contract(
    'src/features/orders/ui/Order.js',
    "import {user} from '../../../entities/user/@x/order.js'",
    ['invalidCrossImport'],
    cross,
  )
  await contract('src/entities/user/@x/order.js', 'export const user = 1', [], cross)
  await contract('src/entities/user/@x/order.js', 'export default function User() {}', ['invalidCrossImport'], cross)
  await contract(
    'src/entities/user/@x/order.js',
    "export * from '../index.js'",
    ['invalidCrossImport', 'selfBarrel'],
    cross,
  )
  write('src/entities/user/@x/order.js', 'export const user = 1')
  await contract('src/features/orders/@x/order.js', 'export const user = 1', ['invalidCrossImport'], cross)
  write('src/entities/customer/index.js')
  await contract(
    'src/entities/customer/model/customer.js',
    "import {user} from '../../user/@x/order.js'",
    ['invalidCrossImport'],
    cross,
  )
  const roots = [
    {
      path: 'src',
      layers: { views: 'pages', _pages: 'pages', _app: 'app' },
      groups: { features: ['checkout', 'account'] },
    },
    { path: 'packages/data/src' },
  ]
  write('src/features/checkout/form/index.js')
  write('src/features/account/form/index.js')
  await contract(
    'src/features/checkout/form/model/state.js',
    "import x from '../../../account/form/index.js'",
    ['siblingSlice'],
    { roots },
  )
  write('src/views/home/index.js')
  await contract('src/views/home/ui/Home.js', "import x from '../../../features/orders/index.js'", [], { roots })
  write('src/_pages/home/index.js')
  await contract('src/_pages/home/ui/Home.js', "import x from '../../../features/orders/index.js'", [], { roots })
  await contract('src/_app/page.js', "import x from '../features/orders/index.js'", [], { roots })
  write('packages/data/src/entities/user/index.js')
  await contract(
    'src/app/page.js',
    "import x from '../../packages/data/src/entities/user/index.js'",
    ['rootBoundary'],
    { roots },
  )
  const workspace = {
    roots,
    publicEntries: [
      { file: 'packages/data/src/entities/user/index.js', consumers: ['src'], reason: 'Workspace public contract' },
    ],
  }
  await contract('src/app/page.js', "import x from '../../packages/data/src/entities/user/index.js'", [], workspace)
  write(
    'node_modules/@fixture/data/package.json',
    JSON.stringify({ name: '@fixture/data', exports: { '.': './index.js' } }),
  )
  fs.symlinkSync(
    path.join(cwd, 'packages/data/src/entities/user/index.js'),
    path.join(cwd, 'node_modules/@fixture/data/index.js'),
  )
  await contract('src/app/page.js', "import x from '@fixture/data'", [], workspace)
  await contract('src/app/page.js', "import x from '@fixture/data'", ['rootBoundary'], { roots })
  const project = createProject({ ...options, roots })
  assert.equal(
    project.classify(path.join(cwd, 'src/features/checkout/form/ui/View.js').replaceAll('/', '\\')).slice,
    'form',
  )
  assert.equal(
    project.resolve('..\\model\\state.js', path.join(cwd, 'src/features/orders/ui/Order.js')),
    path.join(cwd, 'src/features/orders/model/state.js'),
  )
  process.stdout.write('ok strict FSD boundary fixtures\n')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => fs.rmSync(cwd, { recursive: true, force: true }))
