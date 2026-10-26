import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after } from 'node:test'
import { gate } from './gate.mjs'
import { observe } from './observe.mjs'
import { initRun } from './run.mjs'

export const button = (label, id) => ({ role: 'button', label, ...(id && { id }) })

/** A screen with a heading and a button group: enough structure for a high-confidence fingerprint. */
export const screen = (title, buttons = [], extra = []) => ({
  role: 'window',
  children: [
    { role: 'navigationbar', label: title },
    { role: 'group', id: 'content', children: [...buttons.map((label) => button(label, `btn-${label}`)), ...extra] },
  ],
})

const created = []
after(() => Promise.all(created.map((dir) => rm(dir, { recursive: true, force: true }))))

export async function tempDir() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'app-research-')))
  created.push(dir)
  return dir
}

/** Rewrites run.json with `patch` applied, to test limits without driving the whole run there. */
export async function patchRun(runDir, patch) {
  const file = join(runDir, 'run.json')
  await writeFile(file, JSON.stringify({ ...JSON.parse(await readFile(file, 'utf8')), ...patch }))
}

export async function newRun(options = {}) {
  const root = await tempDir()
  const { runDir } = await initRun({
    target: 'com.example.app',
    platform: 'ios',
    'output-dir': join(root, 'research'),
    ...options,
  })
  return { root, runDir }
}

export async function writeSnapshot(root, name, tree) {
  const path = join(root, `${name}.json`)
  await writeFile(path, JSON.stringify(tree))
  return path
}

export async function anchor(root, runDir, tree) {
  return observe(runDir, { anchor: true, snapshot: await writeSnapshot(root, `anchor-${randomUUID()}`, tree) })
}

/** One gated action: gate, then observe the resulting tree. Fails the caller if the gate blocks. */
export async function act(root, runDir, step, tree, extra = {}) {
  const verdict = await gate(runDir, { role: 'button', ...step })
  if (verdict.decision !== 'allow') throw new Error(`gate blocked ${step.label}: ${verdict.category}`)
  return observe(runDir, {
    gate: verdict.gateId,
    snapshot: await writeSnapshot(root, `obs-${randomUUID()}`, tree),
    ...extra,
  })
}
