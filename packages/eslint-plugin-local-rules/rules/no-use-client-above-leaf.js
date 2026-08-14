/**
 * `'use client'` on a route file drags the whole subtree into the client bundle.
 * The boundary belongs on the smallest leaf that actually needs handlers or browser APIs.
 */
const ROUTE_FILE = /(^|\/)app\/(.*\/)?(layout|page|template|default)\.(js|jsx|ts|tsx)$/

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: "disallow 'use client' on Next.js route files - keep the boundary on the leaf that needs it",
      category: 'Best Practices',
      recommended: 'warn',
    },
    schema: [],
    messages: {
      clientBoundaryTooHigh:
        "Move 'use client' down to the leaf component that needs it - this file makes its whole subtree client-side.",
    },
  },
  create(context) {
    const filename = context.getFilename().replace(/\\/g, '/')

    if (!ROUTE_FILE.test(filename)) {
      return {}
    }

    return {
      Program(node) {
        for (const statement of node.body) {
          if (statement.type !== 'ExpressionStatement' || typeof statement.directive !== 'string') {
            return
          }

          if (statement.directive === 'use client') {
            context.report({ node: statement, messageId: 'clientBoundaryTooHigh' })
            return
          }
        }
      },
    }
  },
}
