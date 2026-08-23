import { spawnSync } from 'node:child_process'

let input = ''
for await (const chunk of process.stdin) input += chunk

let hook
try {
  hook = JSON.parse(input)
} catch {
  process.stderr.write('lint-on-stop: invalid hook input\n')
  process.exit(1)
}

const args = hook.stop_hook_active ? ['pnpm', 'lint'] : ['pnpm', 'lint', '--', '--fix']
const lint = spawnSync('rtk', args, {
  cwd: hook.cwd || process.env.CLAUDE_PROJECT_DIR || process.cwd(),
  encoding: 'utf8',
})

if (!lint.error && lint.status === 0) process.exit(0)

const output = `${lint.stdout || ''}${lint.stderr || ''}`.trim().slice(-12000)
const reason = [
  hook.stop_hook_active ? 'Lint still fails.' : 'Lint failed after ESLint auto-fix.',
  'Fix the remaining errors, run `pnpm lint`, and try stopping again.',
  output || lint.error?.message || 'Lint command failed without output.',
].join('\n\n')

process.stdout.write(`${JSON.stringify({ decision: 'block', reason })}\n`)
