// Starts the service. Run: node --no-warnings scripts/dispatch.ts
// Settings come from the environment (see .env.example); tokens come from the keychain.

import process from 'node:process'
import { startApp } from '../src/app/main.ts'

const app = await startApp(process.env)
process.stderr.write(`${new Date().toISOString()} started\n`)

let stopping = false
async function shutDown(): Promise<void> {
  if (stopping) return
  stopping = true
  process.stderr.write(`${new Date().toISOString()} stopping\n`)
  await app.stop()
  process.exit(0)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    shutDown().catch((error: unknown) => {
      process.stderr.write(`${String(error)}\n`)
      process.exit(1)
    })
  })
}
