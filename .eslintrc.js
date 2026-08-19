module.exports = {
  root: true,
  extends: ['./packages/eslint-config/index.js', './packages/eslint-config/local-rules.js'],
  ignorePatterns: ['node_modules', 'dist'],
}
