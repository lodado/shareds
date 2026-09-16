/**
 * `{open && <div className="fixed inset-0">…</div>}` is a dialog that never said so: no role, so
 * no Escape, no focus trap, no name. The rule spots the two shapes that hide a widget behind a
 * boolean - an overlay subtree and a conditional list - and names the pattern whose contract the
 * author should implement. It reports once per conditional, on the JSX root.
 */
const { keyHint } = require('./lib/interaction-contracts')

const OVERLAY_CLASS = /\b(?:fixed|absolute)\b[^"'`]*\binset-0\b|\b(?:overlay|backdrop|modal|drawer|sheet)\b/
const LIST_TAGS = new Set(['ul', 'ol'])
const WIDGET_ROLES = new Set([
  'dialog',
  'alertdialog',
  'menu',
  'listbox',
  'tooltip',
  'region',
  'tabpanel',
  'group',
  'presentation',
  'none',
])

const attributeName = (attribute) =>
  attribute.type === 'JSXAttribute' && attribute.name.type === 'JSXIdentifier' ? attribute.name.name : null

const literalText = (attribute) => {
  if (!attribute) return ''
  if (attribute.value?.type === 'Literal') return String(attribute.value.value)
  if (attribute.value?.type === 'JSXExpressionContainer') {
    const { expression } = attribute.value
    if (expression.type === 'Literal') return String(expression.value)
    if (expression.type === 'TemplateLiteral') return expression.quasis.map((quasi) => quasi.value.raw).join(' ')
    if (expression.type === 'CallExpression')
      return expression.arguments
        .map((argument) => (argument.type === 'Literal' ? String(argument.value) : ''))
        .join(' ')
  }
  return ''
}

const tagName = (element) =>
  element.openingElement.name.type === 'JSXIdentifier' ? element.openingElement.name.name : ''

/** Depth-first over JSX elements only; components are opaque. */
const walkElements = (element, visit) => {
  if (element.type !== 'JSXElement' && element.type !== 'JSXFragment') return
  if (element.type === 'JSXElement' && visit(element) === false) return
  for (const child of element.children) {
    if (child.type === 'JSXElement' || child.type === 'JSXFragment') walkElements(child, visit)
  }
}

const hasRole = (root) => {
  let found = false
  walkElements(root, (element) => {
    if (
      element.openingElement.attributes.some(
        (attribute) => attributeName(attribute) === 'role' && WIDGET_ROLES.has(literalText(attribute)),
      )
    )
      found = true
    return !found
  })
  return found
}

const looksLikeOverlay = (root) => {
  let found = false
  walkElements(root, (element) => {
    const className = literalText(
      element.openingElement.attributes.find((attribute) => attributeName(attribute) === 'className'),
    )
    const style = element.openingElement.attributes.find((attribute) => attributeName(attribute) === 'style')
    const styleText =
      style?.value?.type === 'JSXExpressionContainer'
        ? JSON.stringify(
            style.value.expression.properties?.map((property) => [property.key?.name, property.value?.value]) ?? [],
          )
        : ''
    if (OVERLAY_CLASS.test(className) || /"position","fixed"/.test(styleText)) found = true
    return !found
  })
  return found
}

const looksLikeList = (root) => root.type === 'JSXElement' && LIST_TAGS.has(tagName(root))

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'flag a boolean-gated overlay or list that renders a widget without declaring its pattern role',
      category: 'Accessibility',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      overlayWithoutRole:
        'This conditional overlay behaves like a dialog but declares no role. Add role="dialog" aria-modal="true" aria-labelledby, then implement the contract. Keys: {{ keyHint }}',
      listWithoutRole:
        'This conditional list behaves like a menu or listbox but declares no role. Add role="menu" (actions) or role="listbox" (selection) and the matching item roles. Keys: {{ keyHint }}',
    },
  },
  create(context) {
    return {
      // Anywhere a boolean gates JSX: `{open && <…>}` in JSX, `return open && <…>`, or an arrow body.
      LogicalExpression(expression) {
        if (expression.operator !== '&&') return
        const root = expression.right
        if (root.type !== 'JSXElement' && root.type !== 'JSXFragment') return
        if (hasRole(root)) return
        if (looksLikeOverlay(root)) {
          context.report({ node: root, messageId: 'overlayWithoutRole', data: { keyHint: keyHint('dialog') } })
        } else if (looksLikeList(root)) {
          context.report({ node: root, messageId: 'listWithoutRole', data: { keyHint: keyHint('menu-button') } })
        }
      },
    }
  },
}
