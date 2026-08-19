/**
 * `as Foo` on a network or storage payload is a claim, not a check: the value keeps whatever
 * shape the server actually sent. Parse the boundary into a union instead. Asserting to
 * `unknown` is allowed because it forces narrowing afterwards.
 */
const BOUNDARY_METHODS = new Set(['json', 'getItem', 'get'])

const SAFE_TARGETS = new Set(['TSUnknownKeyword', 'TSAnyKeyword'])

const isBoundaryCall = (node) => {
  if (node?.type !== 'CallExpression') {
    return false
  }

  const { callee } = node

  if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
    if (callee.object.type === 'Identifier' && callee.object.name === 'JSON' && callee.property.name === 'parse') {
      return true
    }

    return BOUNDARY_METHODS.has(callee.property.name)
  }

  return false
}

const assertedExpression = (node) =>
  node.expression?.type === 'AwaitExpression' ? node.expression.argument : node.expression

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow asserting a parsed boundary payload into a type instead of parsing it',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      assertedPayload:
        'Do not assert a boundary payload into `{{target}}`. Parse it into a union at the boundary (for example z.discriminatedUnion) so an unexpected shape fails here.',
    },
  },
  create(context) {
    const check = (node) => {
      if (SAFE_TARGETS.has(node.typeAnnotation?.type)) {
        return
      }

      if (!isBoundaryCall(assertedExpression(node))) {
        return
      }

      context.report({
        node,
        messageId: 'assertedPayload',
        data: { target: context.getSourceCode().getText(node.typeAnnotation) },
      })
    }

    return {
      TSAsExpression: check,
      TSTypeAssertion: check,
    }
  },
}
