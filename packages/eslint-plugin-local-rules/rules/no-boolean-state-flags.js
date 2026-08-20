/**
 * Parallel boolean flags in locally-owned state encode combinations the flow can
 * never enter. Framework projections and component props are not state ownership.
 */
const FLAG_PATTERN = /^(is|has|should|can)[A-Z]/
const TYPE_WRAPPERS = new Set(['Readonly', 'Required', 'Partial'])

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

const stateShape = (typeNode) => {
  if (typeNode?.type === 'TSTypeLiteral') {
    return { node: typeNode, members: typeNode.members }
  }

  if (typeNode?.type !== 'TSTypeReference' || typeNode.typeName.type !== 'Identifier') {
    return null
  }

  if (TYPE_WRAPPERS.has(typeNode.typeName.name)) {
    return stateShape(typeNode.typeArguments?.params[0])
  }

  return { reference: typeNode.typeName.name }
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'disallow parallel boolean flags in locally-owned state',
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
    const namedShapes = new Map()
    const usedStateTypes = new Set()

    const enterFunction = () => functionStack.push({ booleanStates: [] })
    const exitFunction = () => functionStack.pop()

    return {
      TSTypeAliasDeclaration(node) {
        const shape = stateShape(node.typeAnnotation)

        if (shape?.members) {
          namedShapes.set(node.id.name, shape)
        }
      },
      TSInterfaceDeclaration(node) {
        namedShapes.set(node.id.name, { node: node.body, members: node.body.body })
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

        const [stateType] = (node.typeArguments ?? node.typeParameters)?.params ?? []
        const shape = stateShape(stateType)

        if (shape?.members) {
          reportShape(context, shape.node, shape.members)
        } else if (shape?.reference) {
          usedStateTypes.add(shape.reference)
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
      'Program:exit'() {
        for (const name of usedStateTypes) {
          const shape = namedShapes.get(name)

          if (shape) {
            reportShape(context, shape.node, shape.members)
          }
        }
      },
    }
  },
}
