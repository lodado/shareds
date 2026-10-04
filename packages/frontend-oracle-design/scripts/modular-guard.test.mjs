import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- plugin contracts run through node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const pluginDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const nestedScript = join(pluginDirectory, 'skills/frontend-oracle-design/scripts/oracle-guard-hook.mjs')
// Exercise the same public hook before and after the structural relocation.
const script = existsSync(nestedScript) ? nestedScript : join(pluginDirectory, 'skills/scripts/oracle-guard-hook.mjs')
const roles = ['frontend-oracle-design', 'oracle-intake', 'oracle-author', 'oracle-implement', 'oracle-review']

async function runWrite(t, skill, via, entryType) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-role-guard-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const transcriptPath = join(root, 'session.jsonl')
  const entry = via === 'slash'
    ? { type: entryType ?? 'user', message: { content: `<command-name>/${skill}</command-name>` } }
    : { type: entryType ?? 'assistant', message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill } }] } }
  await writeFile(transcriptPath, `${JSON.stringify({ ...entry, timestamp: '2026-10-04T12:00:00.000Z' })}\n`)
  const result = spawnSync(process.execPath, [script], {
    input: JSON.stringify({
      hook_event_name: 'PreToolUse',
      cwd: root,
      transcript_path: transcriptPath,
      tool_name: 'Write',
      tool_input: { file_path: join(root, 'src/save.test.ts'), content: 'test("save", () => {})' },
    }),
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '', 'the tested payload must be judgeable, not a fail-open diagnostic')
  return result.stdout.trim() ? JSON.parse(result.stdout).hookSpecificOutput : null
}

for (const role of roles) {
  for (const via of ['tool', 'slash']) {
    for (const name of [role, `frontend-oracle-design:${role}`]) {
      test(`${via} activation of ${name} preserves the pre-lock test gate`, async (t) => {
        const decision = await runWrite(t, name, via)
        assert.equal(decision?.permissionDecision, 'deny', 'a specialist must not bypass TEST_BEFORE_LOCK')
        assert.match(decision.permissionDecisionReason, /^TEST_BEFORE_LOCK:/)
      })
    }
  }
}

for (const name of ['frontend-oracle-designer', 'frontend-oracle-design-notes', 'oracle-authoring', 'other:oracle-author']) {
  for (const via of ['tool', 'slash']) {
    test(`${via} activation of unrelated ${name} does not activate Oracle`, async (t) => {
      assert.equal(await runWrite(t, name, via), null)
    })
  }
}

test('a tool result quoting a specialist slash command does not activate Oracle', async (t) => {
  assert.equal(await runWrite(t, 'oracle-author', 'slash', 'tool'), null)
})
