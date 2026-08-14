/**
 * Storing a value that the current props and state already determine gives the screen a second
 * source of truth and an extra render to get there. Derive it while rendering instead.
 */
const EFFECT_HOOKS = new Set(['useEffect', 'useLayoutEffect'])
const IMPURE_TYPES = new Set([
  'CallExpression',
  'NewExpression',
  'AwaitExpression',
  'AssignmentExpression',
  'UpdateExpression',
  'YieldExpression',
])

const effectName = (callee) => {
  if (callee.type === 'Identifier') {
    return callee.name
  }

  return callee.type === 'MemberExpression' && !callee.computed ? callee.property.name : null
}

/** The single expression the effect body evaluates, or null when it does more than one thing. */
const soleExpression = (fn) => {
  if (fn.body.type !== 'BlockStatement') {
    return fn.body
  }

  const [statement] = fn.body.body

  return fn.body.body.length === 1 && statement.type === 'ExpressionStatement' ? statement.expression : null
}

const walk = (node, visit) => {
  if (!node || typeof node.type !== 'string') {
    return
  }

  visit(node)

  Object.keys(node).forEach((key) => {
    if (key === 'parent') {
      return
    }

    const value = node[key]

    if (Array.isArray(value)) {
      value.forEach((child) => walk(child, visit))
      return
    }

    if (value && typeof value === 'object') {
      walk(value, visit)
    }
  })
}

const describeArgument = (argument) => {
  let pure = true
  const identifiers = new Set()

  walk(argument, (node) => {
    if (IMPURE_TYPES.has(node.type)) {
      pure = false
      return
    }

    if (node.type === 'Identifier') {
      identifiers.add(node.name)
    }
  })

  return { pure, identifiers }
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'disallow effects whose only job is to store a value derived from the dependencies',
      category: 'Best Practices',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      derivedStateInEffect:
        'This value is derived from {{ deps }}. Compute it during render instead of storing it from an effect.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!EFFECT_HOOKS.has(effectName(node.callee)) || node.arguments.length < 2) {
          return
        }

        const [callback, dependencies] = node.arguments

        if (callback.type !== 'ArrowFunctionExpression' && callback.type !== 'FunctionExpression') {
          return
        }

        if (dependencies.type !== 'ArrayExpression') {
          return
        }

        const expression = soleExpression(callback)

        if (
          !expression ||
          expression.type !== 'CallExpression' ||
          expression.callee.type !== 'Identifier' ||
          !/^set[A-Z]/.test(expression.callee.name) ||
          expression.arguments.length !== 1
        ) {
          return
        }

        const depNames = new Set(
          dependencies.elements
            .filter((element) => element && element.type === 'Identifier')
            .map((element) => element.name),
        )

        const { pure, identifiers } = describeArgument(expression.arguments[0])
        const used = [...identifiers].filter((name) => depNames.has(name))

        if (!pure || used.length === 0 || identifiers.size !== used.length) {
          return
        }

        context.report({ node, messageId: 'derivedStateInEffect', data: { deps: used.join(', ') } })
      },
    }
  },
}
