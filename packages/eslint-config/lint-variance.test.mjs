import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { measure, normalizedEntropy } from './scripts/lint-variance.mjs'

test('normalized entropy is 0 when runs agree and 1 when every run differs', () => {
  assert.equal(normalizedEntropy(['a', 'a', 'a']), 0)
  assert.equal(normalizedEntropy(['a', 'b', 'c']), 1)
  assert.ok(normalizedEntropy(['a', 'a', 'b']) > 0 && normalizedEntropy(['a', 'a', 'b']) < 1)
})

test('three runs of one prompt: placement agrees, export style and suppressions differ', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lint-variance-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const config = path.join(root, 'eslint.config.mjs')
  fs.writeFileSync(config, "export default [{ rules: { 'no-debugger': 'error' } }]\n")
  const runs = [
    ['export function Cart() { return null }\n'],
    ['export default function Cart() { return null }\n'],
    ['// eslint-disable-next-line no-debugger -- flaky\ndebugger\nexport function Cart() { return null }\n'],
  ].map(([code], index) => {
    const dir = path.join(root, `run-${index}`)
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'src/Cart.js'), code)
    return dir
  })

  const report = await measure(config, runs)
  assert.equal(report.axes.placement.entropy, 0)
  assert.equal(report.axes.exports.distinct, 2 / 3)
  assert.deepEqual(report.prints.map((print) => print.suppressions), ['0', '0', '1'])
})
