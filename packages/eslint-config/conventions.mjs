/**
 * Conventions preset (flat) - opt-in. Pins the choices an agent otherwise makes differently on
 * every run: named exports, function declarations at the top level, file-name casing and boolean
 * names. Each rule is already installed with the base; this preset only turns them on, and most
 * of them autofix.
 *
 * Framework files whose name and default export the framework fixes - Next.js route files, the
 * Pages Router, config files and Storybook stories - keep both.
 */
import { CODE_FILES } from './code-files.js'

const DEFAULT_EXPORT_FILES = [
  '**/app/**/{page,layout,template,default,not-found,loading,error,global-error,route,opengraph-image,twitter-image,icon,apple-icon,sitemap,robots,manifest}.{js,jsx,ts,tsx}',
  '**/pages/**/*.{js,jsx,ts,tsx}',
  '**/middleware.{js,ts}',
  '**/instrumentation.{js,ts}',
  '**/*.config.*',
  '**/*.stories.*',
  '**/.storybook/**',
]

export default [
  {
    name: 'lodado/conventions',
    files: CODE_FILES,
    rules: {
      // One name per export makes every symbol greppable and every import identical.
      'import-lite/no-default-export': 'error',
      'antfu/top-level-function': 'error',
      // PascalCase components and camelCase modules; Next.js special files are lowercase already.
      'unicorn/filename-case': ['error', { cases: { camelCase: true, pascalCase: true } }],
      'unicorn/consistent-boolean-name': 'warn',
      'unicorn/prefer-await': 'warn',
    },
  },
  {
    name: 'lodado/conventions/framework-defaults',
    files: DEFAULT_EXPORT_FILES,
    // The framework fixes these names (`not-found.tsx`, `pages/about-us.tsx`) and their default export.
    rules: { 'import-lite/no-default-export': 'off', 'unicorn/filename-case': 'off' },
  },
]
