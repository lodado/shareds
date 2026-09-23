import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

// Static guard for the headless core; tsconfig.core.json (no DOM lib) is the type-level half.
const SLICE = fileURLToPath(new URL('../..', import.meta.url))
const CORE_DIRS = ['model', 'config']
const FORBIDDEN_GLOBALS =
  /\b(?:window|document|navigator|requestAnimationFrame|performance|localStorage|sessionStorage|fetch|setTimeout|setInterval|Date\.now|Math\.random)\b/
const IMPORT = /\bfrom\s+'(?<spec>[^']+)'/g

function coreFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__test__' ? [] : coreFiles(full)
    return entry.name.endsWith('.ts') ? [full] : []
  })
}

const files = CORE_DIRS.flatMap((dir) => coreFiles(path.join(SLICE, dir)))

test('core files exist', () => {
  assert.ok(files.length >= 6)
})

for (const file of files) {
  const rel = path.relative(SLICE, file)
  const source = readFileSync(file, 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')

  test(`${rel} imports only relative core modules`, () => {
    for (const match of source.matchAll(IMPORT)) {
      const spec = match.groups?.spec ?? ''
      assert.ok(spec.startsWith('.'), `${rel} imports package ${spec}`)
      const target = path.relative(SLICE, path.resolve(path.dirname(file), spec))
      assert.ok(CORE_DIRS.some((dir) => target.startsWith(`${dir}/`)), `${rel} reaches outside core: ${target}`)
    }
  })

  test(`${rel} avoids platform globals and ambient time or randomness`, () => {
    assert.doesNotMatch(source, FORBIDDEN_GLOBALS)
  })
}
