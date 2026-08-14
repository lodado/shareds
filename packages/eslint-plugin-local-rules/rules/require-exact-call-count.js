/**
 * Side-effect count is where mutation bugs hide: 0 / exactly 1 / 2+.
 * `toHaveBeenCalled()` passes for 1 and for 7, so it cannot express that boundary.
 */
const LOOSE_CALL_MATCHERS = new Set(['toHaveBeenCalled', 'toBeCalled'])
const EXACT_VALUE_MATCHERS = new Set(['toBe', 'toEqual', 'toStrictEqual'])

/** Walks `expect(x).not.resolves.matcher` back to the `expect(x)` call, noting a `.not` on the way. */
const readExpectChain = (matcherCallee) => {
  let current = matcherCallee.object
  let negated = false

  while (current && current.type === 'MemberExpression') {
    if (!current.computed && current.property.name === 'not') {
      negated = true
    }
    current = current.object
  }

  const isExpectCall =
    current &&
    current.type === 'CallExpression' &&
    current.callee.type === 'Identifier' &&
    current.callee.name === 'expect'

  return isExpectCall ? { expectCall: current, negated } : null
}

const isMockCallsLength = (node) =>
  node &&
  node.type === 'MemberExpression' &&
  !node.computed &&
  node.property.name === 'length' &&
  node.object.type === 'MemberExpression' &&
  !node.object.computed &&
  node.object.property.name === 'calls'

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'require exact call-count assertions instead of loose "was it called" matchers',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      exactCount:
        'Assert the exact number of calls with toHaveBeenCalledTimes(n) - "{{ matcher }}" passes for 1 call and for 7.',
      exactLength: 'Assert the exact call count with toBe(n) - "{{ matcher }}" hides how many calls happened.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression' || node.callee.computed) {
          return
        }

        const matcher = node.callee.property.name
        const chain = readExpectChain(node.callee)

        if (!chain) {
          return
        }

        // `.not.toHaveBeenCalled()` is already the exact "0 calls" boundary.
        if (LOOSE_CALL_MATCHERS.has(matcher) && !chain.negated) {
          context.report({ node, messageId: 'exactCount', data: { matcher } })
          return
        }

        if (isMockCallsLength(chain.expectCall.arguments[0]) && !EXACT_VALUE_MATCHERS.has(matcher)) {
          context.report({ node, messageId: 'exactLength', data: { matcher } })
        }
      },
    }
  },
}
