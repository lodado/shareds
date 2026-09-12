import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
// eslint-disable-next-line test/no-import-node-test -- standalone package contract checks.
import test from 'node:test'

// Reuse Ajv 8 already installed through the root commitlint toolchain.
const cliRequire = createRequire(import.meta.resolve('@commitlint/cli'))
const loadRequire = createRequire(cliRequire.resolve('@commitlint/load'))
const validatorRequire = createRequire(loadRequire.resolve('@commitlint/config-validator'))
const Ajv = validatorRequire('ajv/dist/2020.js')
const ajv = new Ajv({ strict: false, allErrors: true })
ajv.addFormat('uri', (value) => URL.canParse(value))
const schemaRoot = new URL('../skills/reference-driven-figma-design/references/schemas/', import.meta.url)
const requestSchema = JSON.parse(await readFile(new URL('design-request.schema.json', schemaRoot)))
const deliverySchema = JSON.parse(await readFile(new URL('design-delivery.schema.json', schemaRoot)))
const validateDelivery = ajv.compile(deliverySchema)

function delivery() {
  return {
    schema_version: '1.0',
    request_id: 'settings-error',
    status: 'FIGMA_READY',
    figma: {
      url: 'https://www.figma.com/design/TestFile/Settings',
      file_key: 'TestFile',
      page_ids: ['1:1'],
      frame_ids: ['1:2'],
      editable: true,
      code_generated: false,
    },
    scope: {
      pilot_sections: ['Error state'],
      completed_sections: ['Error state'],
      responsive_frames: ['1:2'],
      states: ['error'],
    },
    source_trace: { base_template: null, internal_assets_used: ['Error/Approved'], references: [] },
    critique: {
      iteration_count: 1,
      rounds: [
        {
          version: 'V1',
          inspected_frames: ['1:2'],
          top_issues: ['Error copy hierarchy'],
          fixes: ['Use existing error variant'],
          preserved: ['Brand tokens'],
          result: 'No remaining issues',
        },
      ],
      ai_slop_findings: [],
      unresolved: [],
    },
    asset_library: { catalog_location: null, entries: [] },
    verification: {
      figma_read: true,
      figma_write: true,
      structure_inspected: true,
      preview_inspected: true,
      design_self_review: 'ready',
      user_acceptance: 'not-obtained',
      unreviewed: [],
    },
    handoff: { summary: 'One scoped state verified; reused existing assets', next_action: 'User review' },
  }
}

test('request accepts a scoped one-section pilot without inventing extra scope', () => {
  const validate = ajv.compile(requestSchema.properties.scope)
  assert.ok(
    validate({
      pilot_sections: ['Error state'],
      full_sections: ['Error state'],
      responsive_frames: [{ name: 'Desktop', width: 1280 }],
      states: ['error'],
    }),
    JSON.stringify(validate.errors),
  )
})

test('ready delivery accepts a small reviewed change and more than four genuine rounds', () => {
  const result = delivery()
  assert.ok(validateDelivery(result), JSON.stringify(validateDelivery.errors))
  result.critique.rounds = Array.from({ length: 5 }, (_, index) => ({
    ...result.critique.rounds[0],
    version: `V${index + 1}`,
  }))
  result.critique.iteration_count = 5
  assert.ok(validateDelivery(result), JSON.stringify(validateDelivery.errors))
  result.critique.rounds[4].top_issues = []
  result.critique.rounds[4].fixes = []
  result.critique.rounds[4].result = 'Rechecked hierarchy and error state; no further change needed'
  assert.ok(validateDelivery(result), JSON.stringify(validateDelivery.errors))
})

test('ready delivery rejects absent scope, unresolved work, fake URLs, and missing preview', () => {
  const invalidChanges = [
    (value) => {
      value.scope.completed_sections = []
    },
    (value) => {
      value.scope.pilot_sections = []
    },
    (value) => {
      value.scope.responsive_frames = []
    },
    (value) => {
      value.critique.unresolved = ['Required mobile frame missing']
    },
    (value) => {
      value.verification.unreviewed = ['Required error state']
    },
    (value) => {
      value.figma.url = 'https://example.com/not-figma'
    },
    (value) => {
      value.figma.url = 'https://www.figma.com.evil.test/design/TestFile'
    },
    (value) => {
      value.verification.preview_inspected = false
    },
    (value) => {
      value.figma.editable = false
    },
    (value) => {
      value.critique.rounds = []
      value.critique.iteration_count = 0
    },
  ]
  for (const change of invalidChanges) {
    const result = delivery()
    // Use two rounds so the original count gate cannot mask the invalid field.
    result.critique.rounds.push({ ...result.critique.rounds[0], version: 'V2' })
    result.critique.iteration_count = 2
    change(result)
    assert.equal(validateDelivery(result), false, change.toString())
  }
})

test('blocked delivery permits unknown Figma identifiers and no completed frames', () => {
  const result = delivery()
  result.status = 'BLOCKED'
  result.figma = { url: null, file_key: null, page_ids: [], frame_ids: [], editable: false, code_generated: false }
  result.scope = { pilot_sections: [], completed_sections: [], responsive_frames: [], states: [] }
  result.critique = { iteration_count: 0, rounds: [], ai_slop_findings: [], unresolved: ['Write unavailable'] }
  result.verification = {
    figma_read: false,
    figma_write: false,
    structure_inspected: false,
    preview_inspected: false,
    design_self_review: 'unreviewed',
    user_acceptance: 'not-obtained',
    unreviewed: ['All frames'],
  }
  assert.ok(validateDelivery(result), JSON.stringify(validateDelivery.errors))
  result.status = 'PILOT_READY'
  assert.equal(validateDelivery(result), false, 'An uninspected, empty pilot is not ready')
  const pilot = delivery()
  pilot.status = 'PILOT_READY'
  pilot.verification.design_self_review = 'incomplete'
  pilot.verification.unreviewed = ['Remaining full-page sections']
  assert.ok(validateDelivery(pilot), JSON.stringify(validateDelivery.errors))
})
