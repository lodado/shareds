import { constants } from 'node:fs'
import { copyFile, readFile, stat } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fingerprint } from './fingerprint.mjs'
import { assertConsistent, FILES, loadRun, pendingGate, usedActions } from './state.mjs'
import { appendJsonl, pad, withRunLock, writeJson } from './store.mjs'

const RESULTS = ['ok', 'error', 'timeout']
const STATE_KINDS = ['content', 'loading', 'error', 'empty', 'dialog']

async function requireFile(path, flag) {
  const info = await stat(path).catch(() => null)
  if (!info?.isFile()) throw new Error(`${flag} is not a readable file: ${path}`)
}

function requireGate(state, gateId) {
  const gate = state.gates.find((item) => item.gateId === gateId)
  if (!gate) throw new Error(`Unknown gate ${gateId}; run \`gate\` before acting.`)
  if (gate.decision !== 'allow')
    throw new Error(`Gate ${gateId} was blocked (${gate.category}); a blocked action cannot be observed.`)
  if (gate.consumedBy) throw new Error(`Gate ${gateId} was already used by ${gate.consumedBy}.`)
  if (pendingGate(state)?.gateId !== gateId)
    throw new Error(`Gate ${gateId} was superseded by a newer receipt; one action is observed per receipt.`)
  const here = state.observations.at(-1).screenId
  if (gate.screenId !== here)
    throw new Error(
      `Gate ${gateId} was issued on ${gate.screenId} but the run is now on ${here}; gate the action again.`,
    )
  if (usedActions(state) >= state.run.maxActions) throw new Error('Action budget is spent.')
  return gate
}

function checkRequest(state, input) {
  const { run } = state
  if (run.mode !== 'interactive') throw new Error(`Mode ${run.mode} records no device observations.`)
  const anchor = Boolean(input.anchor)
  if (anchor === Boolean(input.gate))
    throw new Error('Pass exactly one of --anchor (first screen or relaunch) or --gate <receipt>.')
  const result = input.result ?? 'ok'
  if (!RESULTS.includes(result)) throw new Error(`--result must be one of ${RESULTS.join(', ')}`)
  if (anchor && result !== 'ok') throw new Error('An anchor records a screen that was reached; use --result ok.')
  if (input['state-kind'] !== undefined && !STATE_KINDS.includes(input['state-kind'])) {
    throw new Error(`--state-kind must be one of ${STATE_KINDS.join(', ')}`)
  }
  if (!input.snapshot) throw new Error('--snapshot <file.json> is required')
  if (!anchor && state.observations.length === 0)
    throw new Error('Record the first screen with `observe --anchor` before gated actions.')
  if (anchor && state.observations.length > 0 && usedActions(state) >= run.maxActions)
    throw new Error('Action budget is spent; a relaunch counts as an action.')
  if (anchor && state.observations.filter((item) => item.anchor).length >= run.maxAnchors) {
    throw new Error(`Anchor limit ${run.maxAnchors} reached; relaunching repeatedly means the run is stuck.`)
  }
  return { anchor, result, gate: anchor ? null : requireGate(state, input.gate) }
}

function findScreen(state, fp, input) {
  if (input['new-screen'] && input['screen-id']) throw new Error('--new-screen and --screen-id conflict')
  if (input['screen-id']) {
    const forced = state.screens.find((screen) => screen.id === input['screen-id'])
    if (!forced) throw new Error(`--screen-id ${input['screen-id']} does not exist`)
    return { screen: forced, adjudicated: true }
  }
  if (input['new-screen']) return { screen: null, adjudicated: true }
  const known = state.screens.find((screen) => screen.key === fp.screenKey || screen.aliases?.includes(fp.screenKey))
  return { screen: known, adjudicated: false }
}

function placeScreen(state, fp, input, before, observationId) {
  const { screen: matched, adjudicated } = findScreen(state, fp, input)
  const depth = before ? before.depth + 1 : 0
  if (matched) {
    // An adjudication is remembered, so the same look is the same screen next time without the flag.
    if (matched.key !== fp.screenKey && !matched.aliases?.includes(fp.screenKey))
      matched.aliases = [...(matched.aliases ?? []), fp.screenKey]
    // Reaching a screen again can only shorten its depth along a recorded path; a relaunch is not a path.
    if (before) matched.depth = Math.min(matched.depth, depth)
    return { screen: matched, isNew: false, adjudicated, sameStructure: false }
  }
  const sameStructure = state.screens.some((screen) => screen.structureKey === fp.structureKey)
  const screen = {
    id: `S-${pad(state.screens.length + 1, 3)}`,
    key: fp.screenKey,
    structureKey: fp.structureKey,
    aliases: [],
    title: fp.title,
    type: input['screen-type'] ?? 'unclassified',
    depth,
    parent: before ? { screenId: before.id, observationId } : null,
    confidence: fp.confidence,
    firstObservation: observationId,
    states: [],
    candidates: [],
  }
  state.screens.push(screen)
  return { screen, isNew: true, adjudicated, sameStructure }
}

function placeState(screen, fp, input, observationId) {
  const known = screen.states.find((item) => item.key === fp.stateKey)
  if (known) return { state: known, isNew: false }
  const kind = input['state-kind'] ?? (fp.loading ? 'loading' : 'content')
  const created = {
    id: `${screen.id}.${screen.states.length + 1}`,
    key: fp.stateKey,
    kind,
    firstObservation: observationId,
  }
  screen.states.push(created)
  return { state: created, isNew: true }
}

function recordTransition(state, { from, to, action, fromState, toState, observationId }) {
  const key = [from.id, to.id, fromState, toState, action.actionKey].join('|')
  const found = state.transitions.find(
    (item) => [item.from, item.to, item.fromState, item.toState, item.actionKey].join('|') === key,
  )
  if (found) {
    found.count += 1
    found.observationIds.push(observationId)
    return found
  }
  const created = {
    id: `T-${pad(state.transitions.length + 1, 3)}`,
    from: from.id,
    to: to.id,
    fromState,
    toState,
    action: { type: action.action, label: action.label, role: action.role, id: action.id },
    actionKey: action.actionKey,
    count: 1,
    observationIds: [observationId],
  }
  state.transitions.push(created)
  return created
}

function storedResult(unchanged, result) {
  if (unchanged && result === 'ok') return 'no-change'
  return result
}

function classificationOf(placed, placedState) {
  if (placed.isNew) return 'new-screen'
  return placedState.isNew ? 'new-state' : 'known'
}

async function copyEvidence(dir, id, input) {
  const copy = async (from, to) => {
    try {
      await copyFile(from, join(dir, to), constants.COPYFILE_EXCL)
    } catch (error) {
      if (error.code === 'EEXIST')
        throw new Error(
          `Evidence file ${to} already exists; an earlier observe was interrupted. Check it, then remove it.`,
          { cause: error },
        )
      throw error
    }
    return to
  }
  const snapshotPath = await copy(input.snapshot, `snapshots/${id}.json`)
  if (!input.screenshot) return { snapshotPath, screenshotPath: null }
  return {
    snapshotPath,
    screenshotPath: await copy(input.screenshot, `screenshots/${id}${extname(input.screenshot) || '.png'}`),
  }
}

/** A failed action never creates a screen, a state or a transition: the app stayed where it was. */
function failedPlacement(before, lastObservation) {
  return {
    screen: before,
    isNew: false,
    adjudicated: false,
    sameStructure: false,
    state: { id: lastObservation.afterState.stateId },
  }
}

function addCandidates(screen, fp) {
  const known = new Set(screen.candidates.map((candidate) => candidate.key))
  screen.candidates.push(...fp.candidates.filter((candidate) => !known.has(candidate.key)))
}

function limitationsOf({ screenshotPath, fp, placed }) {
  const lowConfidence = fp?.confidence === 'low'
  return [
    ...(screenshotPath ? [] : ['screenshot-missing']),
    ...(lowConfidence ? ['low-confidence-fingerprint'] : []),
    ...(placed.adjudicated ? ['agent-adjudicated-screen'] : []),
    ...(placed.sameStructure ? ['same-structure-other-title'] : []),
  ]
}

async function record(runDir, input) {
  const state = await loadRun(runDir)
  const { run, dir } = state
  assertConsistent(state)
  const { anchor, result, gate } = checkRequest(state, input)
  await requireFile(input.snapshot, '--snapshot')
  if (input.screenshot) await requireFile(input.screenshot, '--screenshot')

  const lastObservation = state.observations.at(-1)
  const id = `O-${pad(state.observations.length + 1, 4)}`
  const before = anchor ? null : state.screens.find((screen) => screen.id === lastObservation.screenId)
  const beforeState = anchor ? null : lastObservation.afterState
  const failed = result !== 'ok'
  const fp = failed ? null : fingerprint(JSON.parse(await readFile(input.snapshot, 'utf8')))
  const placed = failed ? failedPlacement(before, lastObservation) : placeScreen(state, fp, input, before, id)
  const placedState = failed ? { state: placed.state, isNew: false } : placeState(placed.screen, fp, input, id)
  if (!failed) addCandidates(placed.screen, fp)

  const afterState = { screenId: placed.screen.id, stateId: placedState.state.id }
  const stored = storedResult(!anchor && beforeState.stateId === afterState.stateId, result)
  let transition = null
  if (!anchor && stored === 'ok') {
    transition = recordTransition(state, {
      from: before,
      to: placed.screen,
      action: gate,
      fromState: beforeState.stateId,
      toState: afterState.stateId,
      observationId: id,
    })
  }

  const { snapshotPath, screenshotPath } = await copyEvidence(dir, id, input)
  const limitations = limitationsOf({ screenshotPath, fp, placed })
  const observation = {
    id,
    runId: run.runId,
    targetVersion: run.targetVersion,
    platform: run.platform,
    locale: run.locale,
    anchor,
    gateId: gate?.gateId ?? null,
    screenId: placed.screen.id,
    action: anchor ? { type: 'anchor' } : { type: gate.action, label: gate.label, role: gate.role, id: gate.id },
    beforeState,
    afterState,
    screenshotPath,
    snapshotPath,
    timestamp: new Date().toISOString(),
    result: stored,
    classification: failed ? 'failed' : classificationOf(placed, placedState),
    transitionId: transition?.id ?? null,
    note: input.note ?? null,
    limitations,
  }
  // The observation line is the commit record: it is written last, so an interrupted run is detectable.
  await writeJson(join(dir, FILES.screens), { screens: state.screens })
  await writeJson(join(dir, FILES.transitions), { transitions: state.transitions })
  await appendJsonl(join(dir, FILES.observations), observation)
  return {
    observationId: id,
    screenId: placed.screen.id,
    stateId: afterState.stateId,
    classification: observation.classification,
    result: stored,
    transitionId: observation.transitionId,
    limitations,
    budget: {
      used: usedActions({ ...state, observations: [...state.observations, observation] }),
      max: run.maxActions,
    },
  }
}

export const observe = (runDir, input) => withRunLock(runDir, () => record(runDir, input))

/** Reads a snapshot and says where `observe` would put it, without writing anything. */
export async function identify(runDir, input) {
  const state = await loadRun(runDir)
  if (!input.snapshot) throw new Error('--snapshot <file.json> is required')
  await requireFile(input.snapshot, '--snapshot')
  const fp = fingerprint(JSON.parse(await readFile(input.snapshot, 'utf8')))
  const known = state.screens.find((screen) => screen.key === fp.screenKey || screen.aliases?.includes(fp.screenKey))
  const lookalikes = state.screens
    .filter((screen) => screen.structureKey === fp.structureKey && screen !== known)
    .map((screen) => screen.id)
  return {
    screenId: known?.id ?? null,
    stateKnown: known ? known.states.some((item) => item.key === fp.stateKey) : false,
    title: fp.title,
    confidence: fp.confidence,
    sameStructureAs: lookalikes,
    candidates: fp.candidates.length,
  }
}
