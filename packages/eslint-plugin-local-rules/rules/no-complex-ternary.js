const SKIPPED_KEYS = new Set(['parent', 'loc', 'range', 'start', 'end'])

/** Walks an expression subtree looking for logical operators or optional chains. */
function containsComplexity(node) {
  if (node === null || typeof node !== 'object' || typeof node.type !== 'string') {
    return false
  }

  if (node.type === 'LogicalExpression' || node.type === 'ChainExpression') {
    return true
  }

  return Object.keys(node).some((key) => {
    if (SKIPPED_KEYS.has(key)) {
      return false
    }

    const value = node[key]

    if (Array.isArray(value)) {
      return value.some(containsComplexity)
    }

    return containsComplexity(value)
  })
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'disallow nested ternaries and ternaries whose condition contains logical operators or optional chains - extract a named pure function with early returns, or a lookup object',
      category: 'Best Practices',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      nestedTernary: 'Nested ternary hides the branching rule. Extract a named pure function with early returns.',
      complexTest:
        'Ternary condition contains a logical operator or optional chain. Extract a named pure function with early returns, or a lookup object.',
    },
  },
  create(context) {
    return {
      ConditionalExpression(node) {
        const isNested =
          node.test.type === 'ConditionalExpression' ||
          node.consequent.type === 'ConditionalExpression' ||
          node.alternate.type === 'ConditionalExpression'

        if (isNested) {
          context.report({ node, messageId: 'nestedTernary' })
          return
        }

        if (containsComplexity(node.test)) {
          context.report({ node, messageId: 'complexTest' })
        }
      },
    }
  },
}
