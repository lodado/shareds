/**
 * Shared "is this call explained by a comment" check for the rules that demand a written reason.
 * A reason is a comment of at least three words placed directly above the statement or at the end
 * of its line. A lint directive, a license header above a blank line, `// TODO` or `// wip` is not.
 */
const NOT_A_REASON = /^(?:eslint|@ts-|prettier-ignore|istanbul|c8|todo\b|fixme\b|xxx\b|wip\b)/iu
const MIN_REASON_WORDS = 3

/** The statement the call belongs to - that is where authors put the explaining comment. */
const getStatement = (node) => {
  let current = node

  while (current.parent && !/(Statement|Declaration)$/.test(current.parent.type)) {
    current = current.parent
  }

  return current.parent || current
}

/** Leading comments that touch the statement: each ends on the line before the next one starts. */
const adjacentLeading = (sourceCode, statement) => {
  const block = []
  let line = statement.loc.start.line
  for (const comment of sourceCode.getCommentsBefore(statement).reverse()) {
    if (comment.loc.end.line !== line - 1 && comment.loc.end.line !== line) {
      break
    }
    block.push(comment)
    line = comment.loc.start.line
  }
  return block
}

const isReason = (text) => {
  const value = text.replace(/^[\s*]+/u, '').trim()
  return !NOT_A_REASON.test(value) && value.split(/\s+/u).filter(Boolean).length >= MIN_REASON_WORDS
}

const hasReasonComment = (sourceCode, node) => {
  const statement = getStatement(node)
  const trailing = sourceCode
    .getCommentsAfter(statement)
    .filter((comment) => comment.loc.start.line === statement.loc.end.line)

  return [...adjacentLeading(sourceCode, statement), ...trailing].some((comment) => isReason(comment.value))
}

module.exports = { hasReasonComment, getStatement }
