/**
 * FSD segments are ui / model / api / lib / config. `components`, `hooks` and `utils`
 * mix view and state ownership the segments were meant to separate. Ships off - the
 * `fsd` preset turns it on.
 */
const { normalize } = require('./lib/fsd-path')

const BANNED_SEGMENT = /\/(?:pages|_pages|views|widgets|features|entities)\/[^/]+\/(components|hooks|utils)\//

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow components/hooks/utils folders inside FSD slices - use ui/model/lib segments',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [],
    messages: {
      bannedSegment:
        "'{{segment}}' is not an FSD segment. Components and view hooks go in ui/, stateful logic and interaction hooks in model/, pure helpers in lib/.",
    },
  },
  create(context) {
    const match = BANNED_SEGMENT.exec(normalize(context.getFilename()))

    if (!match) {
      return {}
    }

    return {
      Program(node) {
        context.report({ node, messageId: 'bannedSegment', data: { segment: match[1] } })
      },
    }
  },
}
