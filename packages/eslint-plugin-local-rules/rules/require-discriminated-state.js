/**
 * A `status` literal union next to optional siblings is the optional-soup shape: the type
 * still allows `status: 'success'` with no payload, or an error message on a success state.
 * Split it into one union member per state so each state carries only its own fields.
 */
const DISCRIMINANT_NAMES = new Set(['status', 'state', 'kind', 'type', 'phase'])

const memberName = (member) => {
  if (member.type !== 'TSPropertySignature' || member.computed) {
    return null
  }

  return member.key.type === 'Identifier' ? member.key.name : null
}

const isStringLiteralUnion = (member) => {
  const annotation = member.typeAnnotation?.typeAnnotation

  if (annotation?.type !== 'TSUnionType' || annotation.types.length < 2) {
    return false
  }

  return annotation.types.every(
    (entry) =>
      entry.type === 'TSLiteralType' && entry.literal.type === 'Literal' && typeof entry.literal.value === 'string',
  )
}

const report = (context, node, members) => {
  const discriminant = members.find((member) => {
    const name = memberName(member)
    return name !== null && DISCRIMINANT_NAMES.has(name) && isStringLiteralUnion(member)
  })

  if (!discriminant) {
    return
  }

  const optional = members.filter((member) => member !== discriminant && member.optional)

  if (optional.length === 0) {
    return
  }

  context.report({
    node,
    messageId: 'optionalSoup',
    data: {
      discriminant: memberName(discriminant),
      fields: optional.map(memberName).filter(Boolean).join(', '),
    },
  })
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'require one union member per state instead of a status literal union with optional siblings',
      category: 'Best Practices',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      optionalSoup:
        '`{{discriminant}}` is a state discriminant, so {{fields}} must belong to the states that own them. Split this into a discriminated union with one member per state.',
    },
  },
  create(context) {
    return {
      TSTypeLiteral(node) {
        report(context, node, node.members)
      },
      TSInterfaceBody(node) {
        report(context, node, node.body)
      },
    }
  },
}
