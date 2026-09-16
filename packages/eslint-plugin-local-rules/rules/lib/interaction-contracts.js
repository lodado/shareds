/**
 * Loads contracts/*.json once and turns a pattern's guidance into the one-line hint the two
 * interaction rules append to their messages. The JSON is the single source for both the lint
 * message and the pre-implementation guidance the design skills read.
 */
const { readdirSync, readFileSync } = require('node:fs')
const { join } = require('node:path')

const CONTRACTS_DIRECTORY = join(__dirname, '..', '..', 'contracts')

const contracts = Object.fromEntries(
  readdirSync(CONTRACTS_DIRECTORY)
    .filter((name) => name.endsWith('.json'))
    .map((name) => {
      const contract = JSON.parse(readFileSync(join(CONTRACTS_DIRECTORY, name), 'utf8'))
      return [contract.pattern, contract]
    }),
)

/** `Escape: 닫기 · ArrowDown: …` - the keys column of a pattern, for a lint message. */
const keyHint = (pattern) => {
  const keys = contracts[pattern]?.guidance?.keys ?? []
  return keys.map(({ key, do: action }) => `${key}: ${action}`).join(' · ')
}

const stepGuidance = (pattern, stepId) => contracts[pattern]?.steps?.find((step) => step.id === stepId)?.guidance ?? ''

module.exports = { contracts, keyHint, stepGuidance }
