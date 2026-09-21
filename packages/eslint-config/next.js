/**
 * Next.js preset (flat): @next/eslint-plugin-next core-web-vitals only. React, hooks and
 * a11y rules come from the sibling presets, so this preset does not depend on
 * eslint-config-next and its ESLint-9-only copies of eslint-plugin-react and jsx-a11y.
 */
const next = require('@next/eslint-plugin-next')

module.exports = [
  next.configs['core-web-vitals'],
  {
    name: 'lodado/next',
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
]
