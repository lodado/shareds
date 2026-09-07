import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package scripts use the trusted node-test adapter.
import test from 'node:test'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const ts = require('typescript')

test('fixture parser validates unknown inputs at runtime, separately from compiler witnesses', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'oracle-type-runtime-'))
  try {
    const source = await readFile(new URL('../../test-fixtures/typescript/contracts.ts', import.meta.url), 'utf8')
    // This emits runnable fixture code only. type-guidance.test.mjs owns actual typechecking.
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    })
    const output = join(directory, 'contracts.mjs')
    await writeFile(output, outputText)
    const { parseUserId } = await import(pathToFileURL(output).href)
    for (const valid of ['user-1', '0']) assert.equal(parseUserId(valid), valid)
    for (const invalid of [undefined, null, '', 0, false, {}, []]) {
      assert.throws(() => parseUserId(invalid), /invalid id/)
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
