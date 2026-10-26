import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gate } from './gate.mjs'
import { lint } from './lint.mjs'
import { next } from './next.mjs'
import { identify, observe } from './observe.mjs'
import { render } from './render.mjs'
import { initRun, status } from './run.mjs'

const USAGE = `Usage: cli.mjs <command> [--flag value]
  init     --target T --platform ios|android|web [--scope S] [--mode M] [--max-actions N] [--max-depth N]
           [--scope-note TEXT] [--locale L] [--app NAME] [--target-version V] [--test-session human-prepared] [--output-dir DIR]
  status   --run DIR
  gate     --run DIR --action tap|longpress|type|swipe|scroll|back|home|open [--label L] [--role R] [--id I] [--context TEXT]
  observe  --run DIR (--anchor | --gate G-0001) --snapshot FILE [--screenshot FILE] [--result ok|error|timeout]
           [--state-kind K] [--screen-type T] [--screen-id S-001 | --new-screen] [--note TEXT]
  identify --run DIR --snapshot FILE
  next     --run DIR [--limit N]
  lint     --run DIR
  render   --run DIR`

/** `--key value`, `--key=value`, or a bare `--flag`. */
export function parseArgs(args) {
  const flags = {}
  for (let i = 0; i < args.length; i++) {
    const token = args[i]
    if (!token.startsWith('--')) throw new Error(`Unexpected argument ${token}\n${USAGE}`)
    const [name, inline] = token.slice(2).split(/=(.*)/s)
    if (inline !== undefined) flags[name] = inline
    else if (args[i + 1] !== undefined && !args[i + 1].startsWith('--')) {
      flags[name] = args[i + 1]
      i += 1
    } else flags[name] = true
  }
  return flags
}

export async function main(args) {
  const [command, ...rest] = args
  const flags = parseArgs(rest)
  if (command === 'init') return initRun(flags)
  if (!['status', 'gate', 'observe', 'identify', 'next', 'lint', 'render'].includes(command)) throw new Error(USAGE)
  if (typeof flags.run !== 'string') throw new Error(`--run <run directory> is required\n${USAGE}`)
  switch (command) {
    case 'status':
      return status(flags.run)
    case 'gate':
      return gate(flags.run, flags)
    case 'observe':
      return observe(flags.run, flags)
    case 'identify':
      return identify(flags.run, flags)
    case 'next':
      return next(flags.run, { limit: flags.limit === undefined ? 10 : Number(flags.limit) })
    case 'lint':
      return lint(flags.run)
    default:
      return render(flags.run)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await main(process.argv.slice(2))
    console.log(JSON.stringify(result, null, 2))
    if (result?.ok === false) process.exitCode = 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
