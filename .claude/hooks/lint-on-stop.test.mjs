import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const hook = new URL('./lint-on-stop.mjs', import.meta.url)

async function run({ active = false, exit = 0, output = 'lint failure' } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'lint-on-stop-'))
  const bin = join(dir, 'rtk')
  await writeFile(bin, `#!/bin/sh
printf '%s' "$*" > "$RTK_ARGS_FILE"
printf '%s\\n' "$RTK_OUTPUT" >&2
exit "$RTK_EXIT"
`)
  await chmod(bin, 0o755)
  const result = spawnSync(process.execPath, [hook.pathname], {
    input: JSON.stringify({ stop_hook_active: active, cwd: dir }),
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      RTK_ARGS_FILE: join(dir, 'args'),
      RTK_EXIT: String(exit),
      RTK_OUTPUT: output,
    },
    encoding: 'utf8',
  })
  return { result, args: await readFile(join(dir, 'args'), 'utf8') }
}

test('auto-fixes on first stop and allows a clean exit', async () => {
  const { result, args } = await run({ output: '0 warnings' })
  assert.equal(result.status, 0)
  assert.equal(args, 'pnpm lint -- --fix')
  assert.equal(result.stdout, '')
})

test('blocks stop with remaining lint errors', async () => {
  const { result } = await run({ exit: 1, output: 'lint error' })
  assert.equal(result.status, 0)
  const feedback = JSON.parse(result.stdout)
  assert.equal(feedback.decision, 'block')
  assert.match(feedback.reason, /Lint failed after ESLint auto-fix/)
})

test('communicates warning-only diagnostics on the initial stop', async () => {
  const { result } = await run({ output: '1 warning' })
  assert.equal(result.status, 0)
  const feedback = JSON.parse(result.stdout)
  assert.equal(feedback.decision, 'block')
  assert.match(feedback.reason, /passed with warnings/)
  assert.match(feedback.reason, /1 warning/)
})

test('allows warning-only follow-up after Claude continues', async () => {
  const { result, args } = await run({ active: true, output: '1 warning' })
  assert.equal(args, 'pnpm lint')
  assert.equal(result.status, 0)
  assert.equal(result.stdout, '')
})

test('does not treat zero warnings as a warning', async () => {
  const { result } = await run({ output: '0 warnings' })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, '')
})

test('detects an ESLint warning diagnostic line', async () => {
  const { result } = await run({ output: '  3:4  warning  Prefer pure functions  custom/rule' })
  assert.equal(result.status, 0)
  assert.equal(JSON.parse(result.stdout).decision, 'block')
})

test('ignores unrelated dependency warning text', async () => {
  const { result } = await run({ output: 'warning: package metadata is stale' })
  assert.equal(result.status, 0)
  assert.equal(result.stdout, '')
})

test('still blocks real errors on follow-up', async () => {
  const { result } = await run({ active: true, exit: 1, output: 'lint error' })
  assert.equal(result.status, 0)
  assert.equal(JSON.parse(result.stdout).decision, 'block')
})
