#!/usr/bin/env node

// FOD 6단계 드라이버. 사람이 쓰는 파일은 SPEC.md·Bend 세 파일·adapter·제품 코드뿐이고, 기록(proof·approval·gen·run)은
// 이 스크립트만 쓴다. 각 명령은 실패를 한 번에 모두, 고치는 방법과 함께 돌려준다.
//
//   fod.mjs init <id>                       1단계: .ai/oracles/<id>/SPEC.md 틀
//   fod.mjs check <id>                      1단계: SPEC 검사
//   fod.mjs prove <id>                      2단계: 모델 검사 → 법칙 증명 → 도달 증명 → 공간 열거
//   fod.mjs approve <id> --by <name>        2단계 끝: 사용자가 승인한 뒤에만
//   fod.mjs gen <id>                        3단계: fast-check·W-method 적합성 테스트 생성
//   fod.mjs run red|green <id> [-- <cmd>]   4·5단계: 테스트 실행 기록
//   fod.mjs status <id>                     지금 단계와 다음 명령
//   fod.mjs drop <id>                       버린 run — 가드 훅이 더는 막지 않는다

import { spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
// glob 함수는 Node 22.5+에만 있다 — 이름으로 import하면 옛 Node가 로드 단계에서 알 수 없는 오류를 낸다. main이 먼저 확인한다.
import path, { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import {
  AXES,
  axisClosed,
  checkSpec,
  OUTSIDE_MODEL,
  productDigests,
  productGlobs,
  readJson,
  readRuns,
  runDir,
  sha256,
  treeDigest,
} from './fod-spec.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const TEMPLATE = join(HERE, '..', 'templates', 'SPEC.md')
const DEFAULT_RUNS = 200
const MAX_FAILING = 20

const finding = (code, where, message, fix) => ({ code, where, message, fix })

class UsageError extends Error {}

function assertId(id) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id ?? '')) throw new UsageError(`run id "${id ?? ''}"는 소문자·숫자·-만 쓴다 (예: pay-double-click)`)
}

/** 한 run의 파일과 지금 digest. SPEC이 없으면 spec은 null이다. */
function load(root, id) {
  assertId(id)
  const dir = runDir(root, id)
  const specFile = join(dir, 'SPEC.md')
  if (!existsSync(specFile)) return { dir, specFile, text: null }
  const text = readFileSync(specFile, 'utf8')
  const checked = checkSpec(text, relative(root, specFile))
  const { model } = checked.spec
  const modelDir = model.model ? dirname(resolve(root, model.model)) : null
  const bendFiles = modelDir ? ['MODEL.bend', 'LAWS.bend', 'PROOF.bend'].map((name) => relative(root, join(modelDir, name))) : []
  return {
    dir,
    specFile,
    text,
    ...checked,
    model,
    modelDir,
    bendFiles,
    digests: { spec: sha256(text), model: treeDigest(root, bendFiles) },
  }
}

const fresh = (record, run) => record !== null && record.spec === run.digests.spec && record.model === run.digests.model

const testsDigest = (root, model) => treeDigest(root, [model.out, model.adapter])

// ── 1단계 ──────────────────────────────────────────────────────────────────────────────────────────────────────

export function init({ root, id }) {
  assertId(id)
  const dir = runDir(root, id)
  const specFile = join(dir, 'SPEC.md')
  if (existsSync(specFile)) return { findings: [finding('SPEC_EXISTS', relative(root, specFile), 'SPEC.md가 이미 있다', '그 파일을 고친다')] }
  mkdirSync(dir, { recursive: true })
  copyFileSync(TEMPLATE, specFile)
  return { findings: [], file: relative(root, specFile) }
}

export function check({ root, id }) {
  const run = load(root, id)
  if (run.text === null)
    return { findings: [finding('SPEC_MISSING', relative(root, run.specFile), 'SPEC.md가 없다', `fod.mjs init ${id}`)] }
  return { findings: run.findings }
}

// ── 2단계 ──────────────────────────────────────────────────────────────────────────────────────────────────────

function oracleModel(root, args) {
  const done = spawnSync(process.execPath, [join(HERE, 'oracle-model.mjs'), ...args], { cwd: root, encoding: 'utf8' })
  let json = null
  try {
    json = JSON.parse(done.stdout)
  } catch {
    json = null
  }
  return { status: done.status, json, output: `${done.stdout}${done.stderr}`.trim().split('\n').slice(-12).join('\n') }
}

/**
 * 법칙이 말하는 규칙 id. 법칙 이름 앞머리(`law r1_pending_no_post:`)이거나 바로 위 주석(`# R1, R2: ...`)이다.
 */
export function rulesWithLaws(text) {
  const lines = text.split('\n')
  const ids = new Set()
  for (const [index, line] of lines.entries()) {
    const name = /^law\s+(\w+)\s*:/.exec(line)?.[1]
    if (!name) continue
    const prefix = /^r(\d+)_/i.exec(name)
    if (prefix) ids.add(`R${prefix[1]}`)
    const comment = lines[index - 1] ?? ''
    if (comment.startsWith('#')) for (const match of comment.split(':')[0].matchAll(/\bR\d+\b/g)) ids.add(match[0])
  }
  return ids
}

// 모든 모델이 가진 이름 — 축이 모델에 들어갔다는 증거가 되지 못한다
const GENERIC_MODEL_NAMES = new Set(['State', 'Msg', 'init', 'step', 'observe', 'next', 'run'])

/** "모델에서" 칸의 backtick 식별자 → 모델에서 찾을 이름들. `Feed.Load(Empty)`는 Load와 Empty다. */
export function axisNames(cell) {
  return [...cell.matchAll(/`([^`]+)`/g)]
    .flatMap(([, item]) => {
      const call = /^([\w.]+)\s*\(([^)]*)\)$/.exec(item.trim())
      const head = (call ? call[1] : item).split('.').at(-1)
      const args = call ? call[2].split(',').map((arg) => arg.trim().split('.').at(-1)) : []
      return [head, ...args]
    })
    .map((name) => name.replaceAll(/\W/g, ''))
    .filter((name) => name && !GENERIC_MODEL_NAMES.has(name))
}

/** 규칙 ↔ 법칙, 축 ↔ 모델 식별자. Bend를 돌리기 전에 정적으로 모두 본다. */
function traceFindings(root, run) {
  const out = []
  const covered = rulesWithLaws(readFileSync(join(run.modelDir, 'LAWS.bend'), 'utf8'))
  const modelText = readFileSync(join(run.modelDir, 'MODEL.bend'), 'utf8')
  for (const rule of run.spec.rules) {
    if (rule.body.includes(OUTSIDE_MODEL) || covered.has(rule.id)) continue
    out.push(finding('RULE_WITHOUT_LAW', `${relative(root, run.specFile)}:${rule.line}`, `${rule.id}를 말하는 법칙이 LAWS.bend에 없다`,
      `법칙 바로 위에 \`# ${rule.id}: ...\` 주석을 달거나, 모델로 말할 수 없는 규칙이면 끝에 (${OUTSIDE_MODEL}: <이유>)를 달아 4단계 손 테스트로 넘긴다`))
  }
  for (const axis of AXES) {
    const row = run.spec.axes.get(axis)
    if (!row || axisClosed(row)) continue
    const names = axisNames(row.model)
    const missing = names.filter((name) => !new RegExp(`\\b${name}\\b`).test(modelText))
    if (names.length === 0 || missing.length > 0)
      out.push(finding('AXIS_NOT_IN_MODEL', `${relative(root, run.specFile)}:${row.line}`,
        names.length === 0
          ? `${axis} 행의 "모델에서" 칸에 이 축을 나타내는 구체적인 모델 식별자가 없다 (State·Msg·init·step·observe·next는 모든 모델에 있어 증거가 아니다)`
          : `${axis} 행이 가리키는 ${missing.join(', ')}가 MODEL.bend에 없다`,
        '그 축을 나타내는 MODEL.bend의 필드·생성자·사건을 `Prefix.Name` 또는 `Prefix.Load(Empty)`처럼 backtick으로 적는다'))
  }
  return out
}

export function prove({ root, id }) {
  const run = load(root, id)
  if (run.text === null) return check({ root, id })
  if (run.findings.length > 0) return { findings: run.findings }
  const missing = run.bendFiles.filter((file) => !existsSync(join(root, file)))
  if (missing.length > 0)
    return { findings: missing.map((file) => finding('MODEL_FILE_MISSING', file, `${file}이 없다`, 'steps/2-proof.md 순서로 MODEL·LAWS·PROOF를 쓴다')) }
  const out = traceFindings(root, run)
  const { model } = run
  const checked = oracleModel(root, ['check', '--file', model.model])
  if (checked.status !== 0) {
    out.push(finding('PROVE_MODEL_INVALID', model.model, 'MODEL.bend가 Bend 검사를 통과하지 못한다', checked.output))
    return { findings: out }
  }
  const proof = oracleModel(root, ['prove', '--dir', relative(root, run.modelDir)])
  if (proof.json?.status !== 'proven')
    out.push(finding('PROVE_FAILED', relative(root, join(run.modelDir, 'PROOF.bend')), '법칙 증명이 닫히지 않았다', proof.output))
  const reach = model.safe ? oracleModel(root, ['prove-reach', '--model', model.model, '--prefix', model.prefix, '--safe', model.safe]) : null
  if (reach && reach.json?.status !== 'proven')
    out.push(finding('PROVE_REACH_FAILED', model.model, `도달 가능한 모든 상태에서 ${model.safe}가 참이라는 증명이 닫히지 않았다`, reach.output))
  const space = oracleModel(root, ['space', '--model', model.model, '--prefix', model.prefix, '--bound', model.bound])
  if (space.json?.complete !== true)
    out.push(finding('SPACE_INCOMPLETE', model.model, `bound ${model.bound} 안의 trace 공간이 예산 안에서 닫히지 않는다`,
      `bound를 낮추거나 상태가 끝없이 자라지 않게 모델을 유한하게 만든다\n${space.output}`))
  if (out.length > 0) return { findings: out }
  const record = {
    at: new Date().toISOString(),
    spec: run.digests.spec,
    model: run.digests.model,
    laws: proof.json.laws,
    reach: reach ? { reachable: reach.json.reachable, states: reach.json.domain?.states } : null,
    space: { cases: space.json.caseCount, bound: Number(model.bound) },
  }
  writeFileSync(join(run.dir, 'proof.json'), `${JSON.stringify(record, null, 2)}\n`)
  return { findings: [], proof: record }
}

export function approve({ root, id, by }) {
  if (!by) throw new UsageError('approve는 --by <승인한 사람>이 필요하다')
  const run = load(root, id)
  if (run.text === null) return check({ root, id })
  if (!fresh(readJson(join(run.dir, 'proof.json')), run))
    return { findings: [finding('APPROVE_PROOF_STALE', relative(root, run.specFile), 'SPEC 또는 Bend가 마지막 증명 뒤에 바뀌었다', `fod.mjs prove ${id}`)] }
  const globs = productGlobs(run.model)
  const record = {
    at: new Date().toISOString(),
    by,
    spec: run.digests.spec,
    model: run.digests.model,
    globs,
    product: productDigests(root, globs),
  }
  writeFileSync(join(run.dir, 'approval.json'), `${JSON.stringify(record, null, 2)}\n`)
  return { findings: [], approval: record }
}

// ── 3단계 ──────────────────────────────────────────────────────────────────────────────────────────────────────

const GEN_FIXES = {
  ADAPTER_SUSPECT: 'adapter는 제품 모듈을 import해 관찰한다. MODEL·생성 모델·oracle 스크립트·fast-check를 import하지 않고, React를 렌더하면 dispose를 export한다',
  ADAPTER_UNREADABLE: '## 모델의 adapter 경로에 파일을 만든다 (init·step·observe, 필요하면 dispose)',
  SPACE_INCOMPLETE: 'bound를 낮춘다',
  SUITE_UNAVAILABLE: '모델 상태가 유한해야 W-method 묶음을 만든다',
  BUGS_INVALID: 'MODEL.bend 옆 BUGS.json은 [{ "id": "B1", "trace": [...] }] 배열이다',
  BUG_OUTSIDE_SPACE: '그 버그 trace를 모델 환경이 허용하도록 모델을 고치거나 항목을 지운다',
  USAGE: 'SPEC ## 모델의 runner·environment·adapter 확장자를 맞춘다 (JSX adapter는 runner vitest)',
  TYPE_UNSUPPORTED: 'state·command 타입은 유한한 생성자·Bool·Nat·List로 만든다',
  RELATION_INVALID: 'relations의 각 이름은 def Prefix.<이름>(s: State, c: Command, t: State) -> Bool이다',
  SAMPLING_BOUND_REQUIRED: 'state·command 타입에 끝없는 Nat·List가 있다: 모델에서 범위를 유한하게 만든다',
}

// Bend 설치 실패(BEND_DOWNLOAD_FAILED·BEND_CHECKSUM_MISMATCH·BEND_INSTALL_FAILED·BEND_UNSUPPORTED_PLATFORM)
const BEND_FIX = '네트워크·플랫폼을 확인하고 node scripts/ensure-bend.mjs로 Bend를 설치한 뒤 다시 실행한다'

const installed = (from, name) => {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'node_modules', name, 'package.json'))) return true
    if (dirname(dir) === dir) return false
  }
}

/** 생성 파일이 import하는 bare 패키지 중 그 파일 위치에서 node_modules로 찾지 못하는 것 — 없으면 테스트 파일이 로드되지 않는다. */
export function missingPackages(files) {
  const missing = new Set()
  for (const file of files) {
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(/^import\s[^'"]*['"]([^'"]+)['"]/gm)) {
      if (/^(?:node:|\.|\/)/.test(specifier)) continue
      const name = specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/')
      if (!installed(dirname(file), name)) missing.add(name)
    }
  }
  return [...missing].sort()
}

const listOption = (value) => (value ? value.split(',').map((item) => item.trim()).filter(Boolean) : [])

/** 두 묶음의 출력 파일 이름. 같으면 속성 묶음이 trace 묶음(cover·W·순서·버그·표본)을 덮어쓴다. */
export const suiteNames = (prefix) => ({ trace: prefix.toLowerCase(), state: `${prefix.toLowerCase()}-state` })

/** 정규화한 생성 옵션 — 투영 모듈이 받는 이름으로. */
function genOptions(root, id, model, bin) {
  return {
    model: resolve(root, model.model),
    prefix: model.prefix,
    adapter: resolve(root, model.adapter),
    out: resolve(root, model.out),
    row: 'MODEL',
    runs: Number(model.runs ?? DEFAULT_RUNS),
    ...(model.runner ? { runner: model.runner } : {}),
    ...(model.environment ? { environment: model.environment } : {}),
    bin,
    regenerate: `fod.mjs gen ${id}`,
  }
}

export async function gen({ root, id }) {
  const run = load(root, id)
  if (run.text === null) return check({ root, id })
  const where = relative(root, run.specFile)
  if (!fresh(readJson(join(run.dir, 'proof.json')), run))
    return { findings: [finding('GEN_PROOF_STALE', where, '마지막 증명 뒤에 SPEC 또는 Bend가 바뀌었다', `fod.mjs prove ${id} → 사용자 승인 → fod.mjs approve`)] }
  if (!fresh(readJson(join(run.dir, 'approval.json')), run))
    return { findings: [finding('GEN_NOT_APPROVED', where, '지금 SPEC·모델에 대한 사용자 승인이 없다', 'steps/2-proof.md 끝의 승인 요청을 하고, 사용자가 승인하면 fod.mjs approve')] }
  const { emitState, emitTrace } = await import('./oracle-projection.mjs')
  const { ensureBend } = await import('./ensure-bend.mjs')
  const { model } = run
  const files = []
  const verification = {}
  try {
    const { bin } = await ensureBend()
    const base = genOptions(root, id, model, bin)
    const trace = await emitTrace({ ...base, name: suiteNames(model.prefix).trace, bound: Number(model.bound) })
    files.push(...trace.files)
    verification.trace = trace.verification
    const relations = listOption(model.relations)
    if (model.state && model.command && relations.length > 0) {
      const state = await emitState({ ...base, name: suiteNames(model.prefix).state, stateType: model.state, commandType: model.command, relations })
      files.push(...state.files)
      verification.state = state.verification
    }
  } catch (error) {
    if (!error.code) throw error
    const fix = GEN_FIXES[error.code] ?? (error.code.startsWith('BEND_') ? BEND_FIX : '메시지대로 고친 뒤 fod.mjs gen')
    return { findings: [finding(error.code, model.adapter, error.message, fix)] }
  }
  const missing = missingPackages(files)
  if (missing.length > 0)
    return { findings: [finding('GEN_DEPENDENCY_MISSING', relative(root, files[0]), `생성 테스트가 import하는 ${missing.join(', ')}를 이 프로젝트에서 찾지 못한다 — 테스트 파일이 로드되지 않는다`,
      `프로젝트에 dev dependency로 설치한다(npm i -D ${missing.join(' ')} 또는 레포의 패키지 매니저), 그다음 fod.mjs gen ${id}`)] }
  const record = {
    at: new Date().toISOString(),
    spec: run.digests.spec,
    model: run.digests.model,
    out: treeDigest(root, [model.out]),
    files: files.map((file) => relative(root, file)),
  }
  writeFileSync(join(run.dir, 'gen.json'), `${JSON.stringify(record, null, 2)}\n`)
  return { findings: [], gen: record, verification }
}

// ── 4·5단계 ────────────────────────────────────────────────────────────────────────────────────────────────────

/** 실패한 테스트 이름 — node --test(spec), vitest, TAP의 실패 줄. */
export function failingTests(output) {
  return [...new Set(output.split('\n').map((line) => line.trim()).filter((line) => /^(?:✖|×|❯.*FAIL|FAIL\s|not ok\s)/.test(line)))]
    .filter((line) => !/^✖ failing tests:?$/.test(line))
    .slice(0, MAX_FAILING)
}

const approvalDigest = (dir) => {
  const file = join(dir, 'approval.json')
  return existsSync(file) ? sha256(readFileSync(file, 'utf8')) : null
}

const currentRuns = (dir) => {
  const approval = approvalDigest(dir)
  return readRuns(dir).filter((entry) => entry.approval === approval)
}

function execute(root, command) {
  // 바깥 node --test의 자식 프로토콜 변수를 지운다 — 남기면 자식 테스트가 사람이 읽는 실패 줄 대신 직렬화된 보고를 낸다
  const { NODE_TEST_CONTEXT: _parent, ...env } = process.env
  const done = spawnSync(command, { cwd: root, env, shell: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const output = `${done.stdout ?? ''}${done.stderr ?? ''}`
  return { exit: done.status ?? 1, output, failing: failingTests(output), tail: output.trim().split('\n').slice(-15).join('\n') }
}

function changedProduct(root, approval) {
  const now = productDigests(root, approval.globs)
  const names = new Set([...Object.keys(now), ...Object.keys(approval.product)])
  return [...names].filter((name) => now[name] !== approval.product[name]).sort()
}

// main은 `--` 뒤 인자를 셸이 푼 다음 공백으로 다시 잇는다 — 붙여 넣은 명령이 기록과 같아지려면 통째로 작은따옴표에 담는다
export const shellQuote = (command) => `'${command.replaceAll("'", "'\\''")}'`

/** 실행 전 관문: RED는 승인 뒤 제품이 그대로일 때 한 번, GREEN은 RED 때와 같은 테스트·adapter로. */
function phaseGate({ root, id, run, phase, red, tests, cmd }) {
  const where = relative(root, run.specFile)
  const { model } = run
  if (phase === 'green') {
    if (!red) return [finding('GREEN_NO_RED', where, '이 승인에 RED 기록이 없다', `fod.mjs run red ${id}`)]
    if (red.command !== cmd)
      return [finding('GREEN_COMMAND_CHANGED', cmd, `RED는 다른 명령으로 기록됐다: ${red.command}`,
        red.command === model.test ? `fod.mjs run green ${id}` : `fod.mjs run green ${id} -- ${shellQuote(red.command)}`)]
    if (red.tests === tests) return []
    return [finding('GREEN_TESTS_CHANGED', `${model.out}, ${model.adapter}`, 'RED 뒤에 생성 테스트나 adapter가 바뀌었다',
      'adapter·테스트를 RED 때로 되돌린다. 모델이 틀렸으면 1·2단계로 돌아가 다시 증명·승인·생성한다')]
  }
  if (red) return [finding('RED_DONE', where, '이 승인에는 이미 RED가 있다', `제품을 고치고 fod.mjs run green ${id}`)]
  const changed = changedProduct(root, readJson(join(run.dir, 'approval.json')))
  if (changed.length === 0) return []
  return [finding('RED_PRODUCT_CHANGED', changed.join(', '), 'RED 전에 제품 범위 파일이 승인 때와 달라졌다',
    '제품 변경을 따로 보관하고 승인 때 내용으로 되돌린 뒤(steps/5-green.md "Setting the fix aside") RED를 먼저 본다 — 테스트가 고치기 전의 결함을 잡는지가 RED의 증거다')]
}

// 생성 테스트의 이름은 모두 `[MODEL]`로 시작하고, 표본 테스트는 `"row":"MODEL"`을 로그로 남긴다
const GENERATED_RAN = /\[MODEL\]|"row":\s*"MODEL"/
const generatedFailed = (failing) => failing.some((line) => line.includes('[MODEL]'))

/** 새 기능의 RED: 제품 범위 파일이 아직 없어서 adapter의 import가 실패했다. 다른 모듈이 없으면 하네스 문제다. */
const productModuleMissing = (output, { root, globs }) =>
  [...output.matchAll(/Cannot find module '([^']+)'/g)].some(([, missing]) => {
    const absolute = missing.replace(/^file:\/\//, '')
    if (!isAbsolute(absolute)) return false
    const file = relative(root, absolute)
    return file !== '..' && !file.startsWith(`..${sep}`) && globs.some((glob) => path.matchesGlob(file, glob))
  })

/**
 * 실행 결과 판정. RED는 생성 테스트(`[MODEL]`)가 실패해야 한다 — 다른 줄의 실패, 로드되지 않은 테스트 파일, out을 돌리지
 * 않는 명령으로는 기록하지 않는다. 예외는 아직 없는 제품 모듈 하나뿐이다. GREEN은 exit 0이고 생성 테스트가 실제로 돌았어야 한다.
 */
export function judge(phase, cmd, result, scope) {
  const output = result.output ?? ''
  const unloaded = result.exit !== 0 && output.match(/Cannot find package '([^']+)'/)?.[1]
  if (unloaded)
    return [finding(phase === 'red' ? 'RED_NOT_A_TEST_FAILURE' : 'GREEN_FAILED', cmd, `패키지 ${unloaded}가 설치되지 않아 테스트 파일이 로드되지 않았다`,
      `프로젝트에 dev dependency로 설치한다(npm i -D ${unloaded}), 그다음 다시 fod.mjs run ${phase}`)]
  if (phase === 'green') {
    if (result.exit !== 0) return [finding('GREEN_FAILED', cmd, `실패 ${result.failing.length}건`, [...result.failing, result.tail].join('\n'))]
    if (GENERATED_RAN.test(output)) return []
    return [finding('GREEN_TESTS_NOT_RUN', cmd, '명령은 통과했지만 생성 테스트([MODEL])가 돌지 않았다', 'SPEC의 test 명령이 생성 테스트 폴더(out)를 실행하게 고친다')]
  }
  if (result.exit === 0)
    return [finding('RED_PASSED', cmd, '생성 테스트가 모두 통과했다 — 고치기 전의 결함을 잡지 못한다',
      '실제 버그 trace를 MODEL.bend 옆 BUGS.json에 넣거나, 모델이 결함 동작을 금지하는지 다시 본다(1·2단계)')]
  if (generatedFailed(result.failing)) return []
  // 생성 테스트가 돌았는데 모두 통과했다면 다른 파일의 없는 모듈은 RED의 증거가 아니다
  if (!GENERATED_RAN.test(output) && productModuleMissing(output, scope)) return []
  if (GENERATED_RAN.test(output))
    return [finding('RED_PASSED', cmd, '생성 테스트는 모두 통과했고 다른 테스트만 실패했다 — 고치기 전의 결함을 모델이 잡지 못한다',
      '실제 버그 trace를 MODEL.bend 옆 BUGS.json에 넣거나, 모델이 결함 동작을 금지하는지 다시 본다(1·2단계)')]
  return [finding('RED_NOT_A_TEST_FAILURE', cmd, '생성 테스트([MODEL])가 돌지 않았다 — 문법·import·환경 실패이거나 명령이 out을 실행하지 않는다', result.tail)]
}

export function runPhase({ root, id, phase, command }) {
  if (!['red', 'green'].includes(phase)) throw new UsageError('run 다음에는 red 또는 green')
  const run = load(root, id)
  if (run.text === null) return check({ root, id })
  const { model } = run
  const gen = readJson(join(run.dir, 'gen.json'))
  if (!fresh(gen, run) || !fresh(readJson(join(run.dir, 'approval.json')), run) || gen.out !== treeDigest(root, [model.out]))
    return { findings: [finding('RUN_TESTS_STALE', model.out, '생성 테스트가 지금 승인·모델의 것이 아니거나 손으로 바뀌었다', `fod.mjs gen ${id}`)] }
  const red = currentRuns(run.dir).find((entry) => entry.phase === 'red')
  const tests = testsDigest(root, model)
  const cmd = command || model.test
  const blocked = phaseGate({ root, id, run, phase, red, tests, cmd })
  if (blocked.length > 0) return { findings: blocked }
  const result = execute(root, cmd)
  const failures = judge(phase, cmd, result, { root, globs: readJson(join(run.dir, 'approval.json')).globs })
  if (failures.length > 0) return { findings: failures, failing: result.failing }
  const entry = { phase, at: new Date().toISOString(), approval: approvalDigest(run.dir), exit: result.exit, failing: result.failing, tests, command: cmd }
  appendFileSync(join(run.dir, 'run.jsonl'), `${JSON.stringify(entry)}\n`)
  return { findings: [], entry }
}

export function drop({ root, id }) {
  const run = load(root, id)
  if (!existsSync(run.dir)) return { findings: [finding('RUN_MISSING', relative(root, run.dir), 'run이 없다', 'id를 확인한다')] }
  appendFileSync(join(run.dir, 'run.jsonl'), `${JSON.stringify({ phase: 'dropped', at: new Date().toISOString(), approval: approvalDigest(run.dir) })}\n`)
  return { findings: [] }
}

// ── 상태 ───────────────────────────────────────────────────────────────────────────────────────────────────────

const STEP_DOCS = ['', 'steps/1-spec.md', 'steps/2-proof.md', 'steps/3-generate.md', 'steps/4-red.md', 'steps/5-green.md', 'steps/6-review.md']

/** 지금 단계와 다음 명령 하나. 판단은 기록 파일의 digest로만 한다. */
export function status({ root, id }) {
  const step = (number, next) => ({ step: number, read: STEP_DOCS[number], next })
  const run = load(root, id)
  if (run.text === null) return step(1, `fod.mjs init ${id}`)
  const runs = currentRuns(run.dir)
  if (runs.some((entry) => entry.phase === 'dropped')) return { step: 0, read: '', next: 'dropped' }
  if (run.findings.length > 0) return { ...step(1, `SPEC.md를 고치고 fod.mjs check ${id}`), findings: run.findings }
  if (!fresh(readJson(join(run.dir, 'proof.json')), run)) return step(2, `Bend 세 파일을 쓰고 fod.mjs prove ${id}`)
  if (!fresh(readJson(join(run.dir, 'approval.json')), run)) return step(2, `사용자에게 승인을 받고 fod.mjs approve ${id} --by <이름>`)
  const gen = readJson(join(run.dir, 'gen.json'))
  if (!fresh(gen, run) || gen.out !== treeDigest(root, [run.model.out])) return step(3, `adapter를 쓰고 fod.mjs gen ${id}`)
  if (!runs.some((entry) => entry.phase === 'red')) return step(4, `fod.mjs run red ${id}`)
  if (!runs.some((entry) => entry.phase === 'green')) return step(5, `제품을 고치고 fod.mjs run green ${id}`)
  return step(6, '독립 리뷰어 1명이 fod.mjs run green을 다시 돌리고 리뷰한다')
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────────────────────────────

function print(result) {
  for (const item of result.findings ?? []) {
    process.stdout.write(`✖ ${item.code} ${item.where}\n  ${item.message}\n  고치기: ${item.fix.replaceAll('\n', '\n    ')}\n`)
  }
}

async function main(argv) {
  if (typeof path.matchesGlob !== 'function')
    throw new UsageError(`Node 22.5 이상이 필요하다 (지금 ${process.version}) — fod.mjs와 가드 훅은 node:fs globSync·node:path matchesGlob을 쓴다`)
  const [command, ...rest] = argv
  const dash = rest.indexOf('--')
  const args = dash === -1 ? rest : rest.slice(0, dash)
  const tail = dash === -1 ? '' : rest.slice(dash + 1).join(' ')
  const root = process.cwd()
  const byIndex = args.indexOf('--by')
  const by = byIndex === -1 ? undefined : args[byIndex + 1]
  const commands = {
    init: () => init({ root, id: args[0] }),
    check: () => check({ root, id: args[0] }),
    prove: () => prove({ root, id: args[0] }),
    approve: () => approve({ root, id: args[0], by }),
    gen: () => gen({ root, id: args[0] }),
    run: () => runPhase({ root, id: args[1], phase: args[0], command: tail }),
    drop: () => drop({ root, id: args[0] }),
    status: () => status({ root, id: args[0] }),
  }
  if (!commands[command]) throw new UsageError(`명령: ${Object.keys(commands).join(' | ')} (저장소 루트에서 실행)`)
  const result = await commands[command]()
  print(result)
  if (command === 'status') {
    const lines = [`step: ${result.step}`, ...(result.read ? [`read: ${result.read}`] : []), `next: ${result.next}`]
    process.stdout.write(`${lines.join('\n')}\n`)
    return 0
  }
  const count = result.findings.length
  process.stdout.write(count === 0 ? `ok ${command}\n` : `${count}건을 모두 고친 뒤 다시 실행한다\n`)
  if (count === 0 && command !== 'drop') process.stdout.write(`next: ${status({ root, id: command === 'run' ? args[1] : args[0] }).next}\n`)
  return count === 0 ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await main(process.argv.slice(2))
  } catch (error) {
    process.stderr.write(`${error instanceof UsageError ? 'USAGE' : (error.code ?? 'FOD_FAILED')}: ${error.message}\n`)
    process.exitCode = error instanceof UsageError ? 2 : 1
  }
}
