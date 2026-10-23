import type { Run } from '../exec/exec'
import { describe, expect, it } from 'vitest'
import { CommandError } from '../exec/exec'
import {
  commitProblem,
  createWorktree,
  installDependencies,
  parseWorktree,
  removeWorktree,
  resolveBaseBranch,
  setWorkspaceStatus,
  statusForStage,
  worktreeNameFor,
} from './worktree'

type Call = [string, readonly string[]]

// Answers each command with the first rule whose text is part of the command line; no rule means success.
function scripted(rules: [string, 'ok' | number | { stdout: string }][]): { run: Run; calls: Call[] } {
  const calls: Call[] = []
  const run: Run = (file, args) => {
    calls.push([file, args])
    const line = `${file} ${args.join(' ')}`
    const rule = rules.find(([part]) => line.includes(part))
    const answer = rule?.[1] ?? 'ok'
    if (typeof answer === 'number') return Promise.reject(new CommandError(file, answer, 'failed'))
    return Promise.resolve({ stdout: typeof answer === 'string' ? '' : answer.stdout, stderr: '' })
  }
  return { run, calls }
}

const REPO = '/work/web-app'

describe('worktreeNameFor as the name of an item worktree', () => {
  it('to be stable per item and different between items', () => {
    const a = worktreeNameFor('slack:C1:1#web-app')
    expect(a).toBe(worktreeNameFor('slack:C1:1#web-app'))
    expect(a).toMatch(/^dispatch-[0-9a-f]{10}$/)
    expect(a).not.toBe(worktreeNameFor('slack:C1:2#web-app'))
  })
})

describe('resolveBaseBranch as the branch new work starts from', () => {
  it('to be origin/develop after a fetch when it exists', async () => {
    const { run, calls } = scripted([])
    expect(await resolveBaseBranch(run, REPO)).toBe('origin/develop')
    expect(calls[0]).toStrictEqual(['git', ['-C', REPO, 'fetch', 'origin', '--prune']])
  })

  it('to be origin/main when there is no develop', async () => {
    const { run } = scripted([['origin/develop', 1]])
    expect(await resolveBaseBranch(run, REPO)).toBe('origin/main')
  })

  it('to be origin/master when there is neither develop nor main', async () => {
    const { run } = scripted([
      ['origin/develop', 1],
      ['origin/main', 1],
    ])
    expect(await resolveBaseBranch(run, REPO)).toBe('origin/master')
  })

  it('to be an error when origin has none of the three', async () => {
    const { run } = scripted([
      ['origin/develop', 1],
      ['origin/main', 1],
      ['origin/master', 1],
    ])
    await expect(resolveBaseBranch(run, REPO)).rejects.toThrow(
      `origin has no develop, main or master branch in ${REPO}`,
    )
  })

  it('to be the branch the owner chose, with or without the origin/ prefix', async () => {
    const { run } = scripted([])
    expect(await resolveBaseBranch(run, REPO, 'stage')).toBe('origin/stage')
    expect(await resolveBaseBranch(run, REPO, 'origin/stage')).toBe('origin/stage')
  })

  it('to be an error, not a fallback, when the chosen branch is missing', async () => {
    const { run } = scripted([['origin/stage', 1]])
    await expect(resolveBaseBranch(run, REPO, 'stage')).rejects.toThrow(
      `the base branch origin/stage does not exist in ${REPO}`,
    )
  })

  it('to be an error, not a missing branch, when git itself fails', async () => {
    const { run } = scripted([['rev-parse', 128]])
    await expect(resolveBaseBranch(run, REPO)).rejects.toThrow('git failed with exit code 128')
  })

  it('to be an error when the fetch fails', async () => {
    const { run } = scripted([['fetch', 1]])
    await expect(resolveBaseBranch(run, REPO)).rejects.toThrow('git failed with exit code 1')
  })
})

const created = JSON.stringify({
  ok: true,
  result: { worktree: { id: 'repo1::/work/wt', path: '/work/wt', branch: 'refs/heads/dispatch-abc' } },
})

describe('parseWorktree as the answer of orca worktree create', () => {
  it('to be the id, the path and the branch without the refs/heads/ prefix', () => {
    expect(parseWorktree(created)).toStrictEqual({ id: 'repo1::/work/wt', path: '/work/wt', branch: 'dispatch-abc' })
  })

  it('to be read from result itself when there is no worktree object', () => {
    expect(parseWorktree(JSON.stringify({ result: { id: 'i', path: '/p', branch: 'b' } }))).toStrictEqual({
      id: 'i',
      path: '/p',
      branch: 'b',
    })
  })

  it.each([['{}'], ['null'], ['{"result":{"worktree":{"id":"i"}}}'], ['{"result":{"worktree":{"path":"/p"}}}']])(
    'to be an error for %s',
    (json) => {
      expect(() => parseWorktree(json)).toThrow('orca worktree create: the answer has no worktree')
    },
  )
})

describe('createWorktree as the call to Orca', () => {
  it('to be a worktree from the repo path and base ref, independent and not revealed in the app', async () => {
    const { run, calls } = scripted([['worktree create', { stdout: created }]])
    const worktree = await createWorktree(run, { repoPath: REPO, name: 'dispatch-abc', baseRef: 'origin/develop' })
    expect(worktree.path).toBe('/work/wt')
    expect(calls).toStrictEqual([
      [
        'orca',
        [
          'worktree',
          'create',
          '--name',
          'dispatch-abc',
          '--repo',
          `path:${REPO}`,
          '--base-branch',
          'origin/develop',
          '--no-parent',
          '--json',
        ],
      ],
    ])
  })

  it('to be commented with the thread when there is one', async () => {
    const { run, calls } = scripted([['worktree create', { stdout: created }]])
    await createWorktree(run, { repoPath: REPO, name: 'n', baseRef: 'origin/main', comment: 'Slack: https://x.test/t' })
    expect(calls[0]?.[1]).toContain('--comment')
    expect(calls[0]?.[1]).toContain('Slack: https://x.test/t')
    expect(calls[0]?.[1]).not.toContain('--reference')
    expect(calls[0]?.[1]).not.toContain('--activate')
  })
})

describe('statusForStage as the Orca board column', () => {
  it.each([
    ['planning', 'in-progress'],
    ['planned', 'in-progress'],
    ['implementing', 'in-progress'],
    ['pr_open', 'in-review'],
    ['merged', 'completed'],
  ] as const)('to be %s on the %s column', (stage, status) => {
    expect(statusForStage(stage)).toBe(status)
  })

  it.each(['ingested', 'notified', 'skipped', 'declined', 'failed'] as const)('to be left alone for %s', (stage) => {
    expect(statusForStage(stage)).toBeUndefined()
  })
})

describe('setWorkspaceStatus as the board update', () => {
  it('to be the orca worktree set call for the path', async () => {
    const { run, calls } = scripted([])
    await setWorkspaceStatus(run, '/work/wt', 'in-review')
    expect(calls).toStrictEqual([
      ['orca', ['worktree', 'set', '--worktree', 'path:/work/wt', '--workspace-status', 'in-review', '--json']],
    ])
  })
})

describe('removeWorktree as the cleanup of finished work', () => {
  it('to be removed when it is clean and everything is pushed', async () => {
    const { run, calls } = scripted([['rev-list', { stdout: '0\n' }]])
    expect(await removeWorktree(run, '/work/wt', { discard: false })).toStrictEqual({ removed: true })
    expect(calls.at(-1)).toStrictEqual(['orca', ['worktree', 'rm', '--worktree', 'path:/work/wt', '--json']])
  })

  it('to be kept when there are uncommitted changes', async () => {
    const { run, calls } = scripted([['status', { stdout: ' M file.ts\n' }]])
    expect(await removeWorktree(run, '/work/wt', { discard: false })).toStrictEqual({
      removed: false,
      reason: 'there are uncommitted changes',
    })
    expect(calls.some(([file]) => file === 'orca')).toBe(false)
  })

  it('to be kept when commits were not pushed', async () => {
    const { run } = scripted([['rev-list', { stdout: '2\n' }]])
    expect(await removeWorktree(run, '/work/wt', { discard: false })).toStrictEqual({
      removed: false,
      reason: 'there are commits that were not pushed',
    })
  })

  it('to be kept when the branch has no upstream', async () => {
    const { run } = scripted([['rev-list', 128]])
    expect(await removeWorktree(run, '/work/wt', { discard: false })).toStrictEqual({
      removed: false,
      reason: 'the branch was never pushed',
    })
  })

  it('to be removed by force, with no check, when the owner declined the work', async () => {
    const { run, calls } = scripted([['status', { stdout: ' M file.ts\n' }]])
    expect(await removeWorktree(run, '/work/wt', { discard: true })).toStrictEqual({ removed: true })
    expect(calls).toStrictEqual([['orca', ['worktree', 'rm', '--worktree', 'path:/work/wt', '--force', '--json']]])
  })
})

describe('commitProblem as the check of a build the agent says is done', () => {
  const BRANCH = 'dispatch-a'
  const onBranch: [string, 'ok' | number | { stdout: string }] = ['symbolic-ref', { stdout: `${BRANCH}\n` }]

  it('to be nothing when it stayed on the branch, left a commit on top of the base and a clean tree', async () => {
    const { run, calls } = scripted([onBranch, ['rev-list', { stdout: '2\n' }]])
    expect(await commitProblem(run, '/work/wt', 'origin/develop', BRANCH)).toBeUndefined()
    expect(calls.at(-1)).toStrictEqual(['git', ['-C', '/work/wt', 'rev-list', '--count', 'origin/develop..HEAD']])
  })

  it('to be a problem when the agent switched to another branch, whatever it committed there', async () => {
    const { run } = scripted([
      ['symbolic-ref', { stdout: 'chore/footer\n' }],
      ['rev-list', { stdout: '1\n' }],
    ])
    expect(await commitProblem(run, '/work/wt', 'origin/develop', BRANCH)).toBe(`the agent left the branch ${BRANCH}`)
  })

  it('to be a problem when changes were left uncommitted', async () => {
    const { run } = scripted([onBranch, ['status', { stdout: ' M a.ts\n' }]])
    expect(await commitProblem(run, '/work/wt', 'origin/develop', BRANCH)).toBe(
      'the agent left uncommitted changes in the worktree',
    )
  })

  it('to be a problem when there is no commit on top of the base', async () => {
    const { run } = scripted([onBranch, ['rev-list', { stdout: '0\n' }]])
    expect(await commitProblem(run, '/work/wt', 'origin/develop', BRANCH)).toBe('the agent made no commit')
  })

  it('to be an error when git itself fails', async () => {
    const { run } = scripted([onBranch, ['rev-list', 128]])
    await expect(commitProblem(run, '/work/wt', 'origin/develop', BRANCH)).rejects.toThrow(
      'git failed with exit code 128',
    )
  })
})

describe('installDependencies as the packages a new worktree lacks', () => {
  const lockedBy =
    (...files: string[]) =>
    (path: string): boolean =>
      files.some((file) => path === `/work/wt/${file}`)

  it.each([
    ['pnpm-lock.yaml', 'pnpm', ['install', '--frozen-lockfile', '--prefer-offline']],
    ['package-lock.json', 'npm', ['ci', '--prefer-offline', '--no-audit', '--no-fund']],
    ['yarn.lock', 'yarn', ['install', '--frozen-lockfile']],
  ])(
    'to be installed from the lock file %s with %s, in the worktree, in the limited environment',
    async (lock, file, args) => {
      const seen: { file: string; args: readonly string[]; cwd: string | undefined; limited: boolean }[] = []
      const run: Run = (command, commandArgs, options) => {
        seen.push({
          file: command,
          args: commandArgs,
          cwd: options?.cwd,
          limited: options?.inheritEnv?.('GH_TOKEN') === false && options.inheritEnv('ANTHROPIC_API_KEY') === false,
        })
        return Promise.resolve({ stdout: '', stderr: '' })
      }
      expect(await installDependencies(run, '/work/wt', undefined, lockedBy(lock))).toBe('installed')
      expect(seen).toStrictEqual([{ file, args, cwd: '/work/wt', limited: true }])
    },
  )

  it('to be left alone when the packages are there already', async () => {
    const { run, calls } = scripted([])
    expect(await installDependencies(run, '/work/wt', undefined, lockedBy('node_modules', 'pnpm-lock.yaml'))).toBe(
      'present',
    )
    expect(calls).toStrictEqual([])
  })

  it('to be nothing to install for a repository with no lock file', async () => {
    const { run, calls } = scripted([])
    expect(await installDependencies(run, '/work/wt', undefined, lockedBy())).toBe('none')
    expect(calls).toStrictEqual([])
  })

  it('to be an error when the install fails', async () => {
    const { run } = scripted([['pnpm', 1]])
    await expect(installDependencies(run, '/work/wt', undefined, lockedBy('pnpm-lock.yaml'))).rejects.toThrow(
      'pnpm failed with exit code 1',
    )
  })

  it('to be stopped with the signal it was given', async () => {
    let seenSignal: AbortSignal | undefined
    const run: Run = (_file, _args, options) => {
      seenSignal = options?.signal
      return Promise.resolve({ stdout: '', stderr: '' })
    }
    const controller = new AbortController()
    await installDependencies(run, '/work/wt', controller.signal, lockedBy('pnpm-lock.yaml'))
    expect(seenSignal).toBe(controller.signal)
  })
})
