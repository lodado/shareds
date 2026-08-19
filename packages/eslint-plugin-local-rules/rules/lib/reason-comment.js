/** Shared "is this call explained by a comment" check for the rules that demand a written reason. */
const MIN_REASON_LENGTH = 3

/** The statement the call belongs to - that is where authors put the explaining comment. */
const getStatement = (node) => {
  let current = node

  while (current.parent && !/(Statement|Declaration)$/.test(current.parent.type)) {
    current = current.parent
  }

  return current.parent || current
}

const hasReasonComment = (sourceCode, node) => {
  const statement = getStatement(node)
  const leading = sourceCode.getCommentsBefore(statement)
  const trailing = sourceCode
    .getCommentsAfter(statement)
    .filter((comment) => comment.loc.start.line === statement.loc.end.line)

  return [...leading, ...trailing].some((comment) => comment.value.trim().length >= MIN_REASON_LENGTH)
}

module.exports = { hasReasonComment }
