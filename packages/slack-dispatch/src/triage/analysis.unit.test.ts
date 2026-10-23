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

  it('to be each text cut to its limit and flattened to one line', () => {
    const long = 'x'.repeat(500)
    const parsed = parseAnalysis({ ...good, request: `a\nb ${long}`, cause: long, plan: long, why: long })
    expect(parsed.request.startsWith('a b x')).toBe(true)
    expect([parsed.request.length, parsed.cause.length, parsed.plan.length, parsed.why.length]).toStrictEqual([
      150, 180, 250, 80,
    ])
    expect(parsed.request).not.toContain('\n')
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
