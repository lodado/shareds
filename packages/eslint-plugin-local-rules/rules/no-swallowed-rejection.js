/**
 * `.catch(() => {})` turns a failed request into a silent success: the caller renders stale or
 * empty data and nothing records why. The same holds for a handler that only logs. Returning
 * `null`/`undefined` maps the failure to a value the caller must handle (`readFile(...).catch(() =>
 * null)`), so it is reported only when the result is thrown away. Handle the failure (map it to an
 * error state, rethrow a typed error) or explain the deliberate case in a comment.
 * A `catch` clause belongs to base `no-empty` and quality `sonarjs/no-ignored-exceptions`.
 */
const { hasReasonComment } = require('./lib/reason-comment')

const FUNCTION_TYPES = new Set(['FunctionExpression', 'ArrowFunctionExpression'])

const isEmptyValue = (node) =>
  !node ||
  (node.type === 'Identifier' && node.name === 'undefined') ||
  (node.type === 'Literal' && node.value === null) ||
  (node.type === 'UnaryExpression' && node.operator === 'void')

const isConsoleCall = (expression) =>
  expression?.type === 'CallExpression' &&
  expression.callee.type === 'MemberExpression' &&
  expression.callee.object.name === 'console'

/** The promise's value is discarded: `load().catch(...)` or `void load().catch(...)` as a statement. */
const isDiscarded = (call) =>
  call.parent.type === 'ExpressionStatement' ||
  (call.parent.type === 'UnaryExpression' && call.parent.operator === 'void')

/** A handler that drops the error: empty, log-only, or an empty value nobody reads. */
const swallows = (handler, call) => {
  if (!FUNCTION_TYPES.has(handler?.type)) {
    return false
  }
  const expressionBody = isConsoleCall(handler.body)
    ? { type: 'ExpressionStatement', expression: handler.body }
    : { type: 'ReturnStatement', argument: handler.body }
  const statements = handler.body.type === 'BlockStatement' ? handler.body.body : [expressionBody]
  const logs = statements.filter(
    (statement) => statement.type === 'ExpressionStatement' && isConsoleCall(statement.expression),
  )
  const returnsEmpty = statements.filter(
    (statement) => statement.type === 'ReturnStatement' && isEmptyValue(statement.argument),
  )
  const onlyThese = logs.length + returnsEmpty.length === statements.length
  const mapsToValue = returnsEmpty.some((statement) => statement.argument) && !isDiscarded(call)
  return onlyThese && (logs.length > 0 || statements.length === 0 || !mapsToValue)
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow promise rejection handlers that drop the error',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [],
    messages: {
      swallowedRejection:
        'This rejection handler drops the error. Map it to an error state or rethrow it, or explain the deliberate case in a comment.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode

    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression' || node.callee.computed) {
          return
        }
        const method = node.callee.property.name
        const handler = method === 'catch' ? node.arguments[0] : method === 'then' ? node.arguments[1] : null
        if (swallows(handler, node) && !hasReasonComment(sourceCode, node)) {
          context.report({ node: handler, messageId: 'swallowedRejection' })
        }
      },
    }
  },
}
