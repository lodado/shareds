import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { mineDimensions } from './oracle-dimensions.mjs'

const script = join(dirname(fileURLToPath(import.meta.url)), 'oracle-dimensions.mjs')

const GRID = `import { useEffect, useState } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

export function Grid({ filter }) {
  const [rows, setRows] = useState([])
  useEffect(() => {
    const timer = setTimeout(() => setRows((r) => r.concat(page)), 200)
    const observer = new ResizeObserver(() => {})
    return () => clearTimeout(timer)
  }, [filter])
  const virtualizer = useVirtualizer({ count: rows.length })
  const controller = new AbortController()
  fetch('/api/rows?filter=' + filter, { signal: controller.signal })
  fetch('/api/count')
  localStorage.setItem('filter', filter)
  return null
}
`

test('mines the r11b defect dimensions from the code that carried them', () => {
  const found = mineDimensions('src/Grid.tsx', GRID)
  const byDimension = Object.fromEntries(found.map((entry) => [entry.dimension, entry]))

  // 결함 1: 핸들러·effect 소유 타이머 × StrictMode — 결함 3: ResizeObserver 초기 측정 — 결함 2: virtualizer 스크롤 소유
  assert.equal(byDimension['StrictMode double-invoke'].family, 'Environment')
  assert.equal(byDimension['StrictMode double-invoke'].citation, 'code(src/Grid.tsx#L6)')
  assert.equal(byDimension['measured layout'].citation, 'code(src/Grid.tsx#L8)')
  assert.equal(byDimension['scroll ownership'].citation, 'code(src/Grid.tsx#L2-L11)')
  assert.equal(byDimension['request interleaving'].family, 'Order')
  assert.equal(byDimension['request interleaving'].citation, 'code(src/Grid.tsx#L13-L14)')
  assert.equal(byDimension['cancel · late response'].family, 'Async')
  assert.equal(byDimension['persisted state'].family, 'Data')
  assert.equal(byDimension.remount, undefined)
})

test('a file with no pattern yields no candidates — and says so instead of claiming completeness', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'oracle-dimensions-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const plain = join(directory, 'copy.ts')
  await writeFile(plain, "export const label = 'Save'\n")
  const grid = join(directory, 'Grid.tsx')
  await writeFile(grid, GRID)

  const empty = spawnSync(process.execPath, [script, '--path', plain], { encoding: 'utf8' })
  assert.equal(empty.status, 0, empty.stderr)
  assert.match(empty.stdout, /No pattern matched\. This is not evidence that the dimension space is complete\./)
  assert.match(empty.stdout, /No known side-effect token found\./)

  const report = spawnSync(process.execPath, [script, '--path', grid], { encoding: 'utf8' })
  assert.equal(report.status, 0, report.stderr)
  assert.match(report.stdout, /^## Dimension candidates — 1 files/)
  assert.match(report.stdout, /\| Environment \| StrictMode double-invoke \| code\(.*Grid\.tsx#L6\) \|/)
  assert.match(report.stdout, /## Side-effect inventory/)
  assert.match(report.stdout, /\| network \| `fetch\(` \| code\(.*Grid\.tsx#L13\) \|/)
  assert.match(report.stdout, /\| storage \| `localStorage` \| code\(.*Grid\.tsx#L15\) \|/)

  const usage = spawnSync(process.execPath, [script], { encoding: 'utf8' })
  assert.equal(usage.status, 2)
})
