/**
 * Taking the `signal` out of the queryFn context and then not handing it to the request
 * means the abort never reaches the network - a stale response can still land last and win.
 */
const FUNCTION_TYPES = new Set(['FunctionExpression', 'ArrowFunctionExpression'])

const destructuresSignal = (fn) => {
  const [firstParam] = fn.params

  return Boolean(
    firstParam &&
      firstParam.type === 'ObjectPattern' &&
      firstParam.properties.some(
        (property) => property.type === 'Property' && !property.computed && property.key.name === 'signal',
      ),
  )
}

const hasSignalOption = (call) => {
  const options = call.arguments[1]

  if (!options || options.type !== 'ObjectExpression') {
    return false
  }

  return options.properties.some(
    (property) =>
      (property.type === 'Property' && !property.computed && property.key.name === 'signal') ||
      property.type === 'SpreadElement',
  )
}

/** Every `fetch(...)` lexically inside the queryFn, nested callbacks included. */
const collectFetchCalls = (node, found = []) => {
  if (!node || typeof node.type !== 'string') {
    return found
  }

  if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'fetch') {
    found.push(node)
  }

  Object.keys(node).forEach((key) => {
    if (key === 'parent') {
      return
    }

    const value = node[key]

    if (Array.isArray(value)) {
      value.forEach((child) => collectFetchCalls(child, found))
      return
    }

    if (value && typeof value === 'object') {
      collectFetchCalls(value, found)
    }
  })

  return found
}

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
    },
  },
  create(context) {
    return {
      Property(node) {
        if (node.computed || node.key.name !== 'queryFn' || !FUNCTION_TYPES.has(node.value.type)) {
          return
        }

        if (!destructuresSignal(node.value)) {
          return
        }

        collectFetchCalls(node.value.body).forEach((call) => {
          if (!hasSignalOption(call)) {
            context.report({ node: call, messageId: 'missingSignalPassthrough' })
          }
        })
      },
    }
  },
}
