export function replacePlaceholders(text, tuple) {
  let output = ''
  let cursor = 0
  while (cursor < text.length) {
    const start = text.indexOf('{', cursor)
    if (start === -1) return output + text.slice(cursor)
    const end = text.indexOf('}', start + 1)
    if (end === -1) return output + text.slice(cursor)
    const id = text.slice(start + 1, end)
    output += id.length === 0 ? text.slice(cursor, end + 1) : text.slice(cursor, start) + (tuple[id] ?? `{${id}}`)
    cursor = end + 1
  }
  return output
}

export function bracedValues(text) {
  const values = []
  let cursor = 0
  while (cursor < text.length) {
    const start = text.indexOf('{', cursor)
    if (start === -1) break
    const end = text.indexOf('}', start + 1)
    if (end === -1) break
    if (end > start + 1) values.push(text.slice(start + 1, end))
    cursor = end + 1
  }
  return values
}

export function stripTrailingParenthesized(text) {
  const trimmed = text.trimEnd()
  if (!trimmed.endsWith(')')) return text
  const close = trimmed.length - 1
  const lastLineTerminator = Math.max(
    text.lastIndexOf('\n', close),
    text.lastIndexOf('\r', close),
    text.lastIndexOf('\u2028', close),
    text.lastIndexOf('\u2029', close),
  )
  const start = text.indexOf('(', lastLineTerminator + 1)
  return start === -1 ? text : text.slice(0, start).trimEnd()
}
