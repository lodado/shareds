import base from './index.mjs'
import localRules from './local-rules.js'

/** Self-lint: package dogfoods its own base + local rules. */
export default [{ ignores: ['strict-types-fixture/**'] }, ...base, ...localRules]
