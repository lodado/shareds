import type { Agent, AgentCall, AgentResult } from '../agent/claude'
import type { Store } from '../store/store'
import { afterEach, describe, expect, it } from 'vitest'
import { closeStore, createItems, getItem, itemKeyOf, openStore } from '../store/store'
import { createSplitAgent, createTriageAgent } from './agents'

const costs: [string, number][] = []
const onCost = (what: string, costUsd: number): void => {
  costs.push([what, costUsd])
}

const opened: Store[] = []
afterEach(() => {
  for (const store of opened.splice(0)) closeStore(store)
  costs.length = 0
})

const SESSION = '22222222-2222-4222-8222-222222222222'

function fakeAgent(result: AgentResult): { agent: Agent; calls: AgentCall[] } {
  const calls: AgentCall[] = []
  return {
    calls,
    agent: (call) => {
      calls.push(call)
      return Promise.resolve(result)
    },
  }
}

const done = (text: string): AgentResult => ({ ok: true, text, costUsd: 0.1, subtype: 'success' })

describe('createSplitAgent as the cutter of a DM prompt', () => {
  it('to be the JSON of the answer, asked for in an empty folder on the cheapest model without tools that write', async () => {
    const { agent, calls } = fakeAgent(done('```json\n{"tasks":[{"repo":"web-app","task":"Fix the footer"}]}\n```'))
    const split = createSplitAgent({ agent, newSessionId: () => SESSION, onCost }, '/scratch')
    expect(await split('footer 고쳐줘', ['web-app', 'api'])).toStrictEqual({
      tasks: [{ repo: 'web-app', task: 'Fix the footer' }],
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      cwd: '/scratch',
      mode: 'text',
      model: 'haiku',
      resume: false,
      sessionId: SESSION,
      maxBudgetUsd: 0.3,
    })
    expect(calls[0]?.prompt).toContain('Known repositories: web-app, api')
    expect(costs).toStrictEqual([['split', 0.1]])
    // A small job with a fixed answer: the owner own setup would only cost more and could change the answer.
    expect(calls[0]?.ownSetup).not.toBe(true)
  })

  it('to be an error when the agent stopped', async () => {
    const { agent } = fakeAgent({ ok: false, text: '', costUsd: 0.3, subtype: 'error_max_budget_usd' })
    const split = createSplitAgent({ agent, newSessionId: () => SESSION, onCost }, '/scratch')
    await expect(split('x', ['web-app'])).rejects.toThrow('the splitting agent stopped (error_max_budget_usd)')
    expect(costs).toStrictEqual([['split', 0.3]])
  })

  it('to be an error when the answer is not JSON', async () => {
    const { agent } = fakeAgent(done('I could not decide'))
    const split = createSplitAgent({ agent, newSessionId: () => SESSION, onCost }, '/scratch')
    await expect(split('x', ['web-app'])).rejects.toThrow('the agent did not answer with JSON')
  })
})

function itemOf(repo = 'web-app', summary = 'The footer link is broken') {
  const store = openStore(':memory:')
  opened.push(store)
  createItems(store, 'slack:C1:1.1', [repo], { meta: { [repo]: { summary } } })
  const item = getItem(store, itemKeyOf('slack:C1:1.1', repo))
  if (item === undefined) throw new Error('the item was not created')
  return item
}

const answer = JSON.stringify({
  request: '푸터 링크가 깨져요',
  cause: 'footer.tsx의 href 오타',
  plan: 'href를 고쳐요',
  recommend: true,
  why: '작은 수정',
})

describe('createTriageAgent as the reading of a new mention', () => {
  const thread = (): Promise<string> => Promise.resolve('[U1] footer broken')

  it('to be the analysis, read by the cheapest model in the repo itself without changing it', async () => {
    const { agent, calls } = fakeAgent(done(answer))
    const triage = createTriageAgent(
      { agent, newSessionId: () => SESSION, onCost },
      '/scratch',
      (repo) => Promise.resolve(`/repos/${repo}`),
      thread,
    )
    expect(await triage(itemOf())).toStrictEqual({
      request: '푸터 링크가 깨져요',
      cause: 'footer.tsx의 href 오타',
      plan: 'href를 고쳐요',
      recommend: true,
      why: '작은 수정',
    })
    expect(calls[0]).toMatchObject({
      cwd: '/repos/web-app',
      mode: 'plan',
      model: 'haiku',
      resume: false,
      sessionId: SESSION,
      maxBudgetUsd: 0.15,
    })
    expect(calls[0]?.prompt).toContain('Repository: web-app')
    expect(calls[0]?.prompt).toContain('<thread>\n[U1] footer broken\n</thread>')
    expect(costs).toStrictEqual([['triage', 0.1]])
    expect(calls[0]?.ownSetup).not.toBe(true)
  })

  it('to be read from the thread alone, never recommended, when the item has no repo', async () => {
    const { agent, calls } = fakeAgent(done(answer))
    const triage = createTriageAgent(
      { agent, newSessionId: () => SESSION, onCost },
      '/scratch',
      () => Promise.reject(new Error('must not be asked')),
      thread,
    )
    const analysis = await triage(itemOf('unrouted'))
    expect(analysis).toMatchObject({ recommend: false, why: '레포를 정하지 못해서 구현할 수 없어요' })
    expect(calls[0]).toMatchObject({ cwd: '/scratch', mode: 'text' })
    expect(calls[0]?.prompt).toContain('Repository: (none: judge from the thread alone)')
  })

  it('to be read from the item summary when the thread cannot be loaded as text', async () => {
    const { agent, calls } = fakeAgent(done(answer))
    const triage = createTriageAgent(
      { agent, newSessionId: () => SESSION, onCost },
      '/scratch',
      () => Promise.resolve('/r'),
      () => Promise.resolve(''),
    )
    await triage(itemOf('web-app', 'Summary from the search'))
    expect(calls[0]?.prompt).toContain('<thread>\nSummary from the search\n</thread>')
  })

  it('to be an error, with the cost recorded, when the model stopped', async () => {
    const { agent } = fakeAgent({ ok: false, text: '', costUsd: 0.15, subtype: 'error_max_budget_usd' })
    const triage = createTriageAgent(
      { agent, newSessionId: () => SESSION, onCost },
      '/scratch',
      () => Promise.resolve('/r'),
      thread,
    )
    await expect(triage(itemOf())).rejects.toThrow('the triage agent stopped (error_max_budget_usd)')
    expect(costs).toStrictEqual([['triage', 0.15]])
  })

  it.each([
    ['text that is not JSON', 'I could not decide', 'the agent did not answer with JSON'],
    ['an answer without a plan', JSON.stringify({ request: 'a', cause: 'b' }), 'the analysis has no plan'],
  ])('to be an error for %s', async (_name, text, message) => {
    const { agent } = fakeAgent(done(text))
    const triage = createTriageAgent(
      { agent, newSessionId: () => SESSION, onCost },
      '/scratch',
      () => Promise.resolve('/r'),
      thread,
    )
    await expect(triage(itemOf())).rejects.toThrow(message)
  })

  it('to be not recommended when the model answers yes in any form but a real true', async () => {
    const { agent } = fakeAgent(done(JSON.stringify({ ...JSON.parse(answer), recommend: 'true' })))
    const triage = createTriageAgent(
      { agent, newSessionId: () => SESSION, onCost },
      '/scratch',
      () => Promise.resolve('/r'),
      thread,
    )
    expect((await triage(itemOf())).recommend).toBe(false)
  })
})
