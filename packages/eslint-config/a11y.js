/**
 * Accessibility preset (flat): jsx-a11y-x strict. The es-tooling fork ships the same
 * rules as eslint-plugin-jsx-a11y under the `jsx-a11y-x/` id and supports ESLint 10.
 */
const jsxA11y = require('eslint-plugin-jsx-a11y-x').default

module.exports = [jsxA11y.configs.strict]
