/**
 * Components render. Transport belongs to the api/network boundary, where the DTO shape,
 * the query key and the cancellation contract can be owned in one place and tested on their own.
 */
const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])
const JSX_TYPES = new Set(['JSXElement', 'JSXFragment'])

// `Item` and `Panel` are components, `GET` and `API` are not.
const isComponentName = (name) => typeof name === 'string' && /^[A-Z][a-z0-9]/.test(name)

const returnsJsx = (fn) => {
  if (fn.body.type !== 'BlockStatement') {
    return JSX_TYPES.has(fn.body.type)
  }

  return fn.body.body.some(
    (statement) => statement.type === 'ReturnStatement' && statement.argument && JSX_TYPES.has(statement.argument.type),
  )
}

const isComponent = (fn) => {
  if (fn.id && isComponentName(fn.id.name)) {
    return true
  }

  if (fn.parent && fn.parent.type === 'VariableDeclarator' && isComponentName(fn.parent.id.name)) {
    return true
  }

  return returnsJsx(fn)
}

const isTransportCall = (callee) => {
  if (callee.type === 'Identifier') {
    return callee.name === 'fetch' || callee.name === 'axios'
  }

  return callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.object.name === 'axios'
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow fetch/axios calls inside components - keep transport in the api boundary',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      transportInComponent:
        'Move this request out of the component. The api/network boundary owns transport; the component receives data and actions.',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode()

    return {
      CallExpression(node) {
        if (!isTransportCall(node.callee)) {
          return
        }

        const insideComponent = sourceCode
          .getAncestors(node)
          .some((ancestor) => FUNCTION_TYPES.has(ancestor.type) && isComponent(ancestor))

        if (insideComponent) {
          context.report({ node, messageId: 'transportInComponent' })
        }
      },
    }
  },
}
