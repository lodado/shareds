import { expect, test } from 'claude-code/testing'

const DIFF_WITH_EVASION = [
  '+++ b/src/a.ts',
  '@@ -0,0 +3,1 @@',
  '+const bad = value as any',
].join('\n')

test('an Edit that adds an evasion is denied before the tool runs', async ($, on) => {
  on('tool.call', () => ({ result: 'tool ran' }))
  const result = await $.tool.call({
    tool: 'Edit',
    file_path: 'src/a.ts',
    old_string: 'const a = 1',
    new_string: '// eslint-disable-next-line no-console\nconst a = 1',
  })
  expect(result.deny).toContain('src/a.ts:1 eslint-disable')
})

test('a clean Edit reaches the tool', async ($, on) => {
  on('tool.call', () => ({ result: 'tool ran' }))
  // The post-edit lint reads the file; an edit that is not in it is skipped
  on('fs.read', () => ({ value: '' }))
  const result = await $.tool.call({
    tool: 'Edit',
    file_path: 'src/a.ts',
    old_string: 'const a = 1',
    new_string: 'const a = 2 as const',
  })
  expect(result).toEqual({ result: 'tool ran' })
})

test('git commit is denied when the diff adds an evasion', async ($, on) => {
  on('tool.call', () => ({ result: 'tool ran' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: DIFF_WITH_EVASION, stderr: '' } }))
  const result = await $.tool.call({ tool: 'Bash', command: 'git add . && git commit -m "feat: x"' })
  expect(result.deny).toContain('src/a.ts:3 as-any')
})

test('git commit passes when the diff is clean', async ($, on) => {
  on('tool.call', () => ({ result: 'tool ran' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }))
  const result = await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat: x"' })
  expect(result).toEqual({ result: 'tool ran' })
})

test('git commit is denied when the diff cannot be read', async ($, on) => {
  on('tool.call', () => ({ result: 'tool ran' }))
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: 'fatal: broken' } }))
  const result = await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat: x"' })
  expect(result.deny).toContain('fatal: broken')
})

test('editing lint configuration asks the user', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))
  on('ui.toast', () => ({ value: undefined }))
  const decision = await $.tool.check({
    tool: 'Edit',
    input: { file_path: '/repo/eslint.config.mjs', old_string: "'error'", new_string: "'off'" },
  })
  expect(decision).toEqual({ decision: 'ask' })
})

test('an ordinary edit keeps the decision the rules reached', async ($, on) => {
  on('tool.check', () => ({ decision: 'allow' }))
  const decision = await $.tool.check({ tool: 'Edit', input: { file_path: 'src/a.ts', old_string: 'a', new_string: 'b' } })
  expect(decision).toEqual({ decision: 'allow' })
})

test('a deny from the rules is not softened to ask', async ($, on) => {
  on('tool.check', () => ({ decision: 'deny' }))
  on('ui.toast', () => ({ value: undefined }))
  const decision = await $.tool.check({ tool: 'Bash', input: { command: 'git commit --no-verify -m x' } })
  expect(decision).toEqual({ decision: 'deny' })
})

const FILE_AFTER_EDIT = ['const a = 1', 'if (a == 1) {}', 'const b = 2'].join('\n')
const EDIT = { tool: 'Edit', tool_use_id: 'toolu_1', file_path: '/repo/src/a.ts', old_string: 'x', new_string: 'if (a == 1) {}' }
const TOOL_RESULT = { ref: 1, result: { type: 'update' }, text: 'edited' }
const lintReport = (...messages: object[]) => JSON.stringify([{ filePath: '/repo/src/a.ts', messages }])

// The row the session stores for the call, which is what Claude reads.
const storedRow = async ($) => {
  const row = await $.session.append({
    message: { type: 'user', role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'edited' }] },
    door: 'tool-result',
    origin: { kind: 'tool', tool: 'Edit' },
    uuid: 'u1',
  })
  return row.message.content[0].content
}

const editWith = async ($, on, run: { exitCode: number; stdout: string; stderr: string }) => {
  on('tool.call', () => TOOL_RESULT)
  on('fs.read', () => ({ value: FILE_AFTER_EDIT }))
  on('process.run', () => ({ value: run }))
  await $.tool.call(EDIT)
  return storedRow($)
}

test('lint findings on the written lines reach the tool result Claude reads', async ($, on) => {
  const content = await editWith($, on, {
    exitCode: 1,
    stdout: lintReport(
      { ruleId: 'eqeqeq', severity: 2, message: 'Expected ===', line: 2, column: 7 },
      { ruleId: 'no-unused-vars', severity: 2, message: 'pre-existing', line: 3, column: 7 },
    ),
    stderr: '',
  })
  expect(content).toContain('edited')
  expect(content).toContain('src/a.ts:2:7 error Expected === (eqeqeq)')
  expect(content).not.toContain('pre-existing')
})

test('a clean lint leaves the tool result unchanged', async ($, on) => {
  expect(await editWith($, on, { exitCode: 0, stdout: '[]', stderr: '' })).toBe('edited')
})

test('a project without ESLint is not reported', async ($, on) => {
  const run = { exitCode: 1, stdout: '', stderr: 'npm error could not determine executable to run' }
  expect(await editWith($, on, run)).toBe('edited')
})

test('an ESLint crash is reported instead of passing as clean', async ($, on) => {
  const content = await editWith($, on, { exitCode: 2, stdout: '', stderr: 'TypeError: boom' })
  expect(content).toContain('ESLint did not run (TypeError: boom)')
})

test('no lint runs when the edit is not in the file', async ($, on) => {
  on('tool.call', () => TOOL_RESULT)
  on('fs.read', () => ({ value: 'unrelated' }))
  await $.tool.call(EDIT)
  expect(await storedRow($)).toBe('edited')
})

test('a note is delivered once, to its own tool call only', async ($, on) => {
  const run = { exitCode: 1, stdout: lintReport({ ruleId: 'eqeqeq', severity: 2, message: 'm', line: 2, column: 1 }), stderr: '' }
  expect(await editWith($, on, run)).toContain('eqeqeq')
  expect(await storedRow($)).toBe('edited')
})

test('waitForTimeout in a spec file is denied; waitFor asks', async ($, on) => {
  on('tool.call', () => ({ result: 'tool ran' }))
  on('tool.check', () => ({ decision: 'allow' }))
  on('ui.toast', () => ({ value: undefined }))
  const denied = await $.tool.call({
    tool: 'Write',
    file_path: 'e2e/a.spec.ts',
    content: 'await page.waitForTimeout(500)',
  })
  expect(denied.deny).toContain('wait-for-timeout')
  const asked = await $.tool.check({
    tool: 'Write',
    input: { file_path: 'src/a.test.tsx', content: 'await waitFor(() => expect(x).toBe(1))' },
  })
  expect(asked).toEqual({ decision: 'ask' })
})
