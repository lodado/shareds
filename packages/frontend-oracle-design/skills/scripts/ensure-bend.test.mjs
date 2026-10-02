import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { BEND_VERSION, ensureBend } from './ensure-bend.mjs'
import { resolveExecutable } from './resolve-executable.mjs'

// bend는 PATH에 없고 tar는 있는 환경 — 실제 설치본이 테스트에 끼어들지 않게 한다
const ENV = { PATH: '/usr/bin:/bin' }

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'ensure-bend-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return { root, cacheDir: join(root, 'cache'), env: { ...ENV, BEND_HOME: join(root, 'user-bend') } }
}

async function fakeBend(bin, version) {
  await mkdir(join(bin, '..'), { recursive: true })
  await writeFile(bin, `#!/bin/sh\n[ "$1" = version ] && echo "bend ${version}"\n`)
  await chmod(bin, 0o755)
}

/** 릴리스와 같은 배치(bend/bin/bend, bend/bend2, bend/guide)의 tar.gz를 만든다. */
async function fakeRelease(root, version) {
  const staging = join(root, 'release')
  await fakeBend(join(staging, 'bend/bin/bend'), version)
  await mkdir(join(staging, 'bend/bend2'), { recursive: true })
  await writeFile(join(staging, 'bend/bend2/base.bend'), '')
  await mkdir(join(staging, 'bend/guide'), { recursive: true })
  const archive = join(root, 'release.tar.gz')
  assert.equal(spawnSync(resolveExecutable('tar', { env: ENV }), ['-czf', archive, '-C', staging, 'bend']).status, 0)
  return readFile(archive)
}

const neverDownload = () => {
  throw new Error('download must not run')
}

test('an installed pinned version is reused without touching the network', async (t) => {
  const { cacheDir, env } = await workspace(t)
  await fakeBend(join(cacheDir, 'bin/bend'), BEND_VERSION)

  const result = await ensureBend({ cacheDir, env, download: neverDownload })

  assert.deepEqual(result, { bin: join(cacheDir, 'bin/bend'), installed: false })
})

test('a user install of the pinned version under BEND_HOME is reused as is', async (t) => {
  const { cacheDir, env } = await workspace(t)
  await fakeBend(join(env.BEND_HOME, 'bin/bend'), BEND_VERSION)

  const result = await ensureBend({ cacheDir, env, download: neverDownload })

  assert.deepEqual(result, { bin: join(env.BEND_HOME, 'bin/bend'), installed: false })
})

test('an archive whose sha256 differs from the pinned one is refused and nothing is installed', async (t) => {
  const { cacheDir, env } = await workspace(t)
  // 다른 버전은 재사용하지 않는다 — 고정 버전을 받으러 간다
  await fakeBend(join(env.BEND_HOME, 'bin/bend'), '2.0.30')

  await assert.rejects(
    ensureBend({ cacheDir, env, platform: 'darwin', arch: 'arm64', download: async () => Buffer.from('tampered') }),
    (error) => error.code === 'BEND_CHECKSUM_MISMATCH' && /nothing installed/.test(error.message),
  )
  await assert.rejects(readFile(join(cacheDir, 'bin/bend')), { code: 'ENOENT' })
  assert.match(await readFile(join(env.BEND_HOME, 'bin/bend'), 'utf8'), /2\.0\.30/)
})

test('a verified archive is unpacked into the cache and reports the pinned version', async (t) => {
  const { root, cacheDir, env } = await workspace(t)
  const archive = await fakeRelease(root, BEND_VERSION)
  const sha256 = createHash('sha256').update(archive).digest('hex')
  const requested = []

  const result = await ensureBend({
    cacheDir,
    env,
    platform: 'linux',
    arch: 'x64',
    checksums: { 'linux-x64': sha256 },
    download: async (url) => {
      requested.push(url)
      return archive
    },
  })

  assert.deepEqual(result, { bin: join(cacheDir, 'bin/bend'), installed: true })
  assert.deepEqual(requested, [
    `https://github.com/bendlang/bend/releases/download/v${BEND_VERSION}/bend-${BEND_VERSION}-linux-x64.tar.gz`,
  ])
  assert.equal(await readFile(join(cacheDir, 'bend2/base.bend'), 'utf8'), '')
})

test('an archive that unpacks a different version fails instead of claiming success', async (t) => {
  const { root, cacheDir, env } = await workspace(t)
  const archive = await fakeRelease(root, '2.0.99')
  const sha256 = createHash('sha256').update(archive).digest('hex')

  await assert.rejects(
    ensureBend({
      cacheDir,
      env,
      platform: 'linux',
      arch: 'x64',
      checksums: { 'linux-x64': sha256 },
      download: async () => archive,
    }),
    (error) => error.code === 'BEND_INSTALL_FAILED' && /reports 2\.0\.99/.test(error.message),
  )
})

test('an unsupported platform fails before any download', async (t) => {
  const { cacheDir, env } = await workspace(t)

  await assert.rejects(
    ensureBend({ cacheDir, env, platform: 'win32', arch: 'x64', download: neverDownload }),
    (error) => error.code === 'BEND_UNSUPPORTED_PLATFORM',
  )
})

test('ORACLE_REQUIRE_BEND=1 makes a missing Bend fail the integration test instead of skipping it', async (t) => {
  // a child process with an empty HOME, PATH and BEND_HOME: os.homedir() reads the real environment, so changing
  // process.env here would still find the runner's installed Bend
  const home = await mkdtemp(join(tmpdir(), 'oracle-require-bend-'))
  t.after(() => rm(home, { recursive: true, force: true }))
  const helper = new URL('./oracle-test-bend.mjs', import.meta.url).href
  const probe = (required) =>
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const { installedBend } = await import(${JSON.stringify(helper)})
const skipped = []
try {
  const bin = await installedBend({ skip: (reason) => skipped.push(reason) })
  console.log(JSON.stringify({ bin, skipped }))
} catch (error) {
  console.log(JSON.stringify({ error: error.message }))
}`,
      ],
      { encoding: 'utf8', env: { HOME: home, PATH: '', BEND_HOME: join(home, 'bend'), ORACLE_REQUIRE_BEND: required } },
    )
  const strict = JSON.parse(probe('1').stdout)
  assert.match(strict.error, /ORACLE_REQUIRE_BEND=1 but Bend .* is not installed/)
  const lenient = JSON.parse(probe('').stdout)
  assert.equal(lenient.bin, null)
  assert.match(lenient.skipped[0], /real Bend integration not run/)
})
