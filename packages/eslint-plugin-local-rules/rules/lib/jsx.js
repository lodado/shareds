/**
 * JSX reading shared by the rules that judge elements: attribute lookup, element names, the
 * names option, and every string literal reachable from a className expression -
 * `cn()` arguments and ternary branches included.
 */
const CLASS_BUILDERS = new Set(['cn', 'clsx', 'classnames', 'classNames', 'cva', 'twMerge', 'tw'])

const attributeName = (attribute) =>
  attribute.type === 'JSXAttribute' && attribute.name.type === 'JSXIdentifier' ? attribute.name.name : null

const findAttribute = (node, name) => node.attributes.find((attribute) => attributeName(attribute) === name)

/** `Form.Select` for a member expression, the identifier otherwise. */
const elementName = (name) => {
  if (name.type === 'JSXIdentifier') {
    return name.name
  }

  return name.type === 'JSXMemberExpression' ? `${elementName(name.object)}.${name.property.name}` : null
}

/** A rule option `{ [key]: string[] }` naming the JSX elements a widget rule judges. */
const namesOption = (key) => [
  {
    type: 'object',
    properties: {
      [key]: { type: 'array', items: { type: 'string' }, uniqueItems: true },
    },
    additionalProperties: false,
  },
]

const collectStrings = (node, out) => {
  if (!node) {
    return out
  }

  if (node.type === 'Literal' && typeof node.value === 'string') {
    out.push(node.value)
  } else if (node.type === 'TemplateLiteral') {
    node.quasis.forEach((quasi) => out.push(quasi.value.raw))
    node.expressions.forEach((expression) => collectStrings(expression, out))
  } else if (node.type === 'ConditionalExpression') {
    collectStrings(node.consequent, out)
    collectStrings(node.alternate, out)
  } else if (node.type === 'LogicalExpression') {
    collectStrings(node.right, out)
  } else if (node.type === 'ArrayExpression') {
    node.elements.forEach((element) => collectStrings(element, out))
  } else if (node.type === 'ObjectExpression') {
    node.properties.forEach((property) => property.key && collectStrings(property.key, out))
  } else if (node.type === 'CallExpression') {
    const callee = node.callee.type === 'Identifier' ? node.callee.name : null

    if (callee === null || CLASS_BUILDERS.has(callee)) {
      node.arguments.forEach((argument) => collectStrings(argument, out))
    }
  }

  return out
}

const classTokens = (attribute) => {
  if (!attribute || !attribute.value) {
    return []
  }

  const expression = attribute.value.type === 'JSXExpressionContainer' ? attribute.value.expression : attribute.value

  return collectStrings(expression, [])
    .flatMap((text) => text.split(/\s+/))
    .filter(Boolean)
}

module.exports = { attributeName, classTokens, elementName, findAttribute, namesOption }
