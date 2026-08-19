/**
 * An effect is a bridge to an external system. Every one of them owes the reader
 * three things - which system, why, and how it is cleaned up - so require them in writing.
 */
const { hasReasonComment } = require('./lib/reason-comment')

const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect'])

const getEffectName = (callee) => {
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
    type: 'suggestion',
    docs: {
      description: 'require a comment describing the external system, reason and cleanup of an effect',
      category: 'Best Practices',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      missingAnnotation:
        'Document this {{ hook }}: which external system it syncs, why it is an effect, and how it cleans up.',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode()

    return {
      CallExpression(node) {
        const hook = getEffectName(node.callee)

        if (!hook || !EFFECT_HOOKS.has(hook)) {
          return
        }

        if (!hasReasonComment(sourceCode, node)) {
          context.report({ node, messageId: 'missingAnnotation', data: { hook } })
        }
      },
    }
  },
}
