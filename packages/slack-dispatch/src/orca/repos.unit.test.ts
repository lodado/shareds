import type { Run } from '../exec/exec'
import { describe, expect, it } from 'vitest'
import { listRepos, parseRepoList } from './repos'

const sample = JSON.stringify({
  id: 'x',
  ok: true,
  result: {
    repos: [
      { id: '1', displayName: 'web-app', path: '/work/web-app', kind: 'git' },
      { id: '2', displayName: 'api-server', path: '/work/api-server' },
      { id: '3', path: '/work/no-name' },
      'nonsense',
      { displayName: 'no-path' },
    ],
  },
})

describe('parseRepoList as the answer of orca repo list', () => {
  it('to be the name and path of every repo that has both', () => {
    expect(parseRepoList(sample)).toEqual([
      { name: 'web-app', path: '/work/web-app' },
      { name: 'api-server', path: '/work/api-server' },
    ])
  })

  it.each([['{}'], ['{"result":{}}'], ['{"result":{"repos":"x"}}'], ['[]'], ['null']])(
    'to be an error for %s',
    (json) => {
      expect(() => parseRepoList(json)).toThrow('orca repo list: the answer has no repos list')
    },
  )
})

describe('listRepos as the question put to Orca', () => {
  it('to be asked with orca repo list --json', async () => {
    const calls: [string, readonly string[]][] = []
    const run: Run = (file, args) => {
      calls.push([file, args])
      return Promise.resolve({ stdout: sample, stderr: '' })
    }
    expect((await listRepos(run)).map((repo) => repo.name)).toEqual(['web-app', 'api-server'])
    expect(calls).toEqual([['orca', ['repo', 'list', '--json']]])
  })
})
