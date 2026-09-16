/**
 * A `role` or `aria-haspopup` names a WAI-ARIA widget pattern, and every pattern has a keyboard
 * and state contract (contracts/<pattern>.json). This rule checks the parts of that contract that
 * are visible in source: state attributes bound to an expression rather than a literal, the
 * required naming/relationship attributes, and a key handler for the pattern's primary keys
 * somewhere in the enclosing component. Whether the handler actually works is a browser test's job.
 */
const { keyHint, stepGuidance } = require('./lib/interaction-contracts')

const FUNCTION_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'])
// Library primitives own the contract themselves; a wrapper only has to pass props through.
const LIBRARY_HANDLED =
  /(?:onEscapeKeyDown|onOpenChange|onDismiss|useDismiss|useInteractOutside|@radix-ui|react-aria|@headlessui|@ariakit|@floating-ui)/

/** pattern → what the rule can verify from source. */
const PATTERNS = {
  dialog: {
    roles: ['dialog', 'alertdialog'],
    requiredAny: [['aria-labelledby', 'aria-label']],
    attrStep: 'has-name',
    keys: ['Escape'],
  },
  'menu-button': {
    haspopup: ['menu', 'true'],
    bound: ['aria-expanded'],
    attrStep: 'expanded-binding',
    keys: ['ArrowDown', 'Enter', ' '],
  },
  combobox: {
    roles: ['combobox'],
    bound: ['aria-expanded'],
    requiredAny: [['aria-controls']],
    attrStep: 'arrowdown-opens',
    keys: ['ArrowDown'],
  },
  tabs: { roles: ['tablist'], keys: ['ArrowRight', 'ArrowLeft'] },
  tab: {
    roles: ['tab'],
    bound: ['aria-selected'],
    requiredAny: [['aria-controls']],
    guidanceFrom: 'tabs',
    attrStep: 'selected-binding',
  },
  listbox: { roles: ['listbox'], keys: ['ArrowDown', 'ArrowUp'] },
  option: { roles: ['option'], bound: ['aria-selected'], guidanceFrom: 'listbox', attrStep: 'selected-binding' },
  switch: { roles: ['switch'], bound: ['aria-checked'], attrStep: 'space-toggles' },
  disclosure: { bound: ['aria-expanded'], requiredAny: [['aria-controls']], attrStep: 'toggle-opens' },
}

const attributeName = (attribute) =>
  attribute.type === 'JSXAttribute' && attribute.name.type === 'JSXIdentifier' ? attribute.name.name : null

const findAttribute = (node, name) => node.attributes.find((attribute) => attributeName(attribute) === name)

const literalValue = (attribute) => {
  if (!attribute || attribute.value === null) return attribute ? '' : null
  if (attribute.value.type === 'Literal') return String(attribute.value.value)
  if (attribute.value.type === 'JSXExpressionContainer' && attribute.value.expression.type === 'Literal')
    return String(attribute.value.expression.value)
  return undefined // an expression - bound to something
}

const enclosingFunction = (node) => {
  let current = node.parent
  while (current && !FUNCTION_TYPES.has(current.type)) current = current.parent
  return current
}

const outermostFunction = (node) => {
  let found = null
  let current = enclosingFunction(node)
  while (current) {
    found = current
    current = enclosingFunction(current)
  }
  return found
}

const detectPattern = (node) => {
  const role = literalValue(findAttribute(node, 'role'))
  const haspopup = literalValue(findAttribute(node, 'aria-haspopup'))
  for (const [pattern, spec] of Object.entries(PATTERNS)) {
    if (spec.roles && role && spec.roles.includes(role)) return pattern
    if (spec.haspopup && haspopup && spec.haspopup.includes(haspopup)) return pattern
  }
  // A button with aria-expanded but no popup role is a disclosure.
  if (spec_isDisclosure(node, role, haspopup)) return 'disclosure'
  return null
}

const spec_isDisclosure = (node, role, haspopup) => {
  if (haspopup !== null || (role && role !== 'button')) return false
  const tag = node.name.type === 'JSXIdentifier' ? node.name.name : ''
  return (tag === 'button' || role === 'button') && Boolean(findAttribute(node, 'aria-expanded'))
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'require the source-visible parts of the WAI-ARIA pattern contract that a role or aria-haspopup declares',
      category: 'Accessibility',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      literalState:
        '{{ pattern }}: `{{ attribute }}` is a literal, so it never changes. Bind it to state: {{ attribute }}={ {{ stateName }} }. {{ guidance }}',
      missingAttribute: '{{ pattern }}: add {{ attributes }}. {{ guidance }}',
      missingKeyHandler:
        '{{ pattern }}: no handler for {{ keys }} in this component. Add onKeyDown for them or use a library primitive. Keys: {{ keyHint }}',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode()

    return {
      JSXOpeningElement(node) {
        const pattern = detectPattern(node)
        if (!pattern) return
        const spec = PATTERNS[pattern]
        const guidancePattern = spec.guidanceFrom ?? pattern
        const guidance = spec.attrStep ? stepGuidance(guidancePattern, spec.attrStep) : ''

        for (const attribute of spec.bound ?? []) {
          const value = literalValue(findAttribute(node, attribute))
          if (value === null) {
            context.report({ node, messageId: 'missingAttribute', data: { pattern, attributes: attribute, guidance } })
          } else if (value !== undefined) {
            const stateName = attribute.replace('aria-', '')
            context.report({ node, messageId: 'literalState', data: { pattern, attribute, stateName, guidance } })
          }
        }

        for (const alternatives of spec.requiredAny ?? []) {
          if (!alternatives.some((name) => findAttribute(node, name))) {
            context.report({
              node,
              messageId: 'missingAttribute',
              data: { pattern, attributes: alternatives.join(' or '), guidance },
            })
          }
        }

        if (spec.keys) {
          const component = outermostFunction(node)
          const text = component ? sourceCode.getText(component) : sourceCode.getText()
          if (LIBRARY_HANDLED.test(text)) return
          const handled = spec.keys.some((key) => text.includes(`'${key}'`) || text.includes(`"${key}"`))
          if (!handled) {
            context.report({
              node,
              messageId: 'missingKeyHandler',
              data: {
                pattern,
                keys: spec.keys.map((key) => (key === ' ' ? 'Space' : key)).join('/'),
                keyHint: keyHint(guidancePattern),
              },
            })
          }
        }
      },
    }
  },
}
