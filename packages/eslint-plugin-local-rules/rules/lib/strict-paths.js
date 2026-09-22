const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')

const normalize = (value) => String(value).replaceAll('\\', '/')
const absolute = (cwd, value) => path.resolve(cwd, normalize(value))
const layers = new Set(['app', 'pages', 'widgets', 'features', 'entities', 'shared'])
const sliced = new Set(['pages', 'widgets', 'features', 'entities'])
const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']

function createProject(options = {}) {
  const cwd = absolute(process.cwd(), options.cwd || process.cwd())
  const realCwd = fs.realpathSync(cwd)
  const projectPath = (value) => {
    const file = absolute(cwd, value)
    if (file.startsWith(`${realCwd}${path.sep}`)) return path.join(cwd, path.relative(realCwd, file))
    return file
  }
  const roots = (options.roots || [])
    .map((root) => ({ ...root, absolute: absolute(cwd, root.path) }))
    .sort((a, b) => b.absolute.length - a.absolute.length)
  const relative = (file) => normalize(path.relative(cwd, projectPath(file)))
  const matches = (file, patterns = []) =>
    patterns.some((pattern) => path.matchesGlob(relative(file), normalize(pattern)))
  const roles = [
    ['ui', options.rendering],
    ['view-hook', options.viewHooks],
    ['shared-runtime', options.sharedRuntime],
    ['server', options.server],
    ['test', options.test],
  ]
  let compilerOptions = {}
  if (options.tsconfig) {
    const configFile = absolute(cwd, options.tsconfig)
    const loaded = ts.readConfigFile(configFile, ts.sys.readFile)
    if (loaded.error) throw new Error(ts.flattenDiagnosticMessageText(loaded.error.messageText, '\n'))
    const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, path.dirname(configFile))
    const errors = parsed.errors.filter((error) => error.code !== 18003)
    if (errors.length)
      throw new Error(errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'))
    compilerOptions = parsed.options
  }
  const resolutionCache = ts.createModuleResolutionCache(cwd, (file) => file, compilerOptions)
  const classify = (filename) => {
    const file = projectPath(filename)
    const root = roots.find((entry) => file.startsWith(`${entry.absolute}${path.sep}`))
    if (!root) return null
    const parts = normalize(path.relative(root.absolute, file)).split('/')
    const physicalLayer = parts[0]
    const layer = root.layers?.[physicalLayer] || physicalLayer
    const groups = root.groups?.[physicalLayer] || []
    const sliceIndex = groups.includes(parts[1]) ? 2 : 1
    const hasSlice = sliced.has(layer) && parts.length > sliceIndex + 1
    const slice = hasSlice ? parts[sliceIndex] : null
    const slicePath = hasSlice ? path.join(root.absolute, ...parts.slice(0, sliceIndex + 1)) : null
    let segment = null
    if (hasSlice && parts.length > sliceIndex + 2) segment = parts[sliceIndex + 1]
    if (!sliced.has(layer) && layers.has(layer) && parts.length > 2) segment = parts[1]
    let role = ['ui', 'model', 'api', 'lib', 'config'].includes(segment) ? segment : null
    for (const [name, patterns] of roles) if (matches(file, patterns)) role = name
    return { root: normalize(root.path), layer, slice, slicePath, segment, role, path: file }
  }
  const resolve = (specifier, from) => {
    const importer = projectPath(from)
    const source = normalize(specifier)
    const resolved = ts.resolveModuleName(source, importer, compilerOptions, ts.sys, resolutionCache).resolvedModule
    if (resolved) {
      const realFile = fs.realpathSync(resolved.resolvedFileName)
      if (realFile.startsWith(`${realCwd}${path.sep}`)) return path.join(cwd, path.relative(realCwd, realFile))
      return realFile
    }
    let candidate
    if (source.startsWith('.')) candidate = path.resolve(path.dirname(importer), source)
    else if (roots.some((root) => source.startsWith(`${normalize(root.path)}/`))) candidate = absolute(cwd, source)
    if (!candidate) return null
    return (
      [
        candidate,
        ...extensions.map((extension) => `${candidate}${extension}`),
        ...extensions.map((extension) => path.join(candidate, `index${extension}`)),
      ].find((file) => fs.existsSync(file) && fs.statSync(file).isFile()) || null
    )
  }
  const isInternal = (specifier) => {
    const source = normalize(specifier)
    if (source.startsWith('.') || path.isAbsolute(source)) return true
    if (roots.some((root) => source.startsWith(`${normalize(root.path)}/`))) return true
    return Object.keys(compilerOptions.paths || {}).some((alias) => {
      const star = alias.indexOf('*')
      if (star < 0) return source === alias
      return source.startsWith(alias.slice(0, star)) && source.endsWith(alias.slice(star + 1))
    })
  }
  return { classify, resolve, matches, relative, isInternal }
}

module.exports = { createProject }
