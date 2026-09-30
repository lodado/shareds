#!/usr/bin/env node

// Bend 참조 모델을 오라클 공간으로 쓴다. 법칙 증명(`bend PROOF.bend --verdict`)의 결과를 분류하고, 잠긴 MODEL.bend를
// `bend -o *.mjs`로 컴파일해 선언 범위의 trace를 결정적으로 열거하고, 구현 adapter의 관측값을 같은 trace에서 대조한다.
// 기대값은 증명된 그 모델 코드가 계산한다 — JS로 옮겨 적은 두 번째 의미를 두지 않는다.

import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { ensureBend, reportedVersion } from './ensure-bend.mjs'
import { sha256, stableStringify } from './oracle-fs.mjs'

export const GENERATOR_VERSION = 1
export const MAX_BOUND = 8
// safety: 나쁜 일이 일어나지 않는다 · effect: 요구된 일이 일어난다 · witness: `exs`로 그 일이 init에서 도달 가능함을 보인다
export const FORMAL_LAW_KINDS = ['safety', 'effect', 'witness']
const MODEL_EXPORTS = ['init', 'step', 'next', 'observe']
const FORMAL_FIELDS = [
  'Model',
  'Laws',
  'Prefix',
  'Bound',
  'Observation',
  'Out of scope',
  'Not formalized',
  'Conformance row',
]

class CliError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

/** Bend 파일 한 장의 구조 — 로컬·hub import, foreign·unsafe 코드, law 이름과 witness(`exs`) 여부. */
export function scanBendSource(text) {
  const lines = text.split('\n')
  const imports = []
  const external = []
  for (const line of lines) {
    const target = line.match(/^import\s+(\S+)/)?.[1]
    if (!target || target === 'Base') continue
    if (target.startsWith('./') || target.startsWith('../')) imports.push(target)
    else external.push(target)
  }
  const laws = []
  lines.forEach((line, index) => {
    const name = line.match(/^law\s+([\w.]+)\s*:/)?.[1]
    if (!name) return
    let end = index + 1
    while (end < lines.length && (lines[end].startsWith(' ') || lines[end].trim() === '')) end += 1
    laws.push({ name, witness: lines.slice(index + 1, end).some((body) => /^\s+exs\s/.test(body)) })
  })
  return {
    imports,
    external,
    laws,
    foreign: /^[ \t]+import[ \t]+"/m.test(text),
    unsafe: /^@unsafe\b|^def\s+[\w.]+\?\(/m.test(text),
  }
}

/** 진입 파일과 그것이 `import ./x.bend`로 부르는 로컬 파일 전부(전이) — 절대 경로·sha256·구조. */
export async function bendInputs(entry) {
  const seen = new Map()
  const visit = async (path) => {
    if (seen.has(path)) return
    const text = await readFile(path, 'utf8').catch((error) => {
      throw new CliError('MODEL_UNREADABLE', `${path}: ${error.message}`)
    })
    const scan = scanBendSource(text)
    seen.set(path, { path, sha256: sha256(text), ...scan })
    for (const local of scan.imports) await visit(resolve(dirname(path), local))
  }
  await visit(resolve(entry))
  return [...seen.values()]
}

/** 증명 밖 코드 — `--verdict`가 거부하는 foreign·unsafe와, 잠글 수 없는 hub import. */
export function untrustedInputs(inputs) {
  return inputs.flatMap(({ path, foreign, unsafe, external }) => [
    ...(foreign ? [`${path}: foreign import`] : []),
    ...(unsafe ? [`${path}: @unsafe def`] : []),
    ...external.map((target) => `${path}: hub import ${target}`),
  ])
}

function inputDigest(inputs, root) {
  return sha256(stableStringify(inputs.map(({ path, sha256: digest }) => [relative(root, path), digest]).sort()))
}

/** Bend 값 → 비교·해시용 JSON. Nat은 안전 범위면 number, 목록은 배열, Bool은 boolean, 생성자는 `$` 태그를 유지한다. */
export function toPlain(value) {
  if (typeof value === 'bigint') return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : value.toString()
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(toPlain)
  if (value.$ === 'Nil' || value.$ === 'Con') return listItems(value).map(toPlain)
  if (value.$ === 'True' || value.$ === 'False') return value.$ === 'True'
  return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, toPlain(field)]))
}

function listItems(list) {
  const items = []
  for (let cursor = list; cursor?.$ === 'Con'; cursor = cursor.tail) items.push(cursor.head)
  return items
}

function listOf(items) {
  return items.reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' })
}

function eventLabel(event) {
  const fields = Object.entries(event)
    .filter(([key]) => key !== '$')
    .map(([key, value]) => `${key}:${JSON.stringify(value)}`)
  return fields.length === 0 ? event.$ : `${event.$}{${fields.join(',')}}`
}

/**
 * Bend 파일을 스킬 소유 임시 디렉터리에 `.mjs`로 컴파일해 불러온다. foreign·unsafe·hub import는 실행 전에 거부한다 —
 * 컴파일된 모듈은 이 프로세스에서 돌기 때문이다. 남는 코드는 Bend가 종료를 검사한 순수 def뿐이다.
 * ponytail: def는 시간·메모리 상한 없이 이 프로세스에서 돈다(상한은 bound ≤ 8·max-cases·max-worlds뿐) — 큰 모델이
 * 오면 열거를 worker thread + resourceLimits·timeout으로 옮긴다.
 */
export async function compileBend({ entry, bin, timeoutMs = 120_000 }) {
  const inputs = await bendInputs(entry)
  const untrusted = untrustedInputs(inputs)
  if (untrusted.length > 0) throw new CliError('MODEL_UNTRUSTED', untrusted.join('; '))

  const outDir = await mkdtemp(join(tmpdir(), 'oracle-model-'))
  try {
    const out = join(outDir, 'model.mjs')
    const built = spawnSync(bin, [basename(entry), '-o', out], {
      cwd: dirname(entry),
      encoding: 'utf8',
      env: { ...process.env, BEND_NO_TELEMETRY: '1' },
      timeout: timeoutMs,
    })
    if (built.error?.code === 'ETIMEDOUT')
      throw new CliError('MODEL_TIMEOUT', `bend -o did not finish in ${timeoutMs}ms`)
    if (built.error) throw new CliError('BEND_UNAVAILABLE', `${bin}: ${built.error.message}`)
    if (built.status !== 0) throw new CliError('MODEL_INVALID', `${built.stdout}${built.stderr}`.trim())
    return { exported: (await import(pathToFileURL(out).href)).default, inputs }
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}

/** MODEL.bend → 오라클 공간을 만드는 init·step·next·observe. */
export async function loadModel({ model, prefix, bin, timeoutMs = 120_000 }) {
  if (!/^[A-Z]\w*$/.test(prefix ?? ''))
    throw new CliError('USAGE', 'prefix must name the model namespace, e.g. Search', 2)
  const entry = resolve(model)
  const { exported, inputs } = await compileBend({ entry, bin, timeoutMs })
  const api = {}
  for (const name of MODEL_EXPORTS) {
    const fn = exported[`${prefix}.${name}`]
    if (typeof fn !== 'function')
      throw new CliError('MODEL_INTERFACE', `${basename(entry)} does not define ${prefix}.${name}`)
    // 컴파일된 def는 인자를 복사하지 않고 넘겨받는다 — 열거가 공유하는 상태·사건 값을 건드리지 못하게 복제해 넘긴다.
    api[name] = (...args) => fn(...args.map((argument) => structuredClone(argument)))
  }
  return {
    ...api,
    prefix,
    digest: inputDigest(inputs, dirname(entry)),
    inputs: inputs.map(({ path, sha256: digest }) => ({ path: relative(dirname(entry), path), sha256: digest })),
    bend: { bin, version: reportedVersion(bin) },
  }
}

/**
 * 선언 범위의 오라클 공간: `init`에서 시작해 환경 `next(history)`가 허용하는 사건을 `bound`개까지 이은 모든 trace.
 * 모든 prefix의 관측값이 기대값이다. 같은 모델·범위·생성기 버전이면 같은 case ID·순서가 나온다 — 시각·runId는 섞지 않는다.
 * 예산을 넘기면 그때까지의 case를 지우지 않고 `complete: false`로 남긴다.
 */
export function enumerateSpace(model, { bound, maxCases = 5000 }) {
  if (!Number.isInteger(bound) || bound < 1 || bound > MAX_BOUND) {
    throw new CliError('USAGE', `bound must be an integer 1..${MAX_BOUND}`, 2)
  }
  if (!Number.isInteger(maxCases) || maxCases < 1)
    throw new CliError('USAGE', 'max-cases must be a positive integer', 2)

  const initialState = model.init()
  const collected = []
  let stopped = null
  const walk = (raw, trace, state, observations) => {
    if (stopped) return
    const choices = raw.length < bound ? listItems(model.next(listOf(raw))) : []
    if (choices.length === 0) {
      if (collected.length >= maxCases) stopped = 'budget'
      else collected.push({ trace, observations })
      return
    }
    const seen = new Set()
    for (const event of choices) {
      const plain = toPlain(event)
      const key = stableStringify(plain)
      if (seen.has(key)) continue
      seen.add(key)
      const nextState = model.step(state, event)
      walk([...raw, event], [...trace, plain], nextState, [...observations, toPlain(model.observe(nextState))])
    }
  }
  walk([], [], initialState, [])

  const cases = collected
    .map(({ trace, observations }) => ({
      id: `M${sha256(stableStringify(trace)).slice(0, 12)}`,
      label: trace.map(eventLabel).join(' · '),
      trace,
      observations,
    }))
    .sort((left, right) => (left.label < right.label ? -1 : Number(left.label > right.label)))
  const inputs = {
    generator: GENERATOR_VERSION,
    model: model.digest ?? null,
    prefix: model.prefix ?? null,
    bound,
    maxCases,
  }
  return {
    ...inputs,
    inputDigest: sha256(stableStringify(inputs)),
    spaceDigest: sha256(stableStringify({ initial: toPlain(model.observe(initialState)), cases })),
    complete: stopped === null,
    stopped,
    scope: `traces of up to ${bound} events from ${inputs.prefix ?? 'the model'}.init that ${
      inputs.prefix ?? 'the model'
    }.next allows; every prefix is observed`,
    initial: toPlain(model.observe(initialState)),
    cases,
  }
}

/** 한 case를 구현 adapter에 넣고 초기 상태와 매 단계의 관측값을 모델 관측값과 대조한다. 첫 불일치에서 멈춘다. */
export function conformCase(space, entry, adapter) {
  let step = 0
  const failure = (fields) => ({ caseId: entry.id, label: entry.label, trace: entry.trace, step, ...fields })
  try {
    let state = adapter.init()
    const mismatch = (expected, event) => {
      const observed = adapter.observe(state)
      return isDeepStrictEqual(observed, expected)
        ? null
        : failure({ status: 'mismatch', event, expected, observed: observed ?? null })
    }
    const initial = mismatch(space.initial, null)
    if (initial) return initial
    for (const [index, event] of entry.trace.entries()) {
      step = index + 1
      state = adapter.step(state, structuredClone(event))
      const found = mismatch(entry.observations[index], event)
      if (found) return found
    }
    return { caseId: entry.id, status: 'pass' }
  } catch (error) {
    // adapter 예외는 제품 정상도 제품 결함도 아니다 — 관측을 못 한 것이다.
    return failure({ status: 'adapter-error', error: error?.message ?? String(error) })
  }
}

/** 공간 전체 대조. 통과는 모든 case가 `pass`이고 공간이 예산 안에서 완결됐을 때뿐이다. */
export function checkConformance(space, adapter) {
  for (const name of ['init', 'step', 'observe']) {
    if (typeof adapter?.[name] !== 'function') throw new CliError('ADAPTER_INTERFACE', `adapter must export ${name}()`)
  }
  const failures = space.cases
    .map((entry) => conformCase(space, entry, adapter))
    .filter(({ status }) => status !== 'pass')
  return {
    spaceDigest: space.spaceDigest,
    complete: space.complete,
    cases: space.cases.length,
    passed: space.cases.length - failures.length,
    failures,
    pass: space.complete && failures.length === 0,
  }
}

/**
 * `bend PROOF.bend --verdict` 결과 분류. `proven`은 exit 0·신호 없음·정확한 `ALL PROOFS CHECK` 줄이 함께일 때뿐이다.
 * 열린 law(채우지 않은 구멍·def 없는 law)·unsafe·foreign·timeout·도구 부재는 각각의 상태로 남고 통과로 바뀌지 않는다.
 */
export async function proveLaws({ dir, bin, require = [], timeoutMs = 120_000 }) {
  const cwd = resolve(dir)
  const command = [bin, 'PROOF.bend', '--verdict']
  const inputs = await bendInputs(join(cwd, 'PROOF.bend'))
  const lawsFile = inputs.find(({ path }) => path === join(cwd, 'LAWS.bend'))
  const laws = lawsFile?.laws.map(({ name }) => name) ?? []
  const base = {
    command,
    cwd,
    laws,
    lawImports: lawsFile?.imports ?? [],
    inputs: inputs.map(({ path, sha256: digest }) => ({ path: relative(cwd, path), sha256: digest })),
    untrusted: untrustedInputs(inputs),
  }
  if (!inputs[0].imports.includes('./LAWS.bend')) {
    return { ...base, status: 'failed', reason: 'PROOF.bend does not import ./LAWS.bend' }
  }
  const missing = require.filter((name) => !laws.includes(name))
  if (missing.length > 0) {
    return { ...base, status: 'failed', reason: `LAWS.bend does not state required laws: ${missing.join(', ')}` }
  }

  const run = spawnSync(bin, command.slice(1), {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, BEND_NO_TELEMETRY: '1' },
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
  })
  const observed = {
    ...base,
    exitCode: run.status,
    signal: run.signal,
    stdout: run.stdout ?? '',
    stderr: run.stderr ?? '',
  }
  const verdict = verdictOf(run, { bin, timeoutMs })
  return run.error ? { ...observed, ...verdict } : { ...observed, bend: { bin, version: reportedVersion(bin) }, ...verdict }
}

/** `bend <file> --verdict` 실행 결과 → 상태. proven은 exit 0·신호 없음·정확한 `ALL PROOFS CHECK` 줄이 함께일 때뿐이다. */
export function verdictOf(run, { bin, timeoutMs }) {
  if (run.error?.code === 'ETIMEDOUT') return { status: 'timeout', reason: `no verdict in ${timeoutMs}ms` }
  if (run.error) return { status: 'unavailable', reason: `${bin}: ${run.error.message}` }
  const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`
  const lines = output.split('\n').map((line) => line.trim())
  if (
    run.status === 0 &&
    run.signal === null &&
    lines.includes('ALL PROOFS CHECK') &&
    !lines.includes('SOME PROOFS FAIL')
  ) {
    return { status: 'proven' }
  }
  const failedAt = output.match(/^Location:\s*(\S+)/m)?.[1] ?? null
  if (/\b\d+ TODOs? found\b/.test(output)) return { status: 'open', failedAt }
  if (/rely on unsafe or foreign code/.test(output)) return { status: 'unsafe', failedAt }
  return { status: 'failed', failedAt }
}

/**
 * 잠금 범위 — 진입 Bend 파일과 그것이 `import ./x.bend`로 부르는 파일 전부가 Source Registry `repo:` 출처인지, 증명 밖
 * 코드(foreign·@unsafe·hub import)가 없는지. structures는 읽은 파일의 scanBendSource 결과(못 읽으면 null)다.
 */
export async function lockScopeIssues(entries, context) {
  const issues = []
  const registered = new Set([...context.sources.values()].map(({ repoPath }) => repoPath).filter(Boolean))
  const structures = new Map()
  const scan = async (repoPath, importer) => {
    if (structures.has(repoPath)) return
    const text = await context.readSource(repoPath)
    if (text === null) {
      const via = importer ? ` (imported by ${importer})` : ''
      issues.push(`formal-source-unreadable: ${repoPath}${via}`)
      structures.set(repoPath, null)
      return
    }
    const structure = scanBendSource(text)
    structures.set(repoPath, { ...structure, text })
    if (structure.foreign || structure.unsafe || structure.external.length > 0) {
      issues.push(`formal-untrusted-code: ${repoPath} carries foreign, @unsafe or hub-imported code outside the proof`)
    }
    for (const target of structure.imports) {
      const imported = join(dirname(repoPath), target).split('\\').join('/')
      // 법칙이 기대는 predicate·helper도 같은 lock에 들어가야 한다 — 법칙 파일만 잠그면 뜻을 바깥에서 바꿀 수 있다.
      if (!registered.has(imported))
        issues.push(
          `formal-import-unlocked: ${imported} (imported by ${repoPath}) is not a repo: Source Registry source`,
        )
      await scan(imported, repoPath)
    }
  }
  for (const entry of entries) await scan(entry, null)
  return { issues, structures }
}

/** `## Formal Model` 절 → 필드·law 표. 없으면 null — 절은 선택이다. */
export function parseFormalModel(lines) {
  const start = lines.findIndex((line) => line.trim() === '## Formal Model')
  if (start === -1) return null
  const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
  const section = lines.slice(start + 1, end === -1 ? lines.length : end)
  const fields = {}
  for (const line of section) {
    const match = line.trim().match(/^- ([^:]+):(.*)$/)
    if (match && FORMAL_FIELDS.includes(match[1])) fields[match[1]] = match[2].trim()
  }
  const laws = section
    .filter((line) => line.trim().startsWith('|'))
    .map((line) =>
      line
        .trim()
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim()),
    )
    .filter((cells) => cells[0] !== 'Law' && !/^:?-+:?$/.test(cells[0]))
    .map(([name, kind, cites]) => ({ name, kind, cites: cites ?? '' }))
  return { fields, laws }
}

/**
 * Formal Model 구조 검사 — card lint가 부른다. 연결이 있다는 것만 본다: law 문장이 정책의 뜻과 같은지는 리뷰 소관이다.
 * context: { policies: Set<P*>, rows: Set<O*|D*>, invariants: Set<I*>, sources: Map<S*, { repoPath, authoritative }>,
 *            readSource(repoPath) → text | null }
 */
export async function formalModelIssues(formal, context) {
  const issues = []
  const { fields, laws } = formal
  for (const field of FORMAL_FIELDS) {
    if (!fields[field]) issues.push(`formal-model-field: Formal Model must set ${field}`)
  }
  if (fields.Prefix && !/^[A-Z]\w*$/.test(fields.Prefix))
    issues.push('formal-prefix: Prefix must be the model namespace, e.g. Search')
  if (
    fields.Bound &&
    !(Number.isInteger(Number(fields.Bound)) && Number(fields.Bound) >= 1 && Number(fields.Bound) <= MAX_BOUND)
  ) {
    issues.push(`formal-bound: Bound must be an integer 1..${MAX_BOUND}`)
  }
  if (
    fields['Conformance row'] &&
    !(/^O\d+$/.test(fields['Conformance row']) && context.rows.has(fields['Conformance row']))
  ) {
    issues.push(`formal-conformance-row: ${fields['Conformance row']} must be one O* contract row`)
  }

  const sourcePath = (field) => {
    const id = fields[field]
    const source = context.sources.get(id)
    if (!/^S\d+$/.test(id ?? '') || !source?.repoPath?.endsWith('.bend') || !source.authoritative) {
      if (id)
        issues.push(
          `formal-model-source: ${field} must cite one approved, non-implementation repo:<path>.bend Source Registry ID`,
        )
      return null
    }
    return source.repoPath
  }
  const modelPath = sourcePath('Model')
  const lawsPath = sourcePath('Laws')

  if (laws.length === 0) issues.push('formal-law-table: Formal Model needs a Law | Kind | Cites table')
  const names = new Set()
  const citedPolicies = new Map()
  for (const law of laws) {
    if (!/^[a-z_][\w.]*$/.test(law.name))
      issues.push(`formal-law-name: ${law.name || '(empty)'} is not a Bend law name`)
    if (names.has(law.name)) issues.push(`formal-law-duplicate: ${law.name}`)
    names.add(law.name)
    if (!FORMAL_LAW_KINDS.includes(law.kind))
      issues.push(`formal-law-kind: ${law.name}: Kind must be ${FORMAL_LAW_KINDS.join(' | ')}`)
    const cited = law.cites.match(/\b[POID]\d+\b/g) ?? []
    if (!cited.some((id) => id.startsWith('P')))
      issues.push(`formal-law-uncited: ${law.name} must cite the P* policy it formalizes`)
    for (const id of cited) {
      const known = { P: context.policies, O: context.rows, D: context.rows, I: context.invariants }[id[0]]
      if (!known.has(id)) issues.push(`formal-law-cite-unknown: ${law.name}: ${id} is not on this card`)
      if (id.startsWith('P')) citedPolicies.set(id, [...(citedPolicies.get(id) ?? []), law.kind])
    }
  }
  // 공허성: 안전 법칙만으로는 아무것도 하지 않는 모델·구현도 통과한다 — 요구된 효과를 법칙으로 두고, 그 효과가 init에서
  // 실제로 일어난다는 exs 법칙을 같은 정책에 요구한다.
  if (laws.length > 0 && !laws.some(({ kind }) => kind === 'effect')) {
    issues.push(
      'formal-effect-missing: only safety laws — a model that does nothing satisfies them; state the required effect as an effect law',
    )
  }
  for (const [policy, kinds] of citedPolicies) {
    if (kinds.includes('effect') && !kinds.includes('witness')) {
      issues.push(
        `formal-witness-missing: ${policy} has effect laws but no witness (exs) law showing the effect happens from init`,
      )
    }
  }
  const unlisted = [...context.policies].filter(
    (id) => !citedPolicies.has(id) && !new RegExp(`\\b${id}\\b`).test(fields['Not formalized'] ?? ''),
  )
  for (const id of unlisted)
    issues.push(`formal-policy-unlisted: ${id} is cited by no law and not listed under Not formalized`)

  if (!modelPath || !lawsPath) return issues
  const scope = await lockScopeIssues([modelPath, lawsPath], context)
  issues.push(...scope.issues)
  const lawsSource = scope.structures.get(lawsPath)
  if (!lawsSource) return issues
  if (!lawsSource.imports.some((target) => join(dirname(lawsPath), target).split('\\').join('/') === modelPath)) {
    issues.push(
      `formal-laws-target: ${lawsPath} must import the Model source ${modelPath} — laws state facts about the locked model`,
    )
  }
  const declared = new Map(lawsSource.laws.map((law) => [law.name, law]))
  for (const law of laws) {
    if (!declared.has(law.name)) issues.push(`formal-law-undeclared: ${law.name} is not a law in ${lawsPath}`)
    else if (law.kind === 'witness' && !declared.get(law.name).witness)
      issues.push(`formal-witness-shape: ${law.name} is a witness row but its law asks for no exs witness`)
  }
  for (const name of declared.keys()) {
    if (!names.has(name)) issues.push(`formal-law-unmapped: ${name} in ${lawsPath} has no Formal Model row`)
  }
  return issues
}

function parseOptions(args) {
  const options = { require: [] }
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index]?.replace(/^--/, '')
    const value = args[index + 1]
    if (
      !['dir', 'require', 'timeout-ms', 'model', 'prefix', 'bound', 'max-cases', 'impl'].includes(name) ||
      value === undefined
    ) {
      throw new CliError('USAGE', `Unknown or incomplete option: ${args[index]}`, 2)
    }
    if (name === 'require') options.require.push(value)
    else options[name] = value
  }
  return options
}

const USAGE = `usage:
  oracle-model.mjs prove --dir <dir with LAWS.bend and PROOF.bend> [--require <law>]... [--timeout-ms <n>]
  oracle-model.mjs space --model <MODEL.bend> --prefix <Name> --bound <n> [--max-cases <n>]
  oracle-model.mjs conform --model <MODEL.bend> --prefix <Name> --bound <n> --impl <adapter.mjs> [--max-cases <n>]`

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!['prove', 'space', 'conform'].includes(command)) throw new CliError('USAGE', USAGE, 2)
  const options = parseOptions(args)
  const timeoutMs = options['timeout-ms'] ? Number(options['timeout-ms']) : undefined
  const { bin } = await ensureBend()

  if (command === 'prove') {
    if (!options.dir) throw new CliError('USAGE', USAGE, 2)
    const result = await proveLaws({ dir: options.dir, bin, require: options.require, timeoutMs })
    process.stdout.write(`${JSON.stringify(result)}\n`)
    process.exitCode = result.status === 'proven' ? 0 : 1
    return
  }

  if (!options.model || !options.prefix || !options.bound) throw new CliError('USAGE', USAGE, 2)
  const model = await loadModel({ model: options.model, prefix: options.prefix, bin, timeoutMs })
  const space = enumerateSpace(model, {
    bound: Number(options.bound),
    ...(options['max-cases'] ? { maxCases: Number(options['max-cases']) } : {}),
  })
  if (command === 'space') {
    process.stdout.write(`${JSON.stringify({ ...space, bend: model.bend, inputs: model.inputs })}\n`)
    process.exitCode = space.complete ? 0 : 1
    return
  }
  if (!options.impl) throw new CliError('USAGE', USAGE, 2)
  const adapter = await import(pathToFileURL(resolve(options.impl)).href)
  const report = checkConformance(space, adapter)
  process.stdout.write(
    `${JSON.stringify({ ...report, inputDigest: space.inputDigest, bend: model.bend, inputs: model.inputs })}\n`,
  )
  process.exitCode = report.pass ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    const cliError =
      error instanceof CliError ? error : new CliError(error.code ?? 'MODEL_FAILED', error.message ?? String(error))
    process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
    process.exitCode = cliError.exitCode
  }
}
