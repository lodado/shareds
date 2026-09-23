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
      // Nesting is core `no-nested-ternary`'s job (the base preset turns it on); reporting it here
      // too would report one defect twice.
      description:
        'disallow ternaries whose condition contains logical operators or optional chains - extract a named pure function with early returns, or a lookup object',
      category: 'Best Practices',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      complexTest:
        'Ternary condition contains a logical operator or optional chain. Extract a named pure function with early returns, or a lookup object.',
    },
  },
  create(context) {
    return {
      ConditionalExpression(node) {
        if (containsComplexity(node.test)) {
          context.report({ node, messageId: 'complexTest' })
        }
      },
    }
  },
}
