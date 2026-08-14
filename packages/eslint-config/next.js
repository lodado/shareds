/** Next.js preset. Requires eslint-config-next in the consuming project. */
module.exports = {
  extends: ['next'],
  rules: {
    '@next/next/no-html-link-for-pages': 'off',
  },
}
