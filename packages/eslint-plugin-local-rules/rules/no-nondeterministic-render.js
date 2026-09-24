/**
 * A component or hook body runs on every render and on the server as well as in the browser.
 * Reading the clock, a random id or the host locale there makes the same props render different
 * markup - hydration mismatches, unstable keys and snapshots that change between machines.
 * `Date.now()` and `Math.random()` belong to react-hooks/purity; this rule covers the rest of the
 * tokens the Oracle nondeterminism scan looks for. Pass the value in, or create it in an event
 * handler or effect. A deliberate one carries `// oracle:nondeterminism <reason>`.
 */
const { getStatement } = require('./lib/reason-comment')
const { functionName } = require('./lib/runtime-modules')

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])
const EXEMPTION = 'oracle:nondeterminism'

// `Item`, `useCart` - a component or a hook; `API` and `GET` are neither.
const isRenderFunction = (fn) => /^(?:[A-Z][a-z0-9]|use[A-Z])/u.test(functionName(fn) ?? '')

const memberCall = (node) =>
  node.callee.type === 'MemberExpression' && !node.callee.computed ? node.callee.property.name : null

/** What makes this expression depend on the clock, randomness or the host locale, or null. */
const source = (node) => {
  if (node.type === 'NewExpression' && node.callee.type === 'Identifier' && node.callee.name === 'Date') {
    return node.arguments.length === 0 ? 'new Date()' : null
  }
  if (node.type === 'NewExpression' && node.callee.type === 'MemberExpression' && node.callee.object.name === 'Intl') {
    return node.arguments.length === 0 ? `new Intl.${node.callee.property.name}()` : null
  }
  if (node.type !== 'CallExpression') {
    return null
  }
  if (node.callee.type === 'Identifier' && node.callee.name === 'Date') {
    return 'Date()'
  }
  const method = memberCall(node)
  if ((method === 'randomUUID' || method === 'getRandomValues') && node.callee.object.name === 'crypto') {
    return `crypto.${method}()`
  }
  // toLocaleString() with no locale reads the host's locale and time zone.
  return /^toLocale(?:Date|Time)?String$/u.test(method ?? '') && node.arguments.length === 0 ? `${method}()` : null
}

// `items.map((item) => <li key={...} />)` runs while rendering, unlike a handler or an effect.
const ITERATORS = new Set(['map', 'flatMap', 'filter', 'reduce', 'forEach', 'find', 'some', 'every', 'sort'])
const isRenderIteration = (fn) =>
  fn.parent.type === 'CallExpression' &&
  fn.parent.arguments.includes(fn) &&
  fn.parent.callee.type === 'MemberExpression' &&
  ITERATORS.has(fn.parent.callee.property.name)

/** Code that runs during render: the component or hook body, not a handler or effect it defines. */
const inRenderBody = (sourceCode, node) => {
  const functions = sourceCode.getAncestors(node).filter((ancestor) => FUNCTION_TYPES.has(ancestor.type))
  let fn = functions.pop()
  while (fn && isRenderIteration(fn)) {
    fn = functions.pop()
  }
  return Boolean(fn) && isRenderFunction(fn)
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow clock, random and host-locale reads while rendering a component or hook',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [],
    messages: {
      nondeterministicRender:
        '{{source}} makes this render depend on when and where it runs. Pass the value in, create it in an event handler or effect, or mark a deliberate one with `// oracle:nondeterminism <reason>`.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode
    const exempt = (node) => {
      const statement = getStatement(node)
      return [...sourceCode.getCommentsBefore(statement), ...sourceCode.getCommentsInside(statement)].some((comment) =>
        comment.value.includes(EXEMPTION),
      )
    }

    const check = (node) => {
      const found = source(node)
      if (found && inRenderBody(sourceCode, node) && !exempt(node)) {
        context.report({ node, messageId: 'nondeterministicRender', data: { source: found } })
      }
    }

    return { NewExpression: check, CallExpression: check }
  },
}
