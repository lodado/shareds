/**
 * Components render. Transport belongs to the api/network boundary, where the DTO shape,
 * the query key and the cancellation contract can be owned in one place and tested on their own.
 *
 * A request is reported inside a component (a PascalCase function that returns JSX or null) and
 * anywhere in a module that renders JSX - so a helper beside the component counts too - whatever
 * its spelling: an alias (`const f = fetch`), `window.fetch`, an HTTP client import or an
 * `axios.create()` instance. A PascalCase factory that returns an object is not a component. Hooks
 * in their own modules belong to the hook-tiers preset; `'use server'` modules and test files are
 * out of scope.
 */
const { functionName, isTransport } = require('./lib/runtime-modules')
const { isTestFile } = require('./lib/test-file')

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])
const RENDERED = new Set(['JSXElement', 'JSXFragment'])

const rendersValue = (node) =>
  Boolean(node) && (RENDERED.has(node.type) || (node.type === 'Literal' && node.value === null))

/** Every value this function returns directly, ignoring nested functions. */
const returnedValues = (fn) => {
  if (fn.body.type !== 'BlockStatement') {
    return [fn.body]
  }
  const values = []
  const visit = (node) => {
    if (!node || typeof node.type !== 'string' || FUNCTION_TYPES.has(node.type)) {
      return
    }
    if (node.type === 'ReturnStatement') {
      values.push(node.argument)
    }
    for (const key of Object.keys(node)) {
      const value = key === 'parent' ? null : node[key]
      if (Array.isArray(value)) {
        value.forEach(visit)
      } else if (value && typeof value === 'object') {
        visit(value)
      }
    }
  }
  fn.body.body.forEach(visit)
  return values
}

// `Item` and `Panel` are components, `GET` and `API` are not.
const isComponent = (fn) => {
  const values = returnedValues(fn)
  return (
    (/^[A-Z][a-z0-9]/u.test(functionName(fn) ?? '') && values.some(rendersValue)) ||
    values.some((value) => RENDERED.has(value?.type))
  )
}

const isServerModule = (program) =>
  program.body.some((statement) => statement.type === 'ExpressionStatement' && statement.directive === 'use server')

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow requests in modules that render JSX - keep transport in the api boundary',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      transportInComponent:
        'Move this request out of the component module. The api/network boundary owns transport; the component receives data and actions.',
    },
  },
  create(context) {
    if (isTestFile(context.filename)) {
      return {}
    }

    const sourceCode = context.sourceCode
    const calls = []
    let rendersJsx = false

    return {
      JSXElement() {
        rendersJsx = true
      },
      JSXFragment() {
        rendersJsx = true
      },
      CallExpression(node) {
        // `axios.create()` builds a client; the request is the call made on it.
        if (isTransport(sourceCode, node.callee) && !isTransport(sourceCode, node)) {
          const inComponent = sourceCode
            .getAncestors(node)
            .some((ancestor) => FUNCTION_TYPES.has(ancestor.type) && isComponent(ancestor))
          calls.push({ node, inComponent })
        }
      },
      'Program:exit'(program) {
        if (isServerModule(program)) {
          return
        }
        for (const { node, inComponent } of calls) {
          if (rendersJsx || inComponent) {
            context.report({ node, messageId: 'transportInComponent' })
          }
        }
      },
    }
  },
}
