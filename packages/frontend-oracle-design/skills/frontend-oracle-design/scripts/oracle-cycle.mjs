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
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
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
  oracle-cycle.mjs preflight --dir <dir>
  oracle-cycle.mjs card-lint --dir <dir>
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
  REWIND_CAP_REACHED: 'rewind allowance spent: oracle-stage.mjs status --brief names the next step (extend after the user approves, or NEEDS_DECISION when extend is refused)',
  PACKAGE_INVALID: 'fix the listed package issues, then rerun fast',
  BEND_CHECK: 'fix the Bend file named in detail (hint included when known), then rerun fast',
  CARD_NOT_GENERATED: 'oracle.md is hand-written: project the card into a new file and merge by hand',
  PREFLIGHT_ISSUES: 'fix every listed issue in one package patch, then rerun preflight; walk records each gate it passes, so a repair after it is a rewind',
  CARD_LINT_FAILED:
    'fix `generated` in one package patch (the walk then asks for --reason gate-failure) or, where the rule takes a hand-written line (a sourced N/A, the Interaction sweep), in oracle.md outside the generated markers; fix `handWritten` in oracle.md outside the markers, no rewind',
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

/** The issues a card lint prints, one per line after its first: the `--draft` failures, without the ones that wait on the user. */
const lintIssues = (output) =>
  output
    .split('\n')
    .slice(1)
    .filter((line) => /^ {2}\S/.test(line) && !line.startsWith('  pending '))
    .map((line) => line.trim())

/** In a scratch folder outside the repository: `work(folder)`, then the folder is removed. */
async function inScratch(work) {
  const scratch = await mkdtemp(join(tmpdir(), 'oracle-preflight-'))
  try {
    return await work(scratch)
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

/**
 * The `--draft` failures of a card file, linted from the repository root the way the lock lints oracle.md: `--root` makes
 * a scratch copy resolve its `code()` witnesses and sources against the repository, not against the scratch folder.
 */
function draftLint(card, root) {
  const linted = run('oracle-verify.mjs', ['card', '--oracle', card, '--draft', '--root', root], root)
  if (linted.ok) return []
  const issues = lintIssues(linted.output)
  return issues.length > 0 ? issues : [`card-lint: ${linted.output.split('\n')[0]}`]
}

/** The card with its generated region and none of the hand-written sections a projection carries over. */
function generatedOnly(text, generatedBlock) {
  const found = generatedBlock(text)
  if (!found.present || found.malformed) return null
  const title = text.split('\n')[0]
  return [title, '', text.slice(found.start, found.end), '', '## User Confirmation', '', '- Status: pending', '- Source: none yet', ''].join('\n')
}

/**
 * `issues` of `text` split by where they are fixed. One the generated region alone also raises comes from the package
 * (or wants a hand-written line a rule accepts, a sourced N/A or the Interaction sweep); one only the hand-written sections
 * raise is fixed in oracle.md outside the markers, an edit check-card does not read and that leaves the stage as it is.
 */
async function byRegion(text, issues, root) {
  if (issues.length === 0) return { generated: [], handWritten: [] }
  const { generatedBlock } = await import('./oracle-package.mjs')
  const bare = generatedOnly(text, generatedBlock)
  if (bare === null) return { generated: issues, handWritten: [] }
  const fromRegion = new Set(
    await inScratch(async (scratch) => {
      await writeFile(join(scratch, 'oracle.md'), bare)
      return draftLint(join(scratch, 'oracle.md'), root)
    }),
  )
  return { generated: issues.filter((issue) => fromRegion.has(issue)), handWritten: issues.filter((issue) => !fromRegion.has(issue)) }
}

/**
 * The Draft lint the lock would run on a card projected from the package now. oracle.md is copied first, so the
 * projection keeps its hand-written sections exactly as `project-card --out oracle.md` does in the walk, and a rule a
 * hand-written line satisfies (a sourced N/A, the Interaction sweep, an Open question) is satisfied here too. Before the
 * first projection there is no card to write such a line in: those issues carry `beforeCard`, and step says that
 * `oracle-cycle.mjs walk` (which runs no preflight) projects the card when only such issues are left.
 */
async function cardPreview(directory, root) {
  const existing = await readFile(join(directory, 'oracle.md'), 'utf8').catch(() => null)
  return inScratch(async (scratch) => {
    const card = join(scratch, 'oracle.md')
    if (existing !== null) await writeFile(card, existing)
    const projected = run('oracle-package.mjs', ['project-card', '--package', relative(root, join(directory, PACKAGE_FILE)), '--out', card], root)
    if (!projected.ok) return { generated: [`card-projection: ${projected.output.split('\n')[0]}`], handWritten: [] }
    const issues = draftLint(card, root)
    if (existing === null) return { generated: issues, handWritten: [], beforeCard: issues.length > 0 }
    return byRegion(await readFile(card, 'utf8'), issues, root)
  })
}

/**
 * preflight — read-only: what the gates after MODELED would refuse, listed at once before the walk passes any gate. A
 * package patch after a passed gate is a rewind each time; found here it is none. It judges nothing new: the package's
 * projection stage, the cross-check's Bend-free inputs (oracle-discovery.mjs crossCheckReadiness) and, once oracle.md
 * exists, the lock's Draft lint of that card re-projected from the package now are the checks project-card, CHECKED
 * and the lock run on the same bytes. Only the issues a package patch fixes stop the walk; the hand-written ones are
 * listed (`handWritten`) and do not. The proofs, the world enumeration and the cross-check candidates stay CHECKED's.
 */
async function preflight(directory, root) {
  const none = { generated: [], handWritten: [] }
  const steps = await fast(directory, root)
  const stopped = steps.find(({ ok }) => !ok)
  if (stopped) return { steps, issues: [], handWritten: [] }
  if (!(await readFile(join(directory, PACKAGE_FILE)).then(() => true, () => false))) return { steps, issues: [], handWritten: [] }
  const { loadPackage, packageIssues } = await import('./oracle-package.mjs')
  const { crossCheckReadiness } = await import('./oracle-discovery.mjs')
  const loaded = await loadPackage(join(directory, PACKAGE_FILE), { root })
  const projection = packageIssues(loaded.pkg, { stage: 'project' })
  // the card projects only from a package the projection stage accepts: its lint waits for those repairs
  const card = projection.length === 0 ? await cardPreview(directory, root) : none
  // the card lint runs the cross-check too: an issue both name is listed once
  const issues = [...new Set([...projection, ...(await crossCheckReadiness(loaded)), ...card.generated])]
  return { steps, issues, handWritten: card.handWritten, beforeCard: Boolean(card.beforeCard) }
}

/**
 * card-lint — read-only: the lock's Draft lint of oracle.md (`card --draft` from the repository root), its failures
 * split by where they are fixed (byRegion), so the remedy for each is a package patch or a card edit, not always a rewind.
 */
async function cardLint(directory, root) {
  const card = join(directory, 'oracle.md')
  const text = await readFile(card, 'utf8').catch(() => null)
  if (text === null) return { generated: [`card-unreadable: ${card}`], handWritten: [] }
  return byRegion(text, draftLint(card, root), root)
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

/** card-lint's answer: the Draft lint's failures, split by region. */
async function cardLintResult(directory, root, started) {
  const { generated, handWritten } = await cardLint(directory, root)
  const count = generated.length + handWritten.length
  if (count === 0) return { ok: true, ms: Math.round(performance.now() - started) }
  const failed = { step: 'card-lint', code: 'CARD_LINT_FAILED', detail: `${count} issues the lock would refuse`, generated, handWritten, next: NEXT.CARD_LINT_FAILED }
  return { ok: false, ms: Math.round(performance.now() - started), failed }
}

/** preflight's answer: a failed check, or the issues the gates after MODELED would refuse, as one record. */
async function preflightResult(directory, root, started) {
  const { steps, issues, handWritten, beforeCard } = await preflight(directory, root)
  const failed = steps.find(({ ok }) => !ok)
  const detail = `${issues.length} issues the gates after MODELED would refuse`
  const listed = issues.length > 0 ? { step: 'preflight', code: 'PREFLIGHT_ISSUES', detail, issues, ...(beforeCard ? { beforeCard } : {}), next: NEXT.PREFLIGHT_ISSUES } : null
  return {
    ok: !failed && !listed,
    ms: Math.round(performance.now() - started),
    steps: steps.map(summary),
    // fixed in oracle.md outside the generated markers: they do not stop the walk
    ...(handWritten.length > 0 ? { handWritten } : {}),
    ...(failed ? { failed: failure(failed) } : {}),
    ...(listed ? { failed: listed } : {}),
  }
}

export async function cycle(command, options) {
  if (!['fast', 'walk', 'preflight', 'card-lint'].includes(command) || !options.dir) throw new CycleError('USAGE', USAGE)
  const directory = resolve(options.dir)
  const root = repositoryRoot(directory)
  const started = performance.now()
  if (command === 'card-lint') return cardLintResult(directory, root, started)
  if (command === 'preflight') return preflightResult(directory, root, started)
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
