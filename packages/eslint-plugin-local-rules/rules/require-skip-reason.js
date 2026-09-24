/**
 * A skipped test is an uncovered contract row, and an inverted result, a retry or a raised
 * timeout turns a race into a pass. Only "no layer can judge this" justifies either, so the
 * reason is written down next to it - which layer covers the row, or why no layer can judge it -
 * or passed as the reason argument of a Playwright annotation such as `test.skip(isWebkit, 'no clipboard API')`.
 */
const { hasReasonComment } = require('./lib/reason-comment')

const SKIP_PROPERTIES = new Set(['skip', 'skipIf', 'runIf', 'todo', 'fixme', 'fail', 'fails', 'failing'])
const TEST_ROOTS = new Set(['test', 'it', 'describe', 'suite', 'context'])
const SKIP_IDENTIFIERS = new Set(['xit', 'xtest', 'xdescribe', 'xcontext'])
const WEAKENING_OPTIONS = new Set(['skip', 'todo', 'fails', 'retry', 'retries', 'repeats', 'timeout'])
const WAITS = new Set(['waitFor', 'poll'])

const propertyName = (node) => (node.type === 'MemberExpression' && !node.computed ? node.property.name : null)

/** Member names from the callee out to its root identifier: `test.describe.skip` → [skip, describe]. */
const chain = (callee) => {
  const names = []
  let node = callee
  while (node.type === 'MemberExpression') {
    names.push(propertyName(node))
    node = node.object
  }
  return { names, root: node.type === 'Identifier' ? node.name : null }
}

const isTestCall = (callee) => TEST_ROOTS.has(chain(callee).root)

const findDefinition = (sourceCode, identifier) => {
  for (let scope = sourceCode.getScope(identifier); scope; scope = scope.upper) {
    const variable = scope.set.get(identifier.name)
    if (variable) {
      return variable.defs[0] ?? null
    }
  }
  return null
}

/** `(ctx) => ctx.skip()` and `({ skip }) => skip()` inside a test callback. */
const isContextSkip = (sourceCode, callee) => {
  const identifier = callee.type === 'Identifier' ? callee : callee.object
  const property = callee.type === 'Identifier' ? callee.name : propertyName(callee)
  if (property !== 'skip' || identifier?.type !== 'Identifier') {
    return false
  }
  const definition = findDefinition(sourceCode, identifier)
  if (definition?.type !== 'Parameter') {
    return false
  }
  const fn = definition.node
  const [first] = fn.params
  const fromFirst =
    first === definition.name ||
    (first?.type === 'ObjectPattern' && first.properties.some((entry) => entry.value === definition.name))
  return fromFirst && fn.parent?.type === 'CallExpression' && isTestCall(fn.parent.callee)
}

const hasWeakeningOption = (argument) =>
  argument?.type === 'ObjectExpression' &&
  argument.properties.some(
    (property) =>
      property.type === 'Property' &&
      WEAKENING_OPTIONS.has(property.key.name ?? property.key.value) &&
      !(property.value.type === 'Literal' && property.value.value === false),
  )

const isText = (node) =>
  node?.type === 'TemplateLiteral' || (node?.type === 'Literal' && typeof node.value === 'string')

/**
 * `test.skip(cond, 'reason')` and `t.skip('reason')`: the annotation carries its reason. A test
 * declaration's string is its title, so a lone string only counts on a context skip.
 */
const hasReasonArgument = (sourceCode, node) => {
  if (isContextSkip(sourceCode, node.callee)) {
    return node.arguments.some(isText)
  }
  return (
    node.arguments.length >= 2 &&
    !node.arguments.some((argument) => argument.type.endsWith('FunctionExpression')) &&
    isText(node.arguments.at(-1))
  )
}

/** What this call weakens, or null. */
const weakening = (sourceCode, node) => {
  const { callee } = node
  if (callee.type === 'Identifier' && SKIP_IDENTIFIERS.has(callee.name)) {
    return 'skip'
  }
  if (isContextSkip(sourceCode, callee)) {
    return 'skip'
  }
  const { names, root } = chain(callee)
  if (TEST_ROOTS.has(root)) {
    if (names.some((name) => SKIP_PROPERTIES.has(name))) {
      return 'skip'
    }
    if (names[0] === 'setTimeout' || (names[0] === 'configure' && hasWeakeningOption(node.arguments[0]))) {
      return 'timeout'
    }
    if (names.length === 0 || names[0] === 'each' || names[0] === 'concurrent') {
      if (node.arguments.some(hasWeakeningOption)) {
        return 'option'
      }
      if (node.arguments.length === 3 && node.arguments[2].type === 'Literal') {
        return 'timeout'
      }
    }
    return null
  }
  const wait = callee.type === 'Identifier' ? callee.name : propertyName(callee)
  if (WAITS.has(wait) && node.arguments.slice(1).some(hasWeakeningOption)) {
    return 'timeout'
  }
  return null
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'require a written reason for a skipped, inverted, retried or longer-timeout test',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      missingReason:
        'Explain the skip in a comment - which layer covers this row instead, or why no layer can judge it.',
      missingWeakeningReason:
        'Explain this {{what}} in a comment. A retry, an inverted result or a longer timeout hides a race instead of fixing it.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode

    return {
      CallExpression(node) {
        const what = weakening(sourceCode, node)
        if (!what || hasReasonArgument(sourceCode, node) || hasReasonComment(sourceCode, node)) {
          return
        }

        if (what === 'skip') {
          context.report({ node, messageId: 'missingReason' })
        } else {
          context.report({
            node,
            messageId: 'missingWeakeningReason',
            data: { what: what === 'timeout' ? 'timeout' : 'test option' },
          })
        }
      },
    }
  },
}
