/**
 * A hover style is the only feedback a pointer user gets, and a keyboard user never triggers it.
 * When an interactive element styles `hover:` but nothing for focus, tabbing through the page shows
 * no trace of where you are. jsx-a11y checks handlers, not styles, so this one reads the class list.
 */
const INTERACTIVE_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary'])
// Router links render an anchor.
const LINK_COMPONENTS = new Set(['Link', 'NavLink'])
const CLASS_BUILDERS = new Set(['cn', 'clsx', 'classnames', 'classNames', 'cva', 'twMerge', 'tw'])
const HOVER_VARIANT = /(?:^|:)(?:group-|peer-)?hover(?:\/[\w-]+)?:/
// A focus variant that paints something; `focus:outline-none` alone removes the indicator.
const FOCUS_VARIANT = /(?:^|:)(?:group-|peer-)?focus(?:-visible|-within)?:/
const FOCUS_REMOVAL = /:(?:outline-none|outline-0|outline-hidden|ring-0)$/
const isFocusStyle = (token) => FOCUS_VARIANT.test(token) && !FOCUS_REMOVAL.test(token)

const attributeName = (attribute) =>
  attribute.type === 'JSXAttribute' && attribute.name.type === 'JSXIdentifier' ? attribute.name.name : null

const findAttribute = (node, name) => node.attributes.find((attribute) => attributeName(attribute) === name)

/** Every string literal reachable from a className expression - `cn()` args and ternary branches included. */
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

const isInteractive = (node) => {
  const tag = node.name.type === 'JSXIdentifier' ? node.name.name : ''

  if (INTERACTIVE_TAGS.has(tag) || LINK_COMPONENTS.has(tag)) {
    return true
  }

  return node.attributes.some((attribute) => {
    const name = attributeName(attribute)

    return name === 'role' || name === 'tabIndex' || name === 'onClick' || name === 'onKeyDown'
  })
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'require a focus style wherever an interactive element styles its hover state',
      category: 'Accessibility',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      hoverWithoutFocus:
        'This element styles `{{ token }}` but nothing for focus, so a keyboard user gets no feedback. Add the focus-visible counterpart, for example `focus-visible:outline-2 focus-visible:outline-offset-2`.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (!isInteractive(node)) {
          return
        }

        const tokens = classTokens(findAttribute(node, 'className'))
        const hovered = tokens.find((token) => HOVER_VARIANT.test(token))

        if (!hovered || tokens.some(isFocusStyle)) {
          return
        }

        context.report({ node, messageId: 'hoverWithoutFocus', data: { token: hovered } })
      },
    }
  },
}
