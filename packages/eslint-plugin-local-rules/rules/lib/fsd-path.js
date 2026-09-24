/** Shared path parsing for the fsd-* boundary rules. */
const path = require('path')

const SLICED_LAYERS = new Set(['pages', '_pages', 'views', 'widgets', 'features', 'entities'])
// app > pages > widgets > features > entities > shared; _app/_pages (FSD Next.js guide) and views are aliases.
const RANK = { shared: 0, entities: 1, features: 2, widgets: 3, pages: 4, _pages: 4, views: 4, app: 5, _app: 5 }

const normalize = (rawPath) => rawPath.replace(/\\/g, '/')

/** Filename relative to the lint cwd, so folders above the repo never read as FSD layers. */
const relativeFilename = (context) => normalize(path.relative(context.cwd, context.filename))

/**
 * Layer of a cwd-relative path → { layer, rank, slice, rest, sliceless }, else null. A layer
 * directly under `src/` wins, so a monorepo package named `shared` or a Next `app/`·`pages/`
 * routing folder outside src is not read as an FSD layer.
 * ponytail: folder-name heuristic without a tsconfig; strict(policy) roots are the exact upgrade.
 */
const parseLayerPath = (relativePath) => {
  const segments = normalize(relativePath).split('/').filter(Boolean)
  const anchored = segments.findIndex((segment, index) => Object.hasOwn(RANK, segment) && segments[index - 1] === 'src')
  const index =
    anchored !== -1 || segments.includes('src')
      ? anchored
      : segments.findIndex((segment) => Object.hasOwn(RANK, segment))
  if (index === -1) {
    return null
  }

  const layer = segments[index]
  const sliced = SLICED_LAYERS.has(layer)
  return {
    layer,
    rank: RANK[layer],
    slice: sliced ? segments[index + 1] ?? null : null,
    rest: segments.slice(index + 2),
    // A file directly inside a sliced layer folder (Next `pages/_app.tsx`) is not a slice.
    sliceless: sliced && segments.length === index + 2,
  }
}

/** Import specifier → cwd-relative path, for relative, `@/`, `~/` and `src/` imports only. */
const resolveImport = (filename, source) => {
  if (typeof source !== 'string') {
    return null
  }
  if (source.startsWith('.')) {
    return path.posix.join(path.posix.dirname(filename), source)
  }
  if (source.startsWith('@/') || source.startsWith('~/')) {
    return `src/${source.slice(2)}`
  }
  return source.startsWith('src/') ? source : null
}

/** Visit every static and literal dynamic module specifier the fsd import rules judge. */
const importVisitors = (check) => ({
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
})

module.exports = { relativeFilename, parseLayerPath, resolveImport, importVisitors }
