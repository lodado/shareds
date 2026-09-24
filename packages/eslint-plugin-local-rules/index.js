const rules = require('./rules')
const { contracts } = require('./rules/lib/interaction-contracts')
const { OWNERS, OWNER_API, TRANSPORT } = require('./rules/lib/runtime-modules')

module.exports = {
  rules,
  /** WAI-ARIA pattern contracts with keyboard·role·CSS guidance - read before implementing, cited by the interaction rules. */
  contracts,
  /** State-owner and transport packages the ownership rules and the hook-tiers preset share. */
  runtimeModules: { OWNERS, OWNER_API, TRANSPORT },
}
