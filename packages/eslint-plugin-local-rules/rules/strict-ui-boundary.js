const fs = require('node:fs')
const ts = require('typescript')
const { createProject } = require('./lib/strict-paths')

const runtimeGlobals = new Set([
  'addEventListener',
  'removeEventListener',
  'setTimeout',
  'setInterval',
  'requestAnimationFrame',
  'ResizeObserver',
  'IntersectionObserver',
  'MutationObserver',
])
const viewFactories = {
  react: ['createElement', 'cloneElement'],
  'react/jsx-runtime': ['jsx', 'jsxs'],
  'react/jsx-dev-runtime': ['jsxDEV'],
  'react-dom': ['createPortal'],
}

const defaults = [
  { source: '@tanstack/react-query', exports: ['*'], kind: 'query' },
  ...['axios', 'ky', 'node-fetch'].map((source) => ({ source, exports: ['*'], kind: 'transport' })),
  ...['@prisma/client', 'pg', 'mongodb', 'drizzle-orm'].map((source) => ({ source, exports: ['*'], kind: 'database' })),
]
const propertyName = (node) => {
  if (!node.computed && node.property?.type === 'Identifier') return node.property.name
  if (node.property?.type === 'Literal' && typeof node.property.value === 'string') return node.property.value
  return null
}
const isTypePosition = (node) => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (
      parent.type.startsWith('TS') &&
      ![
        'TSAsExpression',
        'TSTypeAssertion',
        'TSSatisfiesExpression',
        'TSNonNullExpression',
        'TSInstantiationExpression',
      ].includes(parent.type)
    )
      return true
    if (parent.type.endsWith('Statement') || parent.type.endsWith('Declaration')) break
  }
  return false
}

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Enforce explicitly selected rendering and runtime ownership boundaries', recommended: false },
    schema: [{ type: 'object', additionalProperties: true }],
    messages: {
      forbiddenRuntime: '{{symbol}} crosses the {{role}} runtime boundary in {{file}}. {{direction}}',
      viewImplementation:
        '{{symbol}} implements a view inside {{role}} in {{file}}. Keep rendering in an approved ui owner; pass data from model/api.',
    },
  },
  create(context) {
    const options = context.options[0]
    const project = createProject(options)
    const filename = context.filename
    const current = project.classify(filename)
    if (!current) return {}
    const sourceCode = context.sourceCode
    const rendered = project.matches(filename, options.rendering || [])
    const viewHook = project.matches(filename, options.viewHooks || [])
    const sharedRuntime = project.matches(filename, options.sharedRuntime || [])
    const serverMatch = project.matches(filename, options.server || [])
    const clientDirective = sourceCode.ast.body.some(
      (statement) =>
        statement.type === 'ExpressionStatement' &&
        statement.expression.type === 'Literal' &&
        statement.expression.value === 'use client',
    )
    const server = serverMatch && !clientDirective
    const role = current.role || current.segment || current.layer
    const ui = rendered && !viewHook && !sharedRuntime && !server
    const presentation = ui || viewHook || sharedRuntime
    const modules = [...defaults, ...(options.modules || [])]
    const seenReports = new Set()
    const parsed = new Map()
    const report = (node, messageId, symbol, direction = '') => {
      const owner = symbol.startsWith('react:') ? symbol : symbol.split(':')[0]
      const key = `${messageId}:${owner}`
      if (seenReports.has(key)) return
      seenReports.add(key)
      context.report({ node, messageId, data: { symbol, role, file: project.relative(filename), direction } })
    }
    const variable = (node) => {
      for (let scope = sourceCode.getScope(node); scope; scope = scope.upper) {
        const found = scope.set.get(node.name)
        if (found) return found
      }
      return null
    }
    const read = (file) => {
      if (!parsed.has(file))
        parsed.set(file, ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true))
      return parsed.get(file)
    }
    // Only static re-exports/import aliases are followed, not arbitrary wrapper bodies.
    const exported = (source, name, from, visited = new Set()) => {
      const file = project.resolve(source, from)
      const result = { source, name, file, resolved: !file || file.includes('/node_modules/') }
      if (!file || file.includes('/node_modules/') || !fs.existsSync(file)) return result
      const key = `${file}:${name}`
      if (visited.has(key) || visited.size >= 64) return result
      const next = new Set(visited).add(key)
      const statements = read(file).statements
      const imported = (local) => {
        for (const statement of statements) {
          if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue
          const clause = statement.importClause
          const src = statement.moduleSpecifier.text
          if (clause?.name?.text === local) return exported(src, 'default', file, next)
          if (
            clause?.namedBindings &&
            ts.isNamespaceImport(clause.namedBindings) &&
            clause.namedBindings.name.text === local
          )
            return { source: src, name: '*', file: project.resolve(src, file), from: file, resolved: true }
          if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
            const entry = clause.namedBindings.elements.find(
              (element) => !element.isTypeOnly && element.name.text === local,
            )
            if (entry) return exported(src, entry.propertyName?.text || entry.name.text, file, next)
          }
        }
        return null
      }
      for (const statement of statements) {
        if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue
        if (
          statement.exportClause &&
          ts.isNamespaceExport(statement.exportClause) &&
          statement.exportClause.name.text === name &&
          statement.moduleSpecifier
        ) {
          const src = statement.moduleSpecifier.text
          return { source: src, name: '*', file: project.resolve(src, file), from: file, resolved: true }
        }
        if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          const entry = statement.exportClause.elements.find(
            (element) => !element.isTypeOnly && element.name.text === name,
          )
          if (!entry) continue
          const original = entry.propertyName?.text || entry.name.text
          if (statement.moduleSpecifier) return exported(statement.moduleSpecifier.text, original, file, next)
          return imported(original) || result
        }
        if (!statement.exportClause && statement.moduleSpecifier && name !== 'default') {
          const candidate = exported(statement.moduleSpecifier.text, name, file, next)
          if (candidate.resolved) return candidate
        }
      }
      const direct = statements.some(
        (statement) =>
          (ts.isVariableStatement(statement) &&
            statement.declarationList.declarations.some(
              (declaration) => declaration.name.getText(read(file)) === name,
            )) ||
          ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name?.text === name),
      )
      if (direct) result.resolved = true
      return result
    }
    const access = (base, name) => {
      if (!base || !name) return null
      if (base.source === '<global>' && ['window', 'globalThis', 'self'].includes(base.name)) {
        if (name === 'fetch') return { source: '<network>', name: 'fetch' }
        if (runtimeGlobals.has(name)) return { source: '<runtime>', name }
        return null
      }
      if (base.name === '*' || (base.name === 'default' && base.source === 'react'))
        return exported(base.source, name, base.from || filename)
      return { ...base, name: `${base.name}.${name}` }
    }
    const bindingPath = (pattern, target) => {
      if (pattern === target) return []
      if (pattern.type === 'AssignmentPattern') return bindingPath(pattern.left, target)
      if (pattern.type !== 'ObjectPattern') return null
      for (const prop of pattern.properties) {
        if (prop.type !== 'Property') continue
        const tail = bindingPath(prop.value, target)
        if (!tail) continue
        const name = prop.computed ? prop.key.value : prop.key.name || prop.key.value
        if (typeof name === 'string') return [name, ...tail]
      }
      return null
    }
    const origin = (node, visited = new Set()) => {
      if (!node) return null
      if (
        [
          'AwaitExpression',
          'ChainExpression',
          'TSAsExpression',
          'TSTypeAssertion',
          'TSSatisfiesExpression',
          'TSNonNullExpression',
        ].includes(node.type)
      )
        return origin(node.argument || node.expression, visited)
      if (node.type === 'ImportExpression' && node.source.type === 'Literal')
        return { source: node.source.value, name: '*', file: project.resolve(node.source.value, filename) }
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'require' &&
        !variable(node.callee)?.defs.length &&
        node.arguments[0]?.type === 'Literal'
      ) {
        const source = node.arguments[0].value
        if (typeof source === 'string') return { source, name: '*', file: project.resolve(source, filename) }
      }
      if (node.type === 'MemberExpression') return access(origin(node.object, visited), propertyName(node))
      if (node.type !== 'Identifier') return null
      const binding = variable(node)
      if (!binding?.defs.length) {
        if (node.name === 'fetch') return { source: '<network>', name: 'fetch' }
        if (runtimeGlobals.has(node.name)) return { source: '<runtime>', name: node.name }
        if (['window', 'globalThis', 'self'].includes(node.name)) return { source: '<global>', name: node.name }
        return null
      }
      if (visited.has(binding)) return null
      const next = new Set(visited).add(binding)
      const [def] = binding.defs
      if (def.type === 'ImportBinding') {
        if (def.parent.importKind === 'type' || def.node.importKind === 'type') return null
        let name = '*'
        if (def.node.type === 'ImportSpecifier') name = def.node.imported.name || def.node.imported.value
        if (def.node.type === 'ImportDefaultSpecifier') name = 'default'
        return exported(def.parent.source.value, name, filename)
      }
      if (def.type === 'Variable' && def.node.init) {
        const parts = bindingPath(def.node.id, def.name)
        if (!parts) return null
        return parts.reduce((value, name) => access(value, name), origin(def.node.init, next))
      }
      return null
    }
    const check = (node, value) => {
      if (!value) return
      const symbol = `${value.source}:${value.name}`
      if (value.source === 'react' && (value.name === 'use' || /^use[A-Z]/u.test(value.name))) {
        const allowed = (options.reactAllow || []).some(
          (entry) => entry.reason && entry.exports.includes(value.name) && project.matches(filename, entry.files),
        )
        const owner = (current.segment === 'model' && !rendered) || viewHook || sharedRuntime
        if (!owner && !allowed)
          report(node, 'forbiddenRuntime', symbol, 'Use an approved model hook or a narrowly approved view hook.')
        return
      }
      if (value.source === '<runtime>') {
        if (ui)
          report(
            node,
            'forbiddenRuntime',
            symbol,
            'Move external synchronization to an approved model/view hook or shared runtime with cleanup.',
          )
        return
      }
      if (value.source === '<network>') {
        if (presentation || (!server && current.segment !== 'api'))
          report(
            node,
            'forbiddenRuntime',
            symbol,
            'Move the request to an approved api owner; model calls that ordinary request function.',
          )
        return
      }
      const target = value.file && project.classify(value.file)
      if (
        target &&
        presentation &&
        (target.segment === 'api' || ((viewHook || sharedRuntime) && target.segment === 'model'))
      ) {
        report(
          node,
          'forbiddenRuntime',
          symbol,
          'Rendering calls a model hook; presentation-only hooks must not own domain state or transport.',
        )
        return
      }
      if (target?.segment === 'ui' && ['model', 'api'].includes(current.segment)) {
        report(node, 'viewImplementation', symbol)
        return
      }
      for (const policy of modules) {
        const configuredFile = project.resolve(policy.source, filename)
        if (
          value.source !== policy.source &&
          !value.source.startsWith(`${policy.source}/`) &&
          (!configuredFile || configuredFile !== value.file)
        )
          continue
        if (!policy.exports.includes('*') && !policy.exports.includes(value.name.split('.')[0])) continue
        const transport = ['transport', 'database'].includes(policy.kind)
        let allowed = current.segment === 'model' && !presentation
        if (transport) allowed = (current.segment === 'api' || server) && !presentation
        if (!allowed)
          report(
            node,
            'forbiddenRuntime',
            symbol,
            transport
              ? 'Move transport/DB access to an approved api/server owner.'
              : 'Move workflow/store/Query orchestration to model; keep view hooks presentation-only.',
          )
        return
      }
    }
    const checkModule = (node, source) => check(node, { source, name: '*', file: project.resolve(source, filename) })
    const checkWildcard = (node, source, from = filename, visited = new Set()) => {
      const file = project.resolve(source, from)
      check(node, { source, name: '*', file })
      if (source === 'react' && ui)
        report(node, 'forbiddenRuntime', 'react:*', 'Do not re-export primitive hooks from rendering modules.')
      for (const policy of modules) {
        if (source === policy.source || (file && file === project.resolve(policy.source, from))) {
          for (const name of policy.exports) check(node, { source, name, file })
        }
      }
      if (!file || file.includes('/node_modules/') || visited.has(file) || visited.size >= 64) return
      visited.add(file)
      for (const statement of read(file).statements) {
        if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue
        if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
          for (const entry of statement.exportClause.elements) {
            if (!entry.isTypeOnly) check(node, exported(source, entry.name.text, from))
          }
        } else if (
          statement.exportClause &&
          ts.isNamespaceExport(statement.exportClause) &&
          statement.moduleSpecifier
        ) {
          check(node, exported(statement.moduleSpecifier.text, '*', from))
        } else if (!statement.exportClause && statement.moduleSpecifier) {
          checkWildcard(node, statement.moduleSpecifier.text, file, visited)
        }
      }
    }
    const viewImplementation = (node, symbol) => {
      if (!server && !rendered && current.segment !== 'ui' && !sharedRuntime) report(node, 'viewImplementation', symbol)
      else if (['model', 'api'].includes(current.segment)) report(node, 'viewImplementation', symbol)
    }
    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') return
        if (node.specifiers.length && node.specifiers.every((item) => item.importKind === 'type')) return
        checkModule(node, node.source.value)
        for (const specifier of node.specifiers) {
          if (specifier.importKind !== 'type') check(specifier, origin(specifier.local))
        }
      },
      ExportNamedDeclaration(node) {
        if (!node.source || node.exportKind === 'type') return
        if (node.specifiers.length && node.specifiers.every((item) => item.exportKind === 'type')) return
        checkModule(node, node.source.value)
        for (const specifier of node.specifiers) {
          if (specifier.exportKind === 'type') continue
          if (specifier.type === 'ExportNamespaceSpecifier')
            check(specifier, { ...exported(node.source.value, '*', filename), namespace: true })
          else check(specifier, exported(node.source.value, specifier.local.name || specifier.local.value, filename))
        }
      },
      ExportAllDeclaration(node) {
        if (node.exportKind !== 'type') checkWildcard(node, node.source.value)
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal' && typeof node.source.value === 'string')
          checkModule(node, node.source.value)
      },
      Identifier(node) {
        if (isTypePosition(node)) return
        const binding = variable(node)
        const isReference = binding?.references.some((reference) => reference.identifier === node)
        const isUnresolvedReference = sourceCode
          .getScope(node)
          .through.some((reference) => reference.identifier === node)
        if (isReference || isUnresolvedReference) check(node, origin(node))
      },
      MemberExpression(node) {
        if (!isTypePosition(node)) check(node, origin(node))
      },
      VariableDeclarator(node) {
        if (node.id.type !== 'ObjectPattern') return
        for (const prop of node.id.properties) {
          if (prop.type === 'Property' && prop.value.type === 'Identifier') check(prop, origin(prop.value))
        }
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') check(node, origin(node))
        const value = origin(node.callee)
        if (value && Object.hasOwn(viewFactories, value.source) && viewFactories[value.source].includes(value.name))
          viewImplementation(node, `${value.source}.${value.name}`)
      },
      JSXElement(node) {
        viewImplementation(node, 'JSX')
      },
      JSXFragment(node) {
        viewImplementation(node, 'JSX')
      },
    }
  },
}
