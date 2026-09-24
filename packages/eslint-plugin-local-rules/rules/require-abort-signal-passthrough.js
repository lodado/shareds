/**
 * A queryFn that makes a request without the context `signal` means the abort never reaches the
 * network - a stale response can still land last and win. The rule checks every request the
 * queryFn makes (fetch, `window.fetch`, an HTTP client or its instance), so deleting `{ signal }`
 * does not silence it. The signal counts wherever it appears in the request arguments:
 * `{ signal }`, `AbortSignal.any([signal, ...])`, `new Request(url, { signal })` or a local
 * `const init = { signal }`.
 */
const { findVariable, isTransport } = require('./lib/runtime-modules')

const FUNCTION_TYPES = new Set(['FunctionExpression', 'ArrowFunctionExpression'])

const signalBindingName = (fn) => {
  const [firstParam] = fn.params
  if (firstParam?.type !== 'ObjectPattern') {
    return undefined
  }
  const property = firstParam.properties.find(
    (entry) => entry.type === 'Property' && !entry.computed && entry.key.name === 'signal',
  )
  if (!property) {
    return undefined
  }
  let binding = property.value
  if (binding.type === 'AssignmentPattern') {
    binding = binding.left
  }
  return binding.name
}

/** Whether `name` is read anywhere under `node`, following one hop into a local const initializer. */
const mentions = (sourceCode, node, name, followed = false) => {
  if (!node || typeof node.type !== 'string') {
    return false
  }
  if (node.type === 'Identifier') {
    if (node.name === name) {
      return true
    }
    const init = followed ? null : findVariable(sourceCode, node)?.defs[0]?.node.init
    return Boolean(init) && mentions(sourceCode, init, name, true)
  }
  return Object.keys(node).some((key) => {
    if (key === 'parent' || (key === 'key' && node.type === 'Property' && !node.computed && !node.shorthand)) {
      return false
    }
    const value = node[key]
    return Array.isArray(value)
      ? value.some((child) => mentions(sourceCode, child, name, followed))
      : Boolean(value) && typeof value === 'object' && mentions(sourceCode, value, name, followed)
  })
}

/** The queryFn function this node sits in, if any. */
const enclosingQueryFn = (sourceCode, node) =>
  sourceCode
    .getAncestors(node)
    .findLast(
      (ancestor) =>
        FUNCTION_TYPES.has(ancestor.type) &&
        ancestor.parent.type === 'Property' &&
        !ancestor.parent.computed &&
        ancestor.parent.key.name === 'queryFn',
    )

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'require the queryFn AbortSignal to be passed to the request it guards',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      missingSignalPassthrough:
        'Pass the queryFn signal to this request - fetch(url, { signal }) - otherwise cancellation never reaches the network.',
      missingSignal:
        'Take `signal` from the queryFn context and pass it to this request - ({ signal }) => fetch(url, { signal }).',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode

    return {
      CallExpression(node) {
        if (!isTransport(sourceCode, node.callee) || isTransport(sourceCode, node)) {
          return
        }
        const queryFn = enclosingQueryFn(sourceCode, node)
        if (!queryFn) {
          return
        }

        const signalName = signalBindingName(queryFn)
        if (!signalName) {
          context.report({ node, messageId: 'missingSignal' })
        } else if (!node.arguments.some((argument) => mentions(sourceCode, argument, signalName))) {
          context.report({ node, messageId: 'missingSignalPassthrough' })
        }
      },
    }
  },
}
