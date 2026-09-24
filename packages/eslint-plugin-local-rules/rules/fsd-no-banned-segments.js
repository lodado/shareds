/**
 * FSD segments are ui / model / api / lib / config. `components`, `hooks` and `utils`
 * mix view and state ownership the segments were meant to separate. Ships off - the
 * `fsd` preset turns it on.
 */
const { relativeFilename, parseLayerPath } = require('./lib/fsd-path')

const BANNED_SEGMENTS = new Set(['components', 'hooks', 'utils'])

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
    const at = parseLayerPath(relativeFilename(context))
    const segment = at?.slice && at.rest.length > 1 ? at.rest[0] : null

    if (!BANNED_SEGMENTS.has(segment)) {
      return {}
    }

    return {
      Program(node) {
        context.report({ node, messageId: 'bannedSegment', data: { segment } })
      },
    }
  },
}
