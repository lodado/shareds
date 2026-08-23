import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const hook = new URL('./lint-on-stop.mjs', import.meta.url)

const run = async ({ active = false, exit = 0 } = {}) => {
  const dir = await mkdtemp(join(tmpdir(), 'lint-on-stop-'))
  const bin = join(dir, 'rtk')
  const argsFile = join(dir, 'args')
  await writeFile(bin, '#!/bin/sh\nprintf "%s" "$*" > "$RTK_ARGS_FILE"\necho "lint failure" >&2\nexit "$RTK_EXIT"\n')
  await chmod(bin, 0o755)

  const result = spawnSync(process.execPath, [hook.pathname], {
    input: JSON.stringify({ cwd: dir, stop_hook_active: active }),
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      RTK_ARGS_FILE: argsFile,
      RTK_EXIT: String(exit),
    },
  })

  return { result, args: await readFile(argsFile, 'utf8') }
}

test('auto-fixes on first stop and allows a clean exit', async () => {
  const { result, args } = await run()
  assert.equal(result.status, 0)
  assert.equal(result.stdout, '')
  assert.equal(args, 'pnpm lint -- --fix')
})

test('blocks stop with the remaining lint output', async () => {
  const { result } = await run({ exit: 1 })
  const feedback = JSON.parse(result.stdout)
  assert.equal(feedback.decision, 'block')
  assert.match(feedback.reason, /lint failure/)
})

test('verifies without another auto-fix after Claude continues', async () => {
  const { args } = await run({ active: true, exit: 1 })
  assert.equal(args, 'pnpm lint')
})
