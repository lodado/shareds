#!/usr/bin/env node

// Bend 참조 모델을 오라클 공간으로 쓴다. 법칙 증명(`bend PROOF.bend --verdict`)의 결과를 분류하고, 잠긴 MODEL.bend를
// `bend -o *.mjs`로 컴파일해 선언 범위의 trace를 결정적으로 열거하고, 구현 adapter의 관측값을 같은 trace에서 대조한다.
// 기대값은 증명된 그 모델 코드가 계산한다 — JS로 옮겨 적은 두 번째 의미를 두지 않는다.

import { spawnSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { ensureBend, reportedVersion } from './ensure-bend.mjs'
import { runCli } from './oracle-cli.mjs'
import { sha256, stableStringify } from './oracle-fs.mjs'
import { toPlain } from './oracle-types.mjs'

export { toPlain } from './oracle-types.mjs'

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
// 성질 모드(Formal Oracle Projection state) 선언 — 선택. 관계는 LAWS.bend가 모델에 대해 증명한 Bool def다.
const FORMAL_OPTIONAL_FIELDS = ['State', 'Command', 'Relations']

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

function listItems(list) {
  const items = []
  for (let cursor = list; cursor?.$ === 'Con'; cursor = cursor.tail) items.push(cursor.head)
  return items
}

function listOf(items) {
  return items.reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' })
}

/** 사건 하나의 사람용 이름 — 생성된 테스트에도 `toString()`으로 실린다(그래서 바깥 이름을 참조하지 않는다). */
export function eventLabel(event) {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) return JSON.stringify(event)
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
    return { exported: (await import(pathToFileURL(out).href)).default, inputs, source: await readFile(out, 'utf8') }
  } finally {
    await rm(outDir, { recursive: true, force: true })
  }
}

function commonDirectory(directories) {
  return directories.reduce((common, directory) => {
    const left = common.split(sep)
    const right = directory.split(sep)
    let index = 0
    while (index < left.length && left[index] === right[index]) index += 1
    return left.slice(0, index).join(sep) || sep
  })
}

/**
 * 생성한 Bend 파일(text)을 진입 파일 옆에 두고 `bend <fileName> --verdict`를 돌린다. 진입 파일의 import 전부를
 * 임시 디렉터리에 복사해 원본 트리에는 아무것도 쓰지 않는다.
 */
export async function verdictBeside({ entry, inputs, fileName, text, bin, timeoutMs = 120_000 }) {
  const directory = await mkdtemp(join(tmpdir(), 'oracle-kernel-'))
  try {
    const root = commonDirectory(inputs.map(({ path }) => dirname(path)))
    for (const { path } of inputs) {
      const target = join(directory, relative(root, path))
      await mkdir(dirname(target), { recursive: true })
      await copyFile(path, target)
    }
    const cwd = join(directory, relative(root, dirname(entry)))
    await writeFile(join(cwd, fileName), text)
    const run = spawnSync(bin, [fileName, '--verdict'], {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, BEND_NO_TELEMETRY: '1' },
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
    })
    return verdictOf(run, { bin, timeoutMs })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

/**
 * 커널에 넘긴 생성 Bend 파일과 결과를 out 디렉터리에 남긴다. 남긴 Bend 파일은 out에서 원본 모델을 상대 경로로
 * import하므로 그 자리에서 `bend <file> --verdict`로 다시 검사할 수 있다. 결과 JSON은 같은 이름의 `.json`이다.
 */
export async function keepArtifact({ out, fileName, entry, render, result }) {
  await mkdir(resolve(out), { recursive: true })
  // Bend는 실제 경로로 import를 푼다 — /tmp 같은 심볼릭 링크를 풀어서 상대 경로를 만든다.
  const outDir = await realpath(resolve(out))
  const target = relative(outDir, await realpath(resolve(entry)))
    .split(sep)
    .join('/')
  const importPath = target.startsWith('.') ? target : `./${target}`
  const bendFile = join(outDir, fileName)
  const jsonFile = join(outDir, fileName.replace(/\.bend$/, '.json'))
  await writeFile(bendFile, render(importPath))
  await writeFile(jsonFile, `${JSON.stringify(result, null, 2)}\n`)
  return { bend: bendFile, result: jsonFile }
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

export const MAX_COVER_CONFIGURATIONS = 2000
/** 구성이 무엇인지 — closed는 이 키 아래의 주장이다. 이보다 깊은 곳에서야 갈리는 이력 의존 환경은 한 구성으로 합쳐진다. */
export const COVER_BASIS =
  'a configuration is the model state, the allowed events, and the events allowed one step later; histories that differ only deeper are merged'

/**
 * 구성 그래프 — 너비 우선으로 구성(모델 상태 + 허용 사건 + 각 사건 한 걸음 뒤 허용 사건)을 처음 닿은 이력으로 합쳐 간선을 모은다.
 * next(history)는 과거 전체를 읽는다 — 상태와 지금 허용 사건이 같아도 각 사건 뒤에 허용되는 사건이 다르면 다른 구성이다.
 * 각 구성의 trace는 가장 짧은 접근 이력이고, 간선은 그 trace에 사건 하나를 이은 것이다.
 */
function configurationGraph(model, maxConfigurations) {
  const allowedAfter = (raw) => {
    const seenEvents = new Set()
    return listItems(model.next(listOf(raw))).filter((event) => {
      const key = stableStringify(toPlain(event))
      if (seenEvents.has(key)) return false
      seenEvents.add(key)
      return true
    })
  }
  const nodes = []
  const seen = new Set()
  const visit = (node) => {
    const allowed = allowedAfter(node.raw)
    const ahead = allowed.map((event) => allowedAfter([...node.raw, event]).map(toPlain))
    const key = stableStringify({ state: toPlain(node.state), allowed: allowed.map(toPlain), ahead })
    if (seen.has(key)) return
    seen.add(key)
    nodes.push({ ...node, allowed, edges: [] })
  }
  visit({ raw: [], trace: [], state: model.init(), observations: [] })
  let pairs = 0
  let expanded = 0
  for (; expanded < nodes.length && expanded < maxConfigurations; expanded += 1) {
    const node = nodes[expanded]
    pairs += node.allowed.length
    for (const event of node.allowed) {
      const state = model.step(node.state, event)
      const observation = toPlain(model.observe(state))
      const child = {
        raw: [...node.raw, event],
        trace: [...node.trace, toPlain(event)],
        state,
        observations: [...node.observations, observation],
      }
      node.edges.push({ event: toPlain(event), observation, trace: child.trace, observations: child.observations })
      visit(child)
    }
  }
  // 줄에 남은 구성이 있으면 상한에 걸린 것이다 — 그 앞 깊이까지는 전부 덮었다
  const capped = nodes.length > expanded ? nodes[expanded].trace.length - 1 : null
  return { nodes: nodes.slice(0, expanded), expanded, pairs, capped }
}

/**
 * 전이 커버 — 도달 가능한 구성마다 허용 사건 전부를 한 번씩. 각 구성은 너비 우선의 가장 짧은 접근 trace로 닿고, 그 trace에 사건
 * 하나를 이은 것이 커버 case다. bound 안의 trace는 공간이 이미 전부 돌므로 bound를 넘는 case만 남긴다. 유한 모델이면 모든
 * 구성을 덮고 closed다. 상태가 끝없이 자라 상한에 걸리면 capped: bound 안에서 닿는 구성까지만 덮고(그 너머는 fast-check
 * 표본의 몫이다) 그 깊이를 보고한다. 모델 수준의 가능한 케이스 보고에 쓴다 — 제품에 돌리는 집합은 minimalCover다.
 */
export function transitionCover(model, space, { maxConfigurations = MAX_COVER_CONFIGURATIONS } = {}) {
  const { nodes, expanded, pairs, capped } = configurationGraph(model, maxConfigurations)
  const coveredDepth = capped === null ? null : Math.min(capped, space.bound)
  const cases = nodes
    .flatMap((node) => node.edges.map((edge) => ({ ...edge, depth: node.trace.length })))
    .filter(({ trace, depth }) => trace.length > space.bound && (coveredDepth === null || depth <= coveredDepth))
    .map(({ trace, observations }) => ({
      id: `C${sha256(stableStringify(trace)).slice(0, 12)}`,
      label: trace.map(eventLabel).join(' · '),
      trace,
      observations,
    }))
    .sort((left, right) => left.trace.length - right.trace.length || (left.label < right.label ? -1 : Number(left.label > right.label)))
  return {
    status: capped === null ? 'closed' : 'capped',
    basis: COVER_BASIS,
    configurations: expanded,
    pairs,
    ...(capped === null
      ? {}
      : {
          coveredDepth,
          reason: `more than ${maxConfigurations} configurations — the model state grows without bound; every configuration within depth ${coveredDepth} is covered, fast-check samples past it`,
        }),
    cases,
  }
}

// 값이 이만큼 이하로 갈리면 값마다 하나의 동치류, 넘으면 경계값 다섯(low·low+1·mid·high-1·high)으로 접는다
const ENUM_CLASSES = 5
export const MINIMAL_BASIS =
  'every event class, every event × state class pair and every observed class — a class is one value of a small domain, or one of low, low+1, mid, high-1, high of a wide one; arrays count by length'

/**
 * [경로, 값] 잎. 객체는 필드로 펼치고(`$` 포함 — 합 타입의 갈래도 한 잎이다) 배열은 길이만 센다. 생성된 테스트에도
 * `toString()`으로 실린다(그래서 바깥 이름을 참조하지 않는다).
 */
export function leaves(value, path, found = []) {
  if (Array.isArray(value)) found.push([`${path}.length`, value.length])
  else if (value !== null && typeof value === 'object')
    for (const [key, field] of Object.entries(value)) leaves(field, `${path}.${key}`, found)
  else found.push([path, value])
  return found
}

function compareValues(left, right) {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  return stableStringify(left) > stableStringify(right) ? 1 : -1
}

/** 경로마다 관측한 값들로 동치류 이름 함수를 만든다 — 값 하나가 어느 류인지는 같은 경로의 다른 값에 달렸다. */
function classifier(observed) {
  const names = new Map()
  for (const [path, values] of observed) {
    const distinct = [...new Map(values.map((value) => [stableStringify(value), value])).values()].sort(compareValues)
    const last = distinct.length - 1
    const rank = (index) => {
      if (index === 0) return 'low'
      if (index === 1) return 'low+1'
      if (index === last) return 'high'
      return index === last - 1 ? 'high-1' : 'mid'
    }
    const classOf = (value, index) => [stableStringify(value), distinct.length <= ENUM_CLASSES ? stableStringify(value) : rank(index)]
    names.set(path, new Map(distinct.map(classOf)))
  }
  const table = Object.fromEntries([...names].map(([path, byValue]) => [path, Object.fromEntries(byValue)]))
  return { classOf: ([path, value]) => `${path}=${names.get(path).get(stableStringify(value))}`, table }
}

/** 요구 항목: 구성마다 허용 사건의 (사건 류, 관측 류, 사건 류 × 상태 류). 값의 류는 요구 구성 전체에서 본 값들로 정한다. */
function itemsByEdge(required) {
  const stateLeaves = new Map(required.map((node) => [node, leaves(toPlain(node.state), 'state')]))
  const eventLeaves = (edge) => leaves(edge.event, edge.event.$ ?? 'event')
  const observed = new Map()
  const note = ([path, value]) => observed.set(path, [...(observed.get(path) ?? []), value])
  for (const node of required) {
    stateLeaves.get(node).forEach(note)
    for (const edge of node.edges) {
      eventLeaves(edge).forEach(note)
      leaves(edge.observation, 'observation').forEach(note)
    }
  }
  const { classOf, table } = classifier(observed)
  const itemsOf = (node, edge) => {
    const states = stateLeaves.get(node).map(classOf)
    const events = eventLeaves(edge).map(classOf)
    const observations = leaves(edge.observation, 'observation').map(classOf)
    return [...events, ...observations, ...events.flatMap((event) => states.map((state) => `${event} × ${state}`))]
  }
  return { itemsOf, table }
}

/** 후보 = 구성의 간선 하나(접근 trace + 사건). 한 후보는 접근 trace가 지나는 모든 단계의 항목과 마지막 사건의 항목을 덮는다. */
function coverCandidates(required, itemsOf) {
  const candidates = []
  const upTo = new Map([[required[0], new Set()]])
  const nodeOf = new Map(required.map((node) => [stableStringify(node.trace), node]))
  for (const node of required) {
    for (const edge of node.edges) {
      const items = new Set([...upTo.get(node), ...itemsOf(node, edge)])
      candidates.push({ trace: edge.trace, observations: edge.observations, items, gain: Infinity })
      const child = nodeOf.get(stableStringify(edge.trace))
      if (child && !upTo.has(child)) upTo.set(child, items)
    }
  }
  return candidates.sort(
    (left, right) => left.trace.length - right.trace.length || compareValues(stableStringify(left.trace), stableStringify(right.trace)),
  )
}

/** 탐욕 집합 덮개 — 새로 덮는 항목이 가장 많은 후보부터. gain은 줄기만 하므로 이전 값이 최선 이하인 후보는 다시 세지 않는다. */
function greedyCover(candidates) {
  const uncovered = new Set(candidates.flatMap(({ items }) => [...items]))
  const chosen = []
  while (uncovered.size > 0) {
    let best = null
    for (const candidate of candidates) {
      if (best && candidate.gain <= best.gain) continue
      candidate.gain = [...candidate.items].filter((item) => uncovered.has(item)).length
      if (!best || candidate.gain > best.gain) best = candidate
    }
    chosen.push(best)
    best.items.forEach((item) => uncovered.delete(item))
  }
  return chosen
}

/** 다른 선택 trace의 앞부분인 trace는 그 trace가 이미 지난다 — 마운트 수만 늘린다. */
function dropPrefixes(chosen) {
  const keys = chosen.map(({ trace }) => trace.map(stableStringify))
  const isPrefix = (short, long) => short.length < long.length && short.every((key, index) => key === long[index])
  return chosen.filter((_, index) => !keys.some((other) => isPrefix(keys[index], other)))
}

/**
 * 제품에 돌릴 최소 집합 — 동치 분할과 경계값으로 접은 요구 항목(사건 류, 사건 류 × 상태 류 쌍, 관측 류)을 모두 덮는 가장 작은
 * trace 묶음이다. 후보는 구성마다의 최단 접근 trace + 사건 하나(항상 환경이 허용하는 이력)이고, 한 trace는 지나는 모든 단계의
 * 항목을 덮는다. 탐욕으로 가장 많이 새로 덮는 후보부터 고르고, 다른 선택 trace의 앞부분인 trace는 버린다. 모든 전이를 도는
 * 전이 커버보다 약한 주장이다 — 항목 사이의 3-way 상호작용과 깊은 이력은 fast-check 표본의 몫이다.
 * ponytail: 탐욕 집합 덮개(최적 아님)·접두사 병합만 한다. 서로 접두사가 아닌 trace를 한 긴 trace로 잇는 일은 마운트 수가 문제일 때 추가한다.
 */
export function minimalCover(model, space, { maxConfigurations = MAX_COVER_CONFIGURATIONS } = {}) {
  const { nodes, expanded, capped } = configurationGraph(model, maxConfigurations)
  const coveredDepth = capped === null ? null : Math.min(capped, space.bound)
  const required = nodes.filter((node) => coveredDepth === null || node.trace.length <= coveredDepth)
  const { itemsOf, table } = itemsByEdge(required)
  const candidates = coverCandidates(required, itemsOf)
  const items = [...new Set(candidates.flatMap((candidate) => [...candidate.items]))].sort()
  const cases = dropPrefixes(greedyCover(candidates))
    .map(({ trace, observations }) => ({
      id: `T${sha256(stableStringify(trace)).slice(0, 12)}`,
      label: trace.map(eventLabel).join(' · '),
      trace,
      observations,
    }))
    .sort((left, right) => left.trace.length - right.trace.length || compareValues(left.label, right.label))
  return {
    status: capped === null ? 'closed' : 'capped',
    basis: MINIMAL_BASIS,
    configurations: expanded,
    items: items.length,
    // 생성된 테스트가 표본의 각 단계를 같은 류로 세려면 류 이름표와 항목 목록이 필요하다
    classes: table,
    itemList: items,
    ...(capped === null ? {} : { coveredDepth }),
    cases,
  }
}

/** 한 case를 구현 adapter에 넣고 초기 상태와 매 단계의 관측값을 모델 관측값과 대조한다. 첫 불일치에서 멈춘다. */
export function conformCase(space, entry, adapter) {
  let step = 0
  const failure = (fields) => ({ caseId: entry.id, label: entry.label, trace: entry.trace, step, ...fields })
  try {
    // 결합 케이스는 세계 조건으로 시작한다 — 매개변수를 선언하지 않은 init은 기본 fixture로 돌아 공허하게 통과할 것이다
    if (entry.coordinates !== undefined && adapter.init.length < 1)
      throw new Error(
        'ADAPTER_JOINT_UNSUPPORTED: init declares no coordinates parameter, so the joint case would run on the default fixture (a parameter with a default value is not counted — declare it without one)',
      )
    let state = entry.coordinates === undefined ? adapter.init() : adapter.init(structuredClone(entry.coordinates))
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
  // 가장 짧은 반례가 먼저 — 재현과 원인 분리가 쉬운 순서다.
  const failures = space.cases
    .map((entry) => conformCase(space, entry, adapter))
    .filter(({ status }) => status !== 'pass')
    .sort((left, right) => left.trace.length - right.trace.length)
  return {
    spaceDigest: space.spaceDigest,
    complete: space.complete,
    cases: space.cases.length,
    passed: space.cases.length - failures.length,
    failures,
    pass: space.complete && failures.length === 0,
    verification: conformanceClaim(space, 0),
    residue: projectionResidue(space, adapter),
  }
}

/**
 * 투영이 버린 정보 — adapter.snapshot(state)가 있으면 공간의 모든 prefix에서 관찰값은 같은데 스냅샷이 다른 최상위
 * 필드를 모은다. 각 필드는 사전에 "관찰 안 함 + 이유"로 적거나 후보 축으로 올린다. 판정이 아니라 발견 도구다.
 */
export function projectionResidue(space, adapter) {
  if (typeof adapter.snapshot !== 'function') return null
  const groups = new Map()
  const record = (state) => {
    const key = stableStringify(adapter.observe(state))
    groups.set(key, [...(groups.get(key) ?? []), adapter.snapshot(state)])
  }
  for (const entry of space.cases) {
    try {
      let state = adapter.init()
      record(state)
      for (const event of entry.trace) {
        state = adapter.step(state, structuredClone(event))
        record(state)
      }
    } catch {
      // 관측하지 못한 case는 대응 검사가 adapter-error로 보고한다 — 잔여 분석에서는 건너뛴다.
    }
  }
  const fields = new Map()
  for (const [observation, snapshots] of groups) {
    const keys = new Set(snapshots.flatMap((snapshot) => Object.keys(snapshot ?? {})))
    for (const key of keys) {
      const values = [...new Set(snapshots.map((snapshot) => stableStringify(snapshot?.[key] ?? null)))]
      if (values.length > 1 && !fields.has(key))
        fields.set(key, {
          field: key,
          observation: JSON.parse(observation),
          values: values.slice(0, 3).map((value) => JSON.parse(value)),
        })
    }
  }
  return {
    fields: [...fields.values()].sort((left, right) => (left.field < right.field ? -1 : 1)),
    note: 'implementation fields that vary while the observation stays the same — record each in ## Terms as not observed with a reason, or raise it as a candidate axis',
  }
}

/** 대응 검사가 주장하는 것 — 모델에 대한 증명(prove)과 섞이지 않게 범위와 방법을 함께 적는다. */
export function conformanceClaim(space, runs, seed = null) {
  return {
    level: 'conformance-tested',
    exhaustive: { cases: space.cases.length, bound: space.bound, complete: space.complete },
    sampled: runs > 0 ? { runs, seed, beyond: space.bound } : null,
    claim:
      'no counterexample in the declared space; not a proof about the implementation — the laws are proven about the model only',
  }
}

const ROUTES = {
  'outside-space':
    'the environment does not allow this event, so the model missed it too — reopen the problem definition (POLICY_GAP or DIMENSION_MISSING); never force it into the nearest event',
  'implementation-defect':
    'the model predicts a different observation — a product defect candidate: reproduce it as a failing test (VALID_RED)',
  'model-agrees':
    'the model predicts exactly this behavior — if it is still a bug, the specification is wrong: POLICY_GAP',
  'in-space': 'the trace is inside the space; expected observations are listed for a regression test',
  'adapter-error': 'the adapter could not observe the product — a harness problem, not a verdict (HARNESS_DEFECT)',
}

/**
 * 런타임 반례 한 건을 공간에 비춰 본다(bound와 무관하게 모델로 직접). 환경이 허용하지 않는 사건이 있으면 모델도 놓친
 * 것이고, 안이면 모델 기대값과 관측을 대조한다. observed는 [초기 관측, 각 단계 뒤 관측...]이다.
 */
export function classifyTrace(model, trace, observed = null) {
  const raw = []
  let state = model.init()
  const expected = [toPlain(model.observe(state))]
  for (const [index, event] of trace.entries()) {
    const allowed = listItems(model.next(listOf(raw)))
    const match = allowed.find((choice) => isDeepStrictEqual(toPlain(choice), event))
    if (!match) {
      const verdict = 'outside-space'
      return { verdict, step: index + 1, event, allowed: allowed.map(toPlain), route: ROUTES[verdict] }
    }
    raw.push(match)
    state = model.step(state, match)
    expected.push(toPlain(model.observe(state)))
  }
  if (observed === null) return { verdict: 'in-space', expected, route: ROUTES['in-space'] }
  const step = expected.findIndex((value, index) => !isDeepStrictEqual(observed[index], value))
  if (step === -1) return { verdict: 'model-agrees', expected, route: ROUTES['model-agrees'] }
  const verdict = 'implementation-defect'
  return {
    verdict,
    step,
    event: step === 0 ? null : trace[step - 1],
    expected: expected[step],
    observed: observed[step] ?? null,
    route: ROUTES[verdict],
  }
}

/** adapter로 trace를 돌려 [초기 관측, 각 단계 뒤 관측...]을 모은다. 예외는 adapter-error다. */
export function observeTrace(adapter, trace) {
  let state = adapter.init()
  const observed = [adapter.observe(state)]
  for (const event of trace) {
    state = adapter.step(state, structuredClone(event))
    observed.push(adapter.observe(state))
  }
  return observed
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
  return run.error
    ? { ...observed, ...verdict }
    : { ...observed, bend: { bin, version: reportedVersion(bin) }, ...verdict }
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
  // 커널(Lean)이 없어 검사 자체를 못 한 것은 증명 실패가 아니다 — 환경 결함(ENVIRONMENT_DEFECT)으로 남긴다.
  // 검사가 한 줄이라도 결론을 냈으면(ALL/SOME PROOFS …) 그 결론을 따른다 — 문구가 섞였다고 실패를 환경 탓으로 바꾸지 않는다.
  const verdictLine = lines.some((line) => line === 'ALL PROOFS CHECK' || line === 'SOME PROOFS FAIL')
  const kernelMissing = output.match(/^.*the kernel did not build.*$/m)?.[0]
  if (kernelMissing && run.status !== 0 && !verdictLine) return { status: 'unavailable', reason: kernelMissing.trim() }
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
    if (match && [...FORMAL_FIELDS, ...FORMAL_OPTIONAL_FIELDS].includes(match[1])) fields[match[1]] = match[2].trim()
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
  issues.push(...relationIssues(fields, scope.structures, lawsPath))
  return issues
}

/** `- Relations:`가 있으면 State·Command와 함께, 각 관계가 모델의 def이고 LAWS.bend의 법칙이 그 관계를 말하는지 본다. */
function relationIssues(fields, structures, lawsPath) {
  const relations = (fields.Relations ?? '').split(/[\s,]+/).filter(Boolean)
  if (relations.length === 0) return []
  const issues = []
  for (const field of ['State', 'Command']) {
    if (!/^[A-Z]\w*$/.test(fields[field] ?? ''))
      issues.push(`formal-relation-types: Relations need ${field}: the Bend type of the ${field.toLowerCase()}`)
  }
  const texts = [...structures.values()]
    .filter(Boolean)
    .map(({ text }) => text)
    .join('\n')
  const laws = structures.get(lawsPath)?.text ?? ''
  for (const relation of relations) {
    if (!new RegExp(`^def\\s+${fields.Prefix}\\.${relation}\\(`, 'm').test(texts))
      issues.push(`formal-relation-def: ${fields.Prefix}.${relation} is not a def of the locked model`)
    else if (!new RegExp(`\\b${fields.Prefix}\\.${relation}\\(`).test(laws))
      issues.push(
        `formal-relation-unproven: no law in ${lawsPath} states ${relation} — the generated test would judge with an unproven relation`,
      )
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
    const { cases: coverCases, ...cover } = transitionCover(model, space)
    const report = { ...space, cover: { ...cover, cases: coverCases.length }, bend: model.bend, inputs: model.inputs }
    process.stdout.write(`${JSON.stringify(report)}\n`)
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

// await하지 않는다 — 이 모듈은 순환 import(derive ↔ adequacy)에 있어 top-level await가 import를 교착시킨다
runCli(import.meta, main, { CliError, fallback: 'MODEL_FAILED' })
