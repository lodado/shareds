/**
 * node:test용 NDJSON reporter. Node는 JSON reporter를 내장하지 않으므로
 * `oracle-run.mjs exec --report`가 읽을 수 있는 최소 이벤트만 흘려보낸다.
 *
 * node --test --test-reporter=<이 파일> --test-reporter-destination=<경로>
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, relative, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

import { failureCause } from './oracle-fs.mjs'

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')

// Fixed Contract producers. Diagnostics request execution, never supply results.
async function contractExecution(request, testFile) {
  const base = dirname(testFile)
  const require = createRequire(testFile)
  const source = async (name) => {
    if (typeof name !== 'string' || !name || name.startsWith('/')) throw new Error('relative witness path required')
    const path = await realpath(resolve(base, name))
    if (relative(base, path).startsWith('..')) throw new Error('witness escapes test directory')
    const bytes = await readFile(path)
    return { path, sourceSha256: digest(bytes), text: bytes.toString('utf8') }
  }
  if (request.kind === 'type-contract') {
    const compiler = require.resolve('typescript/bin/tsc')
    const compile = async (name) => {
      const witness = await source(name)
      if (!/from\s+['"]type-fest['"]/.test(witness.text)) throw new Error('consumer witness must import type-fest')
      const command = [process.execPath, compiler, '--strict', '--noEmit', '--target', 'es2022', '--module', 'nodenext', '--moduleResolution', 'nodenext', witness.path]
      const result = spawnSync(command[0], command.slice(1), { cwd: base, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 })
      if (result.error || result.signal || result.status === null) throw new Error(`compiler did not complete: ${result.error?.message ?? result.signal ?? 'no exit status'}\n${result.stdout ?? ''}${result.stderr ?? ''}`)
      const diagnostics = `${result.stdout ?? ''}${result.stderr ?? ''}`
      if (/error TS(?:2307|2688|6053|5083|5012|6231):/.test(diagnostics)) throw new Error(`compiler dependency/path setup failed:\n${diagnostics}`)
      return { path: witness.path, sourceSha256: witness.sourceSha256, command, exitCode: result.status, diagnostics }
    }
    return { kind: request.kind, compilerSha256: digest(await readFile(compiler)), positive: await compile(request.positive), negative: await compile(request.negative) }
  }
  if (request.kind === 'fast-check') {
    const witness = await source(request.module)
    const fc = (await import(pathToFileURL(require.resolve('fast-check')).href)).default
    const module = await import(pathToFileURL(witness.path).href)
    if (!Number.isSafeInteger(module.seed) || !Number.isSafeInteger(module.numRuns) || module.numRuns <= 0 || typeof module.domain !== 'string' || !module.domain.trim()) throw new Error('property requires seed, positive numRuns and domain')
    const result = await fc.check(module.property, { seed: module.seed, numRuns: module.numRuns, endOnFailure: false })
    return { kind: request.kind, path: witness.path, sourceSha256: witness.sourceSha256, domain: module.domain, seed: result.seed, numRuns: result.numRuns, failed: result.failed, numShrinks: result.numShrinks, counterexamplePath: result.counterexamplePath, counterexample: result.counterexample }
  }
  throw new Error('unknown Contract producer')
}

function statusFor(event) {
  if (event.data.skip) return 'skipped'
  if (event.data.todo) return 'todo'
  if (event.type === 'test:pass') return 'passed'
  return 'failed'
}

/** 실패 원인 — node는 테스트 코드의 오류를 `cause`에, 타임아웃·hook 실패를 `failureType`에 싣는다. */
function causeFor(event) {
  const error = event.data.details?.error
  if (event.type !== 'test:fail' || !error) return null
  return failureCause(error.cause?.name ?? error.name, {
    timeout: error.failureType === 'testTimeoutFailure',
    // 실패한 before/beforeEach — 자식 테스트는 hookFailed 또는 cancelledByParent로 온다
    hook: error.failureType === 'hookFailed' || error.failureType === 'cancelledByParent',
  })
}

export default async function* oracleNodeReporter(source) {
  const terminals = []
  const requests = new Map()
  for await (const event of source) {
    if (process.env.ORACLE_VERIFICATION_PROFILE === 'contract/v1' && event.type === 'test:diagnostic' && event.data?.message?.startsWith('oracle-contract/v1 ')) {
      try {
        const request = JSON.parse(event.data.message.slice('oracle-contract/v1 '.length))
        if (requests.has(request.name)) requests.set(request.name, null)
        else requests.set(request.name, request)
      } catch { /* malformed requests never become evidence */ }
    }
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue
    // node:test emits pass events for suites too.  A suite is not evidence.
    if (!event.data?.name || event.data?.type === 'suite' || event.data?.details?.type === 'suite') continue

    // 원인이 없으면 undefined — JSON에서 키가 빠진다. file은 RED 전 기존 테스트 변경을 행에 귀속할 때 쓴다
    const data = {
      name: event.data.name,
      status: statusFor(event),
      test: true,
      cause: causeFor(event) ?? undefined,
      file: event.data.file,
    }
    terminals.push({ type: event.type, data })
  }
  for (const event of terminals) {
    const request = requests.get(event.data.name)
    if (request && event.data.file && event.data.status === 'passed') {
      try {
        event.data.contractEvidence = await contractExecution(request, event.data.file)
        const evidence = event.data.contractEvidence
        if (evidence.failed || (evidence.kind === 'type-contract' && (evidence.positive.exitCode !== 0 || evidence.negative.exitCode === 0))) {
          event.type = 'test:fail'
          event.data.status = 'failed'
          event.data.cause = 'assertion'
        }
      } catch (error) {
        event.data.contractEvidence = { kind: request.kind, error: error.message }
        event.type = 'test:fail'
        event.data.status = 'failed'
        event.data.cause = 'infra'
      }
    }
    yield `${JSON.stringify(event)}\n`
  }
}
