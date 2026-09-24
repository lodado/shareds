/**
 * Parallel boolean flags in locally-owned state encode combinations the flow can
 * never enter. Framework projections and component props are not state ownership.
 *
 * Two boolean `useState`s are one flow when the same function sets both (`setLoading(true)`
 * ... `setError(true)`); independent toggles set by different handlers are fine.
 */
const { findVariable } = require('./lib/runtime-modules')

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])
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

/** `false`, `!x`, `Boolean(x)` and the lazy `() => false`. */
const isBooleanInit = (node) => {
  if (!node) {
    return false
  }
  if (node.type === 'ArrowFunctionExpression' && node.body.type !== 'BlockStatement') {
    return isBooleanInit(node.body)
  }
  return (
    (node.type === 'Literal' && typeof node.value === 'boolean') ||
    (node.type === 'UnaryExpression' && node.operator === '!') ||
    (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'Boolean')
  )
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
        'This function sets {{setters}} together, so they describe one flow as parallel booleans. Use a single `status` literal union instead.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode
    const namedShapes = new Map()
    const usedStateTypes = new Set()
    const booleanSetters = new Set()
    const setterCalls = new Map()

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
      CallExpression(node) {
        if (node.callee.type === 'Identifier') {
          const variable = findVariable(sourceCode, node.callee)
          if (booleanSetters.has(variable)) {
            const fn = sourceCode.getAncestors(node).findLast((ancestor) => FUNCTION_TYPES.has(ancestor.type))
            const calls = setterCalls.get(fn) ?? new Map()
            calls.set(variable, calls.get(variable) ?? node)
            setterCalls.set(fn, calls)
          }
        }

        if (calleeName(node.callee) !== 'useState') {
          return
        }

        const [stateType] = (node.typeArguments ?? node.typeParameters)?.params ?? []
        const shape = stateShape(stateType)

        if (shape?.members) {
          reportShape(context, shape.node, shape.members)
        } else if (shape?.reference) {
          usedStateTypes.add(shape.reference)
        }

        const setter =
          node.parent.type === 'VariableDeclarator' && node.parent.id.type === 'ArrayPattern'
            ? node.parent.id.elements[1]
            : null
        if (
          setter?.type === 'Identifier' &&
          (stateType?.type === 'TSBooleanKeyword' || isBooleanInit(node.arguments[0]))
        ) {
          booleanSetters.add(findVariable(sourceCode, setter))
        }
      },
      'Program:exit'() {
        for (const calls of setterCalls.values()) {
          if (calls.size >= 2) {
            const [first, second] = calls.keys()
            context.report({
              node: [...calls.values()][1],
              messageId: 'parallelState',
              data: { setters: `${first.name} and ${second.name}` },
            })
          }
        }

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
