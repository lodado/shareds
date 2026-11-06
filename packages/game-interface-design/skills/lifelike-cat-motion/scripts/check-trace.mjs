#!/usr/bin/env node
// Order and timing checks for a recorded cat behavior trace. It judges sequences, not charm.
import { readFileSync, realpathSync } from 'node:fs'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const WARNINGS = new Set(['tailFlick', 'tailLash', 'earsSide', 'earsFlat', 'skinRipple', 'headToHand'])
// Lateral sequence: each hind foot is followed by the fore foot on the same side.
const WALK_NEXT = { LH: 'LF', LF: 'RH', RH: 'RF', RF: 'LH' }
const TROT_PARTNER = { LH: 'RF', RF: 'LH', RH: 'LF', LF: 'RH' }
const EPS = 1e-6
const USAGE = 'usage: node scripts/check-trace.mjs <trace.json>'
const fmt = (t) => `${t.toFixed(2)}s`

export function normalizeTrace(input) {
  const events = Array.isArray(input) ? input : input?.events
  if (!Array.isArray(events)) throw new TypeError('trace must be an array of events or { "events": [...] }')
  events.forEach((event, i) => {
    if (!Number.isFinite(event?.t) || typeof event.type !== 'string') throw new TypeError(`event ${i} needs a finite t and a type`)
    if (event.type === 'mood' && (!Number.isFinite(event.valence) || !Number.isFinite(event.arousal))) {
      throw new TypeError(`event ${i} mood needs finite valence and arousal`)
    }
    if (i > 0 && event.t < events[i - 1].t) throw new TypeError(`event ${i} goes back in time`)
  })
  return events
}

// A state lasts until the next state event, or until the end of the trace.
function stateSpans(events) {
  const states = events.filter((e) => e.type === 'state')
  const end = events.at(-1)?.t ?? 0
  return states.map((state, i) => ({ ...state, end: states[i + 1]?.t ?? end, prev: states[i - 1] }))
}

const within = (events, from, to, test) => events.some((e) => e.t >= from - EPS && e.t <= to + EPS && test(e))
const isSignal = (name) => (e) => e.type === 'signal' && e.name === name

function swatWarning({ events, spans }) {
  const swats = spans.filter((s) => s.name === 'swat')
  const failures = swats
    .filter((s) => !within(events, s.t - 4, s.t - 0.4, (e) => e.type === 'signal' && WARNINGS.has(e.name)))
    .map((s) => `swat at ${fmt(s.t)} has no warning signal 0.4–4 s before it`)
  return { checked: swats.length, failures }
}

function pounceAnticipation({ events, spans }) {
  const pounces = spans.filter((s) => s.name === 'pounce')
  const failures = pounces.flatMap((p) => {
    const crouch = p.prev
    if (crouch?.name !== 'crouch') return [`pounce at ${fmt(p.t)} does not follow a crouch`]
    if (p.t - crouch.t < 0.3 - EPS) return [`crouch before the pounce at ${fmt(p.t)} lasted ${fmt(p.t - crouch.t)}, under 0.3 s`]
    return within(events, crouch.t, p.t, isSignal('wiggle')) ? [] : [`crouch before the pounce at ${fmt(p.t)} has no wiggle`]
  })
  return { checked: pounces.length, failures }
}

function blinkReply({ events, spans }) {
  const replies = spans.filter((s) => s.name === 'blinkReply')
  const failures = replies.flatMap((r) => {
    const signals = events.filter((e) => e.type === 'signal' && e.t >= r.t - EPS && e.t <= r.end + EPS)
    const half = signals.findIndex((e) => e.name === 'halfBlink')
    const narrow = half < 0 ? -1 : signals.findIndex((e, i) => i > half && e.name === 'eyesNarrow')
    if (narrow < 0) return [`blink reply at ${fmt(r.t)} lacks a half-blink followed by an eye narrowing`]
    const open = signals.find((e, i) => i > narrow && e.name === 'eyesOpen')
    const held = (open?.t ?? r.end) - signals[narrow].t
    return held < 0.6 - EPS ? [`blink reply at ${fmt(r.t)} holds the narrowing ${fmt(held)}, under 0.6 s`] : []
  })
  return { checked: replies.length, failures }
}

function startleLatency({ events, spans }) {
  const startles = spans.filter((s) => s.name === 'startle')
  const failures = startles.flatMap((s) => {
    const caused = within(events, s.t - 0.12, s.t, (e) => e.type === 'stimulus' && (e.name === 'poke' || e.name === 'noise'))
    const problems = caused ? [] : [`startle at ${fmt(s.t)} has no poke or noise within 0.12 s before it`]
    if (s.end - s.t < 0.3 - EPS) problems.push(`startle at ${fmt(s.t)} lasts ${fmt(s.end - s.t)}, under 0.3 s`)
    return problems
  })
  return { checked: startles.length, failures }
}

function moodContinuity({ events }) {
  const moods = events.filter((e) => e.type === 'mood')
  let checked = 0
  const failures = []
  for (let i = 1; i < moods.length; i++) {
    const [a, b] = [moods[i - 1], moods[i]]
    const dt = b.t - a.t
    if (dt <= EPS || within(events, a.t, b.t, (e) => e.type === 'stimulus')) continue
    checked++
    for (const key of ['valence', 'arousal']) {
      if (!Number.isFinite(a[key]) || !Number.isFinite(b[key])) continue
      const rate = Math.abs(b[key] - a[key]) / dt
      if (rate > 1.5 + EPS) failures.push(`${key} moved ${rate.toFixed(2)}/s between ${fmt(a.t)} and ${fmt(b.t)} with no stimulus`)
    }
  }
  return { checked, failures }
}

function walkFootfalls(contacts) {
  // A pause of 2 s or more starts a new bout, which may begin on any foot.
  const steps = contacts
    .slice(1)
    .map((c, i) => [contacts[i], c])
    .filter(([prev, c]) => prev.gait === 'walk' && c.gait === 'walk' && c.t - prev.t < 2)
  const failures = steps
    .filter(([prev, c]) => WALK_NEXT[prev.foot] !== c.foot)
    .map(([prev, c]) => `walk contact ${c.foot} at ${fmt(c.t)} follows ${prev.foot}; expected ${WALK_NEXT[prev.foot] ?? 'a known foot'}`)
  return { checked: steps.length, failures }
}

function trotFootfalls(contacts) {
  const trot = contacts.filter((c) => c.gait === 'trot')
  const failures = trot
    .filter((c) => !trot.some((o) => o.foot === TROT_PARTNER[c.foot] && Math.abs(o.t - c.t) <= 0.06 + EPS))
    .map((c) => `trot contact ${c.foot} at ${fmt(c.t)} has no ${TROT_PARTNER[c.foot] ?? 'diagonal'} contact within 0.06 s`)
  return { checked: trot.length, failures }
}

function gaitFootfalls({ events }) {
  const contacts = events.filter((e) => e.type === 'contact')
  const walk = walkFootfalls(contacts)
  const trot = trotFootfalls(contacts)
  return { checked: walk.checked + trot.checked, failures: [...walk.failures, ...trot.failures] }
}

// Only back-to-back idle states form a run: sitting again after being petted is not repetition.
function idleVariety({ spans }) {
  const runs = spans
    .slice(2)
    .map((s, i) => [spans[i], spans[i + 1], s])
    .filter((run) => run.every((s) => s.kind === 'idle'))
  const failures = runs
    .filter(([a, b, c]) => a.name === c.name && b.name === c.name)
    .map(([, , c]) => `idle state ${c.name} plays a third time in a row at ${fmt(c.t)}`)
  return { checked: runs.length, failures }
}

function attentionChain({ events }) {
  const turns = events.filter((e) => isSignal('headTurn')(e) && (e.cause === 'call' || e.cause === 'noise'))
  const failures = turns
    .filter((h) => !within(events, h.t - 0.4, h.t - 0.03, (e) => isSignal('earsTurn')(e) && e.cause === h.cause))
    .map((h) => `head turn for ${h.cause} at ${fmt(h.t)} has no ear turn 0.03–0.4 s before it`)
  return { checked: turns.length, failures }
}

const RULES = [
  ['swat-warning', swatWarning],
  ['pounce-anticipation', pounceAnticipation],
  ['blink-reply', blinkReply],
  ['startle-latency', startleLatency],
  ['mood-continuity', moodContinuity],
  ['gait-footfalls', gaitFootfalls],
  ['idle-variety', idleVariety],
  ['attention-chain', attentionChain],
]

export function checkTrace(input) {
  const events = normalizeTrace(input)
  const context = { events, spans: stateSpans(events) }
  const rules = RULES.map(([id, rule]) => ({ id, ...rule(context) }))
  return {
    ok: rules.every((r) => r.failures.length === 0),
    events: events.length,
    rules,
    notExercised: rules.filter((r) => r.checked === 0).map((r) => r.id),
  }
}

export function main(argv) {
  if (argv.length !== 1) {
    console.error(USAGE)
    return 2
  }
  let report
  try {
    report = checkTrace(JSON.parse(readFileSync(argv[0], 'utf8')))
  } catch (error) {
    console.error(`check-trace: ${error.message}`)
    return 2
  }
  console.log(JSON.stringify(report, null, 2))
  return report.ok ? 0 : 1
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2))
}
