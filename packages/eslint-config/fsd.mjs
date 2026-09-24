/**
 * FSD boundary preset (flat) - opt-in for repos that adopted Feature-Sliced Design.
 * These rules ship `recommended: false` in the plugin because they are wrong for non-FSD
 * repos; extending this preset is the deliberate opt-in.
 *
 * The default export reads layers from folder names (relative, `@/`, `~/` and `src/` imports).
 * `fsdBoundaries(options)` adds the tsconfig-resolved contract for repos that can name their
 * roots: aliases, missing public entries, unclassified files and approved `@x` entries.
 */
import path from 'node:path'
import localRulesPlugin from '@lodado/eslint-plugin-local-rules'
import { CODE_FILES } from './code-files.js'

const plugins = { '@lodado/local-rules': localRulesPlugin }
const isLiteralRoot = (root) =>
  Boolean(root.path) && !path.isAbsolute(root.path) && !root.path.split(/[\\/]/u).includes('..') && !/[*?{}]/u.test(root.path)

export default [
  {
    name: 'lodado/fsd',
    files: CODE_FILES,
    plugins,
    rules: {
      '@lodado/local-rules/fsd-layer-direction': 'error',
      '@lodado/local-rules/fsd-no-banned-segments': 'error',
      '@lodado/local-rules/fsd-no-deep-import': 'error',
      '@lodado/local-rules/fsd-no-driver-outside-repository': 'error',
    },
  },
  {
    name: 'lodado/fsd-config',
    files: CODE_FILES,
    ignores: ['**/shared/config/**', '**/*.config.*', '**/scripts/**', '**/*.{test,spec}.*', '**/{e2e,playwright}/**'],
    // Environment reads belong to the shared/config segment; everything else receives typed config.
    rules: { 'node/no-process-env': 'error' },
  },
]

/**
 * fsd-strict-boundaries over the given roots, without the runtime policy of `strict(policy)`.
 * Spread it after the default export; inside the roots it owns direction, public API and
 * segments, so the folder-name rules step aside there.
 */
export function fsdBoundaries(options) {
  if (!options || !path.isAbsolute(options.cwd || '') || !path.isAbsolute(options.tsconfig || ''))
    throw new TypeError('fsdBoundaries requires absolute cwd and tsconfig paths')
  if (!Array.isArray(options.roots) || !options.roots.length) throw new TypeError('fsdBoundaries requires nonempty roots')
  if (!options.roots.every(isLiteralRoot)) throw new TypeError('fsdBoundaries roots must be literal cwd-relative directories')
  return [
    {
      name: 'lodado/fsd-boundaries',
      files: options.roots.map((root) => `${root.path}/**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}`),
      plugins,
      rules: {
        '@lodado/local-rules/fsd-strict-boundaries': ['error', options],
        '@lodado/local-rules/fsd-layer-direction': 'off',
        '@lodado/local-rules/fsd-no-banned-segments': 'off',
        '@lodado/local-rules/fsd-no-deep-import': 'off',
      },
    },
  ]
}
