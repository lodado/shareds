#!/usr/bin/env node
// blackbox-corpus.json → evals.json (skill-creator 형식). 코퍼스가 정본이고 evals.json은 파생이다 — --check가 드리프트를 잡는다.
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const evalDirectory = dirname(fileURLToPath(import.meta.url))
const corpusPath = join(evalDirectory, 'blackbox-corpus.json')
const evalsPath = join(evalDirectory, 'evals.json')

/** expected 필드 하나가 assertion 하나 — 채점자는 증거를 인용해 PASS·FAIL을 매긴다. */
export function assertionsFor(expected) {
  const assertions = [
    `The first line of the response is the lane header and it reports risk=${expected.risk} lane=${expected.lane}`,
    `The reported terminal state is ${expected.status}`,
    `The lane header's nodes list includes every expected node: ${expected.loadedNodes.join(', ')}`,
  ]
  if (expected.forbiddenCeremony?.length) {
    assertions.push(`None of these ceremonies or defects appear in the run: ${expected.forbiddenCeremony.join(', ')}`)
  }
  if (expected.requiredLabels?.length) {
    assertions.push(`The verification report cites actual runs for: ${expected.requiredLabels.join(', ')}`)
  }
  if (expected.lane === 'oracle') {
    assertions.push('Every open question rides the Draft Oracle with candidate rows and a recommendation, and one user confirmation resolves and approves the card')
  }
  return assertions
}

/** held-out 케이스 — 저자가 아니라 실제 escape가 정답을 준다. assertion은 Draft가 그 escape를 카드 시점에 잡았는지. */
export function heldOutEvals(heldOut, offset) {
  return heldOut.cases.map((entry, index) => ({
    id: offset + index + 1,
    name: entry.id,
    category: 'held-out-escape',
    source: entry.source,
    prompt: entry.prompt,
    expected_output: `A Draft Oracle (risk=${entry.expected.risk}, lane=${entry.expected.lane}) whose sweep·deviations·landmines·Open questions already carry the ${entry.escapes.length} escapes below; the run ends ${entry.expected.status} after ${entry.expected.turnsToDraft} user turn.`,
    files: [],
    assertions: [
      `The first line of the response is the lane header and it reports risk=${entry.expected.risk} lane=${entry.expected.lane}`,
      ...entry.escapes.map((escape) => escape.assertion),
      `The Draft reaches the user after ${entry.expected.turnsToDraft} turn, with every surviving question inside the Draft as an Open question`,
    ],
  }))
}

export function toEvals(corpus, heldOut = { cases: [] }) {
  const evals = corpus.cases.map((entry, index) => ({
    id: index + 1,
    name: entry.id,
    category: entry.category,
    prompt: entry.prompt,
    expected_output: `Lane header risk=${entry.expected.risk} lane=${entry.expected.lane}, terminal state ${entry.expected.status}, reference nodes read: ${entry.expected.loadedNodes.join(', ')}.`,
    files: [],
    assertions: assertionsFor(entry.expected),
  }))
  return {
    skill_name: 'frontend-oracle-design',
    source: corpus.name,
    evals: [...evals, ...heldOutEvals(heldOut, evals.length)],
  }
}

const heldOutPath = join(evalDirectory, 'held-out.json')

async function main() {
  const corpus = JSON.parse(await readFile(corpusPath, 'utf8'))
  const heldOut = JSON.parse(await readFile(heldOutPath, 'utf8').catch(() => '{"cases":[]}'))
  const rendered = `${JSON.stringify(toEvals(corpus, heldOut), null, 2)}\n`

  if (process.argv.includes('--check')) {
    const current = await readFile(evalsPath, 'utf8').catch(() => null)
    if (current !== rendered) {
      process.stderr.write('EVALS_STALE: evals/evals.json does not match blackbox-corpus.json — run to-skill-creator-evals.mjs\n')
      process.exitCode = 1
    } else {
      process.stdout.write(`evals ok — ${corpus.cases.length} corpus + ${heldOut.cases.length} held-out cases\n`)
    }
    return
  }

  await writeFile(evalsPath, rendered)
  process.stdout.write(`generated evals.json — ${corpus.cases.length} corpus + ${heldOut.cases.length} held-out cases\n`)
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop())) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
