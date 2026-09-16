const rules = require('./rules')
const { contracts } = require('./rules/lib/interaction-contracts')

module.exports = {
  rules,
  /** WAI-ARIA pattern contracts with keyboard·role·CSS guidance - read before implementing, cited by the interaction rules. */
  contracts,
}
