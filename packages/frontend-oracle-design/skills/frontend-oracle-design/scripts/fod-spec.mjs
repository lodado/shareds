// SPEC.md 읽기·1단계 검사·run 기록. fod.mjs와 가드 훅이 함께 쓴다 — 무거운 모듈(Bend·투영)을 import하지 않는다.

import { createHash } from 'node:crypto'
// globSync는 Node 22.5+에만 있다 — 이름으로 import하지 않아서 옛 Node에서도 가드 훅이 로드되고, 호출 때 실패해 막지 않는다
import fs, { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

export const AXES = ['Data', 'Value', 'Async', 'Order', 'Entry', 'Environment', 'Platform']
export const REQUIRED_SECTIONS = ['목표', '출처', '규칙', '7축', '범위 밖', '모델']
export const REQUIRED_MODEL_KEYS = ['model', 'prefix', 'bound', 'adapter', 'out', 'product', 'test']
export const RUN_ROOT = join('.ai', 'oracles')
export const OUTSIDE_MODEL = '모델 밖'

// 테스트로 판정할 수 없는 말. 규칙은 관찰할 수 있는 결과로 쓴다.
const VAGUE = [/적절[한히]/, /빠르게/, /가능하면/, /필요(?:시|하면)/, /알아서/, /자연스럽게/, /\bappropriate(?:ly)?\b/i,
  /\bas needed\b/i, /\bquickly\b/i, /\bproperly\b/i, /\bgracefully\b/i, /\buser-friendly\b/i, /\betc\b/i]
const UNDECIDED = new Set(['', 'tbd', 'todo', '미정', '추후', '나중에', 'n/a'])

export const sha256 = (text) => createHash('sha256').update(text).digest('hex')

export const runDir = (root, id) => join(root, RUN_ROOT, id)

/** `- ID: 본문` 목록 줄. id가 형식에 맞지 않으면 null. */
function listItem(raw, idPattern) {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('- ')) return null
  const rest = trimmed.slice(2)
  const colon = rest.indexOf(':')
  if (colon < 1) return null
  const id = rest.slice(0, colon).trim()
  return idPattern.test(id) ? { id, body: rest.slice(colon + 1).trim() } : null
}

const tableCells = (raw) => {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('|')) return []
  return trimmed.split('|').slice(1, trimmed.endsWith('|') ? -1 : undefined).map((cell) => cell.trim())
}

function unquote(value) {
  if (value.length < 2 || !value.startsWith('`') || !value.endsWith('`')) return value
  return value.slice(1, -1)
}

/** `## 제목` 단위로 나눈 SPEC. 표·목록은 원문 줄 그대로 둔다. */
export function parseSpec(text) {
  const sections = new Map()
  let current = null
  for (const [index, line] of text.split('\n').entries()) {
    if (line.startsWith('## ')) {
      current = { name: line.slice(3).trim(), line: index + 1, lines: [] }
      sections.set(current.name, current)
    } else {
      current?.lines.push({ text: line, line: index + 1 })
    }
  }
  const items = (name, idPattern) =>
    (sections.get(name)?.lines ?? []).flatMap(({ text: raw, line }) => {
      const item = listItem(raw, idPattern)
      return item ? [{ ...item, line }] : []
    })
  const axes = new Map()
  for (const { text: raw, line } of sections.get('7축')?.lines ?? []) {
    const [axis, value = '', model = '', source = ''] = tableCells(raw)
    if (AXES.includes(axis)) axes.set(axis, { value, model, source, line })
  }
  return {
    sections,
    sources: items('출처', /^[CS]\d+$/),
    rules: items('규칙', /^R\d+$/),
    questions: items('질문', /^Q\d+$/),
    axes,
    model: Object.fromEntries(items('모델', /^[a-z]+$/).map(({ id, body }) => [id, unquote(body)])),
  }
}

const finding = (code, where, message, fix) => ({ code, where, message, fix })

function sectionFindings(spec, file) {
  const out = REQUIRED_SECTIONS.filter((name) => !spec.sections.has(name)).map((name) =>
    finding('SPEC_SECTION_MISSING', file, `## ${name} 절이 없다`, `templates/SPEC.md의 ## ${name} 절을 채운다`),
  )
  if (spec.sections.has('규칙') && spec.rules.length === 0)
    out.push(finding('SPEC_NO_RULES', file, '규칙이 하나도 없다', '`- R1: <언제>, <무엇>은 <관찰 결과>여야 한다 (S1)` 형식으로 쓴다'))
  return out
}

function ruleFindings(spec, file) {
  const known = new Set([...spec.sources, ...spec.questions].map(({ id }) => id))
  const seen = new Set()
  const out = []
  for (const rule of spec.rules) {
    const where = `${file}:${rule.line}`
    if (seen.has(rule.id)) out.push(finding('SPEC_RULE_DUPLICATE', where, `${rule.id}가 두 번 나온다`, '번호를 하나로 정리한다'))
    seen.add(rule.id)
    const cited = [...rule.body.matchAll(/\b([CQS]\d+)\b/g)].map((match) => match[1])
    if (cited.length === 0 || cited.some((id) => !known.has(id)))
      out.push(finding('SPEC_RULE_NO_SOURCE', where, `${rule.id}가 ## 출처의 S*/C* 또는 ## 질문의 Q*를 인용하지 않는다`,
        '근거 문장·코드 줄을 ## 출처에 S*/C*로 적고 규칙 끝에 (S1)처럼 단다. ★ 추천으로 정한 규칙은 그 질문을 (Q1)로 단다'))
    const vague = VAGUE.map((pattern) => rule.body.match(pattern)).find(Boolean)
    if (vague)
      out.push(finding('SPEC_RULE_VAGUE', where, `${rule.id}에 판정할 수 없는 말 "${vague[0]}"이 있다`,
        '관찰할 수 있는 결과(개수·문구·상태·순서)로 바꾼다'))
  }
  return out
}

function axisFindings(spec, file) {
  if (!spec.sections.has('7축')) return []
  return AXES.flatMap((axis) => {
    const row = spec.axes.get(axis)
    if (!row)
      return [finding('SPEC_AXIS_MISSING', file, `7축 표에 ${axis} 행이 없다`, `| ${axis} | 값·경계 또는 N/A — 이유 | 모델 식별자 | S* |`)]
    const value = row.value.toLowerCase()
    if (UNDECIDED.has(value) || /^\?+$/.test(value))
      return [finding('SPEC_AXIS_UNDECIDED', `${file}:${row.line}`, `${axis} 값이 정해지지 않았다`,
        '값·경계를 적거나 `N/A — <왜 이 기능에 없는지>`로 닫는다. 정할 수 없으면 ## 질문에 Q*로 올린다')]
    return []
  })
}

function modelFindings(spec, file) {
  if (!spec.sections.has('모델')) return []
  const out = REQUIRED_MODEL_KEYS.filter((key) => !spec.model[key]).map((key) =>
    finding('SPEC_MODEL_KEY_MISSING', file, `## 모델에 ${key}가 없다`, `\`- ${key}: ...\` 줄을 templates/SPEC.md처럼 적는다`),
  )
  for (const key of ['bound', 'runs']) {
    if (spec.model[key] && !/^[1-9]\d*$/.test(spec.model[key]))
      out.push(finding('SPEC_MODEL_KEY_INVALID', file, `${key} "${spec.model[key]}"가 양의 정수가 아니다`, `\`- ${key}: 3\`처럼 적는다`))
  }
  const { runner, environment } = spec.model
  if (runner && !['node-test', 'vitest'].includes(runner))
    out.push(finding('SPEC_MODEL_KEY_INVALID', file, `runner "${runner}"를 모른다`, '`- runner: node-test` 또는 `- runner: vitest`'))
  if (environment && (runner !== 'vitest' || !/^[\w-]+$/.test(environment)))
    out.push(finding('SPEC_MODEL_KEY_INVALID', file, `environment "${environment}"는 runner vitest와 함께 jsdom 같은 이름으로만 쓴다`, '`- runner: vitest`와 `- environment: jsdom`'))
  return out
}

// 틀의 자리표시(`<기능 이름>`처럼 한글이 든 꺾쇠)가 남은 줄
const placeholderIn = (line) => line.match(/<[^\n<>`]+>/g)?.find((part) => /\p{Script=Hangul}/u.test(part))

function placeholderFindings(text, file) {
  return text.split('\n').flatMap((line, index) => {
    const placeholder = placeholderIn(line)
    if (!placeholder) return []
    return [finding('SPEC_PLACEHOLDER', `${file}:${index + 1}`, `틀의 자리표시 ${placeholder}가 남았다`, '실제 내용으로 바꾸거나 그 줄을 지운다')]
  })
}

/** 1단계 검사. 모든 위반을 한 번에 돌려준다 — 하나 고치고 다시 돌리는 왕복을 만들지 않는다. */
export function checkSpec(text, file = 'SPEC.md') {
  const spec = parseSpec(text)
  return {
    spec,
    findings: [
      ...placeholderFindings(text, file),
      ...[sectionFindings, ruleFindings, axisFindings, modelFindings].flatMap((check) => check(spec, file)),
    ],
  }
}

/** 축이 N/A로 닫혔는지 — 닫힌 축은 모델 식별자가 없어도 된다. */
export const axisClosed = (row) => /^n\/a\s*[—-]\s*\S/.test(row.value.toLowerCase())

export const productGlobs = (model) =>
  model.product
    .split(',')
    .map((glob) => unquote(glob.trim()))
    .filter(Boolean)

/** 제품 범위 파일의 digest 표. 아직 없는 파일(새 기능)은 표에 없고, RED 전에 생기면 바뀐 것으로 본다. */
export function productDigests(root, globs) {
  const files = globs.flatMap((pattern) => fs.globSync(pattern, { cwd: root, exclude: (name) => name === 'node_modules' }))
  return Object.fromEntries(
    [...new Set(files)]
      .filter((file) => statSync(join(root, file)).isFile())
      .sort()
      .map((file) => [file, sha256(readFileSync(join(root, file)))]),
  )
}

/** 디렉터리(재귀)와 개별 파일들의 내용 digest 하나. 없는 경로는 이름만 들어간다. */
export function treeDigest(root, paths) {
  const entries = []
  const visit = (path) => {
    const full = resolve(root, path)
    if (!existsSync(full)) entries.push(`${path}\0missing`)
    else if (statSync(full).isDirectory()) for (const name of readdirSync(full).sort()) visit(join(path, name))
    else entries.push(`${relative(root, full)}\0${sha256(readFileSync(full))}`)
  }
  for (const path of paths) visit(path)
  return sha256(entries.join('\n'))
}

export function readJson(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null
}

export function readRuns(dir) {
  const file = join(dir, 'run.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

/** cwd에서 위로 올라가며 `.ai/oracles`가 있는 저장소 루트를 찾는다. */
export function findRoot(start) {
  let dir = resolve(start)
  while (!existsSync(join(dir, RUN_ROOT))) {
    const parent = resolve(dir, '..')
    if (parent === dir) return null
    dir = parent
  }
  return dir
}
