/**
 * A select hides its choices behind a click. With two or three fixed choices, a radio group shows
 * every option at once and takes one click instead of two. Only literal `<option>` children count:
 * a mapped, conditional or grouped child means the list can grow. A `hidden` option is not shown,
 * and the first option is a placeholder when it is disabled or, in a `required` select, has an
 * empty value - the HTML placeholder label option. A select with `multiple` or `size` above 1
 * already shows its choices.
 */
const { elementName, findAttribute, namesOption } = require('./lib/jsx')

const MIN_OPTIONS = 2
const MAX_OPTIONS = 3

/** A present boolean attribute: bare, any string value, or any expression except `{false}`. */
const isOn = (attribute) => {
  if (!attribute) return false
  if (attribute.value?.type !== 'JSXExpressionContainer') return true

  return attribute.value.expression.type !== 'Literal' || attribute.value.expression.value !== false
}

const isEmptyString = (value) => {
  const expression = value?.type === 'JSXExpressionContainer' ? value.expression : value

  if (expression?.type === 'Literal') return expression.value === ''

  return (
    expression?.type === 'TemplateLiteral' &&
    expression.expressions.length === 0 &&
    expression.quasis[0].value.cooked === ''
  )
}

const isBlank = (child) => {
  if (child.type === 'JSXText') return child.value.trim() === ''
  if (child.type !== 'JSXExpressionContainer') return false

  const { expression } = child

  return (
    expression.type === 'JSXEmptyExpression' ||
    (expression.type === 'Literal' && typeof expression.value === 'string' && expression.value.trim() === '')
  )
}

const shownAsList = (opening) => {
  if (isOn(findAttribute(opening, 'multiple'))) return true

  const size = findAttribute(opening, 'size')
  if (!size) return false

  const expression = size.value?.type === 'JSXExpressionContainer' ? size.value.expression : size.value

  return !(expression?.type === 'Literal' && Number(expression.value) <= 1)
}

const isPlaceholder = (option, index, required) =>
  index === 0 &&
  (isOn(findAttribute(option, 'disabled')) || (required && isEmptyString(findAttribute(option, 'value')?.value)))

/** The number of real choices, or null when a child could add more than the source shows. */
const countFixedChoices = (select) => {
  const required = isOn(findAttribute(select.openingElement, 'required'))
  const options = []

  for (const child of select.children) {
    if (isBlank(child)) continue
    if (child.type !== 'JSXElement' || elementName(child.openingElement.name) !== 'option') return null
    options.push(child.openingElement)
  }

  return options.filter(
    (option, index) => !isOn(findAttribute(option, 'hidden')) && !isPlaceholder(option, index, required),
  ).length
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'suggest a radio group when a select offers two or three fixed choices',
      category: 'Interaction',
      recommended: false,
    },
    schema: namesOption('components'),
    messages: {
      preferRadio:
        '`{{ name }}` offers {{ count }} fixed choices behind a click. A radio group shows every choice at once and takes one click instead of two; use one unless the layout has no room for the choices side by side.',
    },
  },
  create(context) {
    const components = new Set(['select', ...(context.options[0]?.components ?? [])])

    return {
      JSXElement(node) {
        const name = elementName(node.openingElement.name)

        if (!components.has(name) || shownAsList(node.openingElement)) {
          return
        }

        const count = countFixedChoices(node)

        if (count === null || count < MIN_OPTIONS || count > MAX_OPTIONS) {
          return
        }

        context.report({ node: node.openingElement, messageId: 'preferRadio', data: { name, count: String(count) } })
      },
    }
  },
}
