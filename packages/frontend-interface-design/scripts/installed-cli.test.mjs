import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const skill = join(dirname(dirname(fileURLToPath(import.meta.url))), 'skills/frontend-interface-design')

for (const script of ['scripts/pack.mjs', 'scripts/observe.mjs', 'scripts/render.mjs', 'evals/run-live.mjs']) {
  test(`${script} executes through an installed skill symlink rather than silently succeeding`, async (t) => {
    const root = await mkdtemp(join(process.env.JCODE_SCRATCH_DIR || tmpdir(), 'fid-installed-'))
    t.after(() => rm(root, { recursive: true, force: true }))
    const installed = join(root, 'frontend-interface-design')
    await symlink(skill, installed, 'dir')
    const direct = spawnSync(process.execPath, [join(skill, script), '--invalid-option'], {
      encoding: 'utf8',
      cwd: root,
    })
    const linked = spawnSync(process.execPath, [join(installed, script), '--invalid-option'], {
      encoding: 'utf8',
      cwd: root,
    })
    assert.notEqual(direct.status, 0)
    assert.equal(linked.status, direct.status, 'installed CLI must actually invoke its entry point')
    assert.equal(linked.stderr, direct.stderr)
    assert.equal(linked.stdout, direct.stdout)
  })
}
