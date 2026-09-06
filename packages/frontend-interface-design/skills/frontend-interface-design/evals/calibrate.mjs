#!/usr/bin/env node
// Judge-versus-human calibration. human-votes.json is a list of { briefId, a, b, winner } where a and
// b name the two run directories (or their variants) of a judged pair and winner is "A", "B" or
// "tie". Agreement is computed over the human's decisive votes only (a human tie says nothing
// about direction); a judge tie against a decisive human vote counts as a disagreement. Below 75%
// the checklist is the suspect, not the humans — fix the questions and re-measure.
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const USAGE = 'USAGE: calibrate.mjs --judgments <dir> --votes <human-votes.json> --out <json>'
const SWAP = { A: 'B', B: 'A', tie: 'tie' }

export const AGREEMENT_THRESHOLD = 0.75

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sideMatches(side, reference, baseDirectory) {
  if (!isRecord(side) || typeof reference !== 'string') return false
  if (reference === side.variant) return true
  if (typeof side.dir !== 'string') return false
  return resolve(baseDirectory, reference) === resolve(side.dir) || reference === side.dir
}

/** The judgment for a vote, with `swapped` when the vote names the pair in the other order. */
export function matchJudgment(judgments, vote, baseDirectory = process.cwd()) {
  for (const judgment of judgments) {
    if (judgment.briefId !== vote.briefId) continue
    if (sideMatches(judgment.a, vote.a, baseDirectory) && sideMatches(judgment.b, vote.b, baseDirectory)) return { judgment, swapped: false }
    if (sideMatches(judgment.a, vote.b, baseDirectory) && sideMatches(judgment.b, vote.a, baseDirectory)) return { judgment, swapped: true }
  }
  return null
}

/** Agreement rate between judge winners and decisive human votes, flagged below the 75% target. */
export function calibrate(judgments, votes, { baseDirectory = process.cwd(), threshold = AGREEMENT_THRESHOLD } = {}) {
  const results = []
  const unmatched = []
  let decisive = 0
  let agreements = 0
  let judgeTies = 0
  for (const vote of votes) {
    if (!isRecord(vote) || !Object.hasOwn(SWAP, vote.winner)) {
      unmatched.push({ vote, reason: 'INVALID_VOTE' })
      continue
    }
    const match = matchJudgment(judgments, vote, baseDirectory)
    if (!match) {
      unmatched.push({ vote, reason: 'NO_JUDGMENT' })
      continue
    }
    const judgeWinner = match.swapped ? SWAP[match.judgment.winner] ?? 'tie' : match.judgment.winner
    const counted = vote.winner !== 'tie'
    const agree = counted ? judgeWinner === vote.winner : null
    if (counted) {
      decisive += 1
      if (agree) agreements += 1
      if (judgeWinner === 'tie') judgeTies += 1
    }
    results.push({ briefId: vote.briefId, humanWinner: vote.winner, judgeWinner, counted, agree })
  }
  const agreementRate = decisive ? Math.round((agreements / decisive) * 10000) / 10000 : null
  return {
    pairs: results.length,
    decisive,
    agreements,
    judgeTies,
    agreementRate,
    threshold,
    flagged: agreementRate === null || agreementRate < threshold,
    unmatched,
    results,
  }
}

function option(args, name) {
  const index = args.indexOf(name)
  return index === -1 ? null : args[index + 1]
}

async function readJudgments(directory) {
  const judgments = []
  for (const name of (await readdir(directory)).sort()) {
    if (!name.endsWith('.json')) continue
    try {
      const judgment = JSON.parse(await readFile(join(directory, name), 'utf8'))
      if (isRecord(judgment) && typeof judgment.briefId === 'string' && typeof judgment.winner === 'string') judgments.push(judgment)
    } catch {
      // Not a judgment file; the directory may hold notes.
    }
  }
  return judgments
}

async function main() {
  const args = process.argv.slice(2)
  const judgmentsDirectory = option(args, '--judgments')
  const votesFile = option(args, '--votes')
  const out = option(args, '--out')
  if (!judgmentsDirectory || !votesFile || !out) {
    process.stderr.write(`${USAGE}\n`)
    process.exitCode = 2
    return
  }
  const [judgments, votes] = await Promise.all([readJudgments(resolve(judgmentsDirectory)), readFile(resolve(votesFile), 'utf8').then(JSON.parse)])
  if (!Array.isArray(votes)) throw new Error('INVALID_VOTES: expected an array')
  const report = { generatedAt: new Date().toISOString(), judgments: judgments.length, votes: votes.length, ...calibrate(judgments, votes, { baseDirectory: dirname(resolve(votesFile)) }) }
  await writeFile(resolve(out), `${JSON.stringify(report, null, 2)}\n`)
  const rate = report.agreementRate === null ? 'n/a' : `${Math.round(report.agreementRate * 100)}%`
  process.stdout.write(
    `agreement ${rate} (${report.agreements}/${report.decisive} decisive votes, ${report.unmatched.length} unmatched) — ${report.flagged ? `BELOW ${Math.round(AGREEMENT_THRESHOLD * 100)}%: fix the checklist and re-measure` : 'OK'} → ${resolve(out)}\n`,
  )
  if (report.flagged) process.exitCode = 1
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`EVAL_CALIBRATE_FAILED: ${error.message}\n`)
    process.exitCode = 2
  })
}
