import { describe, expect, it } from 'vitest'
import { describeSplit, MAX_REPOS_PER_REQUEST, validateSplit } from './split'

const KNOWN = ['web-app', 'api-server', 'docs']

describe('validateSplit as the answer of the agent that cut a prompt into repos', () => {
  it('to be one task per known repo, in the order given', () => {
    const answer = {
      tasks: [
        { repo: 'api-server', task: 'Add a rate limit to the export endpoint' },
        { repo: 'web-app', task: '  Fix the footer link  ' },
      ],
    }
    expect(validateSplit(answer, KNOWN)).toEqual({
      ok: true,
      tasks: [
        { repo: 'api-server', task: 'Add a rate limit to the export endpoint' },
        { repo: 'web-app', task: 'Fix the footer link' },
      ],
      dropped: [],
    })
  })

  it('to be one item with both tasks when the same repo is named twice', () => {
    const answer = {
      tasks: [
        { repo: 'web-app', task: 'Fix the footer link' },
        { repo: 'docs', task: 'Document the footer' },
        { repo: 'web-app', task: 'Add a test for it' },
      ],
    }
    expect(validateSplit(answer, KNOWN)).toEqual({
      ok: true,
      tasks: [
        { repo: 'web-app', task: 'Fix the footer link\nAdd a test for it' },
        { repo: 'docs', task: 'Document the footer' },
      ],
      dropped: [],
    })
  })

  it('to be the good tasks kept and every bad one listed with its reason', () => {
    const answer = {
      tasks: [
        { repo: 'web-app', task: 'Fix the footer link' },
        { repo: 'secret-repo', task: 'Read the keys' },
        { repo: 'docs', task: '   ' },
        { repo: 'api-server', task: 'x'.repeat(4001) },
        'web-app: do something',
        { repo: 42, task: 'no repo name' },
        { repo: 'Web-App', task: 'wrong case' },
      ],
    }
    expect(validateSplit(answer, KNOWN)).toEqual({
      ok: true,
      tasks: [{ repo: 'web-app', task: 'Fix the footer link' }],
      dropped: [
        { repo: 'secret-repo', reason: 'unknown_repo' },
        { repo: 'docs', reason: 'empty_task' },
        { repo: 'api-server', reason: 'too_long' },
        { repo: '?', reason: 'not_an_object' },
        { repo: '?', reason: 'unknown_repo' },
        { repo: 'Web-App', reason: 'unknown_repo' },
      ],
    })
  })

  it('to be a task of exactly the maximum length accepted', () => {
    const task = 'x'.repeat(4000)
    expect(validateSplit({ tasks: [{ repo: 'docs', task }] }, KNOWN)).toMatchObject({
      ok: true,
      tasks: [{ repo: 'docs', task }],
    })
  })

  it('to be shown with at most forty characters of an unknown repo name', () => {
    const result = validateSplit(
      {
        tasks: [
          { repo: 'r'.repeat(100), task: 'x' },
          { repo: 'docs', task: 'y' },
        ],
      },
      KNOWN,
    )
    expect(result).toMatchObject({ ok: true, dropped: [{ repo: 'r'.repeat(40), reason: 'unknown_repo' }] })
  })

  it.each([
    ['null', null],
    ['a list instead of an object', []],
    ['an object without tasks', { items: [] }],
    ['tasks that is not a list', { tasks: 'web-app' }],
  ])('to be refused for %s', (_name, answer) => {
    expect(validateSplit(answer, KNOWN)).toEqual({ ok: false, error: 'the output has no tasks list', dropped: [] })
  })

  it('to be refused when no task names a known repo, keeping the list of what was dropped', () => {
    expect(validateSplit({ tasks: [{ repo: 'nope', task: 'x' }] }, KNOWN)).toEqual({
      ok: false,
      error: 'no task names a known repo',
      dropped: [{ repo: 'nope', reason: 'unknown_repo' }],
    })
    expect(validateSplit({ tasks: [] }, KNOWN)).toEqual({ ok: false, error: 'no task names a known repo', dropped: [] })
  })

  it('to be refused when the request would spread over too many repos', () => {
    const repos = Array.from({ length: MAX_REPOS_PER_REQUEST + 1 }, (_unused, index) => `repo-${index}`)
    const answer = { tasks: repos.map((repo) => ({ repo, task: 'do it' })) }
    expect(validateSplit(answer, repos)).toEqual({ ok: false, error: 'too many repos (9, at most 8)', dropped: [] })
    expect(validateSplit({ tasks: answer.tasks.slice(0, 8) }, repos)).toMatchObject({ ok: true })
  })
})

describe('describeSplit as what the owner reads before planning starts', () => {
  it('to be one line per repo with the first line of its task', () => {
    const text = describeSplit(
      [
        { repo: 'web-app', task: 'Fix the footer link\nAdd a test for it' },
        { repo: 'api-server', task: 'Add a rate limit' },
      ],
      [],
    )
    expect(text).toBe(
      ['2개 레포로 나눴어요.', '• web-app: Fix the footer link', '• api-server: Add a rate limit'].join('\n'),
    )
  })

  it('to be followed by what was left out and why', () => {
    const text = describeSplit(
      [{ repo: 'docs', task: 'Document it' }],
      [
        { repo: 'secret-repo', reason: 'unknown_repo' },
        { repo: 'web-app', reason: 'empty_task' },
      ],
    )
    expect(text).toBe(
      [
        '1개 레포로 나눴어요.',
        '• docs: Document it',
        '제외한 항목:',
        '• secret-repo (등록되지 않은 레포)',
        '• web-app (작업 내용 없음)',
      ].join('\n'),
    )
  })

  it('to be a first line cut to 100 characters', () => {
    const text = describeSplit([{ repo: 'docs', task: 'w'.repeat(300) }], [])
    expect(text.split('\n')[1]).toBe(`• docs: ${'w'.repeat(99)}…`)
  })
})
