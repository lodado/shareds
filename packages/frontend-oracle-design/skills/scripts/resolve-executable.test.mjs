import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package contract tests run with node --test.
import test from 'node:test'
import { resolveExecutable, spawnGit } from './resolve-executable.mjs'

async function command(directory, name, executable = true) {
  const file = join(directory, name)
  await writeFile(file, '')
  if (executable) await chmod(file, 0o755)
  return file
}

test('resolves the first executable in PATH order', async () => {
  const root = await mkdtemp(join(tmpdir(), 'resolve-executable-'))
  const first = await mkdtemp(join(root, 'first-'))
  const second = await mkdtemp(join(root, 'second-'))
  const expected = await command(first, 'git')
  await command(second, 'git')
  assert.equal(resolveExecutable('git', { env: { PATH: `${first}:${second}` } }), expected)
})

test('skips a directory collision and finds the next executable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'resolve-executable-'))
  const collision = await mkdtemp(join(root, 'collision-'))
  const valid = await mkdtemp(join(root, 'valid-'))
  await mkdir(join(collision, 'git'))
  const expected = await command(valid, 'git')
  assert.equal(resolveExecutable('git', { env: { PATH: `${collision}:${valid}` } }), expected)
})

test('skips missing and non-executable candidates', async () => {
  const root = await mkdtemp(join(tmpdir(), 'resolve-executable-'))
  const blocked = await mkdtemp(join(root, 'blocked-'))
  const valid = await mkdtemp(join(root, 'valid-'))
  await command(blocked, 'git', false)
  const expected = await command(valid, 'git')
  assert.equal(resolveExecutable('git', { env: { PATH: `${blocked}:${valid}` } }), expected)
})

test('resolves relative PATH entries from cwd', async () => {
  const root = await mkdtemp(join(tmpdir(), 'resolve-executable-'))
  const bin = await mkdtemp(join(root, 'bin-'))
  const expected = await command(bin, 'git')
  const relative = bin.slice(root.length + 1)
  assert.equal(resolveExecutable('git', { cwd: root, env: { PATH: relative } }), expected)
})

test('fails when PATH has no executable candidate', async () => {
  const root = await mkdtemp(join(tmpdir(), 'resolve-executable-'))
  assert.throws(() => resolveExecutable('git', { env: { PATH: root } }), /Unable to resolve git/)
})


test('uses Windows Path and PATHEXT when resolving on Windows', async () => {
  const root = await mkdtemp(join(tmpdir(), 'resolve-executable-'))
  const bin = await mkdtemp(join(root, 'bin-'))
  const expected = await command(bin, 'git.EXE')
  assert.equal(
    resolveExecutable('git', { cwd: root, platform: 'win32', env: { pAtH: bin, pAtHeXt: '.EXE' } }),
    expected,
  )
})


test('spawnGit resolves from its explicit environment and cwd', async () => {
  const root = await mkdtemp(join(tmpdir(), 'resolve-executable-'))
  const bin = join(root, 'bin')
  await mkdir(bin, { recursive: true })
  await writeFile(join(bin, 'git'), '#!/bin/sh\nexit 0\n')
  await chmod(join(bin, 'git'), 0o755)
  const result = spawnGit(['--version'], { cwd: root, env: { PATH: 'bin' }, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
})


test('spawnGit preserves omitted PATH default semantics', () => {
  const options = { env: {}, encoding: 'utf8' }
  const native = spawnSync(process.platform === 'win32' ? 'git.exe' : 'git', ['--version'], options)
  const resolved = spawnGit(['--version'], options)
  assert.equal(resolved.status, native.status, resolved.stderr)
})


test('omitted PATH does not fall back to cwd while empty PATH does', async () => {
  const root = await mkdtemp(join(tmpdir(), 'resolve-executable-'))
  const localGit = await command(root, 'git')
  assert.equal(resolveExecutable('git', { cwd: root, env: { PATH: '' } }), localGit)
  const native = spawnSync(process.platform === 'win32' ? 'git.exe' : 'git', ['--version'], { cwd: root, env: {}, encoding: 'utf8' })
  if (native.status === 0) assert.notEqual(resolveExecutable('git', { cwd: root, env: {} }), localGit)
})
