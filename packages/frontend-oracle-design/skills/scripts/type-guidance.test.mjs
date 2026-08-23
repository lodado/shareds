import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const skillDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const packageDirectory = dirname(skillDirectory)

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

test('uses the exact-pinned official TypeScript compiler package', async () => {
  const [packageJson, compilerPackageJson] = await Promise.all([
    readJson(join(packageDirectory, 'package.json')),
    readJson(require.resolve('typescript/package.json')),
  ])

  assert.equal(packageJson.devDependencies?.typescript, '5.9.3')
  assert.equal(compilerPackageJson.name, 'typescript')
  assert.equal(compilerPackageJson.version, '5.9.3')
})

test('compiles TypeScript guidance witnesses as positive and negative API contracts', () => {
  const tsc = require.resolve('typescript/bin/tsc')
  const tsconfig = join(packageDirectory, 'test-fixtures/typescript/tsconfig.json')
  const result = spawnSync(process.execPath, [tsc, '--project', tsconfig, '--noEmit', '--pretty', 'false'], {
    encoding: 'utf8',
  })

  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`)
})
