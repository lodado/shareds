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
  const result = await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat: x"' })
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

test('git commit --no-verify is denied before the tool runs', async ($, on) => {
  on('tool.call', () => ({ result: 'tool ran' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }))
  const result = await $.tool.call({ tool: 'Bash', command: 'git commit --no-verify -m "feat: x"' })
  expect(result.deny).toContain('skips git hooks (no-verify)')
})

test('git push --no-verify is denied before the tool runs', async ($, on) => {
  on('tool.call', () => ({ result: 'tool ran' }))
  const result = await $.tool.call({ tool: 'Bash', command: 'git push --no-verify origin HEAD:main' })
  expect(result.deny).toContain('skips git hooks (no-verify)')
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

test('waitForTimeout in a spec file is denied', async ($, on) => {
  on('tool.call', () => ({ result: 'tool ran' }))
  const denied = await $.tool.call({
    tool: 'Write',
    file_path: 'e2e/a.spec.ts',
    content: 'await page.waitForTimeout(500)',
  })
  expect(denied.deny).toContain('wait-for-timeout')
})

test('a clock wait in a test reaches the tool result Claude reads as a hint', async ($, on) => {
  on('tool.call', () => TOOL_RESULT)
  on('fs.read', () => ({ value: 'unrelated' }))
  await $.tool.call({
    tool: 'Edit',
    tool_use_id: 'toolu_1',
    file_path: '/repo/src/a.test.tsx',
    old_string: 'x',
    new_string: 'await waitFor(() => expect(x).toBe(1))',
  })
  const content = await storedRow($)
  expect(content).toContain('edited')
  expect(content).toContain('(wait-for) in /repo/src/a.test.tsx')
})

test('git add && git commit also scans untracked files', async ($, on) => {
  on('tool.call', () => ({ result: 'tool ran' }))
  on('process.run', ($, e) => {
    const argv = e.argv.join(' ')
    if (argv.startsWith('git ls-files')) return { value: { exitCode: 0, stdout: 'src/new.ts\0notes.md\0', stderr: '' } }
    return { value: { exitCode: 0, stdout: '', stderr: '' } }
  })
  on('fs.read', () => ({ value: 'const ok = 1\nconst bad = value as any\n' }))
  const result = await $.tool.call({ tool: 'Bash', command: 'git add . && git commit -m "feat: x"' })
  expect(result.deny).toContain('src/new.ts:2 as-any')
})

test('untracked files are not read when the commit does not stage them', async ($, on) => {
  on('tool.call', () => ({ result: 'tool ran' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }))
  const result = await $.tool.call({ tool: 'Bash', command: 'git commit -m "feat: x"' })
  expect(result).toEqual({ result: 'tool ran' })
})

test('a commit that stages more untracked code files than the scan reads is denied', async ($, on) => {
  on('tool.call', () => ({ result: 'tool ran' }))
  const names = Array.from({ length: 201 }, (_, i) => `src/f${i}.ts`).join('\0')
  on('process.run', ($, e) => ({
    value: { exitCode: 0, stdout: e.argv.includes('ls-files') ? names : '', stderr: '' },
  }))
  on('fs.read', () => ({ value: 'const ok = 1' }))
  const result = await $.tool.call({ tool: 'Bash', command: 'git add -A && git commit -m x' })
  expect(result.deny).toContain('untracked')
})

test('untracked paths are read NUL-separated, so unusual names are not mangled', async ($, on) => {
  on('tool.call', () => ({ result: 'tool ran' }))
  on('process.run', ($, e) => ({
    value: { exitCode: 0, stdout: e.argv.includes('ls-files') ? 'src/é ü.ts\0' : '', stderr: '' },
  }))
  on('fs.read', ($, e) => ({ value: e.path.endsWith('src/é ü.ts') ? 'const bad = x as any' : '' }))
  const result = await $.tool.call({ tool: 'Bash', command: 'git add -A && git commit -m x' })
  expect(result.deny).toContain('as-any')
})
