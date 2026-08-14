/**
 * TanStack Query preset: query keys carry every input that changes the result,
 * and the server QueryClient is never shared between requests.
 */
module.exports = {
  extends: ['plugin:@tanstack/query/recommended'],
}
