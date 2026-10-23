// Script registry: what a script is, which ones may run for an item stage, and how a stored prompt
// is rendered. Pure functions only — reading registry/<id>/ from disk belongs to the worker.

import type { Stage } from '../machine/machine.ts'
import type { RunEvent } from '../run/run.ts'
import { isStage } from '../machine/machine.ts'

export type FieldSpec =
  | { kind: 'string' }
  | { kind: 'number' }
  | { kind: 'boolean' }
  | { kind: 'enum'; values: readonly string[] }

export type ModelTier = 'haiku' | 'sonnet' | 'opus'

export interface ScriptDef {
  id: string
  allowedStages: readonly Stage[]
  model: ModelTier
  tools: readonly string[]
  maxTurns: number
  maxCostUsd: number
  input: Readonly<Record<string, FieldSpec>>
  outputRequired: readonly string[]
}

export type StartEvent = Extract<RunEvent, { type: 'start' }>

const MODEL_TIERS: Record<ModelTier, true> = { haiku: true, sonnet: true, opus: true }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isModelTier = (value: unknown): value is ModelTier =>
  typeof value === 'string' && Object.hasOwn(MODEL_TIERS, value)

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const SCRIPT_KEYS: ReadonlySet<string> = new Set([
  'id',
  'allowedStages',
  'model',
  'tools',
  'maxTurns',
  'maxCostUsd',
  'input',
  'output',
])
const OUTPUT_KEYS: ReadonlySet<string> = new Set(['required'])

// A key nobody reads would be silently ignored, so a typo like `maxTurn` or a limit meant for a later version
// must fail loudly instead.
function assertKnownKeys(label: string, record: Record<string, unknown>, known: ReadonlySet<string>): void {
  const extra = Object.keys(record).find((key) => !known.has(key))
  if (extra !== undefined) throw new Error(`${label}: unknown field ${JSON.stringify(extra)}`)
}

function parseFieldSpec(name: string, raw: unknown): FieldSpec {
  if (raw === 'string' || raw === 'number' || raw === 'boolean') return { kind: raw }
  if (typeof raw === 'string' && raw.startsWith('enum:')) {
    const values = raw.slice('enum:'.length).split(',')
    if (values.includes('')) throw new Error(`input "${name}": empty enum value`)
    return { kind: 'enum', values }
  }
  throw new Error(`input "${name}": unknown field spec ${JSON.stringify(raw)}`)
}

export function parseScriptDef(raw: unknown): ScriptDef {
  if (!isRecord(raw)) throw new Error('script.json must be an object')
  const { id, allowedStages, model, tools, maxTurns, maxCostUsd, input, output } = raw
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id))
    throw new Error(`invalid script id ${JSON.stringify(id)}`)
  assertKnownKeys(id, raw, SCRIPT_KEYS)
  if (!Array.isArray(allowedStages) || allowedStages.length === 0 || !allowedStages.every(isStage)) {
    throw new Error(`${id}: allowedStages must be a non-empty list of known stages`)
  }
  if (!isModelTier(model)) throw new Error(`${id}: unknown model tier ${JSON.stringify(model)}`)
  if (!isStringArray(tools)) throw new Error(`${id}: tools must be a list of strings`)
  if (typeof maxTurns !== 'number' || !Number.isInteger(maxTurns) || maxTurns <= 0) {
    throw new Error(`${id}: maxTurns must be a positive integer`)
  }
  if (typeof maxCostUsd !== 'number' || !Number.isFinite(maxCostUsd) || maxCostUsd <= 0) {
    throw new Error(`${id}: maxCostUsd must be a positive number`)
  }
  if (!isRecord(input)) throw new Error(`${id}: input must be an object`)
  if (!isRecord(output) || !isStringArray(output.required))
    throw new Error(`${id}: output.required must be a list of strings`)
  assertKnownKeys(`${id} output`, output, OUTPUT_KEYS)
  return {
    id,
    allowedStages,
    model,
    tools,
    maxTurns,
    maxCostUsd,
    input: Object.fromEntries(Object.entries(input).map(([name, spec]) => [name, parseFieldSpec(name, spec)])),
    outputRequired: output.required,
  }
}

export function candidatesFor(defs: readonly ScriptDef[], stage: Stage): ScriptDef[] {
  return defs.filter((def) => def.allowedStages.includes(stage))
}

// A text parameter is one short line without control characters, so a value an agent copied out of a thread cannot
// carry a second paragraph of instructions into the prompt.
const SAFE_TEXT = /^\P{Cc}{1,500}$/u

function matchesField(spec: FieldSpec, value: unknown): boolean {
  switch (spec.kind) {
    case 'string':
      return typeof value === 'string' && SAFE_TEXT.test(value)
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'enum':
      return typeof value === 'string' && spec.values.includes(value)
  }
}

// Exactly the declared fields: a missing or an extra key is invalid, so a selection cannot smuggle data in.
export function validateParams(input: ScriptDef['input'], params: unknown): boolean {
  if (!isRecord(params)) return false
  const declared = Object.entries(input)
  if (Object.keys(params).length !== declared.length) return false
  return declared.every(([name, spec]) => Object.hasOwn(params, name) && matchesField(spec, params[name]))
}

export function validateOutput(def: ScriptDef, output: unknown): boolean {
  return isRecord(output) && def.outputRequired.every((key) => Object.hasOwn(output, key) && output[key] !== undefined)
}

// The four admission checks of POST /runs, as the `start` event the run lifecycle decides on.
// `selection` is whatever the agent produced, so nothing about it is trusted.
export function admit(
  defs: readonly ScriptDef[],
  stage: Stage,
  selection: unknown,
  hasActiveRun: boolean,
): { start: StartEvent; def: ScriptDef | undefined } {
  const scriptId = isRecord(selection) ? selection.scriptId : undefined
  const def = defs.find((candidate) => candidate.id === scriptId)
  return {
    def,
    start: {
      type: 'start',
      registered: def !== undefined,
      allowed: def !== undefined && def.allowedStages.includes(stage),
      valid: def !== undefined && isRecord(selection) && validateParams(def.input, selection.params),
      free: !hasActiveRun,
    },
  }
}

// One pass over the template, so a value that contains `{{...}}` is never expanded again. The thread is
// data: it only ever appears inside the <thread> block, and a closing tag in it is neutralized.
export function renderPrompt(template: string, vars: Readonly<Record<string, string>>, thread: string): string {
  if (thread !== '' && !template.includes('{{thread}}')) {
    throw new Error('the prompt has no {{thread}} placeholder for the thread')
  }
  // Also the spaced and the full-width forms of the closing tag.
  const neutralized = thread.replace(/[<＜]\s*\/\s*thread/gi, (tag) => `<\\${tag.slice(1)}`)
  const block = `<thread>\n${neutralized}\n</thread>`
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    if (name === 'thread') return block
    const value = Object.hasOwn(vars, name) ? vars[name] : undefined
    if (value === undefined) throw new Error(`prompt placeholder {{${name}}} has no value`)
    return value
  })
}
