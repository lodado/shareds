/**
 * Taking the `signal` out of the queryFn context and then not handing it to the request
 * means the abort never reaches the network - a stale response can still land last and win.
 */
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

const hasSignalOption = (call, signalName) => {
  const options = call.arguments[1]

  if (!options || options.type !== 'ObjectExpression') {
    return false
  }

  return options.properties.some((property) => {
    if (property.type !== 'Property' || property.computed || property.key.name !== 'signal') {
      return false
    }

    return property.value.type === 'Identifier' && property.value.name === signalName
  })
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

        const signalName = signalBindingName(node.value)
        if (!signalName) {
          return
        }

        collectFetchCalls(node.value.body).forEach((call) => {
          if (!hasSignalOption(call, signalName)) {
            context.report({ node: call, messageId: 'missingSignalPassthrough' })
          }
        })
      },
    }
  },
}
