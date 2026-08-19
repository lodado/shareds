/**
 * Opt-in naming convention: `*.scenario.test.*` for behaviour next to a component,
 * `*.unit.test.*` for pure helpers. Off by default - a repo with its own convention keeps it.
 */
const { normalize, isE2EFile } = require('./lib/test-file')

const UNIT_TEST_FILE = /\.(test|spec)\.[jt]sx?$/
const CONVENTIONAL = /\.(scenario|unit|integration)\.(test|spec)\.[jt]sx?$/

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'require test files to declare their layer in the filename',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [],
    messages: {
      unconventionalName:
        'Name the layer in the filename: *.scenario.test.* next to a component, *.unit.test.* for a pure helper.',
    },
  },
  create(context) {
    const filename = normalize(context.getFilename())

    if (!UNIT_TEST_FILE.test(filename) || CONVENTIONAL.test(filename) || isE2EFile(filename)) {
      return {}
    }

    return {
      Program(node) {
        context.report({ node, messageId: 'unconventionalName' })
      },
    }
  },
}
