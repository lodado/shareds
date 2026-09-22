import base from '@lodado/eslint-config'
import strict from '@lodado/eslint-config/strict'
import policy from './strict-policy.mjs'

export default [...base, ...strict(policy)]
