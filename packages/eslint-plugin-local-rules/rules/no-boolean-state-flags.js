/**
 * Parallel boolean flags for one flow encode states the flow can never be in -
 * `isLoading && isSuccess`, `isError && isSubmitting`. One `status` literal union
 * makes those combinations unrepresentable instead of merely unlikely.
 */
const FLAG_PATTERN = /^(is|has|should|can)[A-Z]/

const calleeName = (callee) => {
  if (callee.type === 'Identifier') {
    return callee.name
  }

  if (callee.type === 'MemberExpression' && !callee.computed) {
    return callee.property.name
  }

  return null
}

const isBooleanMember = (member) => {
  if (member.type !== 'TSPropertySignature' || member.computed || member.key.type !== 'Identifier') {
    return false
  }

  return FLAG_PATTERN.test(member.key.name) && member.typeAnnotation?.typeAnnotation?.type === 'TSBooleanKeyword'
}

const reportShape = (context, node, members) => {
  const flags = members.filter(isBooleanMember)

  if (flags.length < 2) {
    return
  }

  context.report({
    node,
    messageId: 'parallelFlags',
    data: { flags: flags.map((member) => member.key.name).join(', ') },
  })
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'disallow parallel boolean flags for one flow - use a single status literal union',
      category: 'Best Practices',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      parallelFlags:
        '{{flags}} describe one flow as parallel booleans, which allows impossible combinations. Use a single `status` literal union.',
      parallelState:
        'This function already owns a boolean state for the same flow. Use a single `status` literal union instead of parallel useState flags.',
    },
  },
  create(context) {
    const functionStack = []

    const enterFunction = () => functionStack.push({ booleanStates: [] })
    const exitFunction = () => functionStack.pop()

    return {
      TSTypeLiteral(node) {
        reportShape(context, node, node.members)
      },
      TSInterfaceBody(node) {
        reportShape(context, node, node.body)
      },
      FunctionDeclaration: enterFunction,
      'FunctionDeclaration:exit': exitFunction,
      FunctionExpression: enterFunction,
      'FunctionExpression:exit': exitFunction,
      ArrowFunctionExpression: enterFunction,
      'ArrowFunctionExpression:exit': exitFunction,
      CallExpression(node) {
        const current = functionStack[functionStack.length - 1]

        if (!current || calleeName(node.callee) !== 'useState') {
          return
        }

        const [initial] = node.arguments
        if (initial?.type !== 'Literal' || typeof initial.value !== 'boolean') {
          return
        }

        current.booleanStates.push(node)

        if (current.booleanStates.length === 2) {
          context.report({ node, messageId: 'parallelState' })
        }
      },
    }
  },
}
