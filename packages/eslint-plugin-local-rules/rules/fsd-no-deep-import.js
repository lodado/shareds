/**
 * An FSD slice exposes one public API (index.ts, or index.server.ts / api/server.ts for
 * server-only consumers). Importing an internal segment file couples the consumer to
 * internals the slice is free to move. Ships off - the `fsd` preset turns it on.
 */
const path = require('path')

const { normalize, parseSlicedPath } = require('./lib/fsd-path')

const PUBLIC_ENTRIES = new Set(['index', 'index.server'])

const isPublicSurface = (rest) => {
  if (rest.length === 0) {
    return true
  }

  if (rest.length === 1 && PUBLIC_ENTRIES.has(rest[0])) {
    return true
  }

  // documented server-only entry: <slice>/api/server
  if (rest.length === 2 && rest[0] === 'api' && rest[1] === 'server') {
    return true
  }

  // @x cross-import notation is a deliberately published surface
  return rest[0] === '@x'
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'disallow importing FSD slice internals - consume the slice public API instead',
      category: 'Best Practices',
      recommended: false,
    },
    schema: [],
    messages: {
      deepImport:
        "Deep import into '{{slice}}'. Import from the slice public API (its index.ts) so the slice can move its internals freely.",
    },
  },
  create(context) {
    const filename = normalize(context.getFilename())
    const importer = parseSlicedPath(filename)

    const check = (node, source) => {
      if (typeof source !== 'string') {
        return
      }

      const resolved = source.startsWith('.')
        ? path.posix.join(path.posix.dirname(filename), source)
        : source.replace(/^[@~]\//, '')
      const target = parseSlicedPath(resolved)

      if (!target || isPublicSurface(target.rest)) {
        return
      }

      if (importer && importer.layer === target.layer && importer.slice === target.slice) {
        return
      }

      context.report({ node, messageId: 'deepImport', data: { slice: `${target.layer}/${target.slice}` } })
    }

    return {
      ImportDeclaration(node) {
        check(node.source, node.source.value)
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          check(node.source, node.source.value)
        }
      },
      ExportAllDeclaration(node) {
        check(node.source, node.source.value)
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') {
          check(node.source, node.source.value)
        }
      },
    }
  },
}
