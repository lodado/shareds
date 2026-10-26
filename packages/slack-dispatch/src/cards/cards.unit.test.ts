import { describe, expect, it } from 'vitest'
import { escapeMrkdwn } from '../slack/blocks'
import { buildFailedCard, buildPlanCard, buildPrCard, parseItemAction, shownPlan, shownReport } from './cards'

const KEY = 'slack:C1:1730000000.000100#web-app'

interface ButtonView {
  action_id: string
  value: string
  style: string | undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function toButton(element: unknown): ButtonView[] {
  if (!isRecord(element) || typeof element.action_id !== 'string' || typeof element.value !== 'string') return []
  return [
    {
      action_id: element.action_id,
      value: element.value,
      style: typeof element.style === 'string' ? element.style : undefined,
    },
  ]
}

function buttonsOf(message: { blocks: { type: string; elements?: unknown[] }[] }): ButtonView[] {
  const actions = message.blocks.find((block) => block.type === 'actions')
  return (actions?.elements ?? []).flatMap(toButton)
}

const click = (actionId: string, value: unknown): unknown => ({
  type: 'block_actions',
  actions: [{ action_id: actionId, value }],
})

describe('buildPlanCard as a plan waiting for the owner', () => {
  const card = buildPlanCard({
    itemKey: KEY,
    cardId: 7,
    repo: 'web-app',
    plan: '1. edit footer',
    threadUrl: 'https://x.test/t',
  })

  it('to be an approve and a reject button that carry the card id and the item', () => {
    expect(buttonsOf(card).map((b) => [b.action_id, b.value, b.style])).toStrictEqual([
      ['item.approve_plan:7', KEY, 'primary'],
      ['item.reject:7', KEY, 'danger'],
    ])
  })

  it('to be telling the owner, above the buttons, to ask for changes by replying in the thread', () => {
    const kinds = card.blocks.map((block) => block.type)
    expect(kinds).toStrictEqual(['header', 'section', 'section', 'actions', 'context'])
    const hint = card.blocks[2]
    expect(hint?.type === 'section' && hint.text.text).toContain('스레드에 답글')
    expect(hint?.type === 'section' && hint.text.text).toContain('같은 세션이 플랜을 고쳐서 새 카드로 다시 보내요')
  })

  it('to be without a link line, and nothing else changed, when the item has no thread', () => {
    const own = buildPlanCard({ itemKey: KEY, cardId: 1, repo: 'web-app', plan: 'p', threadUrl: '' })
    expect(own.blocks.map((block) => block.type)).toStrictEqual(['header', 'section', 'section', 'actions'])
  })

  it('to be titled with the repo and linked to the thread', () => {
    expect(card.text).toBe('플랜: web-app')
    expect(JSON.stringify(card.blocks)).toContain('<https://x.test/t|원본: Slack 쓰레드>')
  })

  it('to be naming a Jira issue as the source when the item came from Jira', () => {
    const fromJira = buildPlanCard({
      itemKey: KEY,
      cardId: 1,
      repo: 'web-app',
      plan: 'p',
      threadUrl: 'https://acme.atlassian.net/browse/PROJ-1',
    })
    expect(JSON.stringify(fromJira.blocks)).toContain('<https://acme.atlassian.net/browse/PROJ-1|원본: Jira 이슈>')
  })

  it('to be without a link line when the item has no thread', () => {
    const own = buildPlanCard({ itemKey: KEY, cardId: 1, repo: 'web-app', plan: 'p', threadUrl: '' })
    expect(JSON.stringify(own.blocks)).not.toContain('원본')
  })

  it('to be a section of at most 3000 characters whatever the plan length', () => {
    const long = buildPlanCard({
      itemKey: KEY,
      cardId: 1,
      repo: 'web-app',
      plan: Array.from({ length: 500 }, (_, i) => `step ${i}`).join('\n'),
      threadUrl: '',
    })
    const body = long.blocks.find((block) => block.type === 'section')
    expect(body?.type === 'section' && body.text.text.length <= 3000).toBe(true)
  })

  it('to be an error for an item key longer than a button value may be', () => {
    expect(() => buildPlanCard({ itemKey: 'k'.repeat(151), cardId: 1, repo: 'r', plan: 'p', threadUrl: '' })).toThrow(
      'item key is longer than 150',
    )
  })
})

describe('buildPrCard as a finished PR', () => {
  it('to be a merge and a reject button, with the QA and PR notes', () => {
    const card = buildPrCard({
      itemKey: KEY,
      repo: 'web-app',
      prUrl: 'https://x.test/pr/1',
      report: 'build ok',
      qa: 'Visual QA 통과 (스크린샷 4장).',
    })
    expect(buttonsOf(card).map((b) => [b.action_id, b.value])).toStrictEqual([
      ['item.merge:0', KEY],
      ['item.cancel:0', KEY],
    ])
    const text = JSON.stringify(card.blocks)
    expect(text).toContain('<https://x.test/pr/1|PR 열기>')
    expect(text).toContain('Visual QA 통과 (스크린샷 4장).')
    expect(text).toContain('기각해도 열린 PR은 GitHub에서 직접 닫아야 해요.')
  })

  it('to be a report that cannot make a link or a mention', () => {
    const card = buildPrCard({
      itemKey: KEY,
      repo: 'web-app',
      prUrl: 'https://x.test/pr/1',
      report: 'see <https://evil.test|PR 열기> and <!channel> & more',
      qa: 'Visual QA 건너뜀: UI 파일 변경 없음.',
    })
    const text = JSON.stringify(card.blocks)
    expect(text).toContain('see &lt;https://evil.test|PR 열기&gt; and &lt;!channel&gt; &amp; more')
    expect(text).not.toContain('<https://evil.test')
    expect(text).not.toContain('<!channel>')
  })
})

describe('buildPrCard as a finished item the worker did not open a PR for', () => {
  it('to be only a discard button, saying that the branch may keep the commits', () => {
    const card = buildPrCard({
      itemKey: KEY,
      repo: 'web-app',
      prUrl: null,
      report: 'build ok',
      qa: 'Visual QA 통과 (스크린샷 4장).',
    })
    expect(card.text).toBe('구현 완료: web-app')
    expect(buttonsOf(card).map((b) => [b.action_id, b.style])).toStrictEqual([['item.cancel:0', 'danger']])
    const text = JSON.stringify(card.blocks)
    expect(text).toContain('폐기하면 워크트리를 지워요. 커밋은 브랜치에 남을 수 있어요.')
    expect(text).not.toContain('PR 열기')
  })
})

describe('buildFailedCard as a failed item', () => {
  it('to be only a retry button while retries are left: a failed item cannot be called off', () => {
    const card = buildFailedCard({ itemKey: KEY, repo: 'web-app', reason: 'tests failed', canRetry: true })
    expect(buttonsOf(card).map((b) => b.action_id)).toStrictEqual(['item.retry:0'])
  })

  it('to be no button at all, with a note, once the retries or the money are spent', () => {
    const card = buildFailedCard({ itemKey: KEY, repo: 'web-app', reason: 'tests failed', canRetry: false })
    expect(card.blocks.some((block) => block.type === 'actions')).toBe(false)
    expect(JSON.stringify(card.blocks)).toContain('다시 시도할 수 없어요: 재시도 횟수나 비용 한도를 다 썼어요.')
  })

  it('to be a reason that cannot open or close a link', () => {
    const card = buildFailedCard({ itemKey: KEY, repo: 'web-app', reason: '<http://evil|click>', canRetry: true })
    expect(JSON.stringify(card.blocks)).toContain('&lt;http://evil|click&gt;')
    expect(JSON.stringify(card.blocks)).not.toContain('<http://evil|click>')
  })
})

describe('shownPlan and shownReport as what the owner is shown', () => {
  it('to be the whole text when it fits', () => {
    expect(shownPlan('1. a\n2. b')).toBe('1. a\n2. b')
    expect(shownReport('done')).toBe('done')
  })

  it('to be cut at whole lines so that the escaped text still fits a section', () => {
    const plan = Array.from({ length: 400 }, (_, i) => `step ${i}: <a> & <b>`).join('\n')
    const shown = shownPlan(plan)
    expect(shown.endsWith('… (이하 생략)')).toBe(true)
    expect(escapeMrkdwn(shown).length).toBeLessThanOrEqual(3000)
    expect(plan.startsWith(shown.replace('\n… (이하 생략)', ''))).toBe(true)
  })

  it('to be the same text the plan card shows, before its escaping', () => {
    const plan = Array.from({ length: 400 }, (_, i) => `step ${i}: <a>`).join('\n')
    const card = buildPlanCard({ itemKey: KEY, cardId: 1, repo: 'web-app', plan, threadUrl: '' })
    const body = card.blocks.find((block) => block.type === 'section')
    expect(body?.type === 'section' && body.text.text).toBe(escapeMrkdwn(shownPlan(plan)))
  })

  it('to be a report short enough to share a section with the line above it', () => {
    const report = Array.from({ length: 400 }, (_, i) => `line ${i}`).join('\n')
    expect(escapeMrkdwn(shownReport(report)).length).toBeLessThanOrEqual(2500)
  })
})

describe('parseItemAction as a click on an item card', () => {
  it.each(['approve_plan', 'reject', 'merge', 'retry', 'cancel'] as const)(
    'to be the %s action with its card and item',
    (action) => {
      expect(parseItemAction(click(`item.${action}:12`, KEY))).toStrictEqual({
        ok: true,
        action,
        cardId: 12,
        itemKey: KEY,
      })
    },
  )

  it.each([
    ['null', null],
    ['not block_actions', { type: 'view_submission' }],
    ['no actions', { type: 'block_actions', actions: [] }],
    ['an action without an id', { type: 'block_actions', actions: [{ value: KEY }] }],
    ['a digest action', click('digest.plan_all:3', '3')],
    ['an unknown item action', click('item.drop_table:1', KEY)],
    ['a card id that is not a number', click('item.reject:abc', KEY)],
  ])('to be refused for %s', (_name, payload) => {
    expect(parseItemAction(payload).ok).toBe(false)
  })

  it.each([
    ['a missing value', undefined],
    ['an empty value', ''],
    ['a number value', 5],
    ['a value that is too long', 'k'.repeat(151)],
  ])('to be refused for %s', (_name, value) => {
    expect(parseItemAction(click('item.reject:1', value))).toStrictEqual({ ok: false, error: 'the button has no item' })
  })
})
