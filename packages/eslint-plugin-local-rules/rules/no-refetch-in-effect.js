/**
 * Query keys are the dependency mechanism. Re-fetching from an effect when an input changes
 * duplicates that mechanism and leaks stale/out-of-order responses onto the screen.
 */
const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect'])

const calleeName = (callee) => {
  if (callee.type === 'Identifier') {
    return callee.name
  }

  if (callee.type === 'MemberExpression' && !callee.computed) {
    return callee.property.name
  }

  return null
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow calling refetch() inside an effect - put the input in the query key instead',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      refetchInEffect: 'Do not refetch from an effect. Put every input that changes the result into the query key.',
    },
  },
  create(context) {
    const effectStack = []

    return {
      CallExpression(node) {
        const name = calleeName(node.callee)

        if (EFFECT_HOOKS.has(name)) {
          effectStack.push(node)
          return
        }

        if (name === 'refetch' && effectStack.length > 0) {
          context.report({ node, messageId: 'refetchInEffect' })
        }
      },
      'CallExpression:exit': (node) => {
        if (effectStack[effectStack.length - 1] === node) {
          effectStack.pop()
        }
      },
    }
  },
}
