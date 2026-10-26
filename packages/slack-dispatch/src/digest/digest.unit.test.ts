import type { ActionElement, Block, DigestEntry } from './digest'
import { describe, expect, it } from 'vitest'
import { buildDigest, isSelectionClick, MAX_ENTRIES_PER_DIGEST, OWN_PLAN_LIMIT, parseDigestAction, splitDigest } from './digest'

const analysis = {
  request: '푸터 링크 클릭해도 이동 안 함\n모바일과 데스크톱 모두 발생',
  cause: 'footer.tsx의 href 오타',
  plan: 'footer.tsx의 href 수정\n링크 이동 테스트 추가',
  recommend: true,
  why: '작고 분명한 수정이에요',
}

const entry = (n: number, overrides: Partial<DigestEntry> = {}): DigestEntry => ({
  itemKey: `T${n}#web-app`,
  repo: 'web-app',
  summary: `Item ${n}`,
  threadUrl: `https://example.slack.com/archives/C1/p${n}`,
  route: 'the PR link names web-app',
  urgent: false,
  analysis,
  ...overrides,
})

// An entry the model could not read: it has no analysis at all.
const unread = (n: number, overrides: Partial<DigestEntry> = {}): DigestEntry => {
  const { analysis: _analysis, ...plain } = entry(n)
  return { ...plain, ...overrides }
}

const many = (count: number, overrides: Partial<DigestEntry> = {}): DigestEntry[] =>
  Array.from({ length: count }, (_unused, index) => entry(index + 1, overrides))

type Section = Extract<Block, { type: 'section' }>

const sectionsOf = (blocks: Block[]): Section[] => blocks.flatMap((block) => (block.type === 'section' ? [block] : []))

const optionValues = (element: ActionElement | undefined): string[] => {
  if (element?.type !== 'static_select') return []
  return element.options.map((option) => option.value)
}

const buttonsOf = (blocks: Block[]): { action_id: string; style: string | null; label: string }[] =>
  blocks.flatMap((block) =>
    block.type === 'actions'
      ? block.elements.flatMap((element) =>
          element.type === 'button'
            ? [{ action_id: element.action_id, style: element.style ?? null, label: element.text.text }]
            : [],
        )
      : [],
  )

describe('buildDigest as three new items, two of them recommended', () => {
  const entries = [
    entry(1),
    entry(2, { analysis: { ...analysis, recommend: false, why: '제품 결정이 필요해요' } }),
    entry(3, { urgent: true }),
  ]
  const message = buildDigest(4, entries)

  it('to be a header that counts the items, the urgent ones and the recommended ones, also used as the notification', () => {
    expect(message.text).toBe('새 항목 3개 (긴급 1개) · 구현 추천 2개')
    expect(message.blocks[0]).toStrictEqual({
      type: 'header',
      text: { type: 'plain_text', text: '새 항목 3개 (긴급 1개) · 구현 추천 2개' },
    })
  })

  it('to be one section per item with the request, the cause, the plan and the recommendation', () => {
    expect(sectionsOf(message.blocks).map((section) => section.text.text)).toStrictEqual([
      [
        '*1. web-app*  <https://example.slack.com/archives/C1/p1|원본: Slack 쓰레드>  _the PR link names web-app_',
        '*요청사항*',
        '• 푸터 링크 클릭해도 이동 안 함',
        '• 모바일과 데스크톱 모두 발생',
        '*원인*',
        '• footer.tsx의 href 오타',
        '*개선 플랜*',
        '• footer.tsx의 href 수정',
        '• 링크 이동 테스트 추가',
        '*구현 추천:* O — 작고 분명한 수정이에요',
      ].join('\n'),
      [
        '*2. web-app*  <https://example.slack.com/archives/C1/p2|원본: Slack 쓰레드>  _the PR link names web-app_',
        '*요청사항*',
        '• 푸터 링크 클릭해도 이동 안 함',
        '• 모바일과 데스크톱 모두 발생',
        '*원인*',
        '• footer.tsx의 href 오타',
        '*개선 플랜*',
        '• footer.tsx의 href 수정',
        '• 링크 이동 테스트 추가',
        '*구현 추천:* X — 제품 결정이 필요해요',
      ].join('\n'),
      expect.stringContaining('*3. web-app* :rotating_light:  <https://example.slack.com/archives/C1/p3|원본: Slack 쓰레드>'),
    ])
  })

  it('to be a check box on each item, checked at the start only when the item is recommended', () => {
    const boxes = sectionsOf(message.blocks).map((section) => section.accessory)
    expect(boxes.map((box) => box?.options.map((option) => option.value))).toStrictEqual([
      ['T1#web-app'],
      ['T2#web-app'],
      ['T3#web-app'],
    ])
    expect(boxes.map((box) => box?.initial_options?.map((option) => option.value))).toStrictEqual([
      ['T1#web-app'],
      undefined,
      ['T3#web-app'],
    ])
    expect(boxes[0]?.initial_options).toStrictEqual(boxes[0]?.options)
  })

  it('to be ids that name the digest and the position, so every block and every box is its own', () => {
    const sections = sectionsOf(message.blocks)
    expect(sections.map((section) => section.block_id)).toStrictEqual([
      'digest:4:item:0',
      'digest:4:item:1',
      'digest:4:item:2',
    ])
    expect(sections.map((section) => section.accessory?.action_id)).toStrictEqual([
      'digest.pick:4:0',
      'digest.pick:4:1',
      'digest.pick:4:2',
    ])
  })

  it('to be four buttons that name the digest, then a note about the boxes that arrived checked', () => {
    expect(buttonsOf(message.blocks)).toStrictEqual([
      { action_id: 'digest.plan_selected:4', style: 'primary', label: '선택한 항목 플랜 시작' },
      { action_id: 'digest.build_selected:4', style: null, label: '선택한 항목 바로 구현' },
      { action_id: 'digest.plan_all:4', style: null, label: '전체 플랜 시작' },
      { action_id: 'digest.reject_rest:4', style: 'danger', label: '선택 안 한 항목 기각' },
    ])
    const note = message.blocks.at(-1)
    expect(JSON.stringify(note)).toContain('구현 추천 항목은 미리 체크해 두었어요')
  })

  it('to be a model menu in front of the buttons that starts on the automatic choice and offers four models', () => {
    const actions = message.blocks.find((block) => block.type === 'actions')
    const menu = actions?.elements[0]
    expect(menu).toMatchObject({
      type: 'static_select',
      action_id: 'digest.model:4',
      initial_option: { value: 'opusplan' },
    })
    expect(optionValues(menu)).toStrictEqual(['opusplan', 'opus', 'sonnet', 'haiku'])
  })
})

describe('buildDigest as items in several repos', () => {
  it('to be the items of one repo together, in the order the repos first appeared, and numbered in that order', () => {
    const message = buildDigest(1, [
      entry(1, { repo: 'web-app' }),
      entry(2, { repo: 'api-server' }),
      entry(3, { repo: 'web-app' }),
    ])
    const heads = sectionsOf(message.blocks).map((section) => section.text.text.split('\n')[0]?.split('  ')[0])
    expect(heads).toStrictEqual(['*1. web-app*', '*2. web-app*', '*3. api-server*'])
    expect(sectionsOf(message.blocks).map((section) => section.accessory?.options[0]?.value)).toStrictEqual([
      'T1#web-app',
      'T3#web-app',
      'T2#web-app',
    ])
  })
})

describe('buildDigest as an item the model could not read', () => {
  const message = buildDigest(1, [unread(1, { summary: 'The footer link is broken' })])
  const section = sectionsOf(message.blocks)[0]

  it('to be the plain summary with a note, recommended as no', () => {
    expect(section?.text.text.split('\n').slice(1)).toStrictEqual([
      '*요청사항*',
      '• The footer link is broken',
      '_분석을 못 했어요. 원본을 확인해 주세요._',
      '*구현 추천:* X',
    ])
  })

  it('to be unchecked at the start, and not counted as recommended in the title', () => {
    expect(section?.accessory?.initial_options).toBeUndefined()
    expect(message.text).toBe('새 항목 1개')
  })
})

describe('buildDigest as text that must stay text', () => {
  it('to be an analysis and a repo name that cannot make a link, a mention or a channel call', () => {
    const message = buildDigest(1, [
      entry(1, {
        repo: '<!here>',
        analysis: {
          ...analysis,
          request: '<!channel> & <@U1>',
          cause: '<https://evil.test|x>',
          plan: '>quote',
          why: '<b>',
        },
      }),
    ])
    const text = sectionsOf(message.blocks)[0]?.text.text ?? ''
    expect(text).toContain('*1. &lt;!here&gt;*')
    expect(text).toContain('• &lt;!channel&gt; &amp; &lt;@U1&gt;')
    expect(text).toContain('• &lt;https://evil.test|x&gt;')
    expect(text).toContain('• &gt;quote')
    expect(text).toContain('*구현 추천:* O — &lt;b&gt;')
    expect(text).not.toContain('<!')
    expect(text).not.toContain('<@')
  })

  it('to be a fallback summary that cannot make a link either', () => {
    const message = buildDigest(1, [unread(1, { summary: 'see <https://evil.test|here>' })])
    expect(sectionsOf(message.blocks)[0]?.text.text).toContain('• see &lt;https://evil.test|here&gt;')
  })

  it('to be an item with no thread: no link, and no route when there is none', () => {
    const message = buildDigest(1, [entry(1, { threadUrl: '', route: '' })])
    expect(sectionsOf(message.blocks)[0]?.text.text.split('\n')[0]).toBe('*1. web-app*')
  })

  it('to be a section under 3000 characters even when every field is as long as allowed and all markup characters', () => {
    const worst = '<'.repeat(400)
    const message = buildDigest(1, [
      entry(1, {
        repo: worst,
        route: worst,
        summary: worst,
        analysis: {
          request: Array.from({ length: 4 }, () => '<'.repeat(70)).join('\n'),
          cause: Array.from({ length: 4 }, () => '<'.repeat(70)).join('\n'),
          plan: Array.from({ length: 4 }, () => '<'.repeat(70)).join('\n'),
          recommend: true,
          why: '<'.repeat(80),
        },
      }),
    ])
    expect(sectionsOf(message.blocks)[0]?.text.text.length).toBeLessThanOrEqual(3000)
  })
})

describe('buildDigest as paragraphs that together do not fit a section', () => {
  const lines = (text: string): string => Array.from({ length: 4 }, () => text.repeat(70)).join('\n')

  it.each(['&', '<', '>'])(
    'to be the whole plan, with lines of the request and the cause dropped, for %s everywhere',
    (mark) => {
      const full = {
        request: lines(mark),
        cause: lines(mark),
        plan: lines(mark),
        recommend: true,
        why: mark.repeat(80),
      }
      const text = sectionsOf(buildDigest(1, [entry(1, { analysis: full })]).blocks)[0]?.text.text ?? ''
      expect(text.length).toBeLessThanOrEqual(3000)
      expect(text).not.toContain('이하 생략')
      const plan = text.split('*개선 플랜*\n')[1]?.split('\n*구현 추천:*')[0] ?? ''
      expect(plan.split('\n')).toHaveLength(4)
    },
  )

  it('to be every line of everything when it fits', () => {
    const text = sectionsOf(buildDigest(1, [entry(1)]).blocks)[0]?.text.text ?? ''
    expect(text).toContain('• 모바일과 데스크톱 모두 발생')
    expect(text).toContain('• 링크 이동 테스트 추가')
  })
})

describe('buildDigest as an empty or oversized list', () => {
  it('to be an error for no entries', () => {
    expect(() => buildDigest(1, [])).toThrow('a digest needs at least one entry')
  })

  it('to be a message with at most 50 blocks at the largest size, so Slack accepts it', () => {
    const message = buildDigest(1, many(MAX_ENTRIES_PER_DIGEST), ['web-app', 'api'])
    expect(message.blocks).toHaveLength(MAX_ENTRIES_PER_DIGEST + 6)
    expect(message.blocks.length).toBeLessThanOrEqual(50)
  })

  it('to be an error for more entries than one message holds', () => {
    expect(() => buildDigest(1, many(MAX_ENTRIES_PER_DIGEST + 1))).toThrow('split it first')
  })

  it('to be an error for an item key longer than the option value limit', () => {
    expect(() => buildDigest(1, [entry(1, { itemKey: 'k'.repeat(151) })])).toThrow('item key is longer than 150')
  })
})

describe('splitDigest as items that arrived in one poll', () => {
  it('to be messages of at most forty, in arrival order', () => {
    const chunks = splitDigest(many(85))
    expect(chunks.map((chunk) => chunk.length)).toStrictEqual([40, 40, 5])
    expect(chunks[2]?.[0]?.itemKey).toBe('T81#web-app')
  })

  it('to be nothing for no items', () => {
    expect(splitDigest([])).toStrictEqual([])
  })
})

describe('isSelectionClick as a tick in a check box or a choice in the model menu', () => {
  it('to be true for a click on a pick box or the model menu and false for a button or anything else', () => {
    const click = (actionId: unknown): unknown => ({ type: 'block_actions', actions: [{ action_id: actionId }] })
    expect(isSelectionClick(click('digest.pick:7:2'))).toBe(true)
    expect(isSelectionClick(click('digest.model:7'))).toBe(true)
    expect(isSelectionClick(click('digest.build_selected:7'))).toBe(false)
    expect(isSelectionClick(click('digest.plan_all:7'))).toBe(false)
    expect(isSelectionClick(click('item.merge:0'))).toBe(false)
    expect(isSelectionClick(click(5))).toBe(false)
    expect(isSelectionClick(null)).toBe(false)
  })
})

function clickPayload(actionId: unknown, values: unknown = {}): unknown {
  return {
    type: 'block_actions',
    user: { id: 'U1' },
    actions: [{ action_id: actionId, type: 'button' }],
    state: { values },
  }
}

const picks = (actionId: string, ...keys: unknown[]): unknown => ({
  [actionId]: { type: 'checkboxes', selected_options: keys.map((value) => ({ value })) },
})

describe('parseDigestAction as the click on a digest button', () => {
  it('to be the action, the digest and everything ticked in that digest, without repeats', () => {
    const payload = clickPayload('digest.plan_selected:7', {
      'digest:7:pick:0': picks('digest.pick:7:0', 'T1#web-app', 'T2#web-app'),
      'digest:7:pick:1': picks('digest.pick:7:1', 'T3#api-server', 'T1#web-app'),
    })
    expect(parseDigestAction(payload)).toEqual({
      ok: true,
      action: 'plan_selected',
      digestId: 7,
      selected: ['T1#web-app', 'T2#web-app', 'T3#api-server'],
      model: 'opusplan',
      ownPlan: '',
      repo: '',
    })
  })

  it('to be refused for the rough plan button, which the digest no longer has', () => {
    expect(parseDigestAction(clickPayload('digest.rough_plan:9'))).toEqual({
      ok: false,
      error: 'not a digest action: digest.rough_plan:9',
    })
  })

  it('to be only the ticks of the clicked digest when an older digest is still on screen', () => {
    const payload = clickPayload('digest.reject_rest:8', {
      'digest:7:pick:0': picks('digest.pick:7:0', 'OLD#web-app'),
      'digest:8:pick:0': picks('digest.pick:8:0', 'NEW#web-app'),
    })
    expect(parseDigestAction(payload)).toEqual({
      ok: true,
      action: 'reject_rest',
      digestId: 8,
      selected: ['NEW#web-app'],
      model: 'opusplan',
      ownPlan: '',
      repo: '',
    })
  })

  it('to be an empty selection when nothing is ticked or the state is missing', () => {
    expect(parseDigestAction(clickPayload('digest.plan_all:3'))).toEqual({
      ok: true,
      action: 'plan_all',
      digestId: 3,
      selected: [],
      model: 'opusplan',
      ownPlan: '',
      repo: '',
    })
    expect(parseDigestAction({ type: 'block_actions', actions: [{ action_id: 'digest.plan_all:3' }] })).toEqual({
      ok: true,
      action: 'plan_all',
      digestId: 3,
      selected: [],
      model: 'opusplan',
      ownPlan: '',
      repo: '',
    })
  })

  it('to be the plan the owner typed in the box of that digest, trimmed and cut to the limit', () => {
    const typed = (value: unknown): unknown =>
      clickPayload('digest.plan_selected:7', {
        'digest:7:ownplan': { 'digest.ownplan:7': { type: 'plain_text_input', value } },
        'digest:6:ownplan': { 'digest.ownplan:6': { type: 'plain_text_input', value: 'old digest' } },
      })
    expect(parseDigestAction(typed('  탭 추가\n팝업 재사용  '))).toMatchObject({ ok: true, ownPlan: '탭 추가\n팝업 재사용' })
    expect(parseDigestAction(typed(null))).toMatchObject({ ok: true, ownPlan: '' })
    expect(parseDigestAction(typed('x'.repeat(OWN_PLAN_LIMIT + 10)))).toMatchObject({
      ok: true,
      ownPlan: 'x'.repeat(OWN_PLAN_LIMIT),
    })
  })

  it('to be the typed repo over the menu, the menu when nothing is typed, and empty when neither was used', () => {
    const chosen = (typedRepo: unknown, menuRepo?: string): unknown =>
      clickPayload('digest.plan_selected:7', {
        'digest:7:repotext': { 'digest.repotext:7': { type: 'plain_text_input', value: typedRepo } },
        'digest:7:repo': {
          'digest.repo:7': { type: 'static_select', selected_option: menuRepo === undefined ? null : { value: menuRepo } },
        },
      })
    expect(parseDigestAction(chosen('  Deep-Agent ', 'web-app'))).toMatchObject({ ok: true, repo: 'Deep-Agent' })
    expect(parseDigestAction(chosen('   ', 'web-app'))).toMatchObject({ ok: true, repo: 'web-app' })
    expect(parseDigestAction(chosen(null))).toMatchObject({ ok: true, repo: '' })
  })

  it('to be a menu of the known repos and a box to type one, and only the box when none are known', () => {
    const ids = (message: ReturnType<typeof buildDigest>): (string | undefined)[] =>
      message.blocks.map((block) => ('block_id' in block ? block.block_id : undefined))
    expect(ids(buildDigest(7, many(1), ['web-app']))).toEqual(
      expect.arrayContaining(['digest:7:repo', 'digest:7:repotext']),
    )
    expect(ids(buildDigest(7, many(1)))).not.toContain('digest:7:repo')
    expect(ids(buildDigest(7, many(1)))).toContain('digest:7:repotext')
  })

  it('to be a choice in the repo menu treated as a selection, not an action', () => {
    expect(isSelectionClick(clickPayload('digest.repo:7', {}))).toBe(true)
  })

  it('to be the build-now action with the model chosen in the menu of that digest', () => {
    const payload = clickPayload('digest.build_selected:7', {
      'digest:7:decide': { 'digest.model:7': { type: 'static_select', selected_option: { value: 'sonnet' } } },
    })
    expect(parseDigestAction(payload)).toMatchObject({
      ok: true,
      action: 'build_selected',
      digestId: 7,
      model: 'sonnet',
    })
  })

  it.each([
    ['a model nobody offered', { selected_option: { value: 'gpt-9' } }],
    ['a value that is not text', { selected_option: { value: 5 } }],
    ['a menu with nothing chosen', { selected_option: null }],
  ])('to be the automatic model for %s', (_name, element) => {
    const payload = clickPayload('digest.plan_all:7', { 'digest:7:decide': { 'digest.model:7': element } })
    expect(parseDigestAction(payload)).toMatchObject({ ok: true, model: 'opusplan' })
  })

  it('to be the model of the clicked digest only, not one whose id starts the same', () => {
    const payload = clickPayload('digest.plan_all:7', {
      'digest:70:decide': { 'digest.model:70': { selected_option: { value: 'haiku' } } },
    })
    expect(parseDigestAction(payload)).toMatchObject({ ok: true, model: 'opusplan' })
  })

  it('to be ticks that are strings only', () => {
    const payload = clickPayload('digest.plan_selected:7', {
      'digest:7:pick:0': picks('digest.pick:7:0', 'T1#web-app', 42, null, { value: 'x' }),
    })
    expect(parseDigestAction(payload)).toMatchObject({ ok: true, selected: ['T1#web-app'] })
  })

  it.each([
    ['a string', 'digest.plan_all:3', 'not a block_actions payload'],
    ['null', null, 'not a block_actions payload'],
    ['another payload type', { type: 'view_submission' }, 'not a block_actions payload'],
    ['no actions', { type: 'block_actions' }, 'no action in the payload'],
    ['an empty action list', { type: 'block_actions', actions: [] }, 'no action in the payload'],
    ['an action id that is not text', clickPayload(42), 'no action in the payload'],
    ['an unknown action', clickPayload('digest.launch:3'), 'not a digest action: digest.launch:3'],
    [
      'a digest id that is not a number',
      clickPayload('digest.plan_all:abc'),
      'not a digest action: digest.plan_all:abc',
    ],
    ['an action of another feature', clickPayload('plan.approve:3'), 'not a digest action: plan.approve:3'],
  ])('to be a refusal that says why for %s', (_name, payload, error) => {
    expect(parseDigestAction(payload)).toEqual({ ok: false, error })
  })
})
