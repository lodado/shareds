import { spawnSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { missingReturns } from '../skills/frontend-oracle-design/scripts/oracle-step.mjs'

const SELF = fileURLToPath(import.meta.url)

/**
 * Saves a clean return (no blocking finding) for every review the lock waits for on the files as they are now, as a
 * fixture whose reviewers passed would hold them. Call it right before the lock, after the last edit of the card.
 * Returns the paths it wrote.
 */
export async function saveCleanReturns(directory, profile) {
  const saved = await missingReturns(directory, profile)
  for (const path of saved) {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, path.endsWith('.json') ? '{"candidates": [], "blocking": []}\n' : 'No blocking findings.\n')
  }
  return saved
}

/** The same for a synchronous test: runs this file as a script. */
export function saveCleanReturnsSync(directory, profile) {
  const child = spawnSync(process.execPath, [SELF, directory, profile], { encoding: 'utf8' })
  if (child.status !== 0) throw new Error(`saved-reviews: ${child.stderr}`)
  return JSON.parse(child.stdout)
}

if (process.argv[1] && resolve(process.argv[1]) === SELF) {
  const [directory, profile] = process.argv.slice(2)
  saveCleanReturns(directory, profile).then((saved) => process.stdout.write(JSON.stringify(saved)), (error) => {
    process.stderr.write(`${error.stack}\n`)
    process.exitCode = 1
  })
}
