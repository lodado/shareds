/** Self-lint: the package dogfoods its own base + local rules. */
module.exports = [{ ignores: ['strict-types-fixture/**'] }, ...require('./index.js'), ...require('./local-rules.js')]
