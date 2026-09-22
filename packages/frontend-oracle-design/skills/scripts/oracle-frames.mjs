#!/usr/bin/env node

// Case space → 판정 프레임 결정적 생성기. 열거는 기계, LLM은 disposition만.
// 같은 카드 바이트는 같은 ID 집합을 낸다 — verify가 재생성해 완전성을 대조한다.

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { sha256, stableStringify } from './oracle-fs.mjs'

export const TAXONOMY_FAMILIES = [
  'Data',
  'Value',
  'Async',
  'Order',
  'Entry',
  'Environment',
  'Platform',
  'Inherited',
]

class CliError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

function sectionLines(lines, title) {
  const section = []
  let active = false
  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (active) break
      active = line.trim() === `## ${title}`
      continue
    }
    if (active) section.push(line)
  }
  return section
}

function splitRow(line) {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim())
}

function tableRows(lines, headerFirstCell) {
  return lines
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => splitRow(line.trim()))
    .filter((cells) => cells[0] !== headerFirstCell && !/^:?-+:?$/.test(cells[0]))
}

const STABLE_ID = /^[A-Z0-9][\w-]*$/i
const MAX_FULL_PRODUCT = 100_000

function parseCaseSpaceMetadata(section) {
  const matches = [...section.join('\n').matchAll(/^```json[^\S\n]*\n([\s\S]*?)^```[^\S\n]*$/gm)]
  if (matches.length === 0) return null
  if (matches.length !== 1) throw Object.assign(new Error('Case space metadata must contain one JSON fence'), { code: 'CASE_SPACE_METADATA' })
  try {
    const metadata = JSON.parse(matches[0][1])
    if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') throw new Error('metadata must be an object')
    return metadata
  } catch (error) {
    throw Object.assign(new Error(`Malformed Case space metadata: ${error.message}`), { code: 'CASE_SPACE_METADATA', cause: error })
  }
}

/** `## Case space`를 {strength, coverage, metadata, families:[{family, dimension, choices, excluded}]}로 읽는다. */
export function parseCaseSpace(document) {
  const lines = document.split('\n')
  const section = sectionLines(lines, 'Case space')
  if (section.length === 0) return null

  const strengthLine = section.find((line) => line.trim().startsWith('- Strength:'))
  const strength = strengthLine ? Number.parseInt(strengthLine.split(':')[1], 10) : 2
  const coverageLine = section.find((line) => line.trim().startsWith('- Coverage:'))
  const coverage = coverageLine ? coverageLine.split(':').slice(1).join(':').trim() : null
  if (coverage && coverage !== 'full-product') {
    throw Object.assign(new Error(`Unknown Case space coverage: ${coverage}`), { code: 'CASE_SPACE_COVERAGE' })
  }
  const metadata = coverage === 'full-product' ? parseCaseSpaceMetadata(section) : null
  if (coverage === 'full-product' && !metadata) {
    throw Object.assign(new Error('full-product requires fenced JSON metadata'), { code: 'CASE_SPACE_METADATA' })
  }

  const families = tableRows(section, 'Family').map((cells) => {
    const [family = '', dimension = '', choicesCell = '', touchesCell = ''] = cells
    if (choicesCell.trim().startsWith('excluded:')) {
      return {
        family,
        dimension: null,
        choices: [],
        excluded: choicesCell.trim().slice('excluded:'.length).trim(),
        touches: null,
      }
    }
    const choices = choicesCell
      .split(',')
      .map((choice) => choice.trim())
      .filter(Boolean)
      .map((choice) => {
        const error = /\[error\]$/.test(choice)
        let value = choice
        if (error) value = choice.slice(0, -'[error]'.length).trimEnd()
        return { value, error }
      })
    if (coverage === 'full-product' && choicesCell.split(',').some((choice) => !choice.trim())) {
      throw Object.assign(new Error(`Empty choice ID: ${dimension}`), { code: 'CASE_SPACE_ID' })
    }
    return { family, dimension, choices, excluded: null, touches: parseTouches(touchesCell) }
  })

  if (coverage === 'full-product') {
    const seenDimensions = new Set()
    for (const entry of families) {
      if (entry.excluded) continue
      if (!STABLE_ID.test(entry.dimension)) throw Object.assign(new Error(`Dimension is not an ASCII stable ID: ${entry.dimension}`), { code: 'CASE_SPACE_ID' })
      if (seenDimensions.has(entry.dimension)) throw Object.assign(new Error(`Duplicate dimension ID: ${entry.dimension}`), { code: 'CASE_SPACE_ID' })
      seenDimensions.add(entry.dimension)
      const seenChoices = new Set()
      for (const choice of entry.choices) {
        if (!STABLE_ID.test(choice.value)) throw Object.assign(new Error(`Choice is not an ASCII stable ID: ${choice.value}`), { code: 'CASE_SPACE_ID' })
        if (seenChoices.has(choice.value)) throw Object.assign(new Error(`Duplicate choice ID: ${entry.dimension}=${choice.value}`), { code: 'CASE_SPACE_ID' })
        seenChoices.add(choice.value)
      }
    }
  }

  return { strength, coverage, metadata, model: metadata, families }
}

/** 선택 열 `Touches` — 차원이 닿을 수 있는 P·I id 인용, 또는 `independent: <reason>`. 열이 없으면 null. */
function parseTouches(cell) {
  const value = (cell ?? '').trim()
  if (value.startsWith('independent:')) {
    return { independent: value.slice('independent:'.length).trim(), ids: [] }
  }
  const ids = [...new Set(value.match(/\b[PI]\d+\b/g) ?? [])]
  return ids.length > 0 ? { independent: null, ids } : null
}

function* tupleIndexes(count, size) {
  const indexes = Array.from({ length: size }, (_, position) => position)
  while (true) {
    yield [...indexes]
    let cursor = size - 1
    while (cursor >= 0 && indexes[cursor] === count - size + cursor) cursor -= 1
    if (cursor < 0) return
    indexes[cursor] += 1
    for (let position = cursor + 1; position < size; position += 1) indexes[position] = indexes[position - 1] + 1
  }
}

export function canonicalTuple(tuple) {
  return stableStringify(tuple)
}

export function frameId(tuple, dimensionRevision, constraintRevision) {
  const digest = sha256(`${canonicalTuple(tuple)}${dimensionRevision}${constraintRevision}`)
  return `F${digest}`
}

function fullProductFrames(caseSpace) {
  const dimensions = caseSpace.families
    .filter((entry) => !entry.excluded && entry.dimension)
    .map((entry) => ({ dimension: entry.dimension, choices: entry.choices.map((choice) => choice.value) }))
  if (dimensions.length === 0 || dimensions.some((dimension) => dimension.choices.length === 0)) {
    throw Object.assign(new Error('full-product dimensions and values must not be empty'), { code: 'CASE_SPACE_ID' })
  }

  const dimensionModel = dimensions
    .map((dimension) => ({
      id: dimension.dimension,
      values: [...dimension.choices].sort(),
      source: caseSpace.metadata?.dimensionSources?.[dimension.dimension] ?? null,
    }))
    .sort((left, right) => left.id.localeCompare(right.id))
  if (!Array.isArray(caseSpace.metadata?.constraints)) throw Object.assign(new Error('constraints must be an explicit array'), { code: 'CASE_SPACE_METADATA' })
  const { constraints: declaredConstraints, ...metadata } = caseSpace.metadata
  const constraints = [...declaredConstraints].sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)))
  const dimensionRevision = sha256(stableStringify({ dimensions: dimensionModel, metadata }))
  const constraintRevision = sha256(stableStringify(constraints))
  const rawCount = dimensions.reduce((count, dimension) => count * dimension.choices.length, 1)
  if (rawCount > MAX_FULL_PRODUCT) {
    throw Object.assign(new Error(`full-product requires ${rawCount} tuples; limit is ${MAX_FULL_PRODUCT}`), { code: 'CASE_SPACE_INCOMPLETE' })
  }

  const frames = []
  const visit = (index, tuple) => {
    if (index === dimensions.length) {
      const label = dimensions.map((dimension) => `${dimension.dimension}=${tuple[dimension.dimension]}`).join(' × ')
      frames.push({ id: frameId(tuple, dimensionRevision, constraintRevision), label, tuple })
      return
    }
    const dimension = dimensions[index]
    for (const value of dimension.choices) visit(index + 1, { ...tuple, [dimension.dimension]: value })
  }
  visit(0, {})
  return { frames, errorFrames: [], dimensionRevision, constraintRevision, rawCount }
}

/** t-way covering frames + [error] 단독 프레임. 결정적 — 순서는 표 선언 순서만 따른다.
 * Touches가 채택된 카드는 인용 P·I id가 직접 겹치는 차원 조합만 의무로 삼고(강도 3은 상호 공유
 * clique), 파트너 없는 차원·independent 차원은 choice당 1-way 프레임이 된다. 열이 없으면 전 쌍. */
export function generateCaseFrames(caseSpace) {
  if (caseSpace.coverage === 'full-product') return fullProductFrames(caseSpace)
  const dimensions = caseSpace.families
    .filter((entry) => !entry.excluded && entry.dimension)
    .map((entry) => ({
      dimension: entry.dimension,
      choices: entry.choices.filter((choice) => !choice.error).map((choice) => choice.value),
      touches: entry.touches,
    }))
    .filter((entry) => entry.choices.length > 0)

  const errorFrames = []
  for (const entry of caseSpace.families) {
    if (entry.excluded || !entry.dimension) continue
    for (const choice of entry.choices) {
      if (choice.error) errorFrames.push({ id: `E${errorFrames.length + 1}`, label: `[error] ${entry.dimension}=${choice.value}` })
    }
  }

  const frames = []
  const pushFrame = (label) => frames.push({ id: `F${frames.length + 1}`, label })

  // 공용 greedy — dims 지역 인덱스의 tuple 집합을 덮는 최소 근사 프레임을 순서대로 뽑는다.
  const covers = (frame, tuple) => tuple.every(([index, choice]) => frame[index] === choice)
  const addGreedyFrames = (dims, uncovered) => {
    while (uncovered.length > 0) {
      const seed = uncovered[0]
      const frame = Array.from({ length: dims.length }).fill(null)
      for (const [index, choice] of seed) frame[index] = choice
      for (const [index, dimension] of dims.entries()) {
        if (frame[index] !== null) continue
        let best = dimension.choices[0]
        let bestScore = -1
        for (const choice of dimension.choices) {
          frame[index] = choice
          const score = uncovered.filter((tuple) => tuple.every(([position, value]) => frame[position] === null || frame[position] === value) && tuple.some(([position]) => position === index)).length
          if (score > bestScore) {
            bestScore = score
            best = choice
          }
        }
        frame[index] = best
      }
      for (let cursor = uncovered.length - 1; cursor >= 0; cursor -= 1) {
        if (covers(frame, uncovered[cursor])) uncovered.splice(cursor, 1)
      }
      pushFrame(frame.map((choice, index) => `${dims[index].dimension}=${choice}`).join(' × '))
    }
  }

  const valueTuples = (dims, combo) => {
    const tuples = []
    const build = (position, chosen) => {
      if (position === combo.length) {
        tuples.push(chosen)
        return
      }
      for (const choice of dims[combo[position]].choices) build(position + 1, [...chosen, [combo[position], choice]])
    }
    build(0, [])
    return tuples
  }

  const touchesAdopted = dimensions.some(
    (entry) => entry.touches && (entry.touches.independent || entry.touches.ids.length > 0),
  )

  if (dimensions.length > 0 && !touchesAdopted) {
    const strength = Math.min(Math.max(caseSpace.strength, 1), dimensions.length)
    const uncovered = []
    for (const combo of dimensions.length >= strength ? tupleIndexes(dimensions.length, strength) : []) {
      uncovered.push(...valueTuples(dimensions, combo))
    }
    if (uncovered.length === 0 && dimensions.length > 0) {
      // 차원이 strength보다 적으면 1-way: 모든 choice가 한 번씩 나타난다.
      for (const [index, dimension] of dimensions.entries()) {
        for (const choice of dimension.choices) uncovered.push([[index, choice]])
      }
    }
    addGreedyFrames(dimensions, uncovered)
  }

  if (dimensions.length > 0 && touchesAdopted) {
    const shares = (left, right) =>
      (left.touches?.ids ?? []).some((id) => (right.touches?.ids ?? []).includes(id))

    // 직접 공유 그래프의 연결 성분 — 프레임은 성분을 넘지 않고, 라벨도 성분 차원만 싣는다.
    const assigned = new Set()
    const components = []
    for (const [index, entry] of dimensions.entries()) {
      if (assigned.has(index) || (entry.touches?.ids?.length ?? 0) <= 0) continue
      const queue = [index]
      const component = []
      assigned.add(index)
      while (queue.length > 0) {
        const current = queue.shift()
        component.push(current)
        for (const [candidate, other] of dimensions.entries()) {
          if (assigned.has(candidate) || (other.touches?.ids?.length ?? 0) <= 0) continue
          if (shares(dimensions[current], other)) {
            assigned.add(candidate)
            queue.push(candidate)
          }
        }
      }
      components.push(component)
    }

    const strength = Math.max(caseSpace.strength, 2)
    for (const component of components) {
      if (component.length < 2) continue
      const dims = component.map((index) => dimensions[index])
      const uncovered = []
      for (const combo of tupleIndexes(dims.length, 2)) {
        if (!shares(dims[combo[0]], dims[combo[1]])) continue
        uncovered.push(...valueTuples(dims, combo))
      }
      if (strength >= 3 && dims.length >= 3) {
        for (const combo of tupleIndexes(dims.length, 3)) {
          const clique = combo.every((left, position) =>
            combo.slice(position + 1).every((right) => shares(dims[left], dims[right])),
          )
          if (clique) uncovered.push(...valueTuples(dims, combo))
        }
      }
      addGreedyFrames(dims, uncovered)
    }

    // 파트너 없는 인용 차원·Touches 미기재 차원·independent 차원 — choice당 1-way.
    for (const [index, entry] of dimensions.entries()) {
      const inCombination = components.some((component) => component.length >= 2 && component.includes(index))
      if (inCombination) continue
      for (const choice of entry.choices) pushFrame(`${entry.dimension}=${choice}`)
    }
  }

  return { frames, errorFrames }
}

/** `## State Model`에서 초기 상태 기준 모든 maximal simple path와 빈 state×event 셀을 열거한다. */
export function enumerateStateModel(document) {
  const lines = document.split('\n')
  const section = sectionLines(lines, 'State Model')
  if (section.length === 0) return { paths: [], emptyCells: [] }

  const listOf = (label) =>
    section
      .find((line) => line.trim().startsWith(`- ${label}:`))
      ?.split(':')
      .slice(1)
      .join(':')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean) ?? []

  const states = listOf('States')
  const events = listOf('Events')
  const transitions = tableRows(section, 'From').map(([from, event, to]) => ({ from, event, to }))
  if (states.length === 0 || transitions.length === 0) return { paths: [], emptyCells: [] }

  const emptyCells = []
  for (const state of states) {
    for (const event of events) {
      if (!transitions.some((transition) => transition.from === state && transition.event === event)) {
        emptyCells.push({ id: `EMPTY ${state} × ${event}`, state, event })
      }
    }
  }

  const paths = []
  const walk = (state, visited, steps) => {
    const outgoing = transitions.filter((transition) => transition.from === state)
    if (outgoing.length === 0) {
      if (steps.length > 0) paths.push(steps)
      return
    }
    for (const transition of outgoing) {
      if (visited.has(transition.to)) {
        // 사이클을 닫는 전이는 마지막 한 발로 기록하고 중단한다 — 빼면 성공 복귀 경로가 통째로 사라진다.
        paths.push([...steps, transition])
      } else {
        walk(transition.to, new Set([...visited, transition.to]), [...steps, transition])
      }
    }
  }
  walk(states[0], new Set([states[0]]), [])

  return {
    paths: paths.map((steps, index) => ({
      id: `PATH${index + 1}`,
      label: [states[0], ...steps.map((step) => `-${step.event}-> ${step.to}`)].join(' '),
    })),
    emptyCells,
  }
}

/** 카드 문서 하나에서 전체 프레임 ID 집합을 만든다 — verify와 CLI가 같은 함수를 쓴다. */
export function generateFromDocument(document) {
  const caseSpace = parseCaseSpace(document)
  if (!caseSpace) return null
  const { frames, errorFrames, dimensionRevision, constraintRevision, rawCount } = generateCaseFrames(caseSpace)
  const { paths, emptyCells } = enumerateStateModel(document)
  return { caseSpace, frames, errorFrames, paths, emptyCells, ...(caseSpace.coverage === 'full-product' ? { dimensionRevision, constraintRevision, rawCount } : {}) }
}

async function main() {
  const args = process.argv.slice(2)
  const oracleIndex = args.indexOf('--oracle')
  if (oracleIndex === -1 || !args[oracleIndex + 1]) throw new CliError('USAGE', 'Expected --oracle <path>', 2)

  const document = await readFile(resolve(args[oracleIndex + 1]), 'utf8').catch((error) => {
    throw new CliError('INPUT_UNREADABLE', error.message)
  })
  const generated = generateFromDocument(document)
  if (!generated) throw new CliError('NO_CASE_SPACE', 'Card has no ## Case space section')

  if (args.includes('--json')) {
    process.stdout.write(`${JSON.stringify(generated)}\n`)
    return
  }

  if (generated.caseSpace.coverage === 'full-product') {
    process.stdout.write(`dimension-revision ${generated.dimensionRevision} · constraint-revision ${generated.constraintRevision} · raw ${generated.rawCount}\n`)
  }

  for (const frame of generated.frames) {
    const tuple = frame.tuple ? ` ${JSON.stringify(frame.tuple)}` : ''
    process.stdout.write(`${frame.id} ${frame.label}${tuple}\n`)
  }
  for (const frame of generated.errorFrames) process.stdout.write(`${frame.id} ${frame.label}\n`)
  for (const path of generated.paths) process.stdout.write(`${path.id} ${path.label}\n`)
  for (const cell of generated.emptyCells) process.stdout.write(`${cell.id}\n`)
  process.stdout.write(
    `frames ${generated.frames.length} · error-frames ${generated.errorFrames.length} · paths ${generated.paths.length} · empty-cells ${generated.emptyCells.length}\n`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    let code = 'INPUT_UNREADABLE'
    if (error.code?.startsWith('CASE_SPACE_')) code = error.code
    const cliError = error instanceof CliError ? error : new CliError(code, error.message ?? String(error))
    process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
    process.exitCode = cliError.exitCode
  }
}
