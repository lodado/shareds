import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { reviewOutputDigest } from './oracle-fs.mjs'

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

test('guards a notebook write and a renamed production file, and still lets a new test through', async (t) => {
  const root = await repository(t, 'ORACLE_READY')

  const notebook = hook({
    cwd: root,
    hook_event_name: 'PreToolUse',
    tool_name: 'NotebookEdit',
    tool_input: { notebook_path: 'packages/src/analysis.ipynb', new_source: 'x = 1' },
  })
  assert.match(notebook.decision?.permissionDecisionReason ?? '', /^PRODUCTION_TOUCHED_BEFORE_RED: src\/analysis\.ipynb/)

  // A rename lands as a write to a path the init snapshot never saw — production all the same.
  const renamed = hook(write(root, 'packages/src/save-form.ts'))
  assert.match(renamed.decision?.permissionDecisionReason ?? '', /^PRODUCTION_TOUCHED_BEFORE_RED: src\/save-form\.ts/)
  assert.equal(hook(write(root, 'packages/src/__test__/save-form.test.ts')).decision, null)
})

test('an unjudgeable write is fail-open but leaves one structured diagnostic on stderr', async (t) => {
  const root = await repository(t, 'ORACLE_READY')
  await writeFile(join(root, '.ai', 'oracles', 'sample', 'run-state.json'), '{ not json')

  const unreadable = hook(write(root, 'packages/src/save.ts'))
  assert.equal(unreadable.status, 0)
  assert.equal(unreadable.decision, null)
  assert.deepEqual(JSON.parse(unreadable.stderr.trim()), {
    oracleGuard: 'unjudged',
    reason: 'STATE_UNPARSEABLE',
    oracle: join(root, '.ai', 'oracles', 'sample'),
  })

  const broken = hook('{not json')
  assert.equal(broken.status, 0)
  assert.equal(JSON.parse(broken.stderr.trim()).reason, 'PAYLOAD_UNREADABLE')
})

test('a delete or a shell write is out of scope for the hook and only the transition gate sees it', async (t) => {
  const root = await repository(t, 'ORACLE_READY')

  // Documented gap: the hook matches write tools by file path, so `rm`/`mv` through Bash reaches
  // the working tree unjudged. oracle-run.mjs status --changed-files is what catches it afterwards.
  const shell = hook({
    cwd: root,
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'rm packages/src/save.ts' },
  })
  assert.equal(shell.decision, null)
  assert.equal(shell.stderr.trim(), '')
})

test('a reviewer subagent output is recorded as a host receipt, and the controller cannot write that file', async (t) => {
  const root = await repository(t, 'IMPLEMENTED_GREEN')
  const receipts = join(root, '.ai', 'oracles', 'sample', 'host-receipts.jsonl')
  const findings = { schemaVersion: 2, reviewerRole: 'code-reviewer', findings: [{ id: 'f-1', row: 'O1', severity: 'high' }] }

  const stopped = hook({
    cwd: root,
    hook_event_name: 'SubagentStop',
    session_id: 's-1',
    agent_id: 'agent-7',
    agent_type: 'code-reviewer',
    last_assistant_message: `Review done.\n\n\`\`\`json\n${JSON.stringify(findings)}\n\`\`\`\n`,
  })
  assert.equal(stopped.status, 0)
  // v2.1.271+의 SubagentHandback 보고도 같은 영수증이 된다 — 블라인드 매핑 객체도 대상이다
  const handedBack = hook({
    cwd: root,
    hook_event_name: 'PreToolUse',
    tool_name: 'SubagentHandback',
    agent_id: 'agent-8',
    agent_type: 'blind-mapper',
    tool_input: { message: JSON.stringify({ 'save > pending': 'O1' }) },
  })
  assert.equal(handedBack.decision, null)
  // 서브에이전트가 아닌 호출(agent_id 없음)이나 리뷰 산출물이 아닌 반환은 기록하지 않는다
  hook({ cwd: root, hook_event_name: 'SubagentStop', last_assistant_message: JSON.stringify(findings) })
  hook({ cwd: root, hook_event_name: 'SubagentStop', agent_id: 'agent-9', last_assistant_message: 'no json here' })

  const recorded = (await readFile(receipts, 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
  assert.deepEqual(
    recorded.map(({ agentId, kind, sha256 }) => ({ agentId, kind, sha256 })),
    [
      { agentId: 'agent-7', ...reviewOutputDigest(findings) },
      { agentId: 'agent-8', ...reviewOutputDigest({ 'save > pending': 'O1' }) },
    ],
  )

  const denied = hook(write(root, '.ai/oracles/sample/host-receipts.jsonl', '{}\n'))
  assert.equal(denied.decision?.permissionDecision, 'deny')
  assert.match(denied.decision.permissionDecisionReason, /^HOST_RECEIPT_PROTECTED: /)
})

test('receipts are recorded only while an oracle waits for review', async (t) => {
  const root = await repository(t, 'VALID_RED')
  hook({
    cwd: root,
    hook_event_name: 'SubagentStop',
    agent_id: 'agent-1',
    last_assistant_message: JSON.stringify({ findings: [] }),
  })
  await assert.rejects(readFile(join(root, '.ai', 'oracles', 'sample', 'host-receipts.jsonl'), 'utf8'), { code: 'ENOENT' })
})

test('the ORACLE_READY denial names the way to close an abandoned run', async (t) => {
  const root = await repository(t, 'ORACLE_READY')
  const denied = hook(write(root, 'packages/src/save.ts'))
  assert.match(denied.decision.permissionDecisionReason, /transition --dir .* --to FAIL --reason abandoned/)
})

test('every review artifact in a reply is recorded, the receipt file is protected case-insensitively, and writes mark a hook host', async (t) => {
  const root = await repository(t, 'IMPLEMENTED_GREEN')
  const receipts = join(root, '.ai', 'oracles', 'sample', 'host-receipts.jsonl')
  const findings = { findings: [{ id: 'f-1', row: 'O1', severity: 'low' }] }
  hook({
    cwd: root,
    hook_event_name: 'SubagentStop',
    agent_id: 'agent-3',
    // 앞선 예시 블록이 뒤의 findings를 가리지 않는다
    last_assistant_message: `Checked rows:\n\`\`\`json\n["O1","O2"]\n\`\`\`\nFindings:\n\`\`\`json\n${JSON.stringify(findings)}\n\`\`\`\n`,
  })
  const recorded = (await readFile(receipts, 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
  assert.deepEqual(recorded.map(({ sha256 }) => sha256), [reviewOutputDigest(findings).sha256])

  for (const path of ['.ai/oracles/sample/HOST-RECEIPTS.jsonl', '.AI/oracles/sample/host-receipts.jsonl']) {
    const denied = hook(write(root, path, '{}\n'))
    assert.equal(denied.decision?.permissionDecision, 'deny', path)
  }

  // 구현 중 쓰기가 영수증 파일을 만들어 hook 호스트임을 남긴다
  const red = await repository(t, 'VALID_RED')
  hook(write(red, 'packages/src/save.ts'))
  assert.equal(await readFile(join(red, '.ai', 'oracles', 'sample', 'host-receipts.jsonl'), 'utf8'), '')
})
