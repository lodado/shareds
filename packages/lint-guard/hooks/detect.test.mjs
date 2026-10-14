import assert from 'node:assert/strict'
import { test } from 'node:test'

import { addedLines, evasionsInDiff, evasionsInToolCall, isGitCommit, parseDiff, weakeningReason } from './detect.js'

const ids = (hits) => hits.map((hit) => hit.id).sort()

test('addedLines ignores lines the edit did not add', () => {
  assert.deepEqual(addedLines('a\nb', 'a\nc\nb'), ['c'])
  assert.deepEqual(addedLines('x', 'x\nx'), ['x'])
  assert.deepEqual(addedLines(undefined, 'a'), ['a'])
})

test('Edit that adds each evasion is reported', () => {
  const cases = {
    'eslint-disable': '// eslint-disable-next-line no-console -- reason',
    'ts-ignore': '// @ts-ignore',
    'as-any': 'const a = b as any',
    'as-unknown-as': 'const a = b as unknown as Foo',
    'void-promise': '  void save()',
    'test-skip': "it.skip('x', () => {})",
  }
  for (const [id, line] of Object.entries(cases)) {
    const hits = evasionsInToolCall({ tool: 'Edit', file_path: 'src/a.ts', old_string: '', new_string: line })
    assert.deepEqual(ids(hits), [id], id)
  }
})

test('pre-existing evasion that the edit keeps is not blamed', () => {
  const kept = '// eslint-disable-next-line x -- old'
  const hits = evasionsInToolCall({
    tool: 'Edit',
    file_path: 'src/a.ts',
    old_string: kept,
    new_string: `${kept}\nconst ok = 1`,
  })
  assert.deepEqual(hits, [])
})

test('safe code and non-code files pass', () => {
  assert.deepEqual(evasionsInToolCall({ tool: 'Write', file_path: 'a.ts', content: 'void 0\nconst a = 1 as const' }), [])
  assert.deepEqual(evasionsInToolCall({ tool: 'Write', file_path: 'README.md', content: 'use eslint-disable never' }), [])
  assert.deepEqual(evasionsInToolCall({ tool: 'Read', file_path: 'a.ts' }), [])
})

test('Write and MultiEdit are scanned', () => {
  assert.deepEqual(ids(evasionsInToolCall({ tool: 'Write', file_path: 'a.tsx', content: 'x as any' })), ['as-any'])
  const multi = { tool: 'MultiEdit', file_path: 'a.ts', edits: [{ old_string: 'a', new_string: '// @ts-nocheck' }] }
  assert.deepEqual(ids(evasionsInToolCall(multi)), ['ts-ignore'])
})

test('diff scan reports file and new-file line number', () => {
  const diff = [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,0 +10,2 @@',
    '+const ok = 1',
    '+const bad = x as any',
    'diff --git a/README.md b/README.md',
    '--- a/README.md',
    '+++ b/README.md',
    '@@ -1,0 +1,1 @@',
    '+eslint-disable in docs',
    'diff --git a/gone.ts b/gone.ts',
    '--- a/gone.ts',
    '+++ /dev/null',
    '@@ -1,1 +0,0 @@',
    '-as any',
  ].join('\n')
  assert.equal(parseDiff(diff).length, 2)
  const hits = evasionsInDiff(diff)
  assert.deepEqual(hits.map((hit) => [hit.file, hit.line, hit.id]), [['src/a.ts', 11, 'as-any']])
})

test('git commit detection', () => {
  assert.equal(isGitCommit('git commit -m x'), true)
  assert.equal(isGitCommit('git add . && git commit -am x'), true)
  assert.equal(isGitCommit('git -C repo commit -m x'), true)
  assert.equal(isGitCommit('echo "git commit"'), false)
  assert.equal(isGitCommit('git log --oneline'), false)
})

test('weakening: git hook bypasses', () => {
  for (const command of [
    'git commit --no-verify -m x',
    'git push --no-verify',
    'git commit -nm x',
    'HUSKY=0 git commit -m x',
    'SKIP=lint git commit -m x',
    'git config core.hooksPath /dev/null',
  ]) {
    assert.ok(weakeningReason({ tool: 'Bash', command }), command)
  }
  assert.equal(weakeningReason({ tool: 'Bash', command: 'git push -n' }), null)
  assert.equal(weakeningReason({ tool: 'Bash', command: 'git commit -m "fix: x"' }), null)
})

test('weakening: lint configuration edits', () => {
  assert.ok(weakeningReason({ tool: 'Edit', file_path: '/r/eslint.config.mjs', old_string: 'a', new_string: 'b' }))
  assert.ok(weakeningReason({ tool: 'Write', file_path: '/r/.husky/pre-push', content: 'x' }))
  assert.ok(weakeningReason({ tool: 'Edit', file_path: '/r/vitest.config.ts', old_string: 'a', new_string: 'b' }))
  assert.ok(weakeningReason({ tool: 'Bash', command: "sed -i 's/error/off/' eslint.config.mjs" }))
  assert.equal(weakeningReason({ tool: 'Bash', command: 'cat eslint.config.mjs' }), null)
  assert.equal(weakeningReason({ tool: 'Edit', file_path: 'src/a.ts', old_string: 'a', new_string: 'b' }), null)
})

test('weakening: tsconfig only when it loosens checking', () => {
  const edit = (new_string) => ({ tool: 'Edit', file_path: '/r/tsconfig.json', old_string: '', new_string })
  assert.ok(weakeningReason(edit('"strict": false')))
  assert.ok(weakeningReason(edit('"exclude": ["src"]')))
  assert.equal(weakeningReason(edit('"paths": { "@/*": ["./src/*"] }')), null)
})

test('test files: waitForTimeout is denied, other waits ask', async () => {
  const { slowTestReason } = await import('./detect.js')
  const write = (file_path, content) => ({ tool: 'Write', file_path, content })
  assert.deepEqual(ids(evasionsInToolCall(write('e2e/a.spec.ts', 'await page.waitForTimeout(500)'))), ['wait-for-timeout'])
  assert.deepEqual(evasionsInToolCall(write('src/a.ts', 'await page.waitForTimeout(500)')), [])
  for (const line of [
    'await waitFor(() => expect(x).toBe(1))',
    'await waitForElementToBeRemoved(el)',
    "await page.waitForLoadState('networkidle')",
    'await new Promise((r) => setTimeout(r, 10))',
    'vi.setConfig({ testTimeout: 60000 })',
    'await expect.poll(() => n).toBe(1)',
  ]) {
    assert.ok(slowTestReason(write('src/a.test.tsx', line)), line)
  }
  for (const line of ["await screen.findByText('x')", 'await page.waitForResponse(/api/)', 'await user.click(b)']) {
    assert.equal(slowTestReason(write('src/a.test.tsx', line)), null, line)
  }
  assert.equal(slowTestReason(write('src/a.tsx', 'await waitFor(() => 1)')), null)
})

test('commit diff denies waitForTimeout in test files only', () => {
  const diff = (path) => [`+++ b/${path}`, '@@ -0,0 +1,1 @@', '+await page.waitForTimeout(1)'].join('\n')
  assert.deepEqual(ids(evasionsInDiff(diff('e2e/a.spec.ts'))), ['wait-for-timeout'])
  assert.deepEqual(evasionsInDiff(diff('src/a.ts')), [])
})
