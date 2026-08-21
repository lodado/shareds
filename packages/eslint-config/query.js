/**
 * TanStack Query preset (flat): query keys carry every input that changes the result,
 * and a server QueryClient is never shared between requests.
 */
const query = require('@tanstack/eslint-plugin-query')

module.exports = [...query.configs['flat/recommended']]
