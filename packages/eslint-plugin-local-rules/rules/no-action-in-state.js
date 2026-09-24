/**
 * A state value answers "what is true right now"; an action answers "what can I do next".
 * Storing `retry: () => void` inside a `status` union member ties the callback to the render
 * that produced it - the stored closure goes stale, and every state that has no action needs a
 * fake one (`retry: () => undefined`) just to satisfy the type. Keep the state data-only and
 * return the action as a sibling of it, or reuse the one the query layer already owns.
 */
const DISCRIMINANT_NAMES = new Set(['status', 'phase', 'state'])

const ACTION_NAME = /^(retry|reset|cancel|submit|refetch|reload|load|dismiss|close|open|on[A-Z])/

const isStringLiteralType = (node) =>
  node?.type === 'TSLiteralType' && node.literal.type === 'Literal' && typeof node.literal.value === 'string'

/** A discriminant is one string literal (`'failure'`) or a union of them (`'idle' | 'loading'`). */
const isDiscriminantType = (node) => {
  if (isStringLiteralType(node)) {
    return true
  }

  return node?.type === 'TSUnionType' && node.types.length >= 2 && node.types.every(isStringLiteralType)
}

const propertyName = (member) => {
  if (member.computed || !member.key) {
    return null
  }

  if (member.key.type === 'Identifier') {
    return member.key.name
  }

  if (member.key.type !== 'Literal' || typeof member.key.value !== 'string') {
    return null
  }

  return member.key.value
}

const hasStateDiscriminant = (members, isDiscriminant) =>
  members.some((member) => {
    const name = propertyName(member)
    return name !== null && DISCRIMINANT_NAMES.has(name) && isDiscriminant(member)
  })

// `retry: () => void` and `retry: (() => void) | undefined` are both actions.
const isActionType = (node) =>
  node?.type === 'TSFunctionType' || (node?.type === 'TSUnionType' && node.types.some(isActionType))

const reportMembers = (context, members) => {
  if (!hasStateDiscriminant(members, (member) => isDiscriminantType(member.typeAnnotation?.typeAnnotation))) {
    return
  }

  for (const member of members) {
    if (member.type !== 'TSPropertySignature') {
      continue
    }

    if (!isActionType(member.typeAnnotation?.typeAnnotation)) {
      continue
    }

    context.report({
      node: member,
      messageId: 'actionInStateType',
      data: { field: propertyName(member) ?? 'this field' },
    })
  }
}

/** `'failure' as const` is still the literal `'failure'`. */
const unwrap = (node) =>
  node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression' ? unwrap(node.expression) : node

const isStringLiteral = (node) => {
  const value = unwrap(node)
  return value.type === 'Literal' && typeof value.value === 'string'
}

// An options object handed to a library call (`toast({ status, onClose })`) is not state.
const STATE_WRITER = /^(set[A-Z]\w*|useState|useReducer|dispatch)$/

const isLibraryArgument = (node) => {
  const { parent } = node
  if (parent.type !== 'CallExpression' || !parent.arguments.includes(node)) {
    return false
  }
  const callee = parent.callee.type === 'MemberExpression' ? parent.callee.property : parent.callee
  return callee.type !== 'Identifier' || !STATE_WRITER.test(callee.name)
}

/** `retry: () => load()` is an action by shape; `retry: load` is one by name. */
const isActionValue = (property) => {
  if (property.value.type === 'ArrowFunctionExpression' || property.value.type === 'FunctionExpression') {
    return true
  }

  if (property.value.type !== 'Identifier' && property.value.type !== 'MemberExpression') {
    return false
  }

  const name = propertyName(property)
  return name !== null && ACTION_NAME.test(name)
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'keep discriminated state data-only and return actions beside the state instead of inside it',
      category: 'Best Practices',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      actionInStateType:
        '`{{field}}` is an action stored inside a state union member. Keep each state data-only and expose the action as a sibling of the state, or reuse the existing refetch.',
      actionInStateValue:
        '`{{field}}` is an action stored inside a state value, so it freezes the closure of the render that set it. Return it beside the state instead.',
    },
  },
  create(context) {
    return {
      TSTypeLiteral(node) {
        reportMembers(context, node.members)
      },
      // Base autofix (`ts/consistent-type-definitions`) turns object types into interfaces.
      TSInterfaceBody(node) {
        reportMembers(context, node.body)
      },
      ObjectExpression(node) {
        const properties = node.properties.filter((property) => property.type === 'Property' && !property.computed)

        const isStateValue = hasStateDiscriminant(properties, (property) => isStringLiteral(property.value))

        if (!isStateValue || isLibraryArgument(node)) {
          return
        }

        for (const property of properties) {
          if (!isActionValue(property)) {
            continue
          }

          context.report({
            node: property,
            messageId: 'actionInStateValue',
            data: { field: propertyName(property) ?? 'this field' },
          })
        }
      },
    }
  },
}
