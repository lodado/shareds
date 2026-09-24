/**
 * `as Foo` on a network or storage payload is a claim, not a check: the value keeps whatever
 * shape the server actually sent. Parse the boundary into a union instead. Asserting to
 * `unknown` is allowed because it forces narrowing afterwards - but only as the last step, so
 * `as unknown as Foo` is still a claim. A type argument on the payload call or on an HTTP
 * client call (`res.json<Foo>()`, `axios.get<Foo>()`) is the same claim in another spelling.
 */
const { TRANSPORT, fromModule } = require('./lib/runtime-modules')

const BOUNDARY_METHODS = new Set(['json', 'getItem'])

const SAFE_TARGETS = new Set(['TSUnknownKeyword', 'TSAnyKeyword'])
const WRAPPERS = new Set([
  'AwaitExpression',
  'TSAsExpression',
  'TSTypeAssertion',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'ChainExpression',
])
const ASSERTIONS = new Set(['TSAsExpression', 'TSTypeAssertion'])

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

/** The value under every await, assertion, `satisfies`, `!` and optional chain. */
const innermost = (node) => {
  let current = node
  while (WRAPPERS.has(current.type)) {
    current = current.type === 'AwaitExpression' ? current.argument : current.expression
  }
  return current
}

/** The root identifier of `axios.get`, `api.client.get`, `ky`. */
const calleeRoot = (callee) => {
  let node = callee
  while (node.type === 'MemberExpression') {
    node = node.object
  }
  return node.type === 'Identifier' ? node : null
}

const importedFrom = (sourceCode, identifier) => {
  for (let scope = sourceCode.getScope(identifier); scope; scope = scope.upper) {
    const definition = scope.set.get(identifier.name)?.defs[0]
    if (definition) {
      return definition.type === 'ImportBinding' ? definition.parent.source.value : null
    }
  }
  return null
}

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
    const sourceCode = context.sourceCode

    const check = (node) => {
      // Judge the outermost assertion once; inner hops are part of the same claim.
      if (ASSERTIONS.has(node.parent?.type) || SAFE_TARGETS.has(node.typeAnnotation?.type)) {
        return
      }

      if (!isBoundaryCall(innermost(node))) {
        return
      }

      context.report({
        node,
        messageId: 'assertedPayload',
        data: { target: sourceCode.getText(node.typeAnnotation) },
      })
    }

    return {
      TSAsExpression: check,
      TSTypeAssertion: check,
      CallExpression(node) {
        const typeArguments = node.typeArguments
        if (!typeArguments) {
          return
        }
        const root = calleeRoot(node.callee)
        const transport = root && fromModule(importedFrom(sourceCode, root) ?? '', TRANSPORT)
        if (isBoundaryCall(node) || transport) {
          context.report({
            node: typeArguments,
            messageId: 'assertedPayload',
            data: { target: sourceCode.getText(typeArguments.params[0]) },
          })
        }
      },
    }
  },
}
