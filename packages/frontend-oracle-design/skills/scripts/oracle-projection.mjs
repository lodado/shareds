#!/usr/bin/env node

// Formal Oracle Projection — 증명된 Bend 모델을 실제 구현을 공격하는 테스트로 투영한다. 입력 공간은 Bend 타입에서,
// 기대값은 컴파일된 모델에서, 판정식은 컴파일된 관계 def에서 나온다: 법칙을 TS로 옮겨 적은 두 번째 의미가 없다.
// 사람이 쓰는 경계는 adapter 하나다. 생성 테스트의 통과는 구현의 대응 증거이지 증명이 아니다.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, posix, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { ensureBend } from './ensure-bend.mjs'
import { sha256, stableStringify } from './oracle-fs.mjs'
import {
  bendInputs,
  classifyTrace,
  compileBend,
  conformanceClaim,
  enumerateSpace,
  keepArtifact,
  loadModel,
  verdictBeside,
} from './oracle-model.mjs'
import {
  arbitraryOf,
  bendLiteral,
  bendTypeName,
  cardinality,
  defSignature,
  EXHAUSTIVE_THRESHOLD,
  parseBendTypes,
  toPlain,
  toRuntime,
  typeIR,
  valuesOf,
} from './oracle-types.mjs'

export const PROJECTION_VERSION = 1
const RUNNERS = { 'node-test': "import { test } from 'node:test'", vitest: "import { test } from 'vitest'" }
export const CASE_TIMEOUT = 5000

class CliError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

const toImport = (path) => {
  const portable = path.split(sep).join(posix.sep)
  return portable.startsWith('.') ? portable : `./${portable}`
}

export function eventLabel(event) {
  if (event === null || typeof event !== 'object' || Array.isArray(event)) return JSON.stringify(event)
  const fields = Object.entries(event)
    .filter(([key]) => key !== '$')
    .map(([key, value]) => `${key}:${JSON.stringify(value)}`)
  return fields.length === 0 ? event.$ : `${event.$}{${fields.join(',')}}`
}

/**
 * adapter 정적 감사 — adapter는 모델과 제품 사이의 신뢰 경계다. 모델·컴파일된 모델·오라클 도구를 import하면 기대값을
 * 그대로 돌려줄 수 있고, 제품을 하나도 import하지 않으면 제품을 관찰하지 않는다. 둘 다 생성을 거부한다. 제품 로직을
 * adapter 안에 다시 쓴 경우는 이 감사로 찾지 못한다 — 그 판단은 독립 리뷰의 adapter 체크리스트가 한다.
 */
export function auditAdapterSource(text) {
  // 주석은 코드가 아니다 — 주석 속 import 문구가 제품을 import한 것처럼 보이지 않게 먼저 지운다(문자열은 남긴다).
  const code = text.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1')
  const specifiers = [
    /\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*['"]([^'"]+)['"]/g,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  ].flatMap((pattern) => [...code.matchAll(pattern)].map((match) => match[1].split(/[?#]/)[0]))
  const findings = []
  const oracle = /\.model\.[cm]?js$|\.bend$|oracle-[\w-]+\.mjs$|(?:^|\/)fast-check$/
  for (const specifier of specifiers) {
    if (oracle.test(specifier))
      findings.push({
        code: 'adapter-imports-oracle',
        specifier,
        message: `the adapter imports ${specifier} — it could compute the expected value instead of observing the product`,
      })
  }
  // 정적으로 읽을 수 없는 적재 — 계산한 import 경로, require, 파일 읽기는 무엇을 부르는지 감사가 확인할 수 없다.
  const opaque = [
    [/\bimport\(\s*(?!['"][^'"]*['"]\s*\))/, 'a computed dynamic import'],
    [/\brequire\s*\(|\bcreateRequire\b/, 'require()'],
    [/\breadFile(?:Sync)?\s*\(|\bnode:fs\b|['"]fs(?:\/promises)?['"]/, 'a file-system read'],
    [/\bvm\.|\bnew Function\b|\beval\s*\(/, 'evaluated code'],
  ]
  for (const [pattern, what] of opaque)
    if (pattern.test(code))
      findings.push({
        code: 'adapter-opaque-load',
        specifier: null,
        message: `the adapter uses ${what} — the audit cannot see what it loads; import the product statically`,
      })
  // 렌더 하네스(react·testing-library·vitest)는 제품이 아니다 — 이것만 import한 adapter는 제품을 관찰하지 않는다.
  const renders = /^(?:react|react-dom)(?:\/|$)|^@testing-library\//
  if (specifiers.some((specifier) => renders.test(specifier))) {
    // 표본은 한 테스트 안에서 돌아 runner의 afterEach cleanup이 표본 사이에 끼지 못한다 — 렌더한 트리는 dispose가 걷는다.
    const exportsDispose = [
      /\bexport\s+(?:async\s+)?function\s+dispose\b/,
      /\bexport\s+(?:const|let|var)\s+dispose\b/,
      /\bexport\s*\{[^}]*\bdispose\b/,
    ].some((pattern) => pattern.test(code))
    if (!exportsDispose)
      findings.push({
        code: 'adapter-dispose-missing',
        specifier: null,
        message:
          'the adapter renders with React but exports no dispose — mounted trees, clients and globals leak into the next case',
      })
  }
  if (
    !specifiers.some(
      (specifier) =>
        !specifier.startsWith('node:') && !oracle.test(specifier) && !renders.test(specifier) && specifier !== 'vitest',
    )
  )
    findings.push({
      code: 'adapter-no-product',
      specifier: null,
      message: 'the adapter imports no product module — it cannot be observing the product',
    })
  return findings
}

async function assertAdapterTrusted(adapter) {
  const text = await readFile(resolve(adapter), 'utf8').catch(() => {
    throw new CliError('ADAPTER_UNREADABLE', `${adapter} cannot be read`)
  })
  const findings = auditAdapterSource(text)
  if (findings.length > 0)
    throw new CliError('ADAPTER_SUSPECT', findings.map((finding) => `${finding.code}: ${finding.message}`).join('; '))
}

// 생성 테스트 공통 머리 — 원본 digest가 바뀌면 이 파일은 더 이상 그 모델의 투영이 아니다.
function header({
  mode,
  prefix,
  regenerate,
  scope,
  runner,
  environment,
  caseTimeout,
  sampled,
  adapterImport,
  modelFile,
  sources,
  row,
}) {
  const audit = auditAdapterSource.toString()
  return [
    ...(environment ? [`// @vitest-environment ${environment}`] : []),
    `// AUTO-GENERATED by frontend-oracle-design \`oracle-projection.mjs emit-${mode}\` (Formal Oracle Projection) — DO NOT EDIT.`,
    `// Regenerate: ${regenerate}`,
    `// Model ${prefix}. The laws are proven about the model (\`oracle-model.mjs prove\`); this file is conformance`,
    `// evidence for the implementation, ${scope}. Passing it is not a proof about the implementation.`,
    '',
    "import assert from 'node:assert/strict'",
    "import { createHash } from 'node:crypto'",
    "import { readFileSync } from 'node:fs'",
    RUNNERS[runner],
    ...(sampled ? ["import fc from 'fast-check'"] : []),
    `import * as adapter from ${JSON.stringify(adapterImport)}`,
    `import model from ${JSON.stringify(['.', modelFile].join('/'))}`,
    '',
    `const ROW = ${JSON.stringify(row)}`,
    `const PREFIX = ${JSON.stringify(prefix)}`,
    `const SOURCES = ${JSON.stringify(sources)}`,
    'const call = (name, ...args) => model[PREFIX + "." + name](...args.map((argument) => structuredClone(argument)))',
    toPlain.toString(),
    '',
    '// adapter 호출은 동기·비동기 모두 await한다. 한 호출이 CASE_TIMEOUT 안에 끝나지 않으면 ADAPTER_TIMEOUT으로 실패한다.',
    '// 타이머는 import 시점의 진짜 타이머다 — adapter가 fake timer를 깔아도 시간 제한은 멈추지 않는다.',
    `const CASE_TIMEOUT = ${caseTimeout}`,
    'const { setTimeout: realSetTimeout, clearTimeout: realClearTimeout } = globalThis',
    'async function within(value, where) {',
    '  let timer',
    '  const expire = new Promise((_, reject) => {',
    "    timer = realSetTimeout(() => reject(new Error('ADAPTER_TIMEOUT: ' + where + ' did not settle within ' + CASE_TIMEOUT + 'ms')), CASE_TIMEOUT)",
    '  })',
    '  try {',
    '    return await Promise.race([value, expire])',
    '  } finally {',
    '    realClearTimeout(timer)',
    '  }',
    '}',
    '// 한 테스트의 총 시간은 runner가 아니라 호출별 CASE_TIMEOUT이 제한한다 — vitest 기본 5초는 표본 수백 회를 담지 못한다.',
    'const UNLIMITED = { timeout: Number.POSITIVE_INFINITY }',
    '',
    "test('[' + ROW + '] oracle sources unchanged since generation', () => {",
    '  for (const { path, sha256 } of SOURCES) {',
    "    const actual = createHash('sha256').update(readFileSync(new URL(path, import.meta.url), 'utf8')).digest('hex')",
    "    assert.equal(actual, sha256, 'STALE_GENERATED_TESTS: ' + path + ' changed since generation — regenerate this file')",
    '  }',
    '})',
    '',
    audit,
    '',
    "test('[' + ROW + '] adapter observes the product, not the model', () => {",
    `  const findings = auditAdapterSource(readFileSync(new URL(${JSON.stringify(
      adapterImport,
    )}, import.meta.url), 'utf8'))`,
    "  assert.deepEqual(findings, [], 'ADAPTER_SUSPECT: ' + JSON.stringify(findings))",
    '})',
    '',
  ]
}

/** 생성 테스트가 부를 컴파일된 모델을 쓰고, 원본 파일들과 그 모델의 digest 목록을 돌려준다. */
async function writeModel({ model, bin, timeoutMs, outDir, modelFile }) {
  const entry = resolve(model)
  const { source, inputs } = await compileBend({ entry, bin, timeoutMs })
  const text = `// AUTO-GENERATED by frontend-oracle-design from ${basename(entry)} (bend -o) — DO NOT EDIT.\n${source}`
  await writeFile(join(outDir, modelFile), text)
  return {
    inputs,
    sources: [
      ...inputs.map(({ path, sha256: digest }) => ({ path: toImport(relative(outDir, path)), sha256: digest })),
      { path: `./${modelFile}`, sha256: sha256(text) },
    ],
  }
}

function checkCommon({ row, runner, runs, adapter, environment, caseTimeout }) {
  if (!/^O\d+$/.test(row ?? '')) throw new CliError('USAGE', 'row must be the conformance O* row, e.g. O4', 2)
  if (!RUNNERS[runner]) throw new CliError('USAGE', `runner must be ${Object.keys(RUNNERS).join(' | ')}`, 2)
  // JSX는 node --test가 실행하지 못한다. 환경 주석도 vitest만 읽는다.
  if (/\.[jt]sx$/.test(adapter ?? '') && runner !== 'vitest')
    throw new CliError('USAGE', `${basename(adapter)} is JSX — pass --runner vitest`, 2)
  if (environment !== undefined && (runner !== 'vitest' || !/^[\w-]+$/.test(environment)))
    throw new CliError('USAGE', 'environment needs --runner vitest and a name such as jsdom or happy-dom', 2)
  if (!Number.isInteger(caseTimeout) || caseTimeout < 1)
    throw new CliError('USAGE', 'case-timeout must be a positive integer of milliseconds', 2)
  // 필수 검증 스택: 양수 횟수의 fast-check 표본은 작은·전수 도메인에서도 빠지지 않는다 — 0이나 생략은 받지 않는다.
  if (!Number.isInteger(runs) || runs < 1)
    throw new CliError(
      'SAMPLING_REQUIRED',
      'runs must be a positive integer — the mandatory stack requires positive-count fast-check sampling; exhaustive cases alone do not satisfy it',
      2,
    )
}

/** bound 길이의 trace 가운데 환경이 사건을 더 허용하는 것이 있는지 — 없으면 bound 너머 표본은 존재할 수 없다. */
function beyondBoundReachable(model, space) {
  const listOf = (items) => items.reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' })
  return space.cases.some((entry) => {
    if (entry.trace.length < space.bound) return false
    const raw = []
    let allowed = model.next(listOf(raw))
    for (const event of entry.trace) {
      for (let cursor = allowed; cursor?.$ === 'Con'; cursor = cursor.tail) {
        if (JSON.stringify(toPlain(cursor.head)) === JSON.stringify(event)) {
          raw.push(cursor.head)
          break
        }
      }
      allowed = model.next(listOf(raw))
    }
    return allowed?.$ === 'Con'
  })
}

// 같은 공간이면 같은 표본이다 — seed는 공간 digest에서 나온다. 실행마다 다른 표본을 원하면 다시 생성한다.
const seedOf = (digest) => Number.parseInt(digest.slice(0, 8), 16) % 2_147_483_647

/**
 * trace 모드(차분): bound 안의 모든 trace는 각 prefix의 기대 관측과 함께 데이터로, bound 밖은 선택적으로 fast-check
 * 표본이다. 표본은 선택 인덱스만 만들고 사건은 모델 환경 `next(history)`가 허용하는 것에서 고른다 — 모델이 불가능하다고
 * 한 순서는 생성되지 않고, shrink는 더 짧고 앞선 선택의 trace가 된다. 공간이 예산 안에서 완결되지 않으면 쓰지 않는다.
 */
export async function emitTrace(options) {
  const {
    model,
    prefix,
    bound,
    adapter,
    out,
    row,
    runs,
    maxLength,
    runner = 'node-test',
    environment,
    caseTimeout = CASE_TIMEOUT,
    name,
    bin,
    timeoutMs,
    maxCases,
    regenerate,
  } = options
  checkCommon({ row, runner, runs, adapter, environment, caseTimeout })
  await assertAdapterTrusted(adapter)
  const loaded = await loadModel({ model, prefix, bin, timeoutMs })
  const space = enumerateSpace(loaded, { bound, ...(maxCases ? { maxCases } : {}) })
  if (!space.complete) {
    throw new CliError(
      'SPACE_INCOMPLETE',
      `the space stopped at ${space.cases.length} cases — raise max-cases or lower the bound`,
    )
  }
  const longest = maxLength ?? bound * 2
  if (!Number.isInteger(longest) || longest <= bound)
    throw new CliError('USAGE', 'max-length must be an integer above the bound', 2)
  const outDir = resolve(out)
  await mkdir(outDir, { recursive: true })
  const base = name ?? prefix.toLowerCase()
  const modelFile = `${base}.model.mjs`
  const testFile = `${base}.oracle.test.mjs`
  const { sources } = await writeModel({ model, bin, timeoutMs, outDir, modelFile })
  const seed = seedOf(space.spaceDigest)
  const sampled = true
  const beyond = beyondBoundReachable(loaded, space)
  const scope = `exhaustive over the ${space.cases.length} traces up to ${
    space.bound
  } events and sampled (fast-check, ${runs} runs, seed ${seed}, drawn lengths ${space.bound + 1}..${longest}; ${
    beyond
      ? 'executed lengths are reported and at least one must pass the bound'
      : 'the environment ends every trace within the bound, so no sample can pass it'
  })`
  const lines = [
    ...header({
      mode: 'trace',
      prefix,
      regenerate,
      scope,
      runner,
      environment,
      caseTimeout,
      sampled,
      adapterImport: toImport(relative(outDir, resolve(adapter))),
      modelFile,
      sources,
      row,
    }),
    `const INITIAL = ${JSON.stringify(space.initial)}`,
    `const CASES = ${JSON.stringify(
      space.cases.map(({ id, label, trace, observations }) => ({ id, label, trace, observations })),
    )}`,
    eventLabel.toString(),
    '',
    '// 기대값은 모델이 동기로 계산했다. await는 제품 쪽 adapter 호출에만 붙고, dispose는 실패해도 다음 case 전에 돈다.',
    'async function drive(trace, expected) {',
    "  let state = await within(adapter.init(), 'init')",
    '  try {',
    "    assert.deepEqual(await within(adapter.observe(state), 'initial observe'), INITIAL, 'initial observation')",
    '    for (const [index, event] of trace.entries()) {',
    "      const where = 'step ' + (index + 1) + ' (' + eventLabel(event) + ') of ' + trace.map(eventLabel).join(' · ')",
    '      state = await within(adapter.step(state, structuredClone(event)), where)',
    '      assert.deepEqual(await within(adapter.observe(state), where), expected[index], where)',
    '    }',
    '  } finally {',
    "    if (adapter.dispose) await within(adapter.dispose(state), 'dispose')",
    '  }',
    '}',
    '',
    'for (const entry of CASES) {',
    "  test('[' + ROW + '] [' + entry.id + '] ' + entry.label, UNLIMITED, () => drive(entry.trace, entry.observations))",
    '}',
  ]
  if (sampled) {
    lines.push(
      '',
      `const RUNS = ${runs}`,
      `const BOUND = ${space.bound}`,
      `const BEYOND_REACHABLE = ${beyond}`,
      'function allowed(raw) {',
      '  const items = []',
      "  for (let cursor = call('next', raw.reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' })); cursor?.$ === 'Con'; cursor = cursor.tail) items.push(cursor.head)",
      '  return items',
      '}',
      '',
      '// 선택 인덱스는 0..2^31-1이다 — 고정된 작은 범위를 modulo하면 그보다 많은 선택지 가운데 일부가 영원히 뽑히지 않는다.',
      '// 실제로 실행한 길이를 센다: 뽑은 배열이 bound보다 길어도 환경이 일찍 끝나면 bound 밖을 검사한 것이 아니다.',
      "test('[' + ROW + '] sampled traces (fast-check)', UNLIMITED, async () => {",
      '  const lengths = []',
      '  await fc.assert(',
      `    fc.asyncProperty(fc.array(fc.nat(), { minLength: ${
        space.bound + 1
      }, maxLength: ${longest} }), async (indices) => {`,
      '      const raw = []',
      '      for (const index of indices) {',
      '        const choices = allowed(raw)',
      '        if (choices.length === 0) break',
      '        raw.push(choices[index % choices.length])',
      '      }',
      '      lengths.push(raw.length)',
      "      let state = call('init')",
      "      const expected = raw.map((event) => toPlain(call('observe', (state = call('step', state, event)))))",
      '      await drive(raw.map(toPlain), expected)',
      '    }),',
      `    { numRuns: RUNS, seed: ${seed} },`,
      '  )',
      '  const beyond = lengths.filter((length) => length > BOUND).length',
      `  console.log(JSON.stringify({ fastCheck: { row: ROW, requested: RUNS, executed: lengths.length, beyondBound: beyond, longest: Math.max(...lengths), seed: ${seed} } }))`,
      "  assert.ok(lengths.length >= RUNS, 'fast-check executed ' + lengths.length + ' of ' + RUNS + ' requested runs')",
      "  if (BEYOND_REACHABLE) assert.ok(beyond > 0, 'no sampled trace passed the bound — the sampled claim beyond the bound would be false')",
      '})',
    )
  }
  await writeFile(join(outDir, testFile), `${lines.join('\n')}\n`)
  return {
    files: [join(outDir, modelFile), join(outDir, testFile)],
    spaceDigest: space.spaceDigest,
    verification: { ...conformanceClaim(space, runs, seed), beyondBoundReachable: beyond },
  }
}

/**
 * state 모드(성질 + 선택적 차분): 상태 타입×명령 타입의 도메인에서 adapter가 concretize → step → project 한 결과를
 * 컴파일된 관계 def `<Prefix>.<R>(s, c, t)`로 판정한다. 관계는 LAWS.bend가 모델에 대해 증명한 바로 그 def다.
 * 도메인이 threshold 이하면 전부를 돌리고, 어느 경우든 양수 횟수의 fast-check 표본을 함께 돌린다. 왕복 `project(concretize(s)) == s`도 매번 검사한다.
 */
export async function emitState(options) {
  const {
    model,
    prefix,
    stateType,
    commandType,
    relations = [],
    differential = false,
    adapter,
    out,
    row,
    runs,
    threshold = EXHAUSTIVE_THRESHOLD,
    natMax,
    listMax,
    runner = 'node-test',
    environment,
    caseTimeout = CASE_TIMEOUT,
    name,
    bin,
    timeoutMs,
    regenerate,
  } = options
  checkCommon({ row, runner, runs, adapter, environment, caseTimeout })
  await assertAdapterTrusted(adapter)
  if (relations.length === 0 && !differential)
    throw new CliError('USAGE', 'name at least one --relation or pass --differential', 2)
  const text = await readFile(resolve(model), 'utf8')
  const types = parseBendTypes(text)
  const bounds = {
    ...(natMax === undefined ? {} : { nat: natMax }),
    ...(listMax === undefined ? {} : { list: listMax }),
  }
  let stateIR
  let commandIR
  try {
    stateIR = typeIR(stateType, types, bounds)
    commandIR = typeIR(commandType, types, bounds)
  } catch (error) {
    throw new CliError('TYPE_UNSUPPORTED', error.message)
  }
  for (const relation of relations) {
    const signature = defSignature(text, `${prefix}.${relation}`)
    if (signature?.params.length !== 3 || signature.returns !== 'Bool') {
      throw new CliError(
        'RELATION_INVALID',
        `${prefix}.${relation} must be def ${prefix}.${relation}(s: ${stateType}, c: ${commandType}, t: ${stateType}) -> Bool in ${basename(
          model,
        )}`,
      )
    }
  }
  if (differential && !defSignature(text, `${prefix}.step`))
    throw new CliError('RELATION_INVALID', `--differential needs def ${prefix}.step`)

  const domain = cardinality(stateIR) * cardinality(commandIR)
  const exhaustive = domain <= threshold
  if (domain === Infinity)
    throw new CliError(
      'SAMPLING_BOUND_REQUIRED',
      `${stateType}×${commandType} has an unbounded Nat or List — pass --nat-max / --list-max; the bound is printed in the sampled scope`,
      2,
    )
  const cases = exhaustive
    ? valuesOf(stateIR).flatMap((state) => valuesOf(commandIR).map((command) => [toPlain(state), toPlain(command)]))
    : []
  const outDir = resolve(out)
  await mkdir(outDir, { recursive: true })
  const base = name ?? prefix.toLowerCase()
  const modelFile = `${base}.model.mjs`
  const testFile = `${base}.oracle.test.mjs`
  const { sources } = await writeModel({ model, bin, timeoutMs, outDir, modelFile })
  const seed = seedOf(sha256(stableStringify({ stateIR, commandIR, relations, sources })))
  const limits = [
    ...(bounds.nat === undefined ? [] : [`Nat ≤ ${bounds.nat}`]),
    ...(bounds.list === undefined ? [] : [`List ≤ ${bounds.list}`]),
  ]
  const sampling = [`${runs} runs`, `seed ${seed}`, ...limits].join(', ')
  const scope = exhaustive
    ? `exhaustive over all ${domain} ${stateType}×${commandType} pairs and sampled over the same domain (fast-check, ${sampling})`
    : `sampled over ${stateType}×${commandType} (fast-check, ${sampling})`
  const lines = [
    ...header({
      mode: 'state',
      prefix,
      regenerate,
      scope,
      runner,
      environment,
      caseTimeout,
      sampled: true,
      adapterImport: toImport(relative(outDir, resolve(adapter))),
      modelFile,
      sources,
      row,
    }),
    `const STATE = ${JSON.stringify(stateIR)}`,
    `const COMMAND = ${JSON.stringify(commandIR)}`,
    `const RELATIONS = ${JSON.stringify(relations)}`,
    `const DIFFERENTIAL = ${differential}`,
    toRuntime.toString(),
    eventLabel.toString(),
    arbitraryOf.toString(),
    '',
    '// state와 command는 Bend 런타임 값이다. adapter는 plain 값만 본다.',
    'async function check(state, command) {',
    '  const plainState = toPlain(state)',
    '  const plainCommand = toPlain(command)',
    '  const where = eventLabel(plainState) + " · " + eventLabel(plainCommand)',
    "  let concrete = await within(adapter.concretize(structuredClone(plainState)), 'concretize ' + where)",
    '  try {',
    "    const projected = await within(adapter.project(concrete), 'project ' + where)",
    "    assert.deepEqual(projected, plainState, 'adapter round trip project(concretize(s)) differs at ' + where)",
    "    concrete = await within(adapter.step(concrete, structuredClone(plainCommand)), 'step ' + where)",
    "    const result = toRuntime(await within(adapter.project(concrete), 'project ' + where), STATE, 'project(step(...))')",
    '    for (const relation of RELATIONS) {',
    "      assert.equal(call(relation, state, command, result), true, relation + ' violated at ' + where + ' → ' + eventLabel(toPlain(result)))",
    '    }',
    "    if (DIFFERENTIAL) assert.deepEqual(toPlain(result), toPlain(call('step', state, command)), 'differs from the model at ' + where)",
    '  } finally {',
    "    if (adapter.dispose) await within(adapter.dispose(concrete), 'dispose ' + where)",
    '  }',
    '}',
    '',
  ]
  if (exhaustive) {
    lines.push(
      `const CASES = ${JSON.stringify(cases)}`,
      'for (const [state, command] of CASES) {',
      "  const id = 'S' + createHash('sha256').update(JSON.stringify([state, command])).digest('hex').slice(0, 12)",
      "  test('[' + ROW + '] [' + id + '] ' + eventLabel(state) + ' · ' + eventLabel(command), UNLIMITED, () =>",
      "    check(toRuntime(state, STATE, 'state'), toRuntime(command, COMMAND, 'command')),",
      '  )',
      '}',
    )
  }
  // 전수 도메인에서도 양수 횟수의 fast-check 표본을 따로 돌린다 — 전수가 있다고 표본 의무가 사라지지 않고, 표본은
  // 실제로 실행된 횟수를 센다(요청한 --runs가 아니라).
  lines.push(
    "test('[' + ROW + '] sampled " + `${stateType}×${commandType}` + " pairs (fast-check)', UNLIMITED, async () => {",
    '  let executed = 0',
    `  await fc.assert(fc.asyncProperty(arbitraryOf(fc, STATE), arbitraryOf(fc, COMMAND), async (state, command) => { executed += 1; await check(state, command) }), { numRuns: ${runs}, seed: ${seed} })`,
    `  console.log(JSON.stringify({ fastCheck: { row: ROW, requested: ${runs}, executed, seed: ${seed} } }))`,
    `  assert.ok(executed >= ${runs}, 'fast-check executed ' + executed + ' of ${runs} requested runs')`,
    '})',
  )
  await writeFile(join(outDir, testFile), `${lines.join('\n')}\n`)
  return {
    files: [join(outDir, modelFile), join(outDir, testFile)],
    verification: {
      level: 'conformance-tested',
      strategy: exhaustive ? 'exhaustive+sampled' : 'sampled',
      domain,
      ...(exhaustive ? { cases: cases.length } : {}),
      sampled: { runs, seed, bounds },
      relations,
      differential,
      claim: 'the product agrees with the proven relations on the tested pairs; not a proof about the implementation',
    },
  }
}

/** 생성 테스트의 drive와 같은 순서로 adapter를 돌려 [초기 관측, 각 단계 뒤 관측...]을 모은다. 비동기 adapter도 받는다. */
async function observeTrace(adapter, trace) {
  let state = await adapter.init()
  try {
    const observed = [await adapter.observe(state)]
    for (const event of trace) {
      state = await adapter.step(state, structuredClone(event))
      observed.push(await adapter.observe(state))
    }
    return observed
  } finally {
    if (adapter.dispose) await adapter.dispose(state)
  }
}

/**
 * 런타임 반례 한 건 → 분류 + 커널 재확인. 기대 관측(또는 그 시점의 허용 사건 목록)을 Bend law로 써서
 * `bend --verdict`가 계산으로 확인하게 한다: 컴파일된 JS가 커널과 다르게 계산했다면 여기서 드러난다.
 */
export async function replay({ model, prefix, trace, observed = null, adapter = null, bin, timeoutMs, out = null }) {
  const loaded = await loadModel({ model, prefix, bin, timeoutMs })
  let seen = observed
  if (seen === null && adapter) {
    try {
      seen = await observeTrace(adapter, trace)
    } catch (error) {
      return { verdict: 'adapter-error', error: error?.message ?? String(error), closed: false }
    }
  }
  const result = classifyTrace(loaded, trace, seen)
  const certification = await certifyReplay({ model, prefix, trace, result, bin, timeoutMs })
  // 닫힘: 반례가 공간 안에서 재현되고 모델이 판정한다(제품 결함이거나, 명세상 맞는 동작이거나).
  const outcome = { ...result, trace, observed: seen, closed: result.verdict !== 'outside-space', certification }
  if (!out) return outcome
  // 반례 기록 — trace·관측·분류·커널 법칙. 회귀 사례와 escape 기록의 근거가 된다.
  const kept = await keepArtifact({
    out,
    fileName: 'REPLAY.bend',
    entry: model,
    render: (importPath) => replayFile(importPath, certification.law ?? null),
    result: outcome,
  })
  return { ...outcome, artifacts: kept }
}

function replayFile(importPath, law) {
  const header =
    '# Generated by oracle-projection.mjs replay — DO NOT EDIT. Re-check with `bend REPLAY.bend --verdict`.\n'
  if (!law) return `${header}# nothing to certify for this verdict\nimport Base\nimport ${importPath} as M\n`
  return `${header}import Base\nimport ${importPath} as M\n\nlaw replay_claim:\n  ${law}\n\ndef replay_claim():\n  {==}\n`
}

async function certifyReplay({ model, prefix, trace, result, bin, timeoutMs }) {
  const entry = resolve(model)
  const text = await readFile(entry, 'utf8')
  const types = parseBendTypes(text)
  const step = defSignature(text, `${prefix}.step`)
  const observe = defSignature(text, `${prefix}.observe`)
  let eventIR
  let observationIR
  try {
    eventIR = typeIR(step?.params[1]?.type ?? '', types)
    observationIR = typeIR(observe?.returns ?? '', types)
  } catch (error) {
    return { status: 'not-run', reason: `cannot render values as Bend: ${error.message}` }
  }
  const events = (result.verdict === 'outside-space' ? trace.slice(0, result.step - 1) : trace).map((event) =>
    bendLiteral(event, eventIR),
  )
  let law
  if (result.verdict === 'outside-space') {
    const allowed = result.allowed.map((event) => bendLiteral(event, eventIR)).join(', ')
    law = `{M.${prefix}.next([${events.join(', ')}]) == [${allowed}] : List<${bendTypeName(eventIR)}>}`
  } else if (result.verdict === 'implementation-defect' || result.verdict === 'model-agrees') {
    const upTo = result.verdict === 'implementation-defect' ? result.step : trace.length
    const expected = result.verdict === 'implementation-defect' ? result.expected : result.expected.at(-1)
    const state = events
      .slice(0, upTo)
      .reduce((inner, event) => `M.${prefix}.step(${inner}, ${event})`, `M.${prefix}.init()`)
    law = `{M.${prefix}.observe(${state}) == ${bendLiteral(expected, observationIR)} : ${bendTypeName(observationIR)}}`
  } else {
    return { status: 'not-run', reason: `nothing to certify for ${result.verdict}` }
  }
  const file = replayFile(`./${basename(entry)}`, law)
  const verdict = await verdictBeside({
    entry,
    inputs: await bendInputs(entry),
    fileName: 'REPLAY.bend',
    text: file,
    bin,
    timeoutMs,
  })
  return { ...verdict, law }
}

function parseOptions(args) {
  const options = { relation: [] }
  const flags = new Set(['differential'])
  const known = [
    'model',
    'prefix',
    'bound',
    'adapter',
    'out',
    'row',
    'runs',
    'max-length',
    'runner',
    'name',
    'max-cases',
    'state',
    'command',
    'relation',
    'threshold',
    'nat-max',
    'list-max',
    'trace',
    'observed',
    'timeout-ms',
    'environment',
    'case-timeout',
  ]
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]?.replace(/^--/, '')
    if (flags.has(name)) {
      options[name] = true
      continue
    }
    const value = args[index + 1]
    if (!known.includes(name) || value === undefined)
      throw new CliError('USAGE', `Unknown or incomplete option: ${args[index]}`, 2)
    if (name === 'relation') options.relation.push(value)
    else options[name] = value
    index += 1
  }
  return options
}

const USAGE = `usage:
  oracle-projection.mjs emit-trace --model <MODEL.bend> --prefix <Name> --bound <n> --adapter <adapter.mjs> --out <dir> --row <O*> --runs <n> [--max-length <n>] [--runner node-test|vitest] [--environment <jsdom>] [--case-timeout <ms>] [--name <base>]
  oracle-projection.mjs emit-state --model <MODEL.bend> --prefix <Name> --state <Type> --command <Type> --adapter <adapter.mjs> --out <dir> --row <O*> (--relation <def>)... --runs <n> [--differential] [--threshold <n>] [--nat-max <n>] [--list-max <n>] [--runner node-test|vitest] [--environment <jsdom>] [--case-timeout <ms>]
  oracle-projection.mjs replay --model <MODEL.bend> --prefix <Name> --trace <json> [--observed <json> | --adapter <adapter.mjs>] [--out <dir>]`

const integer = (value) => (value === undefined ? undefined : Number(value))

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!['emit-trace', 'emit-state', 'replay'].includes(command)) throw new CliError('USAGE', USAGE, 2)
  const options = parseOptions(args)
  if (!options.model || !options.prefix) throw new CliError('USAGE', USAGE, 2)
  const { bin } = await ensureBend()
  const timeoutMs = integer(options['timeout-ms'])
  const regenerate = `node oracle-projection.mjs ${[command, ...args].join(' ')}`
  let result
  if (command === 'emit-trace') {
    if (!options.bound || !options.adapter || !options.out) throw new CliError('USAGE', USAGE, 2)
    result = await emitTrace({
      ...options,
      bound: Number(options.bound),
      runs: integer(options.runs),
      maxLength: integer(options['max-length']),
      maxCases: integer(options['max-cases']),
      caseTimeout: integer(options['case-timeout']) ?? CASE_TIMEOUT,
      bin,
      timeoutMs,
      regenerate,
    })
  } else if (command === 'emit-state') {
    if (!options.state || !options.command || !options.adapter || !options.out) throw new CliError('USAGE', USAGE, 2)
    result = await emitState({
      ...options,
      stateType: options.state,
      commandType: options.command,
      relations: options.relation,
      differential: Boolean(options.differential),
      runs: integer(options.runs),
      threshold: integer(options.threshold) ?? EXHAUSTIVE_THRESHOLD,
      natMax: integer(options['nat-max']),
      listMax: integer(options['list-max']),
      caseTimeout: integer(options['case-timeout']) ?? CASE_TIMEOUT,
      bin,
      timeoutMs,
      regenerate,
    })
  } else {
    if (!options.trace) throw new CliError('USAGE', USAGE, 2)
    // replay의 --out은 반례 기록 디렉터리다(emit의 --out과 같은 이름, 다른 산출물).
    const adapter = options.adapter ? await import(pathToFileURL(resolve(options.adapter)).href) : null
    result = await replay({
      model: options.model,
      prefix: options.prefix,
      trace: JSON.parse(options.trace),
      observed: options.observed ? JSON.parse(options.observed) : null,
      adapter,
      bin,
      timeoutMs,
      out: options.out ?? null,
    })
  }
  process.stdout.write(`${JSON.stringify(result)}\n`)
  if (command === 'replay')
    process.exitCode = result.certification?.status === 'proven' || result.certification?.status === 'not-run' ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    const cliError =
      error instanceof CliError
        ? error
        : new CliError(error.code ?? 'PROJECTION_FAILED', error.message ?? String(error))
    process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
    process.exitCode = cliError.exitCode
  }
}
