import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const script = join(dirname(fileURLToPath(import.meta.url)), 'oracle-guard-hook.mjs')

function hook(payload) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload)
  const result = spawnSync(process.execPath, [script], { input, encoding: 'utf8' })
  const decision = result.stdout.trim() ? JSON.parse(result.stdout).hookSpecificOutput : null
  return { status: result.status, decision, stderr: result.stderr }
}

/** repo/.ai/oracles/sample + repo/packages 를 scan root로 둔 run-state. */
async function repository(t, state, extra = {}) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-guard-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const oracle = join(root, '.ai', 'oracles', 'sample')
  await mkdir(oracle, { recursive: true })
  await mkdir(join(root, 'packages', 'src', '__test__'), { recursive: true })
  await writeFile(
    join(oracle, 'run-state.json'),
    JSON.stringify({
      schemaVersion: 3,
      state,
      scanRoot: '../../../packages',
      harnessPaths: ['vitest.config.ts'],
      snapshot: { 'src/__test__/save.test.ts': 'a'.repeat(64), 'src/save.ts': 'b'.repeat(64) },
      ...extra,
    }),
  )
  return root
}

const write = (cwd, file_path, content = 'export const a = 1\n') => ({
  cwd,
  hook_event_name: 'PreToolUse',
  tool_name: 'Write',
  tool_input: { file_path, content },
})

test('denies a production write while the oracle sits at ORACLE_READY, with the gate code', async (t) => {
  const root = await repository(t, 'ORACLE_READY')

  const denied = hook(write(root, 'packages/src/save.ts'))

  assert.equal(denied.status, 0)
  assert.equal(denied.decision?.permissionDecision, 'deny')
  assert.match(denied.decision.permissionDecisionReason, /^PRODUCTION_TOUCHED_BEFORE_RED: src\/save\.ts/)
  assert.match(denied.decision.permissionDecisionReason, /record VALID_RED with oracle-run\.mjs red/)
})

test('allows test files, declared harness files, and paths outside the scan root before RED', async (t) => {
  const root = await repository(t, 'ORACLE_READY')

  assert.equal(hook(write(root, 'packages/src/__test__/save.test.ts')).decision, null)
  assert.equal(hook(write(root, 'packages/src/save.spec.tsx')).decision, null)
  assert.equal(hook(write(root, 'packages/vitest.config.ts')).decision, null)
  assert.equal(hook(write(root, 'docs/notes.md')).decision, null)
  // 오라클 아티팩트 자체(journal·evidence)는 production이 아니다
  assert.equal(hook(write(root, '.ai/oracles/sample/journal.md')).decision, null)
})

test('after VALID_RED a production write passes and a test write that adds a weakening token is denied', async (t) => {
  const root = await repository(t, 'VALID_RED')

  assert.equal(hook(write(root, 'packages/src/save.ts')).decision, null)

  const weakened = hook({
    cwd: root,
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: {
      file_path: 'packages/src/__test__/save.test.ts',
      old_string: "test('posts once', () => {",
      new_string: "test.skip('posts once', () => {",
    },
  })
  assert.equal(weakened.decision?.permissionDecision, 'deny')
  assert.match(weakened.decision.permissionDecisionReason, /^TEST_WEAKENED: src\/__test__\/save\.test\.ts/)

  // 이미 있던 토큰을 그대로 두는 편집은 약화가 아니다
  const unchanged = hook({
    cwd: root,
    hook_event_name: 'PreToolUse',
    tool_name: 'Edit',
    tool_input: {
      file_path: 'packages/src/__test__/save.test.ts',
      old_string: "await page.getByRole('button').first().click()",
      new_string: "await page.getByRole('button', { name: 'Save' }).first().click()",
    },
  })
  assert.equal(unchanged.decision, null)

  // init 스냅샷에 없는 새 테스트 파일은 약화할 기존 강도가 없다 — 토큰이 있어도 허용
  const fresh = hook(write(root, 'packages/src/__test__/new.test.ts', "test('x', async () => { await page.locator('li').first().click() })\n"))
  assert.equal(fresh.decision, null)
})

test('stays silent with no oracle, a foreign tool, or an unreadable payload — fail-open', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-guard-none-'))
  t.after(() => rm(root, { recursive: true, force: true }))

  assert.equal(hook(write(root, 'src/save.ts')).decision, null)
  assert.equal(hook({ cwd: root, tool_name: 'Bash', tool_input: { command: 'ls' } }).decision, null)
  const broken = hook('{not json')
  assert.equal(broken.status, 0)
  assert.equal(broken.decision, null)
})
