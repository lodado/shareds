#!/usr/bin/env node

// FOD 6단계 드라이버. 사람이 쓰는 파일은 SPEC.md·Bend 세 파일·adapter·제품 코드뿐이고, 기록(proof·approval·gen·run)은
// 이 스크립트만 쓴다. 각 명령은 실패를 한 번에 모두, 고치는 방법과 함께 돌려준다.
//
//   fod.mjs init <id>                       1단계: .ai/oracles/<id>/SPEC.md 틀
//   fod.mjs check <id>                      1단계: SPEC 검사
//   fod.mjs prove <id>                      2단계: 모델 검사 → 법칙 증명 → 도달 증명 → 공간 열거 → 법칙 강도
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
import { parseBendTypes } from './oracle-types.mjs'

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

// oracle-model 보고에서 사람이 읽을 부분 — 나머지(command·inputs·cells)는 실패 원인을 가린다
// (check·prove-reach는 Bend 출력을 `output`에 담는다)
const REPORT_KEYS = new Set(['file', 'reason', 'hint', 'message', 'output', 'stderr', 'stdout'])
const lastLines = (text, count) => text.trim().split('\n').slice(-count).join('\n')

function reportTexts(value, out) {
  if (Array.isArray(value)) {
    for (const item of value) reportTexts(item, out)
    return out
  }
  if (!value || typeof value !== 'object') return out
  for (const [key, item] of Object.entries(value)) {
    if (REPORT_KEYS.has(key) && typeof item === 'string' && item.trim()) out.push(lastLines(item, 20))
    else if (key === 'counterexample' && item) out.push(`counterexample: ${JSON.stringify(item)}`)
    else reportTexts(item, out)
  }
  return out
}

/** Bend 실패를 고치는 데 필요한 글만: 이유·힌트·Bend가 찍은 오류·반례. JSON이 아니면 출력 끝부분. */
export function bendText(result) {
  const texts = result.json ? [...new Set(reportTexts(result.json, []))] : []
  return texts.length > 0 ? texts.join('\n') : result.output
}

/**
 * 법칙이 말하는 규칙 id. 법칙 이름 앞머리(`law r1_pending_no_post:`)이거나 바로 위에 이어진 주석(`# R1, R2: ...`)이다.
 */
export function rulesWithLaws(text) {
  const lines = text.split('\n')
  const ids = new Set()
  for (const [index, line] of lines.entries()) {
    const name = /^law\s+(\w+)\s*:/.exec(line)?.[1]
    if (!name) continue
    const prefix = /^r(\d+)_/i.exec(name)
    if (prefix) ids.add(`R${prefix[1]}`)
    // 주석이 여러 줄로 접혀도 id는 `:` 앞에 있다 — 법칙 위로 이어진 주석 줄을 모두 본다
    for (let at = index - 1; at >= 0 && lines[at].startsWith('#'); at -= 1) {
      const head = lines[at].includes(':') ? lines[at].split(':')[0].replaceAll(/\s/g, '') : ''
      if (/^#R\d+(?:,R\d+)*$/.test(head)) for (const match of head.matchAll(/R\d+/g)) ids.add(match[0])
    }
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

/** LAWS.bend의 법칙 이름 → 본문(들여쓴 줄을 공백 하나로 이은 것). */
function lawBodies(text) {
  const laws = new Map()
  for (const chunk of text.split(/^(?=law\s)/m)) {
    const [head, ...rest] = chunk.split('\n')
    const name = /^law\s+(\w+)\s*:/.exec(head)?.[1]
    // 본문은 들여쓴 줄과 빈 줄이다; 맨 앞에서 시작하는 첫 줄(주석·def)에서 끝난다
    const end = rest.findIndex((line) => line.trim() !== '' && !/^\s/.test(line))
    const body = end === -1 ? rest : rest.slice(0, end)
    if (name) laws.set(name, body.map((line) => line.trim()).filter(Boolean).join(' '))
  }
  return laws
}

/**
 * 법칙만 보고 아는 빈틈: 같은 본문의 법칙 두 개(하나는 아무것도 더 말하지 않는다), init을 말하는 법칙이 없음(셀 법칙은 모든 상태에서
 * 성립해 시작 상태를 정하지 못한다 — 시작 화면이 틀린 모델도 증명된다).
 */
export function lawFindings(lawsText, { prefix, where }) {
  const out = []
  const byBody = new Map()
  for (const [name, body] of lawBodies(lawsText)) byBody.set(body, [...(byBody.get(body) ?? []), name])
  for (const names of byBody.values())
    if (names.length > 1)
      out.push(finding('LAW_DUPLICATE', where, `법칙 ${names.join(', ')}의 본문이 같다 — 하나는 아무것도 더 말하지 않는다`,
        '각 법칙이 서로 다른 효과·상태를 말하게 고친다. witness라면 규칙마다 그 규칙의 결과가 보이는 서로 다른 끝 상태를 적는다'))
  // 주석이나 helper def가 init을 말해도 법칙이 시작을 고정하지는 않는다 — 법칙 본문만 본다
  const init = new RegExp(`\\b${prefix}\\.init\\b`)
  if (![...lawBodies(lawsText).values()].some((body) => init.test(body)))
    out.push(finding('LAW_INIT_UNPINNED', where, `${prefix}.init을 말하는 법칙이 없다 — 시작 상태가 SPEC과 달라도 증명된다`,
      `시작 화면을 고정하는 법칙을 더한다: \`{${prefix}.observe(${prefix}.init()) == <Entry·Data 축이 말하는 시작> : ...}\` 또는 init에서 출발하는 exs witness`))
  return out
}

// 칸 관계 법칙의 묶음 두 줄과 식. 식은 공백을 지운 뒤 맞춘다.
const CELL_BINDERS = /^for (\w+) ?: ?\w+\.(\w+) for (\w+) ?: ?\w+\.(\w+) (\{.+\})$/
const CELL_EQUATION = /^\{\w+\.(\w+)\.(\w+)\((\w+),(\w+),\w+\.(\w+)\.step\((\w+),(\w+)\)\)==True\{\}:Bool\}$/

/** 법칙 본문 하나가 `for s: M.State` `for c: M.Msg` `{M.P.R(s, c, M.P.step(s, c)) == True{} : Bool}` 모양이면 그 타입과 관계 이름. */
function cellRelation(body, prefix) {
  const binders = CELL_BINDERS.exec(body)
  const equation = binders && CELL_EQUATION.exec(binders[5].replaceAll(/\s/g, ''))
  if (!equation) return null
  const [, owner, relation, before, event, stepOwner, stepBefore, stepEvent] = equation
  if (owner !== prefix || stepOwner !== prefix) return null
  if (before !== binders[1] || event !== binders[3] || stepBefore !== before || stepEvent !== event) return null
  return { state: binders[2], command: binders[4], relation }
}

/**
 * 칸 관계 법칙이 말하는 관계 이름들, State·Msg 타입 쌍마다. 다른 모양의 법칙(식 하나를 고정하는 칸 법칙, trace 법칙,
 * witness)은 강도를 잴 대상이 아니다.
 */
export function cellRelations(lawsText, prefix) {
  const groups = []
  for (const body of lawBodies(lawsText).values()) {
    const found = cellRelation(body, prefix)
    if (!found) continue
    const group = groups.find(({ state, command }) => state === found.state && command === found.command)
    if (group) group.relations.push(found.relation)
    else groups.push({ state: found.state, command: found.command, relations: [found.relation] })
  }
  return groups
}

/** 칸 관계가 아닌데 이 모델의 step을 말하는 법칙(식 하나를 고정하는 칸 법칙, trace 위의 frame law)이 있는가. */
export function hasOtherStepLaws(lawsText, prefix) {
  return [...lawBodies(lawsText).values()].some((body) => body.includes(`${prefix}.step(`) && !cellRelation(body, prefix))
}

/**
 * `laws` 보고 하나에서: step은 그대로 두는데 법칙들이 열어 둔 관찰 필드. 그 필드를 바꾸는 틀린 모델도 같은 법칙으로 증명된다.
 * step이 바꾸는 필드를 열어 둔 칸은 막지 않는다 — 일부러 느슨한 성질 관계일 수 있어 수만 proof.json에 남긴다.
 */
export function strengthFindings(report, { where }) {
  const kept = Object.entries(report.strength?.keptFields ?? {}).sort(([, left], [, right]) => right - left)
  if (kept.length === 0) return []
  const names = kept.map(([field]) => field)
  const counted = kept.map(([field, count]) => `${field}(${count}칸)`).join(', ')
  const cell = report.strength.freeCells.find(({ freeFields }) => freeFields?.some((field) => field.kept))
  const example = cell ? ` (예: ${cell.state} 에서 ${cell.command})` : ''
  return [
    finding('LAW_FRAME_MISSING', where,
      `법칙이 ${counted}를 열어 둔다${example}, Nat·List 1 안에서 — step은 그 필드를 그대로 두는데 법칙은 다른 값도 허용해, 그 필드를 바꾸는 틀린 모델도 증명된다`,
      `그 사건의 관계에 "뒤 상태의 ${names[0]}는 앞 상태와 같다"를 더하거나, 거절·유지되는 사건이 ${names.join('·')}를 지킨다는 frame law를 더한다`),
  ]
}

// 끝없는 Nat·List는 이 상한에서 자른다. 상한 안에서 열린 칸은 상한 밖 후보가 더해져도 열려 있으니 거짓 지적이 없다.
const STRENGTH_BOUNDS = ['--nat-max', '1', '--list-max', '1']

/** `safe:`에 prefix까지 적어도(`Search.safe`) 같은 함수다. */
export const safeName = ({ prefix, safe }) => (safe.startsWith(`${prefix}.`) ? safe.slice(prefix.length + 1) : safe)

/**
 * 칸 관계 법칙이 다음 관찰을 얼마나 고정하는가. 그런 법칙이 없으면 summary는 null이다. 계산하지 못한 이유는 skipped에 남긴다.
 * 다른 모양의 법칙도 step을 말하면 재지 않는다 — 관계만 보면 그 법칙이 고정한 필드가 열린 것으로 보여 옳은 묶음을 거절한다.
 */
export function lawStrength({ root, model, lawsFile }) {
  const lawsText = readFileSync(join(root, lawsFile), 'utf8')
  const groups = cellRelations(lawsText, model.prefix)
  if (groups.length === 0) return { findings: [], summary: null }
  const findings = []
  const summary = { relations: 0, pinned: 0, free: 0, empty: 0, bounded: false, skipped: [] }
  if (hasOtherStepLaws(lawsText, model.prefix)) {
    summary.relations = groups.reduce((sum, { relations }) => sum + relations.length, 0)
    summary.skipped.push('MIXED_CELL_LAWS')
    return { findings, summary }
  }
  for (const { state, command, relations } of groups) {
    summary.relations += relations.length
    const args = ['laws', '--model', model.model, '--prefix', model.prefix, '--state', state, '--command', command]
    const done = oracleModel(root, [...args, ...relations.flatMap((name) => ['--relation', name]), ...STRENGTH_BOUNDS])
    const strength = done.json?.strength
    if (!strength) {
      summary.skipped.push(/^([A-Z_]+):/m.exec(done.output)?.[1] ?? 'LAWS_FAILED')
      continue
    }
    summary.pinned += strength.pinnedCount
    summary.free += strength.freeCount
    summary.empty += strength.emptyCount
    summary.bounded ||= done.json.bounded === true
    findings.push(...strengthFindings(done.json, { where: lawsFile }))
  }
  return { findings, summary }
}

/**
 * 공간이 쓰지 않는 모델 부분: 선언된 Msg 생성자 중 bound 안의 어떤 trace에도 없는 것, init과 한 번도 다르지 않은 관찰.
 * 생성 테스트는 공간의 trace만 모니 둘 다 테스트되지 않는다.
 */
export function usageFindings(modelText, usage, { prefix, bound, where }) {
  const out = []
  const declared = (parseBendTypes(modelText).get('Msg') ?? []).map(({ name }) => name)
  const unused = declared.filter((name) => !usage.events[name])
  if (unused.length > 0)
    out.push(finding('MODEL_EVENT_NEVER_OFFERED', where, `${prefix}.next가 bound ${bound} 안에서 ${unused.join(', ')}를 한 번도 내놓지 않는다 — 그 사건의 규칙은 테스트되지 않는다`,
      '그 사건이 일어날 수 있는 상태에서 next가 허용하게 고친다(설정 전·로딩 전 같은 시작 상태 포함). 더 긴 trace에서만 나오면 bound를 늘리고, 쓰지 않는 생성자면 지운다'))
  if (!usage.observed)
    out.push(finding('MODEL_OBSERVES_NOTHING', where, `bound ${bound} 안의 모든 관찰이 init의 관찰과 같다 — 어떤 결함도 생성 테스트에서 보이지 않는다`,
      `${prefix}.observe가 규칙이 말하는 화면·요청 값을 돌려주게 고친다`))
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
    out.push(finding('PROVE_MODEL_INVALID', model.model, 'MODEL.bend가 Bend 검사를 통과하지 못한다', bendText(checked)))
    return { findings: out }
  }
  const proof = oracleModel(root, ['prove', '--dir', relative(root, run.modelDir)])
  if (proof.json?.status !== 'proven')
    out.push(finding('PROVE_FAILED', relative(root, join(run.modelDir, 'PROOF.bend')), '법칙 증명이 닫히지 않았다', bendText(proof)))
  const reach = model.safe ? oracleModel(root, ['prove-reach', '--model', model.model, '--prefix', model.prefix, '--safe', safeName(model)]) : null
  if (reach && reach.json?.status !== 'proven')
    out.push(finding('PROVE_REACH_FAILED', model.model, `도달 가능한 모든 상태에서 ${model.safe}가 참이라는 증명이 닫히지 않았다`, bendText(reach)))
  const space = oracleModel(root, ['space', '--model', model.model, '--prefix', model.prefix, '--bound', model.bound])
  if (space.json?.complete !== true)
    out.push(finding('SPACE_INCOMPLETE', model.model, `bound ${model.bound} 안의 trace 공간이 예산 안에서 닫히지 않는다`,
      `bound를 낮추거나 상태가 끝없이 자라지 않게 모델을 유한하게 만든다\n${space.output}`))
  if (space.json?.complete === true)
    out.push(...usageFindings(readFileSync(join(root, model.model), 'utf8'), space.json.usage, { prefix: model.prefix, bound: model.bound, where: model.model }))
  const lawsFile = relative(root, join(run.modelDir, 'LAWS.bend'))
  out.push(...lawFindings(readFileSync(join(root, lawsFile), 'utf8'), { prefix: model.prefix, where: lawsFile }))
  const strength = lawStrength({ root, model, lawsFile })
  out.push(...strength.findings)
  if (out.length > 0) return { findings: out }
  const record = {
    at: new Date().toISOString(),
    spec: run.digests.spec,
    model: run.digests.model,
    laws: proof.json.laws,
    reach: reach ? { reachable: reach.json.reachable, states: reach.json.domain?.states } : null,
    space: { cases: space.json.caseCount, bound: Number(model.bound) },
    strength: strength.summary,
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

/**
 * gen이 부를 투영: trace 묶음은 늘, 속성 묶음은 SPEC이 state·command·relations를 줄 때. 출력 파일 이름이 같으면 속성 묶음이
 * trace 묶음(cover·W·순서·버그·표본)을 덮어쓴다.
 */
export function emitPlan(model) {
  const name = model.prefix.toLowerCase()
  const relations = listOption(model.relations)
  const plan = [{ suite: 'trace', name }]
  if (model.state && model.command && relations.length > 0)
    plan.push({ suite: 'state', name: `${name}-state`, stateType: model.state, commandType: model.command, relations })
  return plan
}

/** 투영·Bend 설치가 던진 코드의 고치는 법. */
export const genFix = (code) => GEN_FIXES[code] ?? (code.startsWith('BEND_') ? BEND_FIX : '메시지대로 고친 뒤 fod.mjs gen')

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
    for (const { suite, ...options } of emitPlan(model)) {
      const emitted = suite === 'trace' ? await emitTrace({ ...base, ...options, bound: Number(model.bound) }) : await emitState({ ...base, ...options })
      files.push(...emitted.files)
      verification[suite] = emitted.verification
    }
  } catch (error) {
    if (!error.code) throw error
    return { findings: [finding(error.code, model.adapter, error.message, genFix(error.code))] }
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

// adapter를 고친 뒤에는 RED가 다시 기록된다 — 판단은 늘 마지막 RED로
const latestRed = (runs) => runs.findLast((entry) => entry.phase === 'red')

const currentRuns = (dir) => {
  const approval = approvalDigest(dir)
  return readRuns(dir).filter((entry) => entry.approval === approval)
}

// 끝나지 않는 promise를 기다리는 테스트는 출력 없이 영원히 멈춘다 — 시간을 넘기면 끊고 그렇다고 알린다
export const RUN_TIMEOUT_MS = 5 * 60 * 1000

const TIMEOUT_MARK = 'fod.mjs: run timed out'

// spawnSync의 timeout은 직속 자식(sh)만 죽여 vitest worker 같은 손자가 남는다 — 명령을 제 프로세스 그룹에서 돌리고 그룹째 끊는다.
// 그룹이 달라 터미널의 Ctrl-C가 닿지 않으니 신호도 그룹에 넘긴다. 명령이 끝나도 그룹에 남은 프로세스(띄워 두고 잊은 서버)는
// 출력 pipe를 잡고 있어 spawnSync가 끝나지 않으니 함께 끊는다. 표시는 동기로 써야 바로 뒤 exit에 잘리지 않는다.
const WATCHDOG = `const { spawn } = require('node:child_process')
const { writeSync } = require('node:fs')
const [command, ms] = process.argv.slice(1)
const child = spawn(command, { shell: true, detached: true, stdio: 'inherit' })
const stop = (signal) => { try { process.kill(-child.pid, signal) } catch {} }
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => { stop(signal); process.exit(130) })
const timer = setTimeout(() => { writeSync(2, '\\n${TIMEOUT_MARK}\\n'); stop('SIGKILL'); process.exit(124) }, Number(ms))
child.on('exit', (code, signal) => { clearTimeout(timer); stop('SIGKILL'); process.exit(code ?? (signal ? 1 : 0)) })`

export function execute(root, command, limitMs = RUN_TIMEOUT_MS) {
  // 바깥 node --test의 자식 프로토콜 변수를 지운다 — 남기면 자식 테스트가 사람이 읽는 실패 줄 대신 직렬화된 보고를 낸다
  const { NODE_TEST_CONTEXT: _parent, ...env } = process.env
  const done = spawnSync(process.execPath, ['-e', WATCHDOG, '--', command, String(limitMs)], {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    // watchdog 자체가 멈춘 경우의 마지막 안전장치
    timeout: limitMs + 30_000,
  })
  const output = `${done.stdout ?? ''}${done.stderr ?? ''}`
  return {
    exit: done.status ?? 1,
    timedOut: done.error?.code === 'ETIMEDOUT' || (done.status === 124 && output.includes(TIMEOUT_MARK)),
    limitMs,
    output,
    failing: failingTests(output),
    tail: output.trim().split('\n').slice(-15).join('\n'),
  }
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
      `실수로 바꿨으면 RED 때로 되돌린다. adapter를 고친 것이면 제품 수정분을 치워 두고(steps/5-green.md "Setting the fix aside") fod.mjs run red ${id}부터 다시 한다. 모델이 틀렸으면 1·2단계`)]
  }
  // 새 adapter·생성 테스트로는 RED를 다시 본다 — 고치기 전 제품에서 그 테스트가 결함을 잡는지가 아직 증명되지 않았다
  if (red?.tests === tests) return [finding('RED_DONE', where, '이 승인과 지금 테스트·adapter에는 이미 RED가 있다', `제품을 고치고 fod.mjs run green ${id}`)]
  const changed = changedProduct(root, readJson(join(run.dir, 'approval.json')))
  if (changed.length === 0) return []
  return [finding('RED_PRODUCT_CHANGED', changed.join(', '), 'RED 전에 제품 범위 파일이 승인 때와 달라졌다',
    '제품 변경을 따로 보관하고 승인 때 내용으로 되돌린 뒤(steps/5-green.md "Setting the fix aside") RED를 먼저 본다 — 테스트가 고치기 전의 결함을 잡는지가 RED의 증거다')]
}

const TIMEOUT_FIX = {
  red: '고치기 전 제품이 settle하지 않는 promise를 테스트가 await하지 않게, deferred를 테스트가 직접 resolve·reject한다.',
  green: '고친 제품이 settle하지 않는 promise가 남았다: 제품이 그 promise를 끝내게 고치거나, 손 테스트라면 deferred를 테스트가 직접 settle한다.',
}

// 생성 테스트의 이름은 모두 `[MODEL]`로 시작하고, 표본 테스트는 `"row":"MODEL"`을 로그로 남긴다
const GENERATED_RAN = /\[MODEL\]|"row":\s*"MODEL"/
const generatedFailed = (failing) => failing.some((line) => line.includes('[MODEL]'))

/** 새 기능의 RED: 제품 범위 파일이 아직 없어서 adapter의 import가 실패했다. 다른 모듈이 없으면 하네스 문제다. */
// node는 절대 경로를, vitest는 import에 적힌 상대 경로와 `imported from <절대 경로>`를 찍는다(경로에 공백이 있을 수 있다)
const MISSING_MODULE = /Cannot find module '([^']+)'(?: imported from ([^\n]+))?/g

const fileUrl = (text) => text.trim().replace(/^'|'$/g, '').replace(/^file:\/\//, '')

function missingPath(specifier, importer) {
  const plain = fileUrl(specifier)
  if (isAbsolute(plain)) return plain
  if (importer && /^\.\.?\//.test(plain)) return resolve(dirname(fileUrl(importer)), plain)
  return null
}

const inside = (root, absolute, globs) => {
  const file = relative(root, absolute)
  return file !== '..' && !file.startsWith(`..${sep}`) && globs.some((glob) => path.matchesGlob(file, glob))
}

// 없는 모듈이 모두 제품 범위이고, 그걸 찾은 쪽이 adapter·생성 테스트·제품 파일일 때만 — 손 테스트의 import는 생성 테스트가 돌았다는 증거가 아니다
const productModuleMissing = (output, { root, globs, adapter, out }) => {
  const missing = [...output.matchAll(MISSING_MODULE)]
  const loader = [adapter, `${out}/**`, ...globs]
  return missing.length > 0 && missing.every(([, specifier, importer]) => {
    const absolute = missingPath(specifier, importer)
    if (!absolute || !inside(root, absolute, globs)) return false
    return !importer || inside(root, resolve(fileUrl(importer)), loader)
  })
}

/**
 * 실행 결과 판정. RED는 생성 테스트(`[MODEL]`)가 실패해야 한다 — 다른 줄의 실패, 로드되지 않은 테스트 파일, out을 돌리지
 * 않는 명령으로는 기록하지 않는다. 예외는 아직 없는 제품 모듈 하나뿐이다. GREEN은 exit 0이고 생성 테스트가 실제로 돌았어야 한다.
 */
export function judge(phase, cmd, result, scope) {
  const output = result.output ?? ''
  if (result.timedOut)
    return [finding('RUN_TIMEOUT', cmd, `${(result.limitMs ?? RUN_TIMEOUT_MS) / 1000}초 안에 끝나지 않아 멈췄다 — 끝나지 않는 promise를 기다리는 테스트가 있다`,
      `${TIMEOUT_FIX[phase]} 마지막 출력:\n${result.tail}`)]
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
  const red = latestRed(currentRuns(run.dir))
  const tests = testsDigest(root, model)
  const cmd = command || model.test
  const blocked = phaseGate({ root, id, run, phase, red, tests, cmd })
  if (blocked.length > 0) return { findings: blocked }
  const result = execute(root, cmd)
  const scope = { root, globs: readJson(join(run.dir, 'approval.json')).globs, adapter: model.adapter, out: model.out }
  const failures = judge(phase, cmd, result, scope)
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
  if (!fresh(readJson(join(run.dir, 'approval.json')), run))
    return step(2, `독립 리뷰어 1명의 모델 읽기를 마쳤으면 사용자에게 승인을 받고 fod.mjs approve ${id} --by <이름>`)
  const gen = readJson(join(run.dir, 'gen.json'))
  if (!fresh(gen, run) || gen.out !== treeDigest(root, [run.model.out])) return step(3, `adapter를 쓰고 fod.mjs gen ${id}`)
  const red = latestRed(runs)
  if (!red) return step(4, `fod.mjs run red ${id}`)
  if (red.tests !== testsDigest(root, run.model)) return step(4, `adapter·생성 테스트가 RED 뒤에 바뀌었다: 제품 수정분을 치워 두고 fod.mjs run red ${id}`)
  if (!runs.slice(runs.indexOf(red) + 1).some((entry) => entry.phase === 'green')) return step(5, `제품을 고치고 fod.mjs run green ${id}`)
  return step(6, '독립 리뷰어 1명이 fod.mjs run green을 다시 돌리고 배달(adapter·제품 diff·손 테스트)을 읽는다')
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
  const skipped = result.proof?.strength?.skipped ?? []
  if (skipped.length > 0) process.stdout.write(`strength skipped: ${skipped.join(', ')}\n`)
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
