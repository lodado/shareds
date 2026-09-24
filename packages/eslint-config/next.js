/**
 * Next.js preset (flat): @next/eslint-plugin-next core-web-vitals only. React, hooks and
 * a11y rules come from the sibling presets, so this preset does not depend on
 * eslint-config-next and its ESLint-9-only copies of eslint-plugin-react and jsx-a11y.
 */
const next = require('@next/eslint-plugin-next')
const { CODE_FILES, forCode } = require('./code-files')

module.exports = [
  forCode(next.configs['core-web-vitals']),
  {
    name: 'lodado/next',
    files: CODE_FILES,
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
      // Certain defects, not judgement calls.
      '@next/next/no-async-client-component': 'error',
      '@next/next/no-typos': 'error',
    },
  },
]
