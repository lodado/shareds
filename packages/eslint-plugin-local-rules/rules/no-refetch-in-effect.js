/**
 * Query keys are the dependency mechanism. Re-fetching from an effect when an input changes
 * duplicates that mechanism and leaks stale/out-of-order responses onto the screen.
 *
 * `refetch` is recognised under any local name it was destructured to, and cache invalidation
 * (`queryClient.invalidateQueries`) counts too. A call inside a subscription callback - an
 * event listener, `socket.onmessage`, `subscribe(...)` - reacts to an external system and is fine.
 */
const { findVariable } = require('./lib/runtime-modules')

const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect'])
const CACHE_METHODS = new Set(['refetch', 'invalidateQueries', 'refetchQueries', 'resetQueries'])
const SUBSCRIBERS = new Set(['addEventListener', 'subscribe', 'on', 'once', 'listen'])
const FUNCTION_TYPES = new Set(['FunctionExpression', 'ArrowFunctionExpression', 'FunctionDeclaration'])

const calleeName = (callee) => {
  if (callee.type === 'Identifier') {
    return callee.name
  }
  if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
    return callee.property.name
  }
  return null
}

/** `refetch()`, `query.refetch()`, `reload()` where `const { refetch: reload } = ...`, `client.invalidateQueries()`. */
const isRefetch = (sourceCode, callee) => {
  if (callee.type === 'MemberExpression') {
    return CACHE_METHODS.has(calleeName(callee))
  }
  if (callee.type !== 'Identifier') {
    return false
  }
  const definition = findVariable(sourceCode, callee)?.defs[0]
  const property = definition?.name.parent
  if (property?.type === 'Property' && property.parent.type === 'ObjectPattern') {
    return (property.key.name ?? property.key.value) === 'refetch'
  }
  return callee.name === 'refetch'
}

/** A function handed to a subscription API or assigned to an `on*` handler property. */
const isSubscriptionCallback = (fn) => {
  const { parent } = fn
  if (parent.type === 'CallExpression' && parent.arguments.includes(fn)) {
    return SUBSCRIBERS.has(calleeName(parent.callee))
  }
  return (
    parent.type === 'AssignmentExpression' &&
    parent.left.type === 'MemberExpression' &&
    /^on[a-z]/u.test(calleeName(parent.left) ?? '')
  )
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
    const sourceCode = context.sourceCode

    return {
      CallExpression(node) {
        if (!isRefetch(sourceCode, node.callee)) {
          return
        }

        for (const ancestor of sourceCode.getAncestors(node).reverse()) {
          if (FUNCTION_TYPES.has(ancestor.type) && isSubscriptionCallback(ancestor)) {
            return
          }
          if (ancestor.type === 'CallExpression' && EFFECT_HOOKS.has(calleeName(ancestor.callee))) {
            context.report({ node, messageId: 'refetchInEffect' })
            return
          }
        }
      },
    }
  },
}
