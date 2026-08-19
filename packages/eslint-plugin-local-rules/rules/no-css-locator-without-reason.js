/**
 * Locator order is role > text > test id > CSS. A CSS selector couples the test to markup
 * the product is free to change, so it needs a written reason for why nothing better exists.
 */
const { hasReasonComment } = require('./lib/reason-comment')
const { isE2EFile } = require('./lib/test-file')

// Playwright's own engines plus the test-id escape hatch, which sits above CSS in the order.
const ALLOWED_ENGINE = /^\s*(role|text|id|data-testid|aria-label|alt|title|placeholder|internal:|xpath)=/
const TEST_ID_SELECTOR = /data-testid/

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'require a comment justifying a CSS locator in end-to-end tests',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      cssLocator:
        'Prefer getByRole/getByText/test id. If CSS is the only handle, say why in a comment above this line.',
    },
  },
  create(context) {
    if (!isE2EFile(context.getFilename())) {
      return {}
    }

    const sourceCode = context.getSourceCode()

    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.computed ||
          node.callee.property.name !== 'locator'
        ) {
          return
        }

        const [selector] = node.arguments

        if (!selector || selector.type !== 'Literal' || typeof selector.value !== 'string') {
          return
        }

        if (ALLOWED_ENGINE.test(selector.value) || TEST_ID_SELECTOR.test(selector.value)) {
          return
        }

        if (!hasReasonComment(sourceCode, node)) {
          context.report({ node, messageId: 'cssLocator' })
        }
      },
    }
  },
}
