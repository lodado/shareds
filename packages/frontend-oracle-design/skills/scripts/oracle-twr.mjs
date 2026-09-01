#!/usr/bin/env node

// Time-Weighted Risk (Google bug-prediction TWR): bug-fix 커밋만 시간 정규화 가중으로 파일별 합산한다.
// risk 판정의 선택적 증거 입력이다 — 게이트가 아니고, 점수가 낮다는 이유로 판정을 낮추지 않는다.

import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const BUG_FIX_SUBJECT = /\b(?:fix(?:es|ed)?|bug|hotfix|regression|defect)\b/i

class CliError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}

function parseOptions(args) {
  const options = { repo: '.', limit: 20, prefixes: [] }
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (flag === '--repo' || flag === '--limit') {
      const value = args[index + 1]
      if (!value) throw new CliError('USAGE', `Incomplete option: ${flag}`, 2)
      if (flag === '--repo') options.repo = value
      else options.limit = Number.parseInt(value, 10)
      index += 1
    } else if (flag.startsWith('--')) {
      throw new CliError('USAGE', `Unknown option: ${flag}`, 2)
    } else {
      options.prefixes.push(flag)
    }
  }
  if (!Number.isInteger(options.limit) || options.limit < 1) throw new CliError('USAGE', '--limit must be a positive integer', 2)
  return options
}

export function scoreCommits(commits, prefixes = []) {
  const bugFixes = commits.filter((commit) => BUG_FIX_SUBJECT.test(commit.subject))
  if (bugFixes.length === 0) return { bugFixCount: 0, scores: [] }

  const timestamps = bugFixes.map((commit) => commit.timestamp)
  const earliest = Math.min(...timestamps)
  const latest = Math.max(...timestamps)
  const span = latest - earliest

  const scores = new Map()
  for (const commit of bugFixes) {
    const normalized = span === 0 ? 1 : (commit.timestamp - earliest) / span
    const weight = 1 / (1 + Math.exp(-12 * normalized + 12))
    for (const file of commit.files) {
      if (prefixes.length > 0 && !prefixes.some((prefix) => file.startsWith(prefix))) continue
      scores.set(file, (scores.get(file) ?? 0) + weight)
    }
  }

  return {
    bugFixCount: bugFixes.length,
    scores: [...scores.entries()]
      .map(([file, score]) => ({ file, score }))
      .sort((first, second) => second.score - first.score || (first.file < second.file ? -1 : 1)),
  }
}

export function parseLog(raw) {
  return raw
    .split('\u001E')
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [header, ...fileLines] = record.split('\n')
      const match = header.match(/^([0-9a-f]{40}) (\d+) (.*)$/s)
      if (!match) return null
      return {
        hash: match[1],
        timestamp: Number.parseInt(match[2], 10),
        subject: match[3],
        files: fileLines.map((line) => line.trim()).filter(Boolean),
      }
    })
    .filter(Boolean)
}

async function main() {
  const options = parseOptions(process.argv.slice(2))
  const repo = resolve(options.repo)
  const log = spawnSync('git', ['-C', repo, 'log', '--no-merges', '--format=%x1e%H %ct %s', '--name-only'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  if (log.status !== 0) throw new CliError('GIT_UNREADABLE', log.stderr?.trim() || 'git log failed')

  const commits = parseLog(log.stdout)
  const { bugFixCount, scores } = scoreCommits(commits, options.prefixes)

  process.stdout.write(`TWR ${bugFixCount} bug-fix commits over ${commits.length}\n`)
  for (const entry of scores.slice(0, options.limit)) {
    process.stdout.write(`${entry.score.toFixed(4)} ${entry.file}\n`)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await main()
  } catch (error) {
    const cliError = error instanceof CliError ? error : new CliError('GIT_UNREADABLE', error.message ?? String(error))
    process.stderr.write(`${cliError.code}: ${cliError.message}\n`)
    process.exitCode = cliError.exitCode
  }
}
