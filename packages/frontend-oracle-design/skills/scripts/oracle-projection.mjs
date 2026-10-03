#!/usr/bin/env node

// Formal Oracle Projection — 증명된 Bend 모델을 실제 구현을 공격하는 테스트로 투영한다. 입력 공간은 Bend 타입에서,
// 기대값은 컴파일된 모델에서, 판정식은 컴파일된 관계 def에서 나온다: 법칙을 TS로 옮겨 적은 두 번째 의미가 없다.
// 사람이 쓰는 경계는 adapter 하나다. 생성 테스트의 통과는 구현의 대응 증거이지 증명이 아니다.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, posix, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { ensureBend } from './ensure-bend.mjs'
import { evaluateWorlds, loadWorld } from './oracle-adequacy.mjs'
import { runCli } from './oracle-cli.mjs'
import { perturbations, spaceCrossCheck } from './oracle-discovery.mjs'
import { sha256, stableStringify } from './oracle-fs.mjs'
import {
  bendInputs,
  classifyTrace,
  compileBend,
  conformanceClaim,
  enumerateSpace,
  eventLabel,
  keepArtifact,
  leaves,
  loadModel,
  minimalCover,
  verdictBeside,
} from './oracle-model.mjs'
import { loadPackage, sourcePath } from './oracle-package.mjs'
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
  // world 모드는 컴파일된 모델을 싣지 않는다 — 기대값은 생성할 때 세계 def로 계산한 데이터다
  const proven = modelFile
    ? `// Model ${prefix}. The laws are proven about the model (\`oracle-model.mjs prove\`); this file is conformance`
    : `// World ${prefix}. The adequacy checks are proven about the world (\`oracle-adequacy.mjs check\`); this file is conformance`
  return [
    ...(environment ? [`// @vitest-environment ${environment}`] : []),
    `// AUTO-GENERATED by frontend-oracle-design \`oracle-projection.mjs emit-${mode}\` (Formal Oracle Projection) — DO NOT EDIT.`,
    `// Regenerate: ${regenerate}`,
    proven,
    `// evidence for the implementation, ${scope}. Passing it is not a proof about the implementation.`,
    '',
    "import assert from 'node:assert/strict'",
    "import { createHash } from 'node:crypto'",
    "import { readFileSync } from 'node:fs'",
    RUNNERS[runner],
    ...(sampled ? ["import fc from 'fast-check'"] : []),
    `import * as adapter from ${JSON.stringify(adapterImport)}`,
    ...(modelFile ? [`import model from ${JSON.stringify(['.', modelFile].join('/'))}`] : []),
    '',
    `const ROW = ${JSON.stringify(row)}`,
    `const PREFIX = ${JSON.stringify(prefix)}`,
    `const SOURCES = ${JSON.stringify(sources)}`,
    ...(modelFile
      ? [
          'const call = (name, ...args) => model[PREFIX + "." + name](...args.map((argument) => structuredClone(argument)))',
          toPlain.toString(),
        ]
      : []),
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
  checkHarness({ row, runner, adapter, environment, caseTimeout })
  // 필수 검증 스택: 양수 횟수의 fast-check 표본은 작은·전수 도메인에서도 빠지지 않는다 — 0이나 생략은 받지 않는다.
  if (!Number.isInteger(runs) || runs < 1)
    throw new CliError(
      'SAMPLING_REQUIRED',
      'runs must be a positive integer — the mandatory stack requires positive-count fast-check sampling; exhaustive cases alone do not satisfy it',
      2,
    )
}

function checkHarness({ row, runner, adapter, environment, caseTimeout }) {
  if (!/^O\d+$/.test(row ?? '')) throw new CliError('USAGE', 'row must be the conformance O* row, e.g. O4', 2)
  if (!RUNNERS[runner]) throw new CliError('USAGE', `runner must be ${Object.keys(RUNNERS).join(' | ')}`, 2)
  // JSX는 node --test가 실행하지 못한다. 환경 주석도 vitest만 읽는다.
  if (/\.[jt]sx$/.test(adapter ?? '') && runner !== 'vitest')
    throw new CliError('USAGE', `${basename(adapter)} is JSX — pass --runner vitest`, 2)
  if (environment !== undefined && (runner !== 'vitest' || !/^[\w-]+$/.test(environment)))
    throw new CliError('USAGE', 'environment needs --runner vitest and a name such as jsdom or happy-dom', 2)
  if (!Number.isInteger(caseTimeout) || caseTimeout < 1)
    throw new CliError('USAGE', 'case-timeout must be a positive integer of milliseconds', 2)
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

/**
 * world 모드: 행동 모델이 없는 카드의 제품 테스트. 세계 모델이 가능하다고 한 좌표 설정마다 제품을 한 번 돌리고(가정이 뺀
 * 설정은 돌리지 않는다), 관찰값이 그 설정에서 카드 행이 모두 참인 세계의 관찰인지 본다. 허용 관찰과 위반 행은 생성할 때
 * 컴파일된 세계 def로 계산해 데이터로 싣는다 — 테스트에 두 번째 의미가 없고, 제품 CI는 Bend 없이 돈다.
 */
export async function emitWorld(options) {
  const {
    card,
    package: packagePath,
    cwd = process.cwd(),
    adapter,
    out,
    row,
    runner = 'node-test',
    environment,
    caseTimeout = CASE_TIMEOUT,
    name,
    bin,
    timeoutMs,
    regenerate,
  } = options
  checkHarness({ row, runner, adapter, environment, caseTimeout })
  await assertAdapterTrusted(adapter)
  const loaded = await loadWorld({ card, package: packagePath, bin, cwd, timeoutMs })
  if (loaded.result) throw new CliError('WORLD_UNAVAILABLE', `the world cannot be enumerated: ${loaded.result.reason}`)
  const { spec, model, inputs } = loaded
  const valid = evaluateWorlds(model, spec).filter((world) => world.valid)
  const field = (fieldName) => spec.fields.find((entry) => entry.name === fieldName)
  const literal = (coordinates) =>
    spec.coordinates
      .map((fieldName) => {
        const value = coordinates[fieldName]
        if (typeof value === 'boolean') return value ? fieldName : `!${fieldName}`
        return `${fieldName}=${value}`
      })
      .join(' ')
  const keyOf = (plain) => JSON.stringify(Object.fromEntries(spec.observations.map((fieldName) => [fieldName, plain[fieldName]])))
  let all = [{}]
  for (const fieldName of spec.coordinates)
    all = all.flatMap((partial) => field(fieldName).values.map((value) => ({ ...partial, [fieldName]: value })))
  const settings = []
  let excluded = 0
  for (const coordinates of all) {
    const worlds = valid.filter((world) => spec.coordinates.every((fieldName) => world.plain[fieldName] === coordinates[fieldName]))
    if (worlds.length === 0) {
      excluded += 1
      continue
    }
    const outcomes = new Map()
    for (const world of worlds) {
      const key = keyOf(world.plain)
      const failed = spec.rows.filter((id) => !world.truth[id]).map((def) => spec.rowIds?.[def] ?? def)
      if (outcomes.has(key) && outcomes.get(key).join() !== failed.join())
        throw new CliError(
          'WORLD_NOT_OBSERVABLE',
          `${literal(coordinates)}: the rows are not a function of the coordinates and observations — run the adequacy check (card-observable) first`,
        )
      outcomes.set(key, failed)
    }
    const sorted = [...outcomes].sort(([left], [right]) => (left < right ? -1 : Number(left > right)))
    settings.push({
      id: `W${sha256(stableStringify(coordinates)).slice(0, 12)}`,
      label: literal(coordinates),
      coordinates,
      allowed: sorted.filter(([, failed]) => failed.length === 0).map(([key]) => key),
      violations: Object.fromEntries(sorted.filter(([, failed]) => failed.length > 0)),
    })
  }
  const outDir = resolve(out)
  await mkdir(outDir, { recursive: true })
  const testFile = `${name ?? spec.prefix.toLowerCase()}.world.test.mjs`
  // 기대값은 세계 파일과, 행·가정·용어를 정한 카드나 패키지에서 나온다 — 어느 쪽이 바뀌어도 이 파일은 낡았다
  const meaning = resolve(cwd, card ?? packagePath)
  const sources = [
    ...inputs.map(({ path, sha256: digest }) => ({ path: toImport(relative(outDir, path)), sha256: digest })),
    { path: toImport(relative(outDir, meaning)), sha256: sha256(await readFile(meaning, 'utf8')) },
  ]
  const scope = `exhaustive over the ${settings.length} coordinate settings the assumptions allow (${excluded} excluded)`
  const lines = [
    ...header({
      mode: 'world',
      prefix: spec.prefix,
      regenerate,
      scope,
      runner,
      environment,
      caseTimeout,
      sampled: false,
      adapterImport: toImport(relative(outDir, resolve(adapter))),
      modelFile: null,
      sources,
      row,
    }),
    `const OBSERVATIONS = ${JSON.stringify(spec.observations)}`,
    `const SETTINGS = ${JSON.stringify(settings)}`,
    '',
    '// 허용 관찰은 그 설정에서 카드 행이 모두 참인 세계의 관찰이다. 위반 행이 있는 관찰은 그 행을, 세계에 없는 관찰은 MODEL_GAP을 말한다.',
    'for (const setting of SETTINGS) {',
    "  test('[' + ROW + '] [' + setting.id + '] ' + setting.label, UNLIMITED, async () => {",
    '    let observed',
    '    try {',
    "      observed = await within(adapter.run(structuredClone(setting.coordinates)), 'run ' + setting.label)",
    '    } finally {',
    "      if (adapter.dispose) await within(adapter.dispose(), 'dispose ' + setting.label)",
    '    }',
    '    const key = JSON.stringify(Object.fromEntries(OBSERVATIONS.map((name) => [name, observed?.[name]])))',
    '    if (setting.allowed.includes(key)) return',
    '    const rows = setting.violations[key]',
    '    assert.fail(',
    '      rows',
    "        ? 'violates ' + rows.join(', ') + ' at ' + setting.label + ': observed ' + key",
    "        : 'MODEL_GAP at ' + setting.label + ': the world allows no ' + key + ' — reopen the problem definition, never force it into the nearest world',",
    '    )',
    '  })',
    '}',
  ]
  await writeFile(join(outDir, testFile), `${lines.join('\n')}\n`)
  return {
    files: [join(outDir, testFile)],
    verification: {
      level: 'conformance-tested',
      strategy: 'exhaustive',
      settings: settings.length,
      excluded,
      claim:
        'the product satisfies every row on every coordinate setting the assumptions allow; with card-implies-goal proven, the goals follow only while the assumptions hold and the observation paths are faithful — not a proof about the product',
    },
  }
}

// 같은 공간이면 같은 표본이다 — seed는 공간 digest에서 나온다. 실행마다 다른 표본을 원하면 다시 생성한다.
const seedOf = (digest) => Number.parseInt(digest.slice(0, 8), 16) % 2_147_483_647

/**
 * trace 모드의 입력 — `--model --prefix --bound` 그대로이거나, 패키지에서 읽는다. 패키지(버전 2, crossCheck)가 있으면
 * space-cross-check가 고른 결합 케이스(세계 설정 × trace)를 함께 싣는다.
 */
async function traceInputs({ package: packagePath, cwd = process.cwd(), model, prefix, bound, bin, timeoutMs }) {
  if (!packagePath) return { model, prefix, bound, joint: null, jointSources: [] }
  const loaded = await loadPackage(packagePath, { root: cwd })
  const { pkg } = loaded
  if (!pkg.behavior)
    throw new CliError('USAGE', 'the package has no behavior model — project its world with emit-world instead', 2)
  const cross = await spaceCrossCheck({ loaded, bin, timeoutMs })
  const joint = cross.status === 'run' ? cross.joint : null
  const declared = pkg.crossCheck ? sourcePath(loaded, pkg.crossCheck.declared ?? pkg.spaceDiscovery) : null
  return {
    model: sourcePath(loaded, pkg.behavior.model),
    prefix: pkg.behavior.prefix,
    bound: pkg.behavior.bound,
    joint,
    jointSources: joint ? [loaded.path, declared, sourcePath(loaded, pkg.world.source)].filter(Boolean) : [],
  }
}

export const BUGS_FILE = 'BUGS.json'
const MAX_PROBES = 8

/**
 * MODEL.bend 옆의 BUGS.json — 실제로 일어난 버그의 trace를 사람이 적어 둔 원천. 기대값은 적지 않는다: 생성할 때마다 지금 모델이
 * 계산하므로 정책이 바뀌어도 낡은 값이 남지 않는다. 지금 환경이 허용하지 않는 trace는 조용히 버리지 않고 생성을 멈춘다.
 */
async function bugCases(model, path, outDir) {
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return { cases: [], sources: [] }
    throw error
  }
  let entries
  try {
    entries = JSON.parse(text)
  } catch (error) {
    throw new CliError('BUGS_INVALID', `${BUGS_FILE} is not JSON: ${error.message}`)
  }
  if (!Array.isArray(entries)) throw new CliError('BUGS_INVALID', `${BUGS_FILE} must be an array of { id, trace }`)
  const seen = new Set()
  const cases = entries.map((entry, index) => {
    if (!/^B\d+$/.test(entry?.id ?? '') || seen.has(entry.id) || !Array.isArray(entry.trace) || entry.trace.length === 0)
      throw new CliError('BUGS_INVALID', `${BUGS_FILE}[${index}] needs a unique id B<n> and a non-empty trace`)
    seen.add(entry.id)
    const verdict = classifyTrace(model, entry.trace)
    if (verdict.verdict === 'outside-space')
      throw new CliError(
        'BUG_OUTSIDE_SPACE',
        `${entry.id}: step ${verdict.step} is not allowed by the model's environment — reopen the problem definition or remove the entry; never drop it silently`,
      )
    return {
      id: entry.id,
      label: entry.trace.map(eventLabel).join(' · '),
      trace: entry.trace,
      observations: verdict.expected.slice(1),
    }
  })
  return { cases, sources: [{ path: toImport(relative(outDir, path)), sha256: sha256(text) }] }
}

/**
 * trace 모드(차분): bound 안의 모든 trace는 각 prefix의 기대 관측과 함께 데이터로, bound 밖은 선택적으로 fast-check
 * 표본이다. 표본은 선택 인덱스만 만들고 사건은 모델 환경 `next(history)`가 허용하는 것에서 고른다 — 모델이 불가능하다고
 * 한 순서는 생성되지 않고, shrink는 더 짧고 앞선 선택의 trace가 된다. 공간이 예산 안에서 완결되지 않으면 쓰지 않는다.
 */
export async function emitTrace(options) {
  const { model, prefix, bound, joint, jointSources } = await traceInputs(options)
  const {
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
  const jointCases = joint?.cases ?? []
  if (!space.complete) {
    throw new CliError(
      'SPACE_INCOMPLETE',
      `the space stopped at ${space.cases.length} cases — raise max-cases or lower the bound`,
    )
  }
  const longest = maxLength ?? bound * 2
  if (!Number.isInteger(longest) || longest <= bound)
    throw new CliError('USAGE', 'max-length must be an integer above the bound', 2)
  // 제품에는 공간 전체가 아니라 동치류·경계값 항목을 모두 덮는 최소 trace 묶음만 돈다 — 공간 전체는 모델이 이미 열거했다
  const cover = minimalCover(loaded, space)
  const outDir = resolve(out)
  // 버그 기록은 그 버그가 난 모델 옆(MODEL.bend와 같은 폴더)에 둔다
  const bugs = await bugCases(loaded, join(dirname(resolve(model)), BUGS_FILE), outDir)
  // 교란은 환경이 막은 사건이다 — 모델은 기대값을 말하지 않으므로 생성 테스트는 판정하지 않고 보고만 한다
  const probes = perturbations(loaded, { ...space, cases: cover.cases })
    .list.slice(0, MAX_PROBES)
    .map(({ key, trace, leaveAt }) => ({ key, trace, leaveAt }))
  await mkdir(outDir, { recursive: true })
  const base = name ?? prefix.toLowerCase()
  const modelFile = `${base}.model.mjs`
  const testFile = `${base}.oracle.test.mjs`
  const written = await writeModel({ model, bin, timeoutMs, outDir, modelFile })
  // 결합 케이스는 패키지·선언 기록·세계 파일에서 나온다 — 그중 하나가 바뀌면 이 파일은 낡았다
  const extra = await Promise.all(
    jointSources.map(async (path) => ({ path: toImport(relative(outDir, path)), sha256: sha256(await readFile(path, 'utf8')) })),
  )
  const sources = [...written.sources, ...extra, ...bugs.sources]
  const seed = seedOf(space.spaceDigest)
  const sampled = true
  const beyond = beyondBoundReachable(loaded, space)
  // 모델이 연 공간 전체와 제품에 돌린 집합은 다르다 — 앞의 것만 exhaustive다
  const { exhaustive: modelSpace, ...claim } = conformanceClaim(space, runs, seed)
  const coverScope = `a minimum cover of ${cover.cases.length} traces for the ${cover.items} items of ${
    cover.status === 'closed'
      ? `the ${cover.configurations} reachable configurations`
      : `the configurations within ${cover.coveredDepth} events (the state grows without bound)`
  } — ${cover.basis}`
  const jointScope = joint ? `, ${jointCases.length} joint cases on the world settings (${joint.covered}/${joint.required} world × behavior pairs)` : ''
  const scope = `${coverScope}${jointScope} — not every trace of the ${space.cases.length} the model enumerates up to ${
    space.bound
  } events — and sampled (fast-check, ${runs} runs, seed ${seed}, drawn lengths ${space.bound + 1}..${longest}; ${
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
      [...bugs.cases, ...cover.cases, ...jointCases].map(({ id, label, trace, observations, coordinates }) => ({
        id,
        label,
        trace,
        observations,
        ...(coordinates === undefined ? {} : { coordinates }),
      })),
    )}`,
    eventLabel.toString(),
    '',
    '// 기대값은 모델이 동기로 계산했다. await는 제품 쪽 adapter 호출에만 붙고, dispose는 실패해도 다음 case 전에 돈다.',
    '// 결합 케이스는 세계 조건으로 시작한다 — 매개변수가 없는 init은 기본 fixture로 돌아 공허하게 통과할 것이다.',
    'async function drive(trace, expected, coordinates) {',
    '  if (coordinates !== undefined && adapter.init.length < 1)',
    "    throw new Error('ADAPTER_JOINT_UNSUPPORTED: init declares no coordinates parameter (a parameter with a default value is not counted)')",
    "  let state = await within(coordinates === undefined ? adapter.init() : adapter.init(structuredClone(coordinates)), 'init')",
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
    "  test('[' + ROW + '] [' + entry.id + '] ' + entry.label, UNLIMITED, () => drive(entry.trace, entry.observations, entry.coordinates))",
    '}',
  ]
  if (sampled) {
    const kinds = [...new Set([...space.cases, ...cover.cases].flatMap(({ trace }) => trace.map((event) => event.$)))].sort()
    lines.push(
      '',
      `const RUNS = ${runs}`,
      `const FIRST = ${Math.ceil(runs / 2)}`,
      `const BOUND = ${space.bound}`,
      `const BEYOND_REACHABLE = ${beyond}`,
      `const CLASSES = ${JSON.stringify(cover.classes)}`,
      `const ITEMS = ${JSON.stringify(cover.itemList)}`,
      `const EVENT_KINDS = ${JSON.stringify(kinds)}`,
      leaves.toString(),
      'function allowed(raw) {',
      '  const items = []',
      "  for (let cursor = call('next', raw.reduceRight((tail, head) => ({ $: 'Con', head, tail }), { $: 'Nil' })); cursor?.$ === 'Con'; cursor = cursor.tail) items.push(cursor.head)",
      '  return items',
      '}',
      '',
      '// 표본의 매 단계를 최소 묶음과 같은 류로 센다. 이름표에 없는 값(bound 밖에서 처음 나온 값)은 unseen 류다.',
      'function classOf([path, value]) {',
      '  const name = CLASSES[path]?.[JSON.stringify(value)]',
      "  return path + '=' + (name ?? 'unseen:' + JSON.stringify(value))",
      '}',
      'function itemsOfStep(state, event, observation) {',
      "  const states = leaves(toPlain(state), 'state').map(classOf)",
      "  const events = leaves(event, event.$ ?? 'event').map(classOf)",
      "  const observed = leaves(observation, 'observation').map(classOf)",
      "  return [...events, ...observed, ...events.flatMap((left) => states.map((right) => left + ' × ' + right))]",
      '}',
      '',
      '// 두 단계: 1단계는 균등하게 뽑으며 항목별 횟수를 세고, 2단계는 그 횟수를 얼려 덜 밟은 항목을 덮는 사건에 가중치를',
      '// 준다. 가중치는 2단계 안에서 바뀌지 않으므로 같은 입력은 같은 trace다 — shrink가 결정적으로 남는다.',
      '// swarm: 실행마다 쓸 사건 종류의 부분집합도 입력이다. 남은 사건끼리 더 깊이 섞인다. 허용 사건이 모두 빠지면 전부 쓴다.',
      'const hits = new Map()',
      'let frozen = null',
      'function weightOf(state, event) {',
      "  const observation = toPlain(call('observe', call('step', state, event)))",
      '  return itemsOfStep(state, toPlain(event), observation).reduce((sum, item) => sum + 1 / (1 + (frozen.get(item) ?? 0)), 0)',
      '}',
      'function pick(choices, index, state) {',
      '  if (frozen === null) return choices[index % choices.length]',
      '  const scores = choices.map((event) => weightOf(state, event))',
      '  let left = ((index % 1_000_000) / 1_000_000) * scores.reduce((sum, score) => sum + score, 0)',
      '  for (const [position, score] of scores.entries()) {',
      '    left -= score',
      '    if (left < 0) return choices[position]',
      '  }',
      '  return choices.at(-1)',
      '}',
      'const lengths = []',
      'async function sample({ enabled, indices }) {',
      '  const raw = []',
      '  const expected = []',
      "  let state = call('init')",
      '  for (const index of indices) {',
      '    const all = allowed(raw)',
      '    if (all.length === 0) break',
      '    const swarm = all.filter((event) => enabled.includes(event.$) || !EVENT_KINDS.includes(event.$))',
      '    const event = pick(swarm.length > 0 ? swarm : all, index, state)',
      "    const next = call('step', state, event)",
      "    const observation = toPlain(call('observe', next))",
      '    for (const item of itemsOfStep(state, toPlain(event), observation)) hits.set(item, (hits.get(item) ?? 0) + 1)',
      '    raw.push(event)',
      '    expected.push(observation)',
      '    state = next',
      '  }',
      '  lengths.push(raw.length)',
      '  await drive(raw.map(toPlain), expected)',
      '}',
      '',
      '// 선택 인덱스는 0..2^31-1이다 — 고정된 작은 범위를 modulo하면 그보다 많은 선택지 가운데 일부가 영원히 뽑히지 않는다.',
      '// 실제로 실행한 길이를 센다: 뽑은 배열이 bound보다 길어도 환경이 일찍 끝나면 bound 밖을 검사한 것이 아니다.',
      "test('[' + ROW + '] sampled traces (fast-check)', UNLIMITED, async () => {",
      '  const input = fc.record({',
      '    enabled: fc.subarray(EVENT_KINDS, { minLength: 1 }),',
      `    indices: fc.array(fc.nat(), { minLength: ${space.bound + 1}, maxLength: ${longest} }),`,
      '  })',
      `  await fc.assert(fc.asyncProperty(input, sample), { numRuns: FIRST, seed: ${seed} })`,
      '  if (RUNS > FIRST) {',
      '    frozen = new Map(hits)',
      `    await fc.assert(fc.asyncProperty(input, sample), { numRuns: RUNS - FIRST, seed: ${seed + 1} })`,
      '  }',
      '  const beyond = lengths.filter((length) => length > BOUND).length',
      `  console.log(JSON.stringify({ fastCheck: { row: ROW, requested: RUNS, executed: lengths.length, beyondBound: beyond, longest: Math.max(...lengths), seed: ${seed}, stages: [FIRST, RUNS - FIRST] } }))`,
      '  // 커버리지: 0번 밟은 항목, Good-Turing(다음 실행이 못 본 항목을 밟을 확률 ≈ 한 번만 본 항목 수 / 전체 관측 수),',
      '  // 3의 법칙(한 번도 안 나온 사건의 확률은 95% 신뢰도로 3/N 이하). 판정이 아니라 어디가 얇은지 보여 준다.',
      '  const counts = [...hits.values()]',
      '  const total = counts.reduce((sum, count) => sum + count, 0)',
      '  const zero = ITEMS.filter((item) => !hits.has(item))',
      "  const unseen = [...hits.keys()].filter((item) => item.includes('=unseen:'))",
      '  console.log(JSON.stringify({ coverage: { row: ROW, items: ITEMS.length, hit: ITEMS.length - zero.length, zero: zero.slice(0, 20), zeroCount: zero.length, goodTuring: total === 0 ? 1 : counts.filter((count) => count === 1).length / total, ruleOfThree: 3 / lengths.length, unseen: unseen.slice(0, 20) } }))',
      "  assert.ok(lengths.length >= RUNS, 'fast-check executed ' + lengths.length + ' of ' + RUNS + ' requested runs')",
      "  if (BEYOND_REACHABLE) assert.ok(beyond > 0, 'no sampled trace passed the bound — the sampled claim beyond the bound would be false')",
      '})',
    )
  }
  if (probes.length > 0) {
    lines.push(
      '',
      '// 환경이 막은 사건을 끼운 trace — 제품이 무시하는지, 화면을 바꾸는지, 던지는지 보고만 한다. 기대값은 정책이라',
      '// 모델이 말하지 않는다: 바뀐 것은 POLICY_GAP 후보이고 이 테스트는 실패하지 않는다.',
      `const PROBES = ${JSON.stringify(probes)}`,
      "test('[' + ROW + '] outside-environment probes (report only)', UNLIMITED, async () => {",
      '  const found = []',
      '  for (const probe of PROBES) {',
      "    const label = probe.trace.map(eventLabel).join(' · ')",
      "    let state = await within(adapter.init(), 'init')",
      '    try {',
      "      const observed = [await within(adapter.observe(state), 'initial observe')]",
      '      for (const event of probe.trace) {',
      "        state = await within(adapter.step(state, structuredClone(event)), label)",
      '        observed.push(await within(adapter.observe(state), label))',
      '      }',
      '      const changed = JSON.stringify(observed[probe.leaveAt]) !== JSON.stringify(observed[probe.leaveAt + 1])',
      "      found.push({ key: probe.key, trace: label, result: changed ? 'unspecified-behavior' : 'ignored' })",
      '    } catch (error) {',
      "      found.push({ key: probe.key, trace: label, result: 'unhandled-event', error: String(error?.message ?? error) })",
      '    } finally {',
      "      if (adapter.dispose) await within(adapter.dispose(state), 'dispose')",
      '    }',
      '  }',
      '  console.log(JSON.stringify({ outsideEnvironment: { row: ROW, probes: found } }))',
      '})',
    )
  }
  await writeFile(join(outDir, testFile), `${lines.join('\n')}\n`)
  return {
    files: [join(outDir, modelFile), join(outDir, testFile)],
    spaceDigest: space.spaceDigest,
    verification: {
      ...claim,
      modelSpace,
      beyondBoundReachable: beyond,
      cover: {
        status: cover.status,
        configurations: cover.configurations,
        items: cover.items,
        cases: cover.cases.length,
        ...(cover.status === 'capped' ? { coveredDepth: cover.coveredDepth } : {}),
      },
      joint: joint ? { required: joint.required, covered: joint.covered, cases: jointCases.length } : null,
      bugs: bugs.cases.length,
      probes: probes.length,
    },
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
    'card',
    'package',
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
  oracle-projection.mjs emit-trace (--package <oracle.package.json> | --model <MODEL.bend> --prefix <Name> --bound <n>) --adapter <adapter.mjs> --out <dir> --row <O*> --runs <n> [--max-length <n>] [--runner node-test|vitest] [--environment <jsdom>] [--case-timeout <ms>] [--name <base>]
  oracle-projection.mjs emit-state --model <MODEL.bend> --prefix <Name> --state <Type> --command <Type> --adapter <adapter.mjs> --out <dir> --row <O*> (--relation <def>)... --runs <n> [--differential] [--threshold <n>] [--nat-max <n>] [--list-max <n>] [--runner node-test|vitest] [--environment <jsdom>] [--case-timeout <ms>]
  oracle-projection.mjs replay --model <MODEL.bend> --prefix <Name> --trace <json> [--observed <json> | --adapter <adapter.mjs>] [--out <dir>]
  oracle-projection.mjs emit-world (--card <oracle.md> | --package <oracle.package.json>) --adapter <world-adapter.mjs> --out <dir> --row <O*> [--runner node-test|vitest] [--environment <jsdom>] [--case-timeout <ms>] [--name <base>]`

const integer = (value) => (value === undefined ? undefined : Number(value))

async function main() {
  const [command, ...args] = process.argv.slice(2)
  if (!['emit-trace', 'emit-state', 'replay', 'emit-world'].includes(command)) throw new CliError('USAGE', USAGE, 2)
  const options = parseOptions(args)
  const timeoutMs = integer(options['timeout-ms'])
  const regenerate = `node oracle-projection.mjs ${[command, ...args].join(' ')}`
  if (command === 'emit-world') {
    if (Boolean(options.card) === Boolean(options.package) || !options.adapter || !options.out)
      throw new CliError('USAGE', USAGE, 2)
    const { bin } = await ensureBend()
    const result = await emitWorld({
      ...options,
      caseTimeout: integer(options['case-timeout']) ?? CASE_TIMEOUT,
      bin,
      timeoutMs,
      regenerate,
    })
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return
  }
  const fromPackage = command === 'emit-trace' && Boolean(options.package)
  if (!fromPackage && (!options.model || !options.prefix)) throw new CliError('USAGE', USAGE, 2)
  const { bin } = await ensureBend()
  let result
  if (command === 'emit-trace') {
    if ((!fromPackage && !options.bound) || !options.adapter || !options.out) throw new CliError('USAGE', USAGE, 2)
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

// await하지 않는다 — 이 모듈은 순환 import(derive ↔ adequacy)에 있어 top-level await가 import를 교착시킨다
runCli(import.meta, main, { CliError, fallback: 'PROJECTION_FAILED' })
