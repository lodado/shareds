import { describe, expect, it } from 'vitest'
import { parseAnalysis, readAnalysis } from './analysis'

const good = {
  request: '푸터 링크가 깨짐',
  cause: 'footer.tsx의 href 오타',
  plan: 'href를 고친다',
  recommend: true,
  why: '작고 분명함',
}

describe('parseAnalysis as the answer of the cheapest model', () => {
  it('to be the five fields when the answer is complete', () => {
    expect(parseAnalysis(good)).toStrictEqual(good)
  })

  it('to be a paragraph of at most four lines, each line cut to 70 characters', () => {
    const long = 'x'.repeat(500)
    const parsed = parseAnalysis({
      ...good,
      request: ['a', 'b', 'c', 'd', 'e', 'f'],
      cause: long,
      plan: `1줄\n2줄\n${long}\n4줄\n5줄`,
      why: long,
    })
    expect(parsed.request).toBe('a\nb\nc\nd')
    expect(parsed.cause.split('\n').map((line) => line.length)).toStrictEqual([70])
    expect(parsed.plan.split('\n').map((line) => line.length)).toStrictEqual([2, 2, 70, 2])
    expect(parsed.why).toHaveLength(80)
  })

  it('to be a line without the bullet or number the model put in front, and without blank lines', () => {
    const parsed = parseAnalysis({
      ...good,
      plan: ['- 파일 수정', '', '2) 테스트 추가', '• 린트 실행', '2.5배 느림'],
    })
    expect(parsed.plan).toBe('파일 수정\n테스트 추가\n린트 실행\n2.5배 느림')
  })

  it.each([['  - foo'], ['- 1. foo'], ['• - 2) foo'], ['  1. 2. foo']])(
    'to be one clean line for %j, the same when parsed again',
    (line) => {
      const once = parseAnalysis({ ...good, plan: [line] })
      expect(once.plan).toBe('foo')
      expect(parseAnalysis(once).plan).toBe('foo')
    },
  )

  it('to be the same analysis when it is parsed again, so one read back from the store does not change', () => {
    const once = parseAnalysis({ ...good, request: ['첫째 줄', '- 둘째 줄'] })
    expect(parseAnalysis(once)).toStrictEqual(once)
  })

  it.each(['true', 1, 'yes', null, undefined, [], {}])(
    'to be a no for recommend %j: only an exact true counts',
    (value) => {
      expect(parseAnalysis({ ...good, recommend: value }).recommend).toBe(false)
    },
  )

  it('to be an empty reason when the model gave none', () => {
    const { why: _why, ...withoutWhy } = good
    expect(parseAnalysis(withoutWhy).why).toBe('')
    expect(parseAnalysis({ ...good, why: 5 }).why).toBe('')
  })

  it.each(['request', 'cause', 'plan'] as const)('to be an error when %s is missing, blank or not text', (field) => {
    for (const bad of [undefined, '', '   \n ', 5, null]) {
      expect(() => parseAnalysis({ ...good, [field]: bad })).toThrow(`the analysis has no ${field}`)
    }
  })

  it.each([null, 'text', 5, [], undefined])('to be an error for %j, which is not an object', (value) => {
    expect(() => parseAnalysis(value)).toThrow('the analysis is not an object')
  })
})

describe('readAnalysis as an analysis read back from the store', () => {
  it('to be the analysis when it is whole and undefined when it is damaged', () => {
    expect(readAnalysis(good)).toStrictEqual(good)
    expect(readAnalysis({ ...good, plan: '' })).toBeUndefined()
    expect(readAnalysis('not an object')).toBeUndefined()
    expect(readAnalysis(undefined)).toBeUndefined()
  })
})
