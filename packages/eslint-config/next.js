/**
 * Next.js preset (flat). eslint-config-next requires the `next` package itself.
 *
 * eslint-config-next ships its own interop-wrapped references for plugins the
 * sibling presets also provide (react, react-hooks, jsx-a11y, import,
 * @typescript-eslint). Flat config rejects two different objects under one
 * plugin key, so every shared plugin is swapped for the same raw module the
 * other presets use.
 */
const next = require('eslint-config-next')

const canonical = {
  react: require('eslint-plugin-react'),
  'react-hooks': require('eslint-plugin-react-hooks'),
  'jsx-a11y': require('eslint-plugin-jsx-a11y'),
  import: require('eslint-plugin-import'),
  '@typescript-eslint': require('typescript-eslint').plugin,
}

const normalize = (config) =>
  config.plugins
    ? {
        ...config,
        plugins: Object.fromEntries(
          Object.entries(config.plugins).map(([name, plugin]) => [name, canonical[name] ?? plugin]),
        ),
      }
    : config

module.exports = [
  ...next.map(normalize),
  {
    name: 'lodado/next',
    rules: {
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
]
