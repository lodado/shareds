import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../test-fixtures/changeability')

function verify(subject, sdkVersion, testFile = 'verify.test.mjs') {
  // A nested node --test must not inherit the outer runner's recursive-test marker.
  const { NODE_TEST_CONTEXT, ...env } = process.env
  return spawnSync(process.execPath, ['--test', join(root, testFile)], {
    encoding: 'utf8',
    timeout: 30000,
    env: {
      ...env,
      SUBJECT_ROOT: join(root, subject),
      SDK_VERSION: sdkVersion,
      COPY_VERSION: sdkVersion === 'v1' ? 'v1' : 'v2',
    },
  })
}

test('changeability pilot: seed preserves v1 but cannot falsely pass the requested v2 changes', () => {
  const baseline = verify('seed', 'v1')
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr)
  const red = verify('seed', 'v2')
  assert.equal(red.status, 1, red.error?.message ?? red.stdout + red.stderr)
})

for (const run of ['run-a', 'run-b']) {
  test(`changeability pilot: ${run} snapshots preserve the contract at both stages`, () => {
    const first = verify(`results/${run}/stage-1/src`, 'v2', 'results/verify-stage1.test.mjs')
    assert.equal(first.status, 0, first.error?.message ?? first.stdout + first.stderr)
    const red = verify(`results/${run}/stage-1/src`, 'v3')
    assert.equal(red.status, 1, red.error?.message ?? red.stdout + red.stderr)
    const second = verify(`results/${run}/stage-2/src`, 'v3')
    assert.equal(second.status, 0, second.error?.message ?? second.stdout + second.stderr)
    assert.equal(
      readFileSync(join(root, `results/${run}/stage-1/src/toggle.mjs`), 'utf8'),
      readFileSync(join(root, `results/${run}/stage-2/src/toggle.mjs`), 'utf8'),
      'the SDK-only follow-up must not rewrite the independent toggle',
    )
  })
}
