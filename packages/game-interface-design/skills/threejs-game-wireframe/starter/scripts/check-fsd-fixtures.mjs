// Proves the FSD checker actually fires: the allowed fixture must pass, the violation fixture must fail on known rules.
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const run = (dir) => {
  const result = spawnSync('npx', ['steiger', dir], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } })
  return { status: result.status, output: result.stdout + result.stderr }
}

const failures = []
const allowed = run('fsd-fixtures/allowed/src')
if (allowed.status !== 0) failures.push(`allowed fixture failed:\n${allowed.output}`)
const violation = run('fsd-fixtures/violation/src')
if (violation.status === 0) failures.push('violation fixture passed')
for (const rule of ['fsd/forbidden-imports', 'fsd/no-public-api-sidestep']) {
  if (!violation.output.includes(rule)) failures.push(`violation fixture did not report ${rule}`)
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exitCode = 1
} else {
  console.log('PASS: allowed fixture clean; violation fixture reports forbidden-imports and no-public-api-sidestep.')
}
