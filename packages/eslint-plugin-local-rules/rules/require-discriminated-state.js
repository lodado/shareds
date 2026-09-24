/**
 * A `status` literal union next to optional siblings is the optional-soup shape: the type
 * still allows `status: 'success'` with no payload, or an error message on a success state.
 * Split it into one union member per state so each state carries only its own fields.
 */
// `type` and `kind` name component variants (`ButtonProps.type`), not lifecycle states.
const DISCRIMINANT_NAMES = new Set(['status', 'state', 'phase'])

const memberName = (member) => {
  if (member.type !== 'TSPropertySignature' || member.computed) {
    return null
  }

  return member.key.type === 'Identifier' ? member.key.name : null
}

/** The annotation, or the union a same-file `type Status = 'a' | 'b'` alias names. */
const resolveAlias = (annotation, aliases) =>
  annotation?.type === 'TSTypeReference' && annotation.typeName.type === 'Identifier'
    ? aliases.get(annotation.typeName.name) ?? annotation
    : annotation

const isStringLiteralUnion = (member, aliases) => {
  const annotation = resolveAlias(member.typeAnnotation?.typeAnnotation, aliases)

  if (annotation?.type !== 'TSUnionType' || annotation.types.length < 2) {
    return false
  }

  return annotation.types.every(
    (entry) =>
      entry.type === 'TSLiteralType' && entry.literal.type === 'Literal' && typeof entry.literal.value === 'string',
  )
}

// `data: T | null` next to a status union is the same soup as `data?: T`.
const isNullable = (member) =>
  member.optional ||
  (member.typeAnnotation?.typeAnnotation?.type === 'TSUnionType' &&
    member.typeAnnotation.typeAnnotation.types.some((entry) =>
      ['TSNullKeyword', 'TSUndefinedKeyword'].includes(entry.type),
    ))

const report = (context, node, members, aliases) => {
  const discriminant = members.find((member) => {
    const name = memberName(member)
    return name !== null && DISCRIMINANT_NAMES.has(name) && isStringLiteralUnion(member, aliases)
  })

  if (!discriminant) {
    return
  }

  const optional = members.filter((member) => member !== discriminant && isNullable(member))

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
    const aliases = new Map()
    const candidates = []

    return {
      TSTypeAliasDeclaration(node) {
        aliases.set(node.id.name, node.typeAnnotation)
      },
      TSTypeLiteral(node) {
        candidates.push([node, node.members])
      },
      TSInterfaceBody(node) {
        candidates.push([node, node.body])
      },
      'Program:exit'() {
        for (const [node, members] of candidates) {
          report(context, node, members, aliases)
        }
      },
    }
  },
}
