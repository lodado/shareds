/**
 * FSD import rule on layers: a slice imports only from layers strictly below it; app and shared
 * have no slices and import freely inside themselves. Same-layer slices never import each other,
 * even through their public API - except entities/B importing entities/A/@x/B. Type-only
 * imports count: switching to `import type` is not a fix. Ships off - the `fsd` preset turns it on.
 */
const { relativeFilename, parseLayerPath, resolveImport, importVisitors } = require('./lib/fsd-path')

const withoutExtension = (name = '') => name.replace(/\.[cm]?[jt]sx?$/, '')
const label = (at) => (at.slice ? `${at.layer}/${at.slice}` : at.layer)

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'enforce the FSD layer import direction and same-layer slice isolation',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [],
    messages: {
      upward:
        "'{{from}}' cannot import from the higher layer '{{to}}'. Move the shared part down to a lower layer, or compose both from '{{to}}'.",
      sibling:
        "'{{from}}' cannot import its sibling slice '{{to}}', even through the public API. Merge the slices, move the shared part to a lower layer, or compose both in a higher layer.",
      crossImport:
        "'{{source}}' is the @x API of '{{to}}' for entities/{{consumer}} only; this file is not that entity.",
    },
  },
  create(context) {
    const filename = relativeFilename(context)
    const from = parseLayerPath(filename)
    // app composes every layer, and a file directly in a sliced layer folder is not a slice.
    if (!from || from.layer === 'app' || from.layer === '_app' || from.sliceless) {
      return {}
    }

    return importVisitors((node, source) => {
      const resolved = resolveImport(filename, source)
      const to = resolved && parseLayerPath(resolved)
      if (!to || (to.layer === from.layer && to.slice === from.slice)) {
        return
      }

      if (to.rest[0] === '@x') {
        const consumer = withoutExtension(to.rest[1])
        const valid =
          from.layer === 'entities' && to.layer === 'entities' && from.slice === consumer && to.rest.length === 2
        if (!valid) {
          context.report({ node, messageId: 'crossImport', data: { source, to: label(to), consumer } })
        }
        return
      }
      if (to.rank > from.rank) {
        context.report({ node, messageId: 'upward', data: { from: label(from), to: to.layer } })
      } else if (to.layer === from.layer && from.slice && to.slice) {
        context.report({ node, messageId: 'sibling', data: { from: label(from), to: label(to) } })
      }
    })
  },
}
