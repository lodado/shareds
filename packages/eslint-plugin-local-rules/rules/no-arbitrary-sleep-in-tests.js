/**
 * A test that waits on the clock is guessing. The test should own the moment a response settles -
 * a deferred barrier, a fake timer, or a condition wait - never a fixed number of milliseconds.
 */
const { isTestFile } = require('./lib/test-file')

const SLEEP_FUNCTIONS = new Set(['sleep', 'delay', 'pause', 'timeout'])

const containsSetTimeout = (node) => {
  if (!node || typeof node.type !== 'string') {
    return false
  }

  if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && node.callee.name === 'setTimeout') {
    return true
  }

  return Object.keys(node).some((key) => {
    if (key === 'parent') {
      return false
    }

    const value = node[key]

    if (Array.isArray(value)) {
      return value.some(containsSetTimeout)
    }

    return value && typeof value === 'object' && containsSetTimeout(value)
  })
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow fixed-duration waits in tests - control the timing with a barrier instead',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      arbitrarySleep:
        'Do not wait on the clock. Resolve a deferred barrier, use fake timers, or wait for the condition itself.',
    },
  },
  create(context) {
    if (!isTestFile(context.getFilename())) {
      return {}
    }

    return {
      // `await new Promise((resolve) => setTimeout(resolve, 100))`
      NewExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'Promise') {
          return
        }

        if (node.arguments.some(containsSetTimeout)) {
          context.report({ node, messageId: 'arbitrarySleep' })
        }
      },

      // `await sleep(100)` and friends
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || !SLEEP_FUNCTIONS.has(node.callee.name)) {
          return
        }

        context.report({ node, messageId: 'arbitrarySleep' })
      },
    }
  },
}
