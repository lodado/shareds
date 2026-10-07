/**
 * A hover style is the only feedback a pointer user gets, and a keyboard user never triggers it.
 * When an interactive element styles `hover:` but nothing for focus, tabbing through the page shows
 * no trace of where you are. jsx-a11y checks handlers, not styles, so this one reads the class list.
 */
const { attributeName, classTokens, findAttribute } = require('./lib/jsx')

const INTERACTIVE_TAGS = new Set(['button', 'a', 'input', 'select', 'textarea', 'summary'])
// Router links render an anchor.
const LINK_COMPONENTS = new Set(['Link', 'NavLink'])
const HOVER_VARIANT = /(?:^|:)(?:group-|peer-)?hover(?:\/[\w-]+)?:/
// A focus variant that paints something; `focus:outline-none` alone removes the indicator.
const FOCUS_VARIANT = /(?:^|:)(?:group-|peer-)?focus(?:-visible|-within)?:/
const FOCUS_REMOVAL = /:(?:outline-none|outline-0|outline-hidden|ring-0)$/
const isFocusStyle = (token) => FOCUS_VARIANT.test(token) && !FOCUS_REMOVAL.test(token)

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
