import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { CommandError, run } from './exec'

const node = process.execPath

// built at run time so no token-shaped literal sits in the source
const botToken = ['xoxb', '1234567890', 'abcdefABCDEF'].join('-')

describe('run as the one way to start an outside program', () => {
  it('to be what the program printed', async () => {
    const result = await run(node, ['-e', 'process.stdout.write("hello"); process.stderr.write("warn")'])
    expect(result).toEqual({ stdout: 'hello', stderr: 'warn' })
  })

  it('to be the standard input given to the program', async () => {
    const result = await run(node, ['-e', 'process.stdin.pipe(process.stdout)'], { input: 'piped text' })
    expect(result.stdout).toBe('piped text')
  })

  it('to be run in the folder that was asked for and with the extra environment', async () => {
    const result = await run(node, ['-e', 'process.stdout.write(process.cwd() + "|" + process.env.EXTRA)'], {
      cwd: '/tmp',
      env: { EXTRA: 'yes' },
    })
    expect(result.stdout.endsWith('|yes')).toBe(true)
    expect(result.stdout.startsWith('/')).toBe(true)
  })

  it('to be a CommandError with the exit code and the text the program wrote on failure', async () => {
    const failure = await run(node, ['-e', 'process.stderr.write("bad things"); process.exit(3)']).catch(
      (error: unknown) => error,
    )
    if (!(failure instanceof CommandError)) throw new Error('expected a CommandError', { cause: failure })
    expect([failure.file, failure.exitCode, failure.stderr]).toEqual([node, 3, 'bad things'])
    expect(failure.message).toBe(`${node} failed with exit code 3: bad things`)
  })

  it('to be an error without a secret even when the program printed one', async () => {
    const failure = await run(node, ['-e', `process.stderr.write("auth ${botToken} rejected"); process.exit(1)`]).catch(
      (error: unknown) => error,
    )
    if (!(failure instanceof CommandError)) throw new Error('expected a CommandError', { cause: failure })
    expect(failure.stderr).toBe('auth [REDACTED] rejected')
    expect(failure.message).not.toContain('abcdefABCDEF')
  })

  it('to be a CommandError without an exit code for a program that does not exist', async () => {
    const failure = await run('no-such-program-anywhere', []).catch((error: unknown) => error)
    if (!(failure instanceof CommandError)) throw new Error('expected a CommandError', { cause: failure })
    expect(failure.exitCode).toBeNull()
  })

  it('to be stopped when it runs longer than the time allowed', async () => {
    const failure = await run(node, ['-e', 'setTimeout(() => {}, 10000)'], { timeoutMs: 200 }).catch(
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(CommandError)
  })

  it('to be stopped when the signal is aborted, and not started when it already was', async () => {
    const controller = new AbortController()
    const running = run(node, ['-e', 'setTimeout(() => {}, 10000)'], { signal: controller.signal }).catch(
      (error: unknown) => error,
    )
    controller.abort()
    expect(await running).toBeInstanceOf(CommandError)
    const late = await run(node, ['-e', 'process.stdout.write("ran")'], { signal: controller.signal }).catch(
      (error: unknown) => error,
    )
    expect(late).toBeInstanceOf(CommandError)
  })

  it('to be started with only the environment variables the caller accepted, and the ones it added', async () => {
    process.env.SLACK_DISPATCH_TEST_SECRET = 'leaky'
    process.env.SLACK_DISPATCH_TEST_KEEP = 'kept'
    try {
      const script =
        'process.stdout.write([process.env.SLACK_DISPATCH_TEST_SECRET, process.env.SLACK_DISPATCH_TEST_KEEP, process.env.EXTRA, process.env.PATH].join("|"))'
      const result = await run(node, ['-e', script], {
        inheritEnv: (name) => name.endsWith('_KEEP'),
        env: { EXTRA: 'added' },
      })
      expect(result.stdout).toBe('|kept|added|')
    } finally {
      delete process.env.SLACK_DISPATCH_TEST_SECRET
      delete process.env.SLACK_DISPATCH_TEST_KEEP
    }
  })

  it('to be a CommandError that keeps what the program printed on standard output', async () => {
    const failure = await run(node, ['-e', 'process.stdout.write("verdict"); process.exit(1)']).catch(
      (error: unknown) => error,
    )
    if (!(failure instanceof CommandError)) throw new Error('expected a CommandError', { cause: failure })
    expect(failure.stdout).toBe('verdict')
  })
})
