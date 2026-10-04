// Closed verification identities. Legacy is compatibility metadata, never a selectable profile.
import { markdownLines, sectionLines } from './oracle-space.mjs'

const CONTROLLERS = Object.freeze({
  'contract/v1': 'frontend-contract-design',
  'formal-bend/v1': 'frontend-oracle-design',
})

function fail(code, message) {
  throw Object.assign(new Error(message), { code })
}

function checkedProfile(profile) {
  if (typeof profile !== 'string' || !Object.hasOwn(CONTROLLERS, profile)) fail('PROFILE_UNKNOWN', `Unknown verification profile: ${String(profile)}`)
  return profile
}

export function profileForController(controller) {
  for (const [profile, name] of Object.entries(CONTROLLERS)) {
    if (controller === name || controller === `frontend-oracle-design:${name}`) return profile
  }
  return fail('PROFILE_CONTROLLER_UNKNOWN', `Unknown verification controller: ${String(controller)}`)
}

export function readCardProfile(cardText) {
  const lines = markdownLines(cardText)
  const sections = lines.filter((line) => line.trim() === '## Verification Profile')
  if (sections.length === 0) return null
  if (sections.length > 1) fail('PROFILE_DUPLICATE', 'Verification Profile section must be unique')
  const entries = sectionLines(lines.map((line) => line.trim()), 'Verification Profile')
    .filter((line) => line.startsWith('- Profile:'))
  if (entries.length > 1) fail('PROFILE_DUPLICATE', 'Profile entry must be unique')
  if (entries.length === 0) fail('PROFILE_REQUIRED', 'Verification Profile requires a Profile entry')
  return checkedProfile(entries[0].slice('- Profile:'.length).trim())
}

export function resolveProfileBinding({ requestedProfile, bindings = [] } = {}) {
  if (requestedProfile !== undefined) checkedProfile(requestedProfile)
  for (const { profile } of bindings) if (profile != null) checkedProfile(profile)
  const profile = requestedProfile ?? bindings.find((binding) => binding.profile != null)?.profile
  if (profile === undefined) {
    if (bindings.length === 0) fail('PROFILE_REQUIRED', 'Select a verification controller before authoring')
    return { kind: 'legacy', profile: null, controller: null }
  }
  if (bindings.some((binding) => binding.profile !== profile)) fail('PROFILE_MISMATCH', 'All artifacts and the requested profile must agree')
  return { kind: 'explicit', profile, controller: CONTROLLERS[profile] }
}
