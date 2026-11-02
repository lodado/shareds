import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- checker mechanics intentionally run with node --test.
import test from 'node:test'
import { checkInstallation, SKILLS } from './installed-skill-acceptance.mjs'
import { analyzeRun, formatTable, refusalOf } from './oracle-session-stats.mjs'

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'installed-parity-'))
  const repo = join(root, 'repo')
  const source = join(repo, 'packages/frontend-oracle-design')
  const json = (path, value) => { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, JSON.stringify(value)) }
  mkdirSync(source, { recursive: true })
  execFileSync('/usr/bin/git', ['init', '-q', repo])
  json(join(repo, '.claude-plugin/marketplace.json'), { plugins: [{ name: 'frontend-oracle-design', version: '0.84.0' }] })
  for (const path of ['package.json', '.claude-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    json(join(source, path), { name: path === 'package.json' ? '@lodado/frontend-oracle-design-plugin' : 'frontend-oracle-design', version: '0.84.0' })
  }
  for (const name of SKILLS) {
    mkdirSync(join(source, 'skills', name), { recursive: true })
    writeFileSync(join(source, 'skills', name, 'SKILL.md'), `---\nname: ${name}\n---\nbody\n`)
  }
  writeFileSync(join(source, '.gitignore'), 'node_modules/\n')
  mkdirSync(join(source, 'node_modules'), { recursive: true })
  writeFileSync(join(source, 'node_modules/ignored'), 'ignored')
  const claudeCache = join(root, 'claude')
  const codexCache = join(root, 'codex')
  const jcodeSkillsRoot = join(root, 'jcode')
  cpSync(source, claudeCache, { recursive: true })
  cpSync(source, codexCache, { recursive: true })
  cpSync(join(source, 'skills'), jcodeSkillsRoot, { recursive: true })
  return { root, repo, source, claudeCache, codexCache, jcodeSkillsRoot, version: '0.84.0' }
}

function scenario(name, mutate, verify) {
  test(name, () => {
    const f = fixture()
    try { mutate(f); verify(checkInstallation(f), f) } finally { rmSync(f.root, { recursive: true, force: true }) }
  })
}
scenario('synthetic full parity and ignored source files', () => {}, result => {
  assert.equal(result.ok, true)
  assert.equal(Object.keys(result.hashes.source).some(path => path.includes('node_modules')), false)
  assert.equal(result.hashes.claude['package.json'], result.hashes.source['package.json'])
  assert.match(result.hashes.jcode[`${SKILLS[0]}/SKILL.md`], /^[a-f0-9]{64}$/)
})
scenario('explicit version required', f => { delete f.version }, result => assert.equal(result.ok, false))
scenario('missing actual cache never falls back to source', f => { rmSync(f.claudeCache, { recursive: true }) }, result => assert.equal(result.ok, false))
scenario('source directory cannot serve as installed cache', f => { f.codexCache = f.source }, result => assert.equal(result.ok, false))
scenario('stale installed version', f => { writeFileSync(join(f.codexCache, 'package.json'), '{"version":"0.83.1"}') }, result => assert.equal(result.ok, false))
scenario('source four metadata alignment', f => { writeFileSync(join(f.repo, '.claude-plugin/marketplace.json'), '{"plugins":[]}') }, result => assert.equal(result.ok, false))
scenario('changed installed bytes', f => { writeFileSync(join(f.jcodeSkillsRoot, SKILLS[0], 'SKILL.md'), 'stale') }, result => assert.equal(result.ok, false))
scenario('missing skill', f => { rmSync(join(f.claudeCache, 'skills', SKILLS[1]), { recursive: true }) }, result => assert.equal(result.ok, false))
scenario('duplicate discoverable core', f => {
  mkdirSync(join(f.codexCache, 'duplicate'), { recursive: true })
  writeFileSync(join(f.codexCache, 'duplicate/SKILL.md'), 'name: frontend-oracle-design')
}, result => assert.equal(result.ok, false))
scenario('extra nondiscoverable payload preserved and reported', f => {
  writeFileSync(join(f.jcodeSkillsRoot, SKILLS[0], 'local-note'), 'keep')
  writeFileSync(join(f.jcodeSkillsRoot, 'old-flat-payload'), 'keep flat')
}, (result, f) => {
  assert.equal(result.ok, true)
  assert.ok(result.localOnly.jcode.includes('old-flat-payload'))
  assert.equal(readFileSync(join(f.jcodeSkillsRoot, 'old-flat-payload'), 'utf8'), 'keep flat')
})
scenario('unrelated flat root SKILL is unchecked and local-only', f => {
  writeFileSync(join(f.jcodeSkillsRoot, 'SKILL.md'), '---\nname: frontend-system-design\n---\nname: frontend-oracle-design\n')
}, (result, f) => {
  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.ok(result.uncheckedUnrelated.jcode.includes('SKILL.md'))
  assert.ok(result.localOnly.jcode.includes('SKILL.md'))
  assert.equal(Object.hasOwn(result.hashes.jcode, 'SKILL.md'), false)
  assert.equal(readFileSync(join(f.jcodeSkillsRoot, 'SKILL.md'), 'utf8'), '---\nname: frontend-system-design\n---\nname: frontend-oracle-design\n')
})
for (const [label, text] of [
  ['missing closing delimiter', '---\nname: frontend-system-design\n'],
  ['non-delimiter closing prefix', '---\nname: frontend-system-design\n---not-a-delimiter\n'],
  ['unmatched single opening quote', "---\nname: 'frontend-system-design\n---\n"],
  ['unmatched double opening quote', '---\nname: "frontend-system-design\n---\n'],
  ['unmatched closing quote', "---\nname: frontend-system-design'\n---\n"],
  ['mismatched quotes', `---\nname: 'frontend-system-design"\n---\n`],
]) {
  scenario(`malformed unrelated flat root ${label} fails`, f => {
    writeFileSync(join(f.jcodeSkillsRoot, 'SKILL.md'), text)
  }, (result, f) => {
    assert.equal(result.ok, false)
    assert.ok(result.errors.some(error => error.includes(`Expected exactly ${SKILLS.length} SKILL.md entries`)))
    assert.equal(result.uncheckedUnrelated.jcode.includes('SKILL.md'), false)
    assert.equal(readFileSync(join(f.jcodeSkillsRoot, 'SKILL.md'), 'utf8'), text)
  })
}
for (const scalar of ['frontend-system-design', "'frontend-system-design'", '"frontend-system-design"']) {
  scenario(`valid unrelated flat root scalar ${scalar} is preserved`, f => {
    writeFileSync(join(f.jcodeSkillsRoot, 'SKILL.md'), `---\nname: ${scalar}\n---\n`)
  }, (result, f) => {
    assert.equal(result.ok, true, result.errors.join('\n'))
    assert.ok(result.uncheckedUnrelated.jcode.includes('SKILL.md'))
    assert.ok(result.localOnly.jcode.includes('SKILL.md'))
    assert.equal(Object.hasOwn(result.hashes.jcode, 'SKILL.md'), false)
    assert.equal(readFileSync(join(f.jcodeSkillsRoot, 'SKILL.md'), 'utf8'), `---\nname: ${scalar}\n---\n`)
  })
}
for (const name of SKILLS) {
  scenario(`flat Oracle duplicate ${name} fails`, f => {
    writeFileSync(join(f.jcodeSkillsRoot, 'SKILL.md'), `---\nname: '${name}'\n---\n`)
  }, result => {
    assert.equal(result.ok, false)
    assert.ok(result.errors.some(error => error.includes('Duplicate Jcode skill: SKILL.md')))
  })
}
scenario('flat discoverable SKILL fails', f => { writeFileSync(join(f.jcodeSkillsRoot, 'SKILL.md'), 'old core') }, result => assert.equal(result.ok, false))
scenario('extra Jcode duplicate core outside the owned skill roots fails', f => {
  mkdirSync(join(f.jcodeSkillsRoot, 'old-core'), { recursive: true })
  writeFileSync(join(f.jcodeSkillsRoot, 'old-core/SKILL.md'), '---\nname: frontend-oracle-design\n---\n')
}, result => {
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes('Duplicate Jcode skill: old-core/SKILL.md')))
})
scenario('unrelated Jcode named skills allowed', f => {
  mkdirSync(join(f.jcodeSkillsRoot, 'unrelated'), { recursive: true })
  writeFileSync(join(f.jcodeSkillsRoot, 'unrelated/SKILL.md'), '---\nname: unrelated\n---\n')
}, result => assert.equal(result.ok, true))
scenario('unrelated Jcode root symlink is unchecked, not followed', f => {
  symlinkSync(join(f.root, 'missing-unrelated-target'), join(f.jcodeSkillsRoot, 'unrelated'))
}, result => {
  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.deepEqual(result.uncheckedUnrelated.jcode, ['unrelated'])
  assert.equal(result.localOnly.jcode.includes('unrelated'), false)
})
scenario('unrelated named skill asset symlink is not traversed', f => {
  mkdirSync(join(f.jcodeSkillsRoot, 'unrelated'), { recursive: true })
  writeFileSync(join(f.jcodeSkillsRoot, 'unrelated/SKILL.md'), '---\nname: unrelated\n---\n')
  symlinkSync(join(f.root, 'missing-asset-target'), join(f.jcodeSkillsRoot, 'unrelated/asset-link'))
}, result => {
  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.deepEqual(result.uncheckedUnrelated.jcode, ['unrelated/asset-link'])
  assert.equal(Object.keys(result.hashes.jcode).some(path => path.startsWith('unrelated/')), false)
})
scenario('owned Jcode directory symlink remains rejected', f => {
  rmSync(join(f.jcodeSkillsRoot, SKILLS[0]), { recursive: true })
  symlinkSync(join(f.source, 'skills', SKILLS[0]), join(f.jcodeSkillsRoot, SKILLS[0]))
}, result => {
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes(`Symlink rejected:`) && error.endsWith(SKILLS[0])))
})
scenario('owned Jcode asset symlink remains rejected', f => {
  symlinkSync(join(f.root, 'missing-asset'), join(f.jcodeSkillsRoot, SKILLS[0], 'asset-link'))
}, result => {
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes('Symlink rejected:') && error.endsWith('asset-link')))
})
scenario('SKILL symlink outside the owned skill roots remains rejected', f => {
  mkdirSync(join(f.jcodeSkillsRoot, 'alias'))
  symlinkSync(join(f.source, 'skills', SKILLS[0], 'SKILL.md'), join(f.jcodeSkillsRoot, 'alias/SKILL.md'))
}, result => {
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes('Symlink rejected:') && error.endsWith('alias/SKILL.md')))
})
scenario('nested duplicate owned entry survives unrelated asset links', f => {
  mkdirSync(join(f.jcodeSkillsRoot, 'unrelated/nested'), { recursive: true })
  writeFileSync(join(f.jcodeSkillsRoot, 'unrelated/SKILL.md'), '---\nname: unrelated\n---\n')
  writeFileSync(join(f.jcodeSkillsRoot, 'unrelated/nested/SKILL.md'), `---\nname: ${SKILLS[0]}\n---\n`)
  symlinkSync(join(f.root, 'missing'), join(f.jcodeSkillsRoot, 'unrelated/asset-link'))
}, result => {
  assert.equal(result.ok, false)
  assert.ok(result.errors.some(error => error.includes('Duplicate Jcode skill: unrelated/nested/SKILL.md')))
})
scenario('tracked source manifest remains accepted when subsequently ignored', f => {
  execFileSync('/usr/bin/git', ['-C', f.repo, 'add', 'packages/frontend-oracle-design'])
  for (const root of [f.source, f.claudeCache, f.codexCache]) writeFileSync(join(root, '.gitignore'), 'node_modules/\nskills/\n')
}, result => {
  assert.equal(result.ok, true, result.errors.join('\n'))
  assert.match(result.hashes.source[`skills/${SKILLS[0]}/SKILL.md`], /^[a-f0-9]{64}$/)
})
scenario('legacy flat directories reported separately', f => {
  mkdirSync(join(f.jcodeSkillsRoot, 'references'), { recursive: true })
  writeFileSync(join(f.jcodeSkillsRoot, 'references/old.md'), 'preserved')
}, result => {
  assert.equal(result.ok, true)
  assert.ok(result.localOnly.jcode.includes('references/old.md'))
})
scenario('escaping symlink rejected without traversal', f => {
  symlinkSync(f.repo, join(f.claudeCache, 'escape'))
}, result => assert.equal(result.ok, false))
scenario('same directory is not two installations', f => { f.codexCache = f.claudeCache }, result => assert.equal(result.ok, false))
scenario('missing explicit cache rejected', f => { delete f.claudeCache }, result => assert.equal(result.ok, false))
scenario('source symlink cannot escape manifest root', f => {
  symlinkSync(join(f.root, 'codex/package.json'), join(f.source, 'escape'))
}, result => assert.equal(result.ok, false))
scenario('symlinked cache root rejected', f => {
  const alias = join(f.root, 'alias')
  symlinkSync(f.codexCache, alias)
  f.codexCache = alias
}, result => assert.equal(result.ok, false))

// oracle-session-stats --run: a synthetic controller transcript plus one child transcript, shaped like the real
// Claude Code rows (spawns are async, the child's duration arrives in a task notification, exit codes are masked).
const T0 = Date.parse('2026-11-01T00:00:00.000Z')
const isoAt = sec => new Date(T0 + sec * 1000).toISOString()
const oracle = name => `node /x/skills/frontend-oracle-design/scripts/oracle-${name}.mjs`
const use = (id, name, input) => ({ type: 'tool_use', id, name, input })
const done = (id, content, isError) => ({ type: 'tool_result', tool_use_id: id, content, ...(isError ? { is_error: true } : {}) })
const rowOf = agentId => (type, sec, content, extra) => JSON.stringify({ type, agentId, timestamp: isoAt(sec), message: { content }, ...extra })
const notice = ms => `<task-notification><task-id>child001</task-id><duration_ms>${ms}</duration_ms></task-notification>`
const attach = (sec, ms) => JSON.stringify({ type: 'attachment', timestamp: isoAt(sec), attachment: { type: 'queued_command', prompt: notice(ms) } })

function controllerRows() {
  const row = rowOf('ctrl0001')
  const call = (sec, id, name, input, output, { isError, extra } = {}) => [
    row('assistant', sec, [use(id, name, input)]),
    row('user', sec + 1, [done(id, output, isError)], extra),
  ]
  const bash = (sec, id, command, output, isError) => call(sec, id, 'Bash', { command }, output, { isError })
  const begin = `${oracle('stage')} begin --id a; echo EXIT=$?`
  // Wrapped with `; echo EXIT=$?`, so no `Exit code` line and no is_error: the refusal shows only in the script's own lines.
  const masked = 'STAGE_NO_PACKAGE: no package yet\nnext: write the package\nEXIT=1'
  const ack = 'Async agent launched successfully.\nagentId: child001'
  const launched = { agentId: 'child001', resolvedModel: 'claude-haiku-4-5', status: 'async_launched' }
  return [
    row('user', 0, 'Run the skill, version 0.126.0, on case-1-submit'),
    ...call(10, 'r1', 'Read', { file_path: '/x/skills/frontend-oracle-design/SKILL.md' }, 'a'.repeat(2048)),
    ...bash(20, 'b1', begin, masked),
    ...bash(30, 'b2', begin, masked),
    ...bash(40, 'b3', begin, masked),
    row('assistant', 50, [{ type: 'text', text: '아 맞다, 라우터 문서를 먼저 읽었어야 했다' }]),
    // 200 characters but 600 bytes: the doc size is counted in bytes.
    ...call(60, 'r2', 'Read', { file_path: '/x/skills/frontend-oracle-design/references/b.md' }, '가'.repeat(200)),
    ...call(70, 'r3', 'Read', { file_path: '/x/other/README.md' }, 'readme'),
    // Mentions of a script or of OHRIGHT are not oracle calls and not apology notes.
    ...bash(80, 'e1', 'echo "REFUSED: oracle-stage.mjs begin" >> /x/log.md', ''),
    ...bash(90, 'b4', `${oracle('step')} advance`, '{"steps":[{"step":"oracle-stage advance","ok":false,"ms":5,"code":"STAGE_GATE"}]}'),
    ...bash(100, 'n1', 'echo "OHRIGHT: skipped the router" >> /x/log.md', ''),
    ...bash(110, 'g1', 'grep -c "OHRIGHT:" /x/log.md', '1'),
    ...bash(120, 'b5', `${oracle('step')} --id a`, 'REFUSED CARD_LINT_FAILED: card has issues\nNEXT FOR YOU: fix the card'),
    ...bash(130, 'b6', `${oracle('verify')} card x.md`, 'Exit code 1\nsomething odd\nNEXT FOR YOU: fix the card', true),
    // A wait for the reviewer is not a refusal even when the harness marks it as an error.
    ...bash(140, 'b7', `${oracle('review')} close`, 'CLOSE_PENDING: waiting for the reviewer', true),
    ...call(150, 's1', 'Agent', { description: 'author the model', subagent_type: 'oracle-author', model: 'haiku' }, ack, { extra: { toolUseResult: launched } }),
    ...bash(200, 'b8', `${oracle('stage')} status && ${oracle('cycle')} walk`, 'Exit code 1\nORACLE_DIR_OVERLAP: .ai/oracles/a overlaps', true),
    // The request copy row repeats a tool_use and has no timestamp: counting it would inflate every total.
    JSON.stringify({ type: 'api-request-blob', message: { content: [use('b9', 'Bash', { command: `${oracle('stage')} begin` })] } }),
    // The completion notice reaches the transcript twice (attachment and user copy); a resumed child notifies again.
    attach(280, 90_000),
    row('user', 290, `[SYSTEM NOTIFICATION] ${notice(90_000)}`),
    attach(295, 30_000),
    row('assistant', 300, [{ type: 'text', text: 'done' }]),
    '{"type":"assistant","timestamp":"2026-11-01T00:05', // cut off while the transcript is still being written
    '',
  ]
}

function childRows() {
  const row = rowOf('child001')
  return [
    row('user', 160, 'author the model for case-1-submit'),
    row('assistant', 170, [use('cr1', 'Read', { file_path: '/x/frontend-oracle-design/references/a.md' })]),
    row('user', 171, [done('cr1', 'c'.repeat(1000))]),
    row('assistant', 180, [use('cb1', 'Bash', { command: `${oracle('model')} check m.bend` })]),
    row('user', 181, [done('cb1', 'Exit code 1\nMODEL_INVALID: bad', true)]),
    row('assistant', 210, [{ type: 'text', text: 'finished' }]),
  ]
}

const loadChild = id => (id === 'child001' ? childRows() : null)

test('analyzeRun follows the child transcript and counts every signal from the recorded rows', () => {
  const run = analyzeRun(controllerRows(), loadChild)
  assert.deepEqual([run.agentId, run.version, run.case, run.minutes], ['ctrl0001', '0.126.0', 'case-1-submit', 5])
  assert.deepEqual([run.startedAt, run.endedAt], ['2026-11-01T00:00:00.000Z', '2026-11-01T00:05:00.000Z'])
  // 15 controller calls + 2 child calls; the request copy row is not a call.
  assert.deepEqual(run.toolCalls, { controller: 15, total: 17 })
  // Echo and grep mentions are not calls, a chained call is one command per script, and the child's call is included.
  assert.equal(run.oracle.commands, 10)
  assert.deepEqual(run.oracle.byCommand, {
    'oracle-stage begin': 3,
    'oracle-step advance': 1,
    'oracle-step': 1,
    'oracle-verify card': 1,
    'oracle-review close': 1,
    'oracle-stage status': 1,
    'oracle-cycle walk': 1,
    'oracle-model check': 1,
  })
  // Refusals come from masked, JSON, REFUSED and exit-code results, in time order across both agents.
  assert.deepEqual(run.refusals.list.map(({ at, code }) => `${at} ${code}`), [
    '00:00:20 STAGE_NO_PACKAGE',
    '00:00:30 STAGE_NO_PACKAGE',
    '00:00:40 STAGE_NO_PACKAGE',
    '00:01:30 STAGE_GATE',
    '00:02:00 CARD_LINT_FAILED',
    '00:02:10 UNKNOWN',
    '00:03:00 MODEL_INVALID',
    '00:03:20 ORACLE_DIR_OVERLAP',
  ])
  assert.deepEqual([run.refusals.count, run.refusals.unknown], [8, 1])
  assert.deepEqual(run.refusals.byCode, { STAGE_NO_PACKAGE: 3, STAGE_GATE: 1, CARD_LINT_FAILED: 1, UNKNOWN: 1, MODEL_INVALID: 1, ORACLE_DIR_OVERLAP: 1 })
  assert.deepEqual(run.refusals.list.filter(({ agent }) => agent !== 'controller').map(({ agent, command }) => [agent, command]), [['author the model [child001]', 'oracle-model check']])
  assert.equal(run.refusals.list.at(-1).command, 'oracle-stage status + oracle-cycle walk')
  // Loop signals: three identical refusals in a row and three identical next lines count; two identical next lines do not.
  assert.equal(run.loops.maxSameRefusalRun, 3)
  assert.deepEqual(run.loops.repeatedNext, [{ count: 3, line: 'next: write the package' }])
  // Docs: bytes not characters, only the plugin's docs, child included; only SKILL.md was read before the first oracle call.
  assert.deepEqual(run.docReads, { count: 3, bytes: 3648, preFirstCommand: { count: 1, bytes: 2048 }, nonMarkdown: { count: 0, bytes: 0 } })
  assert.deepEqual(run.apologies.list.map(({ at, kind, afterCode }) => `${at} ${kind} ${afterCode}`), ['00:00:50 text STAGE_NO_PACKAGE', '00:01:40 note STAGE_GATE'])
  assert.deepEqual([run.apologies.controller, run.apologies.total, run.apologies.text, run.apologies.notes], [2, 2, 1, 1])
  // 90 s notified twice (attachment and user copy) plus 30 s after a resume; the child's last row is 60 s after the spawn.
  assert.deepEqual(run.subagents, {
    count: 1,
    list: [{ parent: 'controller', description: 'author the model', type: 'oracle-author', model: 'claude-haiku-4-5', minutes: 2, source: 'notification', spanMinutes: 1 }],
  })
})

test('analyzeRun without a child loader keeps the spawn but not the rows of the child', () => {
  const run = analyzeRun(controllerRows())
  assert.deepEqual(run.toolCalls, { controller: 15, total: 15 })
  assert.equal(run.oracle.byCommand['oracle-model check'], undefined)
  assert.deepEqual([run.refusals.count, run.docReads.count], [7, 2])
  assert.deepEqual(run.subagents.list.map(({ minutes, source, spanMinutes }) => [minutes, source, spanMinutes]), [[2, 'notification', null]])
})

test('analyzeRun on an empty transcript reports no activity', () => {
  const run = analyzeRun([''])
  assert.deepEqual([run.agentId, run.minutes, run.toolCalls, run.refusals.count, run.loops.maxSameRefusalRun, run.subagents.count, run.docReads.count], [null, null, { controller: 0, total: 0 }, 0, 0, 0, 0])
})

for (const [label, text, isError, expected] of [
  ['masked exit code with a code line', 'STAGE_GATE: blocked\nEXIT=1', false, 'STAGE_GATE'],
  ['exit code line with a code line', 'Exit code 1\nSTAGE_GATE: blocked', true, 'STAGE_GATE'],
  ['REFUSED line without an exit code', 'REFUSED CARD_LINT_FAILED: card has issues', false, 'CARD_LINT_FAILED'],
  ['failed step JSON', '{"steps":[{"step":"x","ok":false,"ms":5,"code":"STAGE_GATE"}]}', false, 'STAGE_GATE'],
  ['failed object in a summary', '{"ok":true,"failed":{"step":"x","code":"BEND_CHECK_FAILED"}}', false, 'BEND_CHECK_FAILED'],
  ['usage banner of a failed call', 'Exit code 1\nUSAGE: oracle-x.mjs <id>', true, 'USAGE'],
  ['usage banner that was asked for', 'USAGE: oracle-x.mjs <id>', false, null],
  ['error without any code', 'Exit code 2\nboom', false, 'UNKNOWN'],
  ['wait for the reviewer', 'CLOSE_PENDING: waiting for the reviewer', true, null],
  ['hook denial, the script never ran', 'PreToolUse:Bash hook error: denied', true, null],
  ['code word inside a sentence of a passing run', 'note: see MODEL_INVALID: docs', false, null],
  ['passing step JSON', '{"steps":[{"step":"x","ok":true,"ms":5}]}', false, null],
]) {
  test(`refusalOf reads ${label}`, () => assert.equal(refusalOf(text, isError), expected))
}

test('formatTable prints one row per run with the thirteen columns in order', () => {
  const run = analyzeRun(controllerRows(), loadChild)
  const [head, divider, row, withLog] = formatTable([run, { ...run, friction: { ohright: 4 } }]).split('\n')
  const cells = line => line.slice(2, -2).split(' | ')
  assert.deepEqual([cells(head).length, cells(divider).length], [13, 13])
  assert.deepEqual(cells(row), ['case-1-submit ctrl0001', '0.126.0', '5', '15/17', '10', '8', '1', '3', '1', '1', '3 / 3.6; pre 2.0', '2/2', '-'])
  assert.equal(cells(withLog).at(-1), '4')
})
