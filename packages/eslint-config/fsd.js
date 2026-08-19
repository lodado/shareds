/**
 * FSD boundary preset - opt-in for repos that adopted Feature-Sliced Design.
 * These rules ship `recommended: false` in local-rules.js because they are wrong
 * for non-FSD repos; extending this preset is the deliberate opt-in.
 */
module.exports = {
  plugins: ['@lodado/local-rules'],
  rules: {
    '@lodado/local-rules/fsd-no-banned-segments': 'error',
    '@lodado/local-rules/fsd-no-deep-import': 'error',
    '@lodado/local-rules/fsd-no-driver-outside-repository': 'error',
  },
}
