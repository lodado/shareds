#!/usr/bin/env node

// Case space → 판정 프레임 결정적 생성기. 열거는 기계, LLM은 disposition만.
// 같은 카드 바이트는 같은 ID 집합을 낸다 — verify가 재생성해 완전성을 대조한다.

import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

/** `## Case space`를 {strength, families:[{family, dimension, choices, excluded}]}로 읽는다. */
export function parseCaseSpace(document) {
  const lines = document.split('\n')
  const section = sectionLines(lines, 'Case space')
  if (section.length === 0) return null

  const strengthLine = section.find((line) => line.trim().startsWith('- Strength:'))
  const strength = strengthLine ? Number.parseInt(strengthLine.split(':')[1], 10) : 2

  const families = tableRows(section, 'Family').map((cells) => {
    const [family = '', dimension = '', choicesCell = ''] = cells
    if (/^excluded:/.test(choicesCell.trim())) {
      return { family, dimension: null, choices: [], excluded: choicesCell.trim().slice('excluded:'.length).trim() }
    }
    const choices = choicesCell
      .split(',')
      .map((choice) => choice.trim())
      .filter(Boolean)
      .map((choice) => {
        const error = /\[error\]$/.test(choice)
        return { value: choice.replace(/\s*\[error\]$/, ''), error }
      })
    return { family, dimension, choices, excluded: null }
  })

  return { strength, families }
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

/** t-way covering frames + [error] 단독 프레임. 결정적 — 순서는 표 선언 순서만 따른다. */
export function generateCaseFrames(caseSpace) {
  const dimensions = caseSpace.families
    .filter((entry) => !entry.excluded && entry.dimension)
    .map((entry) => ({
      dimension: entry.dimension,
      choices: entry.choices.filter((choice) => !choice.error).map((choice) => choice.value),
    }))
    .filter((entry) => entry.choices.length > 0)

  const errorFrames = []
  for (const entry of caseSpace.families) {
    if (entry.excluded || !entry.dimension) continue
    for (const choice of entry.choices) {
      if (choice.error) errorFrames.push({ id: `E${errorFrames.length + 1}`, label: `[error] ${entry.dimension}=${choice.value}` })
    }
  }

  const strength = Math.min(Math.max(caseSpace.strength, 1), dimensions.length)
  const frames = []
  if (dimensions.length > 0) {
    const uncovered = []
    for (const combo of dimensions.length >= strength ? tupleIndexes(dimensions.length, strength) : []) {
      const build = (position, chosen) => {
        if (position === combo.length) {
          uncovered.push(chosen)
          return
        }
        for (const choice of dimensions[combo[position]].choices) build(position + 1, [...chosen, [combo[position], choice]])
      }
      build(0, [])
    }
    if (uncovered.length === 0 && dimensions.length > 0) {
      // 차원이 strength보다 적으면 1-way: 모든 choice가 한 번씩 나타난다.
      for (const [index, dimension] of dimensions.entries()) {
        for (const choice of dimension.choices) uncovered.push([[index, choice]])
      }
    }

    const covers = (frame, tuple) => tuple.every(([index, choice]) => frame[index] === choice)
    while (uncovered.length > 0) {
      const seed = uncovered[0]
      const frame = new Array(dimensions.length).fill(null)
      for (const [index, choice] of seed) frame[index] = choice
      for (const [index, dimension] of dimensions.entries()) {
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
      frames.push({
        id: `F${frames.length + 1}`,
        label: frame.map((choice, index) => `${dimensions[index].dimension}=${choice}`).join(' × '),
      })
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
  const { frames, errorFrames } = generateCaseFrames(caseSpace)
  const { paths, emptyCells } = enumerateStateModel(document)
  return { caseSpace, frames, errorFrames, paths, emptyCells }
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

  for (const frame of generated.frames) process.stdout.write(`${frame.id} ${frame.label}\n`)
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
    const cliError = error instanceof CliError ? error : new CliError('INPUT_UNREADABLE', error.message ?? String(error))
    process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
    process.exitCode = cliError.exitCode
  }
}
