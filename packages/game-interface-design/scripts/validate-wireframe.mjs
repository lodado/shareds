#!/usr/bin/env node
// Consistency checks for a wireframe report; it cannot confirm that commands really ran.
import { readFileSync, realpathSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import Ajv from 'ajv/dist/2020.js'

const SCHEMA = new URL('../skills/threejs-game-wireframe/schemas/wireframe-report.schema.json', import.meta.url)
const ECS_FOR_LEVEL = { LAYOUT_ONLY: 'n/a', FLOW_PROTOTYPE: 'optional', PLAYABLE_GREYBOX: 'required' }
const NEEDS_INSTALL = ['typecheck', 'fsd', 'build', 'browser']
const HUMAN = ['device', 'usability', 'fun', 'business']
const RAN = new Set(['PASS', 'FAIL'])

function levelErrors({ level, ecs, simulated, checks }) {
  const errors = ecs === ECS_FOR_LEVEL[level] ? [] : [`${level} requires ecs "${ECS_FOR_LEVEL[level]}"`]
  if (level === 'PLAYABLE_GREYBOX' && checks.headless.status === 'N/A')
    errors.push('playable greybox needs headless rule tests')
  if (level === 'PLAYABLE_GREYBOX' && simulated.length > 0) errors.push('playable greybox cannot simulate its rules')
  if (level === 'LAYOUT_ONLY' && RAN.has(checks.headless.status))
    errors.push('layout-only has no rules to test headlessly')
  return errors
}

function checkErrors(checks) {
  const errors = []
  for (const [name, check] of Object.entries(checks)) {
    if (RAN.has(check.status) && !check.command && !HUMAN.includes(name))
      errors.push(`${name} ${check.status} needs the command`)
    if ((check.status === 'NOT_RUN' || check.status === 'BLOCKED') && !check.reason)
      errors.push(`${name} ${check.status} needs a reason`)
  }
  return errors
}

function dependencyErrors(checks) {
  const unobserved = HUMAN.filter((name) => RAN.has(checks[name].status) && !checks[name].evidence)
  const errors = unobserved.map((name) => `${name} needs an observation reference`)
  if (checks.install.status === 'PASS') return errors
  const impossible = NEEDS_INSTALL.filter((name) => RAN.has(checks[name].status))
  return [...errors, ...impossible.map((name) => `${name} cannot have run without a successful install`)]
}

function readinessErrors({ ready_to_run: ready, level, checks }) {
  if (!ready) return []
  const required = ['install', 'typecheck', 'build', 'browser', ...(level === 'LAYOUT_ONLY' ? [] : ['headless'])]
  const missing = required.filter((name) => checks[name].status !== 'PASS')
  return missing.length > 0 ? [`ready_to_run needs PASS for ${missing.join(', ')}`] : []
}

export function validateWireframeReport(report) {
  const ajv = new Ajv({ strict: false, allErrors: true })
  const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA, 'utf8')))
  if (!validate(report)) return validate.errors.map((e) => `schema${e.instancePath}: ${e.message}`)
  return [
    ...levelErrors(report),
    ...checkErrors(report.checks),
    ...dependencyErrors(report.checks),
    ...readinessErrors(report),
  ]
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: validate-wireframe.mjs <wireframe-report.json>')
    process.exitCode = 2
  } else {
    const errors = validateWireframeReport(JSON.parse(readFileSync(file, 'utf8')))
    for (const e of errors) console.log('FAIL:', e)
    process.exitCode = errors.length > 0 ? 1 : 0
    if (errors.length === 0)
      console.log(
        'PASS: level, ECS duty, check statuses and readiness are consistent. Truth of each run is not checked.',
      )
  }
}
