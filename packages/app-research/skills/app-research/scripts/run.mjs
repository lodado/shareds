import { randomBytes } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { blockedGates, FILES, loadRun, MODES, PLATFORMS, SCOPES, usedActions } from './state.mjs'
import { writeJson } from './store.mjs'

const LIMITS = { maxVisitsPerScreen: 6, maxRepeatPerAction: 2, maxAnchors: 5 }

const oneOf = (name, value, allowed) => {
  if (!allowed.includes(value))
    throw new Error(`--${name} must be one of ${allowed.join(', ')} (got ${value ?? 'nothing'})`)
  return value
}

const bounded = (name, value, fallback, max) => {
  const number = value === undefined ? fallback : Number(value)
  if (!Number.isInteger(number) || number < 1 || number > max)
    throw new Error(`--${name} must be an integer from 1 to ${max}`)
  return number
}

const slug = (text) =>
  String(text)
    .toLowerCase()
    .replaceAll(/[^\da-z]+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 48) || 'app'

export async function initRun(input, now = new Date()) {
  if (!input.target) throw new Error('--target is required (app URL or package id)')
  const platform = oneOf('platform', input.platform, PLATFORMS)
  const scope = oneOf('scope', input.scope ?? 'all', SCOPES)
  const mode = oneOf('mode', input.mode ?? 'interactive', MODES)
  const testSession = oneOf('test-session', input['test-session'] ?? 'none', ['none', 'human-prepared'])
  if (scope === 'custom' && !input['scope-note'])
    throw new Error('--scope custom needs --scope-note describing the scope')
  const runId = `${now
    .toISOString()
    .replaceAll(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')}-${randomBytes(2).toString('hex')}`
  const app = slug(input.app ?? input.target)
  const dir = resolve(input['output-dir'] ?? 'research', app, runId)
  await mkdir(join(dir, 'screenshots'), { recursive: true })
  await mkdir(join(dir, 'snapshots'))
  // Screens and accessibility trees can contain personal data; keep them out of version control by default.
  await writeFile(join(dir, '.gitignore'), 'screenshots/\nsnapshots/\n')
  const run = {
    schemaVersion: 1,
    runId,
    app,
    target: input.target,
    targetVersion: input['target-version'] ?? 'unknown',
    platform,
    scope,
    scopeNote: input['scope-note'] ?? null,
    mode,
    locale: input.locale ?? 'en-US',
    // Credentials never enter a run; the human prepares the session and the gate blocks credential entry.
    testSession,
    maxActions: bounded('max-actions', input['max-actions'], 60, 500),
    maxDepth: bounded('max-depth', input['max-depth'], 4, 10),
    ...LIMITS,
    createdAt: now.toISOString(),
  }
  await writeJson(join(dir, FILES.run), run)
  await writeJson(join(dir, FILES.screens), { screens: [] })
  await writeJson(join(dir, FILES.transitions), { transitions: [] })
  return { runDir: dir, run }
}

export async function status(runDir) {
  const state = await loadRun(runDir)
  const blocked = blockedGates(state)
  return {
    runId: state.run.runId,
    target: state.run.target,
    mode: state.run.mode,
    budget: { used: usedActions(state), max: state.run.maxActions },
    observations: state.observations.length,
    screens: state.screens.length,
    transitions: state.transitions.length,
    blocked: blocked.length,
    humanActionsPending: blocked.filter((gate) => gate.humanAction).length,
  }
}
