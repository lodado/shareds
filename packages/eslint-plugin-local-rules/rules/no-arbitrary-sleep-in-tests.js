/**
 * A test that waits on the clock is guessing. The test should own the moment a response settles -
 * a deferred barrier, a fake timer, or a condition wait - never a fixed number of milliseconds.
 *
 * Every spelling of a wall-clock wait counts: `new Promise((r) => setTimeout(r, n))` with a bare,
 * `window.` or `globalThis.` setTimeout, `setTimeout` or `scheduler.wait` from `timers/promises`,
 * a local `sleep(n)`, and `x.sleep(n)` / `x.wait(n)` with a literal duration. A wait under
 * `vi.useFakeTimers()` is driven by the test and is fine, and so is a same-named function the
 * test imports from product code.
 */
const { findVariable } = require('./lib/runtime-modules')
const { isTestFile } = require('./lib/test-file')

const SLEEP_FUNCTIONS = new Set(['sleep', 'delay', 'pause', 'timeout', 'wait'])
const GLOBAL_OBJECTS = new Set(['window', 'globalThis', 'self'])
const TIMER_MODULES = new Set(['timers/promises', 'node:timers/promises'])
const TEST_SUPPORT =
  /(^|\/)(test-utils|testing|__mocks__|__tests__|e2e|playwright)\/|\.(setup|test|spec)\.[cm]?[jt]sx?$/u

const importSource = (sourceCode, identifier) => {
  const definition = findVariable(sourceCode, identifier)?.defs[0]
  return definition?.type === 'ImportBinding' ? definition.parent.source.value : null
}

const isTimerCallee = (sourceCode, callee) => {
  if (callee.type === 'Identifier') {
    return callee.name === 'setTimeout' && !findVariable(sourceCode, callee)?.defs[0]
  }
  return (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.property.name === 'setTimeout' &&
    callee.object.type === 'Identifier' &&
    GLOBAL_OBJECTS.has(callee.object.name)
  )
}

const containsSetTimeout = (sourceCode, node) => {
  if (!node || typeof node.type !== 'string') {
    return false
  }

  if (node.type === 'CallExpression' && isTimerCallee(sourceCode, node.callee)) {
    return true
  }

  return Object.keys(node).some((key) => {
    if (key === 'parent') {
      return false
    }

    const value = node[key]

    if (Array.isArray(value)) {
      return value.some((child) => containsSetTimeout(sourceCode, child))
    }

    return value && typeof value === 'object' && containsSetTimeout(sourceCode, value)
  })
}

const isLiteralDuration = (argument) => argument?.type === 'Literal' && typeof argument.value === 'number'

/** A call that waits a fixed time by itself: `sleep(100)`, `utils.sleep(100)`, `setTimeout(100)` from timers/promises. */
const isSleepCall = (sourceCode, node) => {
  const { callee } = node
  if (callee.type === 'Identifier') {
    const source = importSource(sourceCode, callee)
    if (source) {
      return TIMER_MODULES.has(source)
        ? callee.name !== 'setImmediate'
        : SLEEP_FUNCTIONS.has(callee.name) && TEST_SUPPORT.test(source)
    }
    return SLEEP_FUNCTIONS.has(callee.name)
  }
  if (callee.type !== 'MemberExpression' || callee.computed) {
    return false
  }
  const name = callee.property.name
  if (callee.object.type === 'Identifier' && TIMER_MODULES.has(importSource(sourceCode, callee.object) ?? '')) {
    return name === 'wait' || name === 'setTimeout'
  }
  // `promise.timeout(n)` bounds a wait instead of adding one
  return name !== 'timeout' && SLEEP_FUNCTIONS.has(name) && isLiteralDuration(node.arguments[0])
}

const usesFakeTimers = (node) =>
  node.callee.type === 'MemberExpression' && !node.callee.computed && node.callee.property.name === 'useFakeTimers'

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
    if (!isTestFile(context.filename) && !TEST_SUPPORT.test(context.filename.replace(/\\/g, '/'))) {
      return {}
    }

    const sourceCode = context.sourceCode
    const promiseWaits = []
    let fakeTimers = false

    return {
      // `await new Promise((resolve) => setTimeout(resolve, 100))` - unless fake timers drive it
      NewExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'Promise' &&
          node.arguments.some((argument) => containsSetTimeout(sourceCode, argument))
        ) {
          promiseWaits.push(node)
        }
      },

      CallExpression(node) {
        if (usesFakeTimers(node)) {
          fakeTimers = true
        } else if (isSleepCall(sourceCode, node)) {
          context.report({ node, messageId: 'arbitrarySleep' })
        }
      },

      'Program:exit'() {
        if (fakeTimers) {
          return
        }
        for (const node of promiseWaits) {
          context.report({ node, messageId: 'arbitrarySleep' })
        }
      },
    }
  },
}
