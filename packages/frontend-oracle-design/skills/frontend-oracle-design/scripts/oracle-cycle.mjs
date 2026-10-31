#!/usr/bin/env node
/**
 * 저작 루프 한 번 — 고치고 돌리는 왕복을 한 호출로 줄인다. 판정은 새로 하지 않는다: 기존 CLI(oracle-model check,
 * oracle-package validate·project-card, oracle-stage rewind·advance)를 순서대로 부르고, 첫 실패에서 멈춰 그 코드와
 * 다음 할 일을 JSON 한 줄로 돌려준다. 그래서 모든 관문·예산·고정은 그 스크립트들이 그대로 지킨다.
 *
 *   fast — Bend `--check-only`와 `validate --stage model`만. 편집마다 돌리는 1초 안팎의 빠른 확인이다.
 *   walk — 현재 단계에서 목표(기본 DRAFTED)까지 걷는다. 패키지가 바뀌어 STAGE_STALE이면 `--reason`이 있을 때만
 *          DISCOVERING으로 되돌려 다시 걷는다(되돌림은 저작 라운드를 쓰므로 이유 없이 몰래 하지 않는다).
 *          DRAFTED 전에는 생성 카드를 다시 투영한다. lock은 사람 승인이 들어 이 루프에 넣지 않는다.
 */
import { spawnSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { repositoryRoot } from './oracle-fs.mjs'
import { REWIND_REASONS, STAGES } from './oracle-stage.mjs'

const SCRIPTS = fileURLToPath(new URL('.', import.meta.url))
const PACKAGE_FILE = 'oracle.package.json'
const WALKABLE = ['MODELED', 'CHECKED', 'DRAFTED']
const TODO_ONLY = /^SOME PROOFS FAIL\nError: \d+ TODOs? found\.\nThe code is incomplete, and not a valid proof yet\.$/

export const USAGE = `usage:
  oracle-cycle.mjs fast --dir <.ai/oracles/<id>>
  oracle-cycle.mjs walk --dir <dir> [--to MODELED|CHECKED|DRAFTED] [--reason ${REWIND_REASONS.join('|')}] [--note <one line>] [--timeout-ms <n>]`

class CycleError extends Error {
  constructor(code, message, exitCode = 2) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

// 실패 코드 → 다음 한 걸음. 모델이 사용법을 다시 추측하지 않게 고칠 자리를 바로 말한다.
const NEXT = {
  STAGE_STALE: 'package changed after a passed gate: rerun walk with --reason <cause> to rewind and re-walk',
  STAGE_GATE: 'fix the package/Bend issue named in detail, then rerun walk',
  STAGE_ITERATIONS: 'authoring budget exhausted: ask the user, then oracle-stage.mjs extend --approval <file>',
  STAGE_MISSING: 'run oracle-stage.mjs begin --dir <dir> first',
  PACKAGE_INVALID: 'fix the listed package issues, then rerun fast',
  BEND_CHECK: 'fix the Bend file named in detail (hint included when known), then rerun fast',
  CARD_NOT_GENERATED: 'oracle.md is hand-written: project the card into a new file and merge by hand',
}

function run(script, args, cwd) {
  const started = performance.now()
  const child = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const output = `${child.stdout ?? ''}${child.stderr ?? ''}`.trim()
  const code = child.status === 0 ? null : (/^([A-Z][A-Z_]+):/m.exec(child.stderr ?? '')?.[1] ?? `${script}_FAILED`)
  return { step: `${script.replace(/\.mjs$/, '')} ${args[0]}`, ok: child.status === 0, code, ms: Math.round(performance.now() - started), output }
}

const lastJson = (text) => {
  const line = text.split('\n').reverse().find((entry) => entry.startsWith('{'))
  try {
    return line ? JSON.parse(line) : null
  } catch {
    return null
  }
}

function sourcesOf(pkg) {
  if (!Array.isArray(pkg?.sources)) return []
  return pkg.sources
}

/** 검사할 Bend 파일 — 오라클 폴더의 `.bend`와 패키지가 `repo:<path>.bend`로 등록한 출처. */
export async function bendFiles(directory, root) {
  const files = new Set((await readdir(directory)).filter((name) => name.endsWith('.bend')).map((name) => join(directory, name)))
  const pkg = await readFile(join(directory, PACKAGE_FILE), 'utf8').then(JSON.parse, () => null)
  for (const { location } of sourcesOf(pkg)) {
    const path = /^repo:([^#\s]+\.bend)(?:#|$)/.exec(location ?? '')?.[1]
    if (path) files.add(resolve(root, path))
  }
  return [...files].sort()
}

async function fast(directory, root) {
  const steps = []
  const files = await bendFiles(directory, root)
  if (files.length > 0) {
    const check = run('oracle-model.mjs', ['check', ...files.flatMap((file) => ['--file', file])], root)
    const results = lastJson(check.output)?.files ?? []
    // 법칙 파일의 TODO는 아직 증명하지 않은 목표다 — 타입·이름 검사는 통과했으니 빠른 확인에선 막지 않는다(증명은 CHECKED가 본다)
    const todo = results.filter(({ status, output }) => status === 'failed' && TODO_ONLY.test(output ?? ''))
    const failed = results.filter((entry) => entry.status !== 'ok' && !todo.includes(entry))
    const ok = results.length > 0 ? failed.length === 0 : check.ok
    steps.push({ ...check, ok, code: ok ? null : 'BEND_CHECK', detail: failed.length ? failed : undefined, todo: todo.map(({ file }) => file) })
    if (!ok) return steps
  }
  const packagePath = join(directory, PACKAGE_FILE)
  if (await readFile(packagePath).then(() => true, () => false))
    steps.push(run('oracle-package.mjs', ['validate', '--package', relative(root, packagePath), '--stage', 'model'], root))
  return steps
}

async function stageOf(directory, root) {
  const status = run('oracle-stage.mjs', ['status', '--dir', directory], root)
  return status.ok ? lastJson(status.output) : null
}

function assertWalkOptions(target, reason) {
  if (!WALKABLE.includes(target)) throw new CycleError('USAGE', `--to is one of ${WALKABLE.join('|')}`)
  if (reason !== undefined && !REWIND_REASONS.includes(reason)) throw new CycleError('USAGE', `--reason is one of ${REWIND_REASONS.join('|')}`)
}

const refused = (code, output) => ({ step: 'oracle-stage status', ok: false, code, ms: 0, output })

/** 걸음을 시작할 단계 — 낡은 기록은 이유가 있을 때만 DISCOVERING으로 되돌린다. 실패면 그 걸음을 돌려준다. */
async function startStage(directory, root, options, steps) {
  const status = await stageOf(directory, root)
  if (!status?.stage) return { failed: refused('STAGE_MISSING', 'no stage.json') }
  if (!status.stale) return { stage: status.stage }
  if (!options.reason) return { failed: refused('STAGE_STALE', `stage ${status.stage} is stale`) }
  const note = options.note ? ['--note', options.note] : []
  const rewound = run('oracle-stage.mjs', ['rewind', '--dir', directory, '--to', 'DISCOVERING', '--reason', options.reason, ...note], root)
  if (!rewound.ok) return { failed: rewound }
  steps.push(rewound)
  return { stage: 'DISCOVERING' }
}

async function walk(directory, root, options) {
  const target = options.to ?? 'DRAFTED'
  assertWalkOptions(target, options.reason)
  const steps = await fast(directory, root)
  if (steps.some(({ ok }) => !ok)) return steps
  const { stage, failed } = await startStage(directory, root, options, steps)
  if (failed) return [...steps, failed]
  const timeout = options['timeout-ms'] ? ['--timeout-ms', options['timeout-ms']] : []
  for (const next of STAGES.slice(STAGES.indexOf(stage) + 1, STAGES.indexOf(target) + 1)) {
    if (next === 'DRAFTED') {
      const card = join(directory, 'oracle.md')
      const projected = run('oracle-package.mjs', ['project-card', '--package', relative(root, join(directory, PACKAGE_FILE)), '--out', relative(root, card)], root)
      steps.push(projected)
      if (!projected.ok) return steps
    }
    const advanced = run('oracle-stage.mjs', ['advance', '--dir', directory, '--to', next, ...(next === 'MODELED' ? [] : timeout)], root)
    steps.push(advanced)
    if (!advanced.ok) return steps
  }
  return steps
}

function parse(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]?.replace(/^--/, '')
    if (!['dir', 'to', 'reason', 'note', 'timeout-ms'].includes(name) || args[index + 1] === undefined) throw new CycleError('USAGE', USAGE)
    options[name] = args[index + 1]
  }
  return options
}

function summary({ step, ok, ms, code, todo = [] }) {
  const line = { step, ok, ms }
  if (code) line.code = code
  if (todo.length > 0) line.todo = todo
  return line
}

function failure({ step, code, detail, output }) {
  return { step, code, detail: detail ?? output.split('\n').slice(0, 30).join('\n'), next: NEXT[code] ?? 'read detail, fix, rerun' }
}

export async function cycle(command, options) {
  if (!['fast', 'walk'].includes(command) || !options.dir) throw new CycleError('USAGE', USAGE)
  const directory = resolve(options.dir)
  const root = repositoryRoot(directory)
  const started = performance.now()
  const steps = command === 'fast' ? await fast(directory, root) : await walk(directory, root, options)
  const failed = steps.find(({ ok }) => !ok)
  const after = command === 'walk' ? (await stageOf(directory, root))?.stage ?? null : undefined
  return {
    ok: !failed,
    ...(after !== undefined ? { stage: after } : {}),
    ms: Math.round(performance.now() - started),
    steps: steps.map(summary),
    ...(failed ? { failed: failure(failed) } : {}),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2)
  try {
    const result = await cycle(command, parse(args))
    process.stdout.write(`${JSON.stringify(result)}\n`)
    process.exitCode = result.ok ? 0 : 1
  } catch (error) {
    process.stderr.write(`${error.code ?? 'CYCLE_FAILED'}: ${error.message}\n`)
    process.exitCode = error.exitCode ?? 1
  }
}
