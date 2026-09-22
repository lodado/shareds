const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const { createProject } = require('./lib/strict-paths')

const rank = { shared: 0, entities: 1, features: 2, widgets: 3, pages: 4, app: 5 }
const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']
const conventional = new Set(['__test__', '__tests__', '__mocks__', 'assets'])

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Enforce explicitly configured FSD roots, layers, slices and public contracts',
      recommended: false,
    },
    schema: [{ type: 'object', additionalProperties: true }],
    messages: {
      layerDirection: '{{from}} cannot depend on {{to}}; use a lower-layer public API.',
      siblingSlice: '{{from}} cannot depend on sibling {{to}}; a public barrel does not permit sibling access.',
      deepImport: '{{to}} is private; import the approved public entry instead.',
      selfBarrel: 'This slice imports its own public barrel; use a direct internal relative import.',
      wildcardPublic: 'Public wildcard export leaks private contracts; enumerate exports or approve this exact entry.',
      missingPublicEntry: 'Slice {{slice}} has no existing public entry; declare its public contract.',
      invalidSegment: 'Segment {{segment}} is not approved here; place code by responsibility, not file kind.',
      invalidCrossImport: '@x requires an exact approved entities provider/consumer entry with named exports.',
      testBoundary: 'Production code cannot import this test-only entry; expose a production contract separately.',
      serverBoundary: 'This client-capable owner cannot import a server-only entry; use a client-safe contract.',
      modelUi:
        'model/api cannot depend on view implementations, including type imports; extract an approved data contract.',
      unresolved: 'Cannot resolve internal import {{source}}; check the configured TS paths and public file.',
      layerBarrel: 'A layer-wide barrel is not approved; import a slice or small shared public API.',
      unclassifiedFile:
        'File is inside a strict root but has no configured FSD layer; declare its owner or correct its location.',
      rootBoundary: '{{from}} cannot access root {{to}} without an exact public entry and approved consumer.',
    },
  },
  create(context) {
    const options = context.options[0] || {}
    const project = createProject(options)
    const filename = context.filename
    const importer = project.classify(filename)
    if (!importer) return {}
    const approved = options.publicEntries || []
    const allowed = new Set(options.allowedSegments || ['ui', 'model', 'api', 'lib', 'config'])
    const report = (node, messageId, data) => context.report({ node, messageId, data })
    const entryFor = (file) => approved.find((entry) => project.relative(entry.file) === project.relative(file))
    const sameSlice = (target) => Boolean(target.slicePath && target.slicePath === importer.slicePath)
    const sliceId = (target) => project.relative(target.slicePath)
    const publicEntry = (target) => {
      if (entryFor(target.path)) return true
      return Boolean(
        target.slicePath &&
          path.dirname(target.path) === target.slicePath &&
          extensions.some((extension) => path.basename(target.path) === `index${extension}`),
      )
    }
    const hasEntry = (owner) =>
      extensions.some((extension) => fs.existsSync(path.join(owner.slicePath, `index${extension}`))) ||
      approved.some((entry) => {
        const target = project.classify(entry.file)
        return target?.slicePath === owner.slicePath && fs.existsSync(target.path)
      })
    const isTest = (target) =>
      target.role === 'test' ||
      entryFor(target.path)?.kind === 'test' ||
      project
        .relative(target.path)
        .split('/')
        .some((part) => ['__test__', '__tests__', '__mocks__'].includes(part)) ||
      /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(target.path)
    const isServer = (target) => target.role === 'server' || entryFor(target.path)?.kind === 'server'
    const hasNamedExport = (file) => {
      const statements = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      ).statements
      if (statements.some((statement) => ts.isExportDeclaration(statement) && !statement.exportClause)) return false
      return statements.some((statement) => {
        if (ts.isExportDeclaration(statement))
          return (
            statement.exportClause &&
            ts.isNamedExports(statement.exportClause) &&
            statement.exportClause.elements.some((entry) => entry.name.text !== 'default')
          )
        return (
          statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) &&
          !statement.modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
        )
      })
    }
    const crossAllowed = (target) =>
      importer.slicePath &&
      importer.layer === 'entities' &&
      target.layer === 'entities' &&
      (options.crossImports || []).some(
        (entry) =>
          entry.reason &&
          project.relative(entry.from) === sliceId(importer) &&
          project.relative(entry.to) === project.relative(target.path),
      ) &&
      hasNamedExport(target.path)
    const check = (node, source) => {
      if (typeof source !== 'string') return
      const resolved = project.resolve(source, filename)
      if (!resolved) {
        if (project.isInternal(source)) report(node, 'unresolved', { source })
        return
      }
      const target = project.classify(resolved)
      if (!target) {
        if (project.isInternal(source) && !resolved.includes('/node_modules/')) report(node, 'unclassifiedFile')
        return
      }
      const cross = project.relative(resolved).split('/').includes('@x')
      if (cross && !crossAllowed(target)) return report(node, 'invalidCrossImport')
      if (target.root !== importer.root && !entryFor(resolved)?.consumers?.includes(importer.root))
        return report(node, 'rootBoundary', { from: importer.root, to: target.root })
      if (isTest(target) && !isTest(importer)) return report(node, 'testBoundary')
      if (isServer(target) && !isServer(importer)) return report(node, 'serverBoundary')
      if (target.layer === 'shared' && !entryFor(resolved)) {
        const owner = approved.find((entry) => {
          const publicFile = project.classify(entry.file)
          return publicFile?.layer === 'shared' && resolved.startsWith(`${path.dirname(publicFile.path)}${path.sep}`)
        })
        if (owner && !importer.path.startsWith(`${path.dirname(project.classify(owner.file).path)}${path.sep}`))
          return report(node, 'deepImport', { to: project.relative(resolved) })
      }
      if (['model', 'api'].includes(importer.segment) && (target.segment === 'ui' || target.role === 'view-hook'))
        return report(node, 'modelUi')
      if (rank[target.layer] > rank[importer.layer])
        return report(node, 'layerDirection', { from: importer.layer, to: target.layer })
      if (target.slicePath && importer.layer === target.layer && !sameSlice(target) && !cross)
        return report(node, 'siblingSlice', { from: importer.slice || importer.root, to: target.slice })
      if (target.slicePath && !sameSlice(target) && !publicEntry(target) && !cross)
        return report(node, 'deepImport', { to: project.relative(resolved) })
      if (sameSlice(target) && publicEntry(target)) return report(node, 'selfBarrel')
      if (!target.slicePath && path.basename(resolved).startsWith('index.') && !target.segment && !entryFor(resolved))
        return report(node, 'layerBarrel')
    }
    const sourceOf = (node) => (node?.type === 'Literal' && typeof node.value === 'string' ? node.value : null)
    return {
      Program(node) {
        if (!Object.hasOwn(rank, importer.layer)) return report(node, 'unclassifiedFile')
        if (importer.slicePath) {
          if (importer.segment === '@x') {
            if (
              importer.layer !== 'entities' ||
              !(options.crossImports || []).some(
                (entry) => entry.reason && project.relative(entry.to) === project.relative(filename),
              ) ||
              !hasNamedExport(filename)
            )
              report(node, 'invalidCrossImport')
          } else if (importer.segment && !allowed.has(importer.segment) && !conventional.has(importer.segment))
            report(node, 'invalidSegment', { segment: importer.segment })
          else if (!importer.segment && !publicEntry(importer)) report(node, 'invalidSegment', { segment: '(missing)' })
          if (!hasEntry(importer)) report(node, 'missingPublicEntry', { slice: sliceId(importer) })
        } else if (!importer.segment && path.basename(filename).startsWith('index.') && !entryFor(filename))
          report(node, 'layerBarrel')
      },
      ImportDeclaration(node) {
        check(node.source, sourceOf(node.source))
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node.source, sourceOf(node.source))
      },
      ExportAllDeclaration(node) {
        if (publicEntry(importer) && !entryFor(filename)?.allowWildcard) report(node, 'wildcardPublic')
        check(node.source, sourceOf(node.source))
      },
      ImportExpression(node) {
        check(node.source, sourceOf(node.source))
      },
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== 'require' || node.arguments.length !== 1) return
        for (let scope = context.sourceCode.getScope(node); scope; scope = scope.upper)
          if (scope.set.get('require')?.defs.length) return
        check(node.arguments[0], sourceOf(node.arguments[0]))
      },
    }
  },
}
