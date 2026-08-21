/**
 * Base preset (flat): TypeScript parsing, import sorting, prettier conflict removal.
 * Framework-specific rules live in the sibling presets (react/next/a11y/turbo/local-rules).
 */
const js = require('@eslint/js')
const prettier = require('eslint-config-prettier')
const importPlugin = require('eslint-plugin-import')
const simpleImportSort = require('eslint-plugin-simple-import-sort')
const globals = require('globals')
const tseslint = require('typescript-eslint')

module.exports = [
  js.configs.recommended,
  {
    name: 'lodado/base',
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      import: importPlugin,
      'simple-import-sort': simpleImportSort,
    },
    settings: {
      'import/resolver': {
        node: {
          extensions: ['.js', '.jsx', '.ts', '.tsx'],
          moduleDirectory: ['src', 'node_modules'],
          project: ['**/tsconfig.json'],
        },
      },
    },
    rules: {
      'no-underscore-dangle': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],

      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      'import/extensions': 'off',
      'import/prefer-default-export': 'off',
      'import/no-extraneous-dependencies': [
        'warn',
        {
          devDependencies: false,
          includeInternal: false,
          includeTypes: false,
        },
      ],
    },
  },
  prettier,
]
