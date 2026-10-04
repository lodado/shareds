import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { reviewOutputDigest } from './oracle-fs.mjs'
import { spawnGit } from './resolve-executable.mjs'

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

test('denies a hand write of the pre-lock stage record, before any run-state exists', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-guard-stage-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  await mkdir(join(root, '.ai', 'oracles', 'sample'), { recursive: true })
  const denied = hook(write(root, '.ai/oracles/sample/stage.json', '{"stage":"DRAFTED"}\n'))
  assert.equal(denied.decision?.permissionDecision, 'deny')
  assert.match(denied.decision.permissionDecisionReason, /^STAGE_PROTECTED: stage\.json moves only through oracle-stage\.mjs/)
  // another stage.json outside an oracle folder is not ours
  assert.equal(hook(write(root, 'src/stage.json', '{}\n')).decision, null)
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

/** 사용자가 슬래시 명령으로 스킬을 켠 기록 — Claude Code는 Skill tool_use 없이 이 user 문자열만 남긴다. */
const slashEntry = (skill, at) => ({
  type: 'user',
  timestamp: at,
  message: { content: `<command-message>${skill}</command-message>\n<command-name>/${skill}</command-name>\n<command-args>go</command-args>` },
})

/** 스킬을 켠 세션 기록 — Skill 호출(또는 슬래시 명령) 시각과 그 뒤의 assistant 문장들. */
async function transcript(
  root,
  { at = '2026-10-02T03:00:00.000Z', skill = 'frontend-oracle-design:frontend-oracle-design', via = 'tool', after = [] } = {},
) {
  const path = join(root, 'session.jsonl')
  const activation =
    via === 'slash'
      ? slashEntry(skill, at)
      : { type: 'assistant', timestamp: at, message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] } }
  const entries = [
    { type: 'user', timestamp: '2026-10-02T02:59:00.000Z', message: { content: 'write the tests now' } },
    activation,
    ...after.map((text) => ({ type: 'assistant', timestamp: at, message: { content: [{ type: 'text', text }] } })),
  ]
  await writeFile(path, `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`)
  return path
}

const writeIn = (cwd, transcript_path, file_path) => ({ ...write(cwd, file_path, "test('x', () => {})\n"), transcript_path })

test('a session that activated the skill cannot write a test before a lock exists — the interview and the model come first', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-guard-prelock-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const session = await transcript(root)

  const denied = hook(writeIn(root, session, 'src/features/run/TemplateRun.scenario.test.tsx'))
  assert.equal(denied.decision?.permissionDecision, 'deny')
  assert.match(denied.decision.permissionDecisionReason, /^TEST_BEFORE_LOCK: src\/features\/run\/TemplateRun\.scenario\.test\.tsx/)
  assert.match(denied.decision.permissionDecisionReason, /NEEDS_DECISION/)

  // 모델 파일과 오라클 기록, 제품 코드 조사 메모는 lock 전에 쓴다 — 이 관문은 테스트만 본다
  for (const path of ['src/features/run/__test__/formal/MODEL.bend', '.ai/oracles/run/oracle.package.json', 'src/features/run/notes.ts']) {
    assert.equal(hook(writeIn(root, session, path)).decision, null, path)
  }
})

test('a lock created after the activation opens the test gate; a lock left from an earlier session does not', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-guard-lock-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const session = await transcript(root)
  const oracle = join(root, '.ai', 'oracles', 'run')
  await mkdir(oracle, { recursive: true })
  const lock = join(oracle, 'oracle.lock.json')
  await writeFile(lock, '{}\n')
  const test_file = 'src/features/run/__test__/run.test.ts'

  const stale = new Date('2026-10-01T00:00:00.000Z')
  await utimes(lock, stale, stale)
  assert.equal(hook(writeIn(root, session, test_file)).decision?.permissionDecision, 'deny')

  const fresh = new Date('2026-10-02T03:05:00.000Z')
  await utimes(lock, fresh, fresh)
  assert.equal(hook(writeIn(root, session, test_file)).decision, null)
})

test('with parallel slices one slice lock opens tests only inside its own scan root; a lock before init stays unscoped', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-guard-slice-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const session = await transcript(root)
  const fresh = new Date('2026-10-02T03:05:00.000Z')
  const lockSlice = async (id, scanRoot) => {
    const oracle = join(root, '.ai', 'oracles', id)
    await mkdir(oracle, { recursive: true })
    await writeFile(join(oracle, 'oracle.lock.json'), '{}\n')
    await utimes(join(oracle, 'oracle.lock.json'), fresh, fresh)
    if (scanRoot) await writeFile(join(oracle, 'run-state.json'), JSON.stringify({ schemaVersion: 3, state: 'ORACLE_READY', scanRoot }))
  }
  await mkdir(join(root, 'src', 'features', 'run'), { recursive: true })
  await mkdir(join(root, 'src', 'features', 'billing'), { recursive: true })
  await lockSlice('run', '../../../src/features/run')

  assert.equal(hook(writeIn(root, session, 'src/features/run/__test__/run.test.ts')).decision, null)
  const other = hook(writeIn(root, session, 'src/features/billing/__test__/billing.test.ts'))
  assert.equal(other.decision?.permissionDecision, 'deny')
  assert.match(other.decision.permissionDecisionReason, /^TEST_OUTSIDE_LOCKED_SLICE: src\/features\/billing\/__test__\/billing\.test\.ts/)

  // the billing slice locks its own oracle: its tests open
  await lockSlice('billing', '../../../src/features/billing')
  assert.equal(hook(writeIn(root, session, 'src/features/billing/__test__/billing.test.ts')).decision, null)

  // a lock that has no run-state yet does not know its scope, so it stays open as before
  await lockSlice('search')
  assert.equal(hook(writeIn(root, session, 'src/features/search/__test__/search.test.ts')).decision, null)
})

test('the test gate stays out of sessions that never activated the skill or routed the request out of scope', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-guard-other-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const test_file = 'src/save.test.ts'

  assert.equal(hook(writeIn(root, await transcript(root, { skill: 'test:test' }), test_file)).decision, null)
  assert.equal(hook(writeIn(root, join(root, 'missing.jsonl'), test_file)).decision, null)
  assert.equal(hook(write(root, test_file)).decision, null)
  const routed = await transcript(root, { after: ['Status: OUT_OF_SCOPE — copy change, routed to $test'] })
  assert.equal(hook(writeIn(root, routed, test_file)).decision, null)
})

test('a slash-command activation closes the test gate like a Skill call; a tool result quoting the tag does not', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'oracle-guard-slash-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const test_file = 'src/features/run/__test__/run.test.ts'

  for (const skill of ['frontend-oracle-design:frontend-oracle-design', 'frontend-oracle-design']) {
    const denied = hook(writeIn(root, await transcript(root, { via: 'slash', skill }), test_file))
    assert.equal(denied.decision?.permissionDecision, 'deny', skill)
    assert.match(denied.decision.permissionDecisionReason, /^TEST_BEFORE_LOCK: /)
  }
  assert.equal(hook(writeIn(root, await transcript(root, { via: 'slash', skill: 'test:test' }), test_file)).decision, null)

  // grep 결과처럼 태그 문자열을 담은 tool_result는 활성화가 아니다
  const quoted = join(root, 'quoted.jsonl')
  const { message } = slashEntry('frontend-oracle-design:frontend-oracle-design', '2026-10-02T03:00:00.000Z')
  await writeFile(
    quoted,
    `${JSON.stringify({ type: 'user', timestamp: '2026-10-02T03:00:00.000Z', message: { content: [{ type: 'tool_result', content: message.content }] } })}\n`,
  )
  assert.equal(hook(writeIn(root, quoted, test_file)).decision, null)
})

/** 오라클을 cwd 아래 패키지에 둔 모노레포 — 세션은 레포 루트에서 시작한다. */
async function monorepo(t, state, { git = false } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-guard-mono-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const oracle = join(root, 'packages', 'app', '.ai', 'oracles', 'sample')
  await mkdir(oracle, { recursive: true })
  await mkdir(join(root, 'packages', 'web'), { recursive: true })
  // 탐색이 무거운 폴더로 내려가지 않는다 — 여기 둔 오라클은 찾지 않아야 한다
  await mkdir(join(root, 'node_modules', 'dep', '.ai', 'oracles', 'vendored'), { recursive: true })
  await writeFile(join(root, 'node_modules', 'dep', '.ai', 'oracles', 'vendored', 'run-state.json'), JSON.stringify({ state }))
  await writeFile(join(oracle, 'run-state.json'), JSON.stringify({ schemaVersion: 3, state, scanRoot: '../../..' }))
  if (git) assert.equal(spawnGit(['init', '-q', root]).status, 0)
  return { root, oracle }
}

const reviewFindings = { findings: [{ id: 'f-1', row: 'O1', severity: 'low' }] }
const reviewerStop = (cwd) => ({
  cwd,
  hook_event_name: 'SubagentStop',
  agent_id: 'agent-1',
  last_assistant_message: JSON.stringify(reviewFindings),
})

test('a review receipt reaches an oracle below the start folder, and one in a sibling package of the git repository', async (t) => {
  const below = await monorepo(t, 'IMPLEMENTED_GREEN')
  assert.equal(hook(reviewerStop(below.root)).status, 0)
  const recorded = await readFile(join(below.oracle, 'host-receipts.jsonl'), 'utf8')
  assert.equal(JSON.parse(recorded).sha256, reviewOutputDigest(reviewFindings).sha256)
  await assert.rejects(readFile(join(below.root, 'node_modules', 'dep', '.ai', 'oracles', 'vendored', 'host-receipts.jsonl')), {
    code: 'ENOENT',
  })

  const sibling = await monorepo(t, 'IMPLEMENTED_GREEN', { git: true })
  hook(reviewerStop(join(sibling.root, 'packages', 'web')))
  assert.equal(JSON.parse(await readFile(join(sibling.oracle, 'host-receipts.jsonl'), 'utf8')).sha256, reviewOutputDigest(reviewFindings).sha256)
})

test('a final report finds its oracle below the start folder, and says so when no oracle owns its runs', async (t) => {
  const { root, oracle } = await monorepo(t, 'IMPLEMENTED_GREEN')
  await writeFile(join(oracle, 'runs.jsonl'), `${JSON.stringify({ runId: 'r-001', at: '2026-10-02T03:00:00.000Z' })}\n`)
  const stop = (cwd, message) =>
    spawnSync(process.execPath, [script], {
      input: JSON.stringify({ cwd, hook_event_name: 'Stop', last_assistant_message: message }),
      encoding: 'utf8',
    })

  // 이 최소 원장은 runner가 판정하지 못한다 — 그래도 주인 오라클로 골라졌다는 흔적이 남는다
  const owned = stop(root, 'Status: IMPLEMENTED_GREEN — done\n- behavior r-001 exit 0\n')
  assert.equal(owned.status, 0)
  assert.doesNotMatch(owned.stderr, /ORACLE_NOT_FOUND/)
  assert.match(owned.stderr, /packages\/app\/\.ai\/oracles\/sample/)

  const orphan = stop(root, 'Status: REVIEW_VERIFIED — done\n- behavior r-042 exit 0\n')
  assert.equal(orphan.status, 0)
  assert.equal(orphan.stdout.trim(), '')
  assert.equal(JSON.parse(orphan.stderr.trim()).reason, 'ORACLE_NOT_FOUND')
  // 실행 없이 닿는 상태의 무인용 보고는 주인을 찾지 않는다
  assert.equal(stop(root, 'Status: NEEDS_DECISION — waiting on Q1\n').stderr.trim(), '')
})
