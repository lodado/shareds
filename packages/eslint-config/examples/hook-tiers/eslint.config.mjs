import base from '@lodado/eslint-config'
import a11y from '@lodado/eslint-config/a11y'
import hookTiers from '@lodado/eslint-config/hook-tiers'
import localRules from '@lodado/eslint-config/local-rules'
import react from '@lodado/eslint-config/react'

export default [...base, ...react, ...a11y, ...localRules, ...hookTiers]
