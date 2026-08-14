/**
 * A skipped test is an uncovered contract row. Only "no layer can judge this" justifies it,
 * so the reason has to be written down next to the skip.
 */
const { hasReasonComment } = require('./lib/reason-comment')

const SKIP_PROPERTIES = new Set(['skip', 'todo', 'fixme', 'failing'])
const TEST_ROOTS = new Set(['test', 'it', 'describe', 'suite', 'context'])
const SKIP_IDENTIFIERS = new Set(['xit', 'xtest', 'xdescribe', 'xcontext'])

/** `test.skip`, `it.todo`, `test.describe.skip` - the root identifier decides whether it is a test call. */
const isSkippedTestCall = (callee) => {
  if (callee.type === 'Identifier') {
    return SKIP_IDENTIFIERS.has(callee.name)
  }

  if (callee.type !== 'MemberExpression' || callee.computed || !SKIP_PROPERTIES.has(callee.property.name)) {
    return false
  }

  let root = callee.object
  while (root.type === 'MemberExpression') {
    root = root.object
  }

  return root.type === 'Identifier' && TEST_ROOTS.has(root.name)
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'require a comment explaining why a test is skipped',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      missingReason:
        'Explain the skip in a comment - which layer covers this row instead, or why no layer can judge it.',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode()

    return {
      CallExpression(node) {
        if (!isSkippedTestCall(node.callee)) {
          return
        }

        if (!hasReasonComment(sourceCode, node)) {
          context.report({ node, messageId: 'missingReason' })
        }
      },
    }
  },
}
