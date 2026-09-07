/**
 * Two members of a state union that carry the same fields differ only by their tag, so the tag is
 * encoding one boolean - in flight, failed, empty - that the query, the data, or the input already
 * holds. `{ status: 'ready'; page }` next to `{ status: 'paging'; page }` is `ready` plus
 * `isFetching`. Keep one member and read the flag beside the state instead of enumerating it.
 * Members with no fields (`idle` next to `loading`) are left alone: a tag there is the whole fact.
 */
const DISCRIMINANT_NAMES = new Set(['status', 'phase', 'state'])

const isStringLiteralType = (node) =>
  node?.type === 'TSLiteralType' && node.literal.type === 'Literal' && typeof node.literal.value === 'string'

const propertyName = (member) => {
  if (member.type !== 'TSPropertySignature' || member.computed) {
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

/** The member's single string-literal state tag, or null when the member is not a state. */
const discriminantOf = (members) => {
  for (const member of members) {
    const name = propertyName(member)
    const annotation = member.typeAnnotation?.typeAnnotation

    if (name !== null && DISCRIMINANT_NAMES.has(name) && isStringLiteralType(annotation)) {
      return { member, name, tag: annotation.literal.value }
    }
  }

  return null
}

/** One `name?: type` line per field, sorted, so members compare by the data they carry, not by order. */
const payloadOf = (sourceCode, members, discriminant) =>
  members
    .filter((member) => member !== discriminant.member)
    .map((member) => {
      const name = propertyName(member)
      const annotation = member.typeAnnotation?.typeAnnotation

      if (name === null || !annotation) {
        return { name: sourceCode.getText(member), line: sourceCode.getText(member) }
      }

      const type = sourceCode.getText(annotation).replace(/\s+/g, ' ')
      return { name, line: `${name}${member.optional ? '?' : ''}: ${type}` }
    })
    .sort((left, right) => left.line.localeCompare(right.line))

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'disallow a state union member that carries the same fields as a sibling under a different tag',
      category: 'Best Practices',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      sameDataDifferentTag:
        '`{{tag}}` carries exactly the fields of `{{sibling}}` ({{fields}}). A tag that adds no data encodes a flag - in flight, failed, empty - that the query, the data, or the input already holds. Keep one member and read the flag beside the state.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode()

    return {
      TSTypeAliasDeclaration(node) {
        if (node.typeAnnotation.type !== 'TSUnionType') {
          return
        }

        const seen = new Map()

        for (const member of node.typeAnnotation.types) {
          if (member.type !== 'TSTypeLiteral') {
            continue
          }

          const discriminant = discriminantOf(member.members)

          if (!discriminant) {
            continue
          }

          const payload = payloadOf(sourceCode, member.members, discriminant)

          if (payload.length === 0) {
            continue
          }

          const key = [discriminant.name, ...payload.map((field) => field.line)].join('\n')
          const sibling = seen.get(key)

          if (!sibling) {
            seen.set(key, discriminant)
            continue
          }

          context.report({
            node: member,
            messageId: 'sameDataDifferentTag',
            data: {
              tag: discriminant.tag,
              sibling: sibling.tag,
              fields: payload.map((field) => field.name).join(', '),
            },
          })
        }
      },
    }
  },
}
