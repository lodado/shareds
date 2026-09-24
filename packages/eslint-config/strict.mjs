import fs from 'node:fs'
import path from 'node:path'
import localPlugin from '@lodado/eslint-plugin-local-rules'
import ymne from 'eslint-plugin-react-you-might-not-need-an-effect'
import query from './query.js'
import react, { EFFECT_STATE_DUPLICATES } from './react.mjs'
import strictTypes from './strict-types.js'

const boundaryRules = ['strict-ui-boundary', 'fsd-strict-boundaries'].map((name) => `@lodado/local-rules/${name}`)
// fsd-strict-boundaries owns direction, public API and segments inside the roots; the fsd preset steps aside.
const fsdHeuristics = ['fsd-layer-direction', 'fsd-no-banned-segments', 'fsd-no-deep-import'].map((name) => `@lodado/local-rules/${name}`)
const hooks = ['rules-of-hooks', 'exhaustive-deps', 'set-state-in-effect', 'set-state-in-render', 'purity', 'immutability', 'refs', 'static-components']
const resources = ['event-listener', 'fetch', 'intersection-observer', 'interval', 'resize-observer', 'timeout']
const typedRules = ['no-floating-promises', 'no-misused-promises', 'no-explicit-any', 'no-unsafe-assignment', 'no-unsafe-argument', 'no-unsafe-call', 'no-unsafe-member-access', 'no-unsafe-return']
// React Hooks owns state updates inside effects; avoid reporting the same effect twice.
const ymneRules = Object.keys(ymne.configs.strict.rules || {}).filter((name) => !EFFECT_STATE_DUPLICATES.includes(name.split('/')[1]))

function validate(options) {
  if (!options || !path.isAbsolute(options.cwd || '') || !path.isAbsolute(options.tsconfig || '')) throw new TypeError('strict requires absolute cwd and tsconfig paths')
  if (!Array.isArray(options.roots) || !options.roots.length || !Array.isArray(options.rendering) || !options.rendering.length) throw new TypeError('strict requires nonempty roots and rendering globs')
  for (const root of options.roots) {
    if (!root.path || path.isAbsolute(root.path) || root.path.split(/[\\/]/u).includes('..') || /[*?{}]/u.test(root.path)) throw new TypeError('strict roots must be literal cwd-relative directories')
  }
  for (const key of ['rendering', 'viewHooks', 'sharedRuntime', 'server', 'test']) {
    for (const pattern of options[key] || []) {
      if (typeof pattern !== 'string' || !pattern || pattern.startsWith('!') || !options.roots.some((root) => pattern.startsWith(`${root.path}/`))) throw new TypeError(`${key} must stay inside a declared root`)
    }
    if (['viewHooks', 'sharedRuntime', 'server'].includes(key) && options[key]?.length && !options.reasons?.[key]?.trim()) throw new TypeError(`${key} needs a central approval reason`)
  }
  for (const entry of options.reactAllow || []) {
    if (!entry.reason?.trim() || !entry.files?.length || !entry.exports?.length || entry.exports.includes('*')) throw new TypeError('React exceptions require exact exports, narrow files and a reason')
  }
  for (const entry of [...(options.crossImports || []), ...(options.publicEntries || [])]) {
    if (!entry.reason?.trim()) throw new TypeError('Additional public/cross-import entries need an approval reason')
  }
  for (const entry of options.modules || []) {
    if (!entry.source || !entry.exports?.length || !['query', 'store', 'orchestration', 'transport', 'database'].includes(entry.kind)) throw new TypeError('Runtime module contracts require source, exports and a supported kind')
  }
}

/** Opt-in project policy, composed after base. Does not replace no-restricted-* options. */
export default function strictProfile(options) {
  validate(options)
  const files = options.roots.map((root) => `${root.path}/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}`)
  const typed = options.roots.map((root) => `${root.path}/**/*.{ts,tsx,mts,cts}`)
  const scope = (config) => ({ ...config, files })
  return [
    ...react.map(scope),
    ...query.map((config) => ({ ...scope(config), rules: Object.fromEntries(Object.entries(config.rules || {}).map(([name, value]) => [name, Array.isArray(value) ? ['error', ...value.slice(1)] : 'error'])) })),
    ...strictTypes.map((config) => ({ ...config, files: typed, languageOptions: { ...config.languageOptions, parserOptions: { ...config.languageOptions?.parserOptions, project: options.tsconfig, tsconfigRootDir: options.cwd } } })),
    { name: 'lodado/strict-effect-discipline', files, plugins: ymne.configs.strict.plugins, rules: Object.fromEntries(ymneRules.map((name) => [name, 'error'])) },
    {
      name: 'lodado/strict-boundaries',
      files,
      plugins: { '@lodado/local-rules': localPlugin },
      linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
      rules: {
        ...Object.fromEntries(boundaryRules.map((name) => [name, ['error', options]])),
        ...Object.fromEntries(fsdHeuristics.map((name) => [name, 'off'])),
        ...Object.fromEntries(hooks.map((name) => [`react-hooks/${name}`, 'error'])),
        ...Object.fromEntries(resources.map((name) => [`@eslint-react/web-api-no-leaked-${name}`, 'error'])),
        'no-empty': ['error', { allowEmptyCatch: false }],
      },
    },
    { name: 'lodado/strict-types-explicit', files: typed, rules: { 'ts/no-explicit-any': 'error' } },
  ]
}

/** Check configuration coverage before lint, including untracked files and later overrides. */
export async function verifyStrictProject(eslint, options) {
  validate(options)
  const files = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.name === 'node_modules' || entry.name === '.git') throw new Error(`Strict root contains an excluded directory: ${filename}`)
      if (entry.isSymbolicLink()) throw new Error(`Strict roots must not contain unchecked symlinks: ${filename}`)
      if (entry.isDirectory()) visit(filename)
      else if (/\.(?:[cm]?[jt]s|[jt]sx)$/u.test(entry.name)) files.push(filename)
    }
  }
  for (const root of options.roots) visit(path.resolve(options.cwd, root.path))
  if (!files.length) throw new Error('Strict roots contain zero source files')
  for (const glob of options.rendering) {
    if (!files.some((file) => path.matchesGlob(path.relative(options.cwd, file).replaceAll('\\', '/'), glob))) throw new Error(`Rendering glob matched zero files: ${glob}`)
  }
  const expected = strictProfile(options)
  for (const file of files) {
    if (await eslint.isPathIgnored(file)) throw new Error(`Strict source is ignored: ${file}`)
    const config = await eslint.calculateConfigForFile(file)
    if (!config?.linterOptions?.noInlineConfig) throw new Error(`Strict inline config protection missing: ${file}`)
    const required = [...boundaryRules, ...hooks.map((name) => `react-hooks/${name}`), ...resources.map((name) => `@eslint-react/web-api-no-leaked-${name}`), ...ymneRules, 'no-empty']
    if (/\.[cm]?tsx?$/u.test(file)) required.push(...typedRules.map((name) => `ts/${name}`))
    for (const entry of expected) {
      for (const name of Object.keys(entry.rules || {})) if (name.startsWith('@tanstack/query/')) required.push(name)
    }
    for (const name of required) if (config.rules?.[name]?.[0] !== 2) throw new Error(`Strict rule weakened: ${name} in ${file}`)
    for (const name of fsdHeuristics) if (config.rules?.[name]?.[0]) throw new Error(`Spread the fsd preset before strict: ${name} would report a strict defect twice in ${file}`)
    for (const name of boundaryRules) {
      if (JSON.stringify(config.rules[name][1]) !== JSON.stringify(options)) throw new Error(`Strict boundary options changed: ${name} in ${file}`)
    }
    if (/\.[cm]?tsx?$/u.test(file) && config.rules['ts/no-floating-promises']?.[1]?.ignoreVoid !== false) throw new Error(`Strict Promise handling weakened: ${file}`)
    if (JSON.stringify(config.rules['no-empty']) !== JSON.stringify([2, { allowEmptyCatch: false }])) throw new Error(`Strict empty-catch handling weakened: ${file}`)
  }
  return files
}
