import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { BEND_VERSION, ensureBend } from './ensure-bend.mjs'
import {
  adequacyIssues,
  adequacyProofFile,
  adequacySpec,
  certify,
  checkAdequacy,
  mergeKernel,
  modelInput,
  parseAdequacy,
  parseTerms,
  searchAdequacy,
} from './oracle-adequacy.mjs'

const FIXTURE = fileURLToPath(new URL('../../test-fixtures/doc-save/', import.meta.url))
const SCRIPTS = fileURLToPath(new URL('.', import.meta.url))
const CARD = await readFile(join(FIXTURE, 'oracle.md'), 'utf8')
const WORLD = await readFile(join(FIXTURE, 'World.bend'), 'utf8')

// 첫 초안 — 확정이 아직 숨은 값이던 때의 T3 행과, 전송·토스트만 요구하던 두 행.
const T3_HIDDEN =
  '| T3 | server | commit | hidden | committed | — | the server applied the change durably | request sent; server accepted | S1 | confirmed |'
const DRAFT_ROWS = {
  O1: 'Save.imp(Bool.and(s, h), Bool.and(c, Bool.and(a, r)))',
  O1_DRAFT: 'Save.imp(Bool.and(s, h), a)',
  O2: 'Save.imp(Bool.not(h), Bool.not(c))',
  O2_DRAFT: 'Save.imp(Bool.not(s), Bool.not(a))',
}

const line = (card, field, value) => card.replace(new RegExp(`^- ${field}:.*$`, 'm'), `- ${field}: ${value}`)
const hideCommit = (card) => line(card.replace(/^\| T3 .*$/m, T3_HIDDEN), 'Observations', 'ack reload')

async function workspace(t) {
  const root = await mkdtemp(join(tmpdir(), 'oracle-adequacy-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  return root
}

async function fixtureCopy(t) {
  const root = await workspace(t)
  await cp(FIXTURE, root, { recursive: true })
  return root
}

async function edit(path, from, to) {
  const text = await readFile(path, 'utf8')
  assert.ok(
    typeof from === 'string' ? text.includes(from) : from.test(text),
    `${path} lacks the text the edit replaces`,
  )
  await writeFile(path, text.replace(from, to))
}

/** 설치된 고정 Bend가 있을 때만 돈다 — 테스트는 내려받지 않는다. skip은 통과가 아니라 skipped로 남는다. */
async function installedBend(t) {
  try {
    const { bin } = await ensureBend({
      download: () => {
        throw Object.assign(new Error('tests never download Bend'), { code: 'BEND_NOT_INSTALLED' })
      },
    })
    return bin
  } catch (error) {
    t.skip(`Bend ${BEND_VERSION} is not installed (${error.code ?? error.message}) — real Bend integration not run`)
    return null
  }
}

/** 탐색 엔진만 시험하는 손 모델 — World.bend의 def를 JS로 옮긴 test double. 기대값의 출처가 아니다. */
const imp = (a, b) => !a || b
const SAVE = {
  A1: (w) => imp(w.held, w.start),
  A2: (w) => imp(w.reload, w.committed),
  G1: (w) => imp(w.committed, w.held),
  G2: (w) => imp(w.ack, w.committed),
  G3: (w) => imp(w.committed, w.reload),
  G4: (w) => w.start && w.held && w.committed && w.ack && w.reload,
  O1: (w) => imp(w.start && w.held, w.committed && w.ack && w.reload),
  O2: (w) => imp(!w.held, !w.committed),
  O3: (w) => imp(w.ack, w.committed),
  O4: (w) => imp(w.committed, w.reload),
}
const handModel = (defs) => ({ call: (name, value) => defs[name.slice(name.lastIndexOf('.') + 1)](value) })
const search = (card, defs = SAVE) => searchAdequacy(handModel(defs), adequacySpec(card, WORLD))
const find = (result, kind, target = null) =>
  result.checks.find((check) => check.kind === kind && check.target === target)

function lintContext(card, world = WORLD) {
  const lines = card.split('\n')
  const rows = new Map()
  for (const entry of lines) {
    const id = entry.match(/^\|\s*([OD]\d+)\s*\|/)?.[1]
    if (id) rows.set(id, entry)
  }
  return {
    rows: new Set(rows.keys()),
    rowText: rows,
    sources: new Map([
      ['S1', { repoPath: 'README.md', authoritative: true }],
      ['S2', { repoPath: 'World.bend', authoritative: true }],
      ['S9', { repoPath: 'src/save.ts', authoritative: false }],
    ]),
    questionIds: new Set(['Q1']),
    readSource: async (repoPath) => (repoPath === 'World.bend' ? world : null),
  }
}
const lint = (card, world) => {
  const lines = card.split('\n')
  return adequacyIssues({ adequacy: parseAdequacy(lines), terms: parseTerms(lines) }, lintContext(card, world))
}

test('the fixture card and world pass the Terms and Adequacy lint', async () => {
  assert.deepEqual(await lint(CARD), [])
})

test('Terms: one word in one context, one field per meaning, a source for every confirmed term', async () => {
  const duplicate = CARD.replace(
    /^\| T6 .*$/m,
    '| T6 | editor | reload | concept | — | — | a second meaning | — | S1 | confirmed |',
  )
  assert.ok((await lint(duplicate)).some((issue) => issue.startsWith('terms-duplicate: T6: "reload"')))

  // 완료·응답·확정을 한 필드로 합치면 세 뜻을 구별할 수 없다
  const conflated = CARD.replace(
    /^\| T6 .*$/m,
    '| T6 | server | response received | observable | committed | API: 200 response | the server answered | a timeout | S1 | confirmed |',
  )
  assert.ok((await lint(conflated)).some((issue) => issue.startsWith('terms-field-conflated: committed: T3, T6')))

  const unsourced = CARD.replace(
    /^\| T1 .*$/m,
    '| T1 | editor | submit permission | controllable | start | — | holds edit permission at Save | permission at commit | S9 | confirmed |',
  )
  assert.ok((await lint(unsourced)).some((issue) => issue.startsWith('terms-source: T1')))

  const sloppy = CARD.replace(
    /^\| T1 .*$/m,
    '| T1 | editor | submit permission | wish | start | UI: a guess | holds edit permission at Save | permission at commit | S1 | confirmed |',
  )
  const issues = await lint(sloppy)
  assert.ok(issues.some((issue) => issue.startsWith('terms-category: T1')))
  assert.ok(issues.some((issue) => issue.startsWith('terms-observed-via: T1')))
})

test('Adequacy lint: coordinates are controllable, observations observable, goals cite the source text', async () => {
  const swapped = line(line(CARD, 'Coordinates', 'start ack'), 'Observations', 'held reload')
  const issues = await lint(swapped)
  assert.ok(
    issues.includes(
      'adequacy-coordinate-category: ack is observable — a coordinate is a controllable field the test sets',
    ),
  )
  assert.ok(
    issues.includes(
      'adequacy-observation-category: held is controllable — an observation is an observable field the test reads',
    ),
  )

  const copied = CARD.replace(/^\| G1 .*$/m, '| G1 | safety | P1 |')
  assert.ok(
    (await lint(copied)).some((issue) => issue.startsWith('adequacy-goal-source: G1 must cite the source text')),
  )

  const unlisted = line(CARD, 'Rows', 'O1 O2 O3')
  assert.ok(
    (await lint(unlisted)).includes(
      'adequacy-row-unlisted: O4 is neither in Rows nor in Rows outside the world (with a reason)',
    ),
  )

  const missingDef = await lint(CARD, WORLD.replace('def Save.O4(', 'def Save.O9('))
  assert.ok(missingDef.includes('adequacy-def-missing: Save.O4 is not defined in World.bend or its imports'))

  const badExample = CARD.replace(/^\| E1 .*$/m, '| E1 | G1 | start held committed ack | holds |')
  assert.ok((await lint(badExample)).includes('adequacy-example: E1: reload missing'))

  const unlocked = await lint(CARD, `import ./helpers.bend as H\n${WORLD}`)
  assert.ok(unlocked.some((issue) => issue.startsWith('formal-import-unlocked: helpers.bend')))
})

test('Adequacy lint: every hazard has a disposition, and a vague word in a row needs a Terms entry', async () => {
  const noHazard = CARD.replace(/^\| effect-count .*$/m, '')
  assert.ok(
    (await lint(noHazard)).includes('adequacy-hazard: effect-count needs exactly one disposition row (found 0)'),
  )

  const unsourcedHazard = CARD.replace('n/a: S1 one request per attempt', 'n/a: nobody asked')
  assert.ok(
    (await lint(unsourcedHazard)).some((issue) =>
      issue.startsWith('adequacy-hazard: effect-count: Disposition must be'),
    ),
  )
  assert.deepEqual(await lint(CARD.replace('n/a: S1 one request per attempt', 'question: Q1')), [])

  const vague = CARD.replace('"Saved" appears only after a commit', 'the save is complete only after a commit')
  assert.ok((await lint(vague)).includes('adequacy-vague-term: O3 says "complete" — define which meaning in ## Terms'))
})

test('contradictory assumptions leave no world, so nothing can pass vacuously', () => {
  const result = search(CARD, { ...SAVE, A2: (w) => imp(w.reload, w.committed) && w.start && !w.start })
  assert.equal(find(result, 'world-nonempty').status, 'refuted')
  assert.equal(find(result, 'card-satisfiable').status, 'refuted')
  assert.equal(find(result, 'goal-falsifiable', 'G1').status, 'refuted')
  assert.equal(find(result, 'goal-witness', 'G4').status, 'refuted')
  assert.equal(result.counts.valid, 0)
})

test('moving a guarantee into the assumptions shows up: the goal can no longer be violated', () => {
  const result = search(CARD, { ...SAVE, A2: (w) => imp(w.reload, w.committed) && imp(w.committed, w.reload) })
  const swallowed = find(result, 'goal-falsifiable', 'G3')
  assert.equal(swallowed.status, 'refuted')
  assert.equal(find(result, 'goal-falsifiable', 'G1').status, 'proven')
})

test('demo A: a start-only coordinate cannot separate a revoked-midway commit; the refinement closes the gap', () => {
  const draft = search(line(hideCommit(CARD), 'Coordinates', 'start'))
  const first = find(draft, 'sufficiency', 'G1')
  assert.equal(first.status, 'refuted')
  assert.deepEqual(first.differing, [
    { field: 'held', category: 'controllable' },
    { field: 'committed', category: 'hidden' },
  ])
  assert.match(first.suggestions[0], /^add held to Coordinates/)
  assert.match(first.suggestions[1], /OBSERVATION_GAP/)
  for (const name of ['start', 'ack', 'reload']) assert.equal(first.pair.holds[name], first.pair.violates[name])
  assert.equal(SAVE.G1(first.pair.holds), true)
  assert.equal(SAVE.G1(first.pair.violates), false)

  const withHeld = find(search(hideCommit(CARD)), 'sufficiency', 'G1')
  assert.equal(withHeld.status, 'refuted')
  assert.deepEqual(withHeld.differing, [{ field: 'committed', category: 'hidden' }])

  // 음성 대조: 서버 버전 조회를 관찰로 등록하면 같은 좌표·관찰 안에서 판정이 갈리는 세계가 없다
  const refined = search(CARD)
  for (const goal of ['G1', 'G2', 'G3']) assert.equal(find(refined, 'sufficiency', goal).status, 'proven')
})

test('demo B: rows that only ask for the toast all pass while every safety goal fails', () => {
  const draft = { ...SAVE, O1: (w) => imp(w.start && w.held, w.ack), O2: (w) => imp(!w.start, !w.ack) }
  const result = search(line(CARD, 'Rows', 'O1 O2'), draft)
  for (const goal of ['G1', 'G2', 'G3']) {
    const gap = find(result, 'card-implies-goal', goal)
    assert.equal(gap.status, 'refuted', goal)
    const world = gap.counterexample
    assert.equal(SAVE.A1(world) && SAVE.A2(world) && draft.O1(world) && draft.O2(world), true)
    assert.equal(SAVE[goal](world), false)
  }
  assert.equal(find(result, 'goal-witness', 'G4').status, 'proven')

  const refined = search(CARD)
  for (const goal of ['G1', 'G2', 'G3']) assert.equal(find(refined, 'card-implies-goal', goal).status, 'proven')
})

test('a card that forbids the normal save passes every safety goal and fails the witness', () => {
  const result = search(CARD, { ...SAVE, O4: (w) => imp(w.committed, w.reload) && !w.ack })
  for (const goal of ['G1', 'G2', 'G3']) assert.equal(find(result, 'card-implies-goal', goal).status, 'proven')
  assert.equal(find(result, 'goal-witness', 'G4').status, 'refuted')
})

test('a card that depends on a hidden field is not observable by its tests', () => {
  const result = search(hideCommit(CARD))
  const unobservable = find(result, 'card-observable')
  assert.equal(unobservable.status, 'refuted')
  assert.deepEqual(unobservable.differing, [{ field: 'committed', category: 'hidden' }])
})

test('dropping an observation reopens the gap it closed', () => {
  const gap = find(search(line(CARD, 'Observations', 'committed ack')), 'sufficiency', 'G3')
  assert.equal(gap.status, 'refuted')
  assert.deepEqual(gap.differing, [{ field: 'reload', category: 'observable' }])
  assert.match(gap.suggestions[0], /^add reload to Observations/)
})

test('a goal or row that leans on an open term is reported with the field that moves it', () => {
  const open = CARD.replace(/(\| T2 .*\| )confirmed( \|)$/m, '$1open     $2')
  const check = find(search(open), 'open-terms')
  assert.equal(check.status, 'refuted')
  assert.deepEqual(check.openFields, ['held'])
  assert.deepEqual(
    check.dependencies.map(({ def }) => def),
    ['A1', 'O1', 'O2', 'G1', 'G4'],
  )
  assert.equal(find(search(CARD), 'open-terms').status, 'proven')
})

test('an infinite field, a world past the cap and a missing tool are unknown or not-run, never a pass', async (t) => {
  const root = await fixtureCopy(t)
  await edit(join(root, 'World.bend'), 'reload: Bool}', 'reload: Bool, version: Nat}')
  await edit(
    join(root, 'oracle.md'),
    /^\| T6 .*$/m,
    '| T6 | server | version | hidden | version | — | the stored version number | the draft | S1 | confirmed |',
  )
  const infinite = await checkAdequacy({ card: join(root, 'oracle.md'), cwd: root, bin: join(root, 'no-bend') })
  assert.equal(infinite.status, 'unknown')
  assert.equal(infinite.pass, false)
  assert.match(infinite.reason, /version: Nat/)

  const fresh = await fixtureCopy(t)
  const capped = await checkAdequacy({
    card: join(fresh, 'oracle.md'),
    cwd: fresh,
    bin: join(fresh, 'no-bend'),
    maxWorlds: 16,
  })
  assert.equal(capped.status, 'unknown')
  assert.match(capped.reason, /32 worlds exceed max-worlds 16/)

  const missing = await checkAdequacy({ card: join(fresh, 'oracle.md'), cwd: fresh, bin: join(fresh, 'no-bend') })
  assert.equal(missing.status, 'not-run')
  assert.equal(missing.pass, false)
})

test('a kernel that rejects or times out certifies nothing, whatever the search found', async (t) => {
  const root = await workspace(t)
  const result = search(CARD)
  const failed = mergeKernel(result.checks, { status: 'failed', failedAt: 'sufficiency_g1' })
  assert.ok(failed.every((check) => check.status === 'unknown'))
  assert.equal(failed.find((check) => check.kind === 'sufficiency').searchStatus, 'proven')
  assert.match(failed[0].reason, /kernel failed at sufficiency_g1/)

  const bin = join(root, 'slow-bend')
  await writeFile(bin, '#!/bin/sh\nsleep 5\n')
  await chmod(bin, 0o755)
  await writeFile(join(root, 'World.bend'), WORLD)
  const kernel = await certify(result, adequacySpec(CARD, WORLD), {
    worldPath: join(root, 'World.bend'),
    inputs: [{ path: join(root, 'World.bend') }],
    bin,
    timeoutMs: 200,
  })
  assert.equal(kernel.status, 'timeout')
  assert.ok(mergeKernel(result.checks, kernel).every((check) => check.status === 'unknown'))
})

test('the model analyst input carries the source text and hazards, never the rows or the card sections', async (t) => {
  const root = await fixtureCopy(t)
  const input = await modelInput({ card: join(root, 'oracle.md'), cwd: root })
  assert.match(input, /^## Outcome Brief$/m)
  assert.match(input, /A change must not be committed when the editor lacks edit permission/)
  assert.match(input, /^- effect-count: /m)
  assert.match(input, /^## World model authoring$/m)
  assert.doesNotMatch(input, /^\| O\d+ /m)
  assert.doesNotMatch(input, /^## (Case space|Terms|Adequacy|Behavior Contract)$/m)
  assert.doesNotMatch(input, /def Save\./)
  assert.doesNotMatch(input, /^## Files$/m)
})

test('card lint runs the adequacy checks on the fixture and init needs the adequacy run label', async (t) => {
  const repository = await fixtureCopy(t)
  const node = (script, args) =>
    spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd: repository, encoding: 'utf8' })
  const clean = node('oracle-verify.mjs', ['card', '--oracle', 'oracle.md'])
  assert.equal(clean.status, 0, clean.stderr)
  assert.match(clean.stdout, /CARD_LINT_OK 4 rows/)

  const oracleDirectory = join(repository, '.ai', 'oracles', 'doc-save')
  await mkdir(oracleDirectory, { recursive: true })
  await mkdir(join(repository, 'src'), { recursive: true })
  await writeFile(join(repository, 'src', 'index.mjs'), 'export {}\n')
  await cp(join(repository, 'oracle.md'), join(oracleDirectory, 'oracle.md'))
  const lock = join(oracleDirectory, 'oracle.lock.json')
  const locked = node('oracle-lock.mjs', [
    'create',
    '--oracle',
    join(oracleDirectory, 'oracle.md'),
    '--lock',
    lock,
    '--source',
    'README.md',
    '--source',
    'World.bend',
  ])
  assert.equal(locked.status, 0, locked.stderr)
  const init = (...labels) =>
    node('oracle-run.mjs', [
      'init',
      '--dir',
      oracleDirectory,
      '--lock',
      lock,
      '--scan-root',
      join(repository, 'src'),
      ...labels.flatMap((label) => ['--required-label', label]),
    ])
  const refused = init('behavior')
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /^ADEQUACY_LABEL_REQUIRED: /)
  assert.equal(init('behavior', 'bend-adequacy:reported').status, 0)

  // 잠긴 세계 파일이 바뀌면 그 위에서 낸 결론은 더 이상 이 카드의 증거가 아니다
  await edit(join(repository, 'World.bend'), 'Save.imp(h, s)', 'Save.imp(s, h)')
  const changed = node('oracle-lock.mjs', ['verify', '--lock', lock])
  assert.equal(changed.status, 1)
  assert.match(changed.stderr, /SOURCE_CHANGED/)
})

// ── 실제 Bend 2.0.34 통합 (설치본이 있을 때만) ────────────────────────────────────────

test('[bend] the fixture card is proven: every conclusion re-checked by the kernel', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)
  const result = await checkAdequacy({ card: join(root, 'oracle.md'), cwd: root, bin })
  assert.equal(result.status, 'proven', JSON.stringify(result.checks.filter((check) => check.status !== 'proven')))
  assert.equal(result.pass, true)
  assert.equal(result.kernel.status, 'proven')
  assert.equal(result.bend.version, BEND_VERSION)
  assert.deepEqual(
    { worlds: result.counts.worlds, valid: result.counts.valid, excluded: result.counts.excluded },
    { worlds: 32, valid: 18, excluded: 14 },
  )
  assert.equal(find(result, 'sufficiency', 'G1').evidenceKind, 'kernel-proof-finite')
  assert.equal(find(result, 'goal-witness', 'G4').evidenceKind, 'kernel-witness')
  assert.equal(find(result, 'example', 'E2').evidenceKind, 'kernel-computation')
  assert.equal(result.independence.evidence, 'self-reported')
  for (const pair of result.minimalPairs) {
    const differing = Object.keys(pair.holds).filter((name) => pair.holds[name] !== pair.violates[name])
    assert.deepEqual(differing, [pair.field])
  }
  assert.deepEqual(
    result.outside.hazards.map(({ Hazard }) => Hazard),
    ['concurrent-change', 'effect-count', 'identity-reference', 'feature-composition'],
  )
})

test('[bend] demos A and B on the first draft: kernel-checked counterexamples, then proven after refinement', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)
  const card = join(root, 'oracle.md')
  await writeFile(card, line(hideCommit(CARD), 'Coordinates', 'start'))
  const demoA = await checkAdequacy({ card, cwd: root, bin })
  assert.equal(demoA.status, 'refuted')
  const gap = find(demoA, 'sufficiency', 'G1')
  assert.equal(gap.evidenceKind, 'kernel-witness')
  assert.deepEqual(
    gap.differing.map(({ field }) => field),
    ['held', 'committed'],
  )

  await writeFile(card, line(CARD, 'Rows', 'O1 O2'))
  await edit(join(root, 'World.bend'), DRAFT_ROWS.O1, DRAFT_ROWS.O1_DRAFT)
  await edit(join(root, 'World.bend'), DRAFT_ROWS.O2, DRAFT_ROWS.O2_DRAFT)
  const demoB = await checkAdequacy({ card, cwd: root, bin })
  assert.equal(demoB.status, 'refuted')
  for (const goal of ['G1', 'G2', 'G3']) {
    assert.equal(find(demoB, 'card-implies-goal', goal).status, 'refuted', goal)
    assert.equal(find(demoB, 'card-implies-goal', goal).evidenceKind, 'kernel-witness')
  }

  await writeFile(card, CARD)
  await writeFile(join(root, 'World.bend'), WORLD)
  assert.equal((await checkAdequacy({ card, cwd: root, bin })).status, 'proven')
})

test('[bend] the kernel rejects a proof that skips a case or a wrong decision table', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await workspace(t)
  await writeFile(join(root, 'World.bend'), WORLD)
  const spec = adequacySpec(CARD, WORLD)
  const file = adequacyProofFile(search(CARD).obligations, spec, './World.bend')
  const verdict = async (text) => {
    await writeFile(join(root, 'ADEQUACY.bend'), text)
    return spawnSync(bin, ['ADEQUACY.bend', '--verdict'], { cwd: root, encoding: 'utf8' })
  }
  assert.equal((await verdict(file)).status, 0)

  const skipped = file.replace('    case M.Save{False{}, False{}, False{}, False{}, False{}}:\n      {==}\n', '')
  assert.notEqual(skipped, file)
  const skippedRun = await verdict(skipped)
  assert.equal(skippedRun.status, 1)
  assert.match(`${skippedRun.stdout}${skippedRun.stderr}`, /SOME PROOFS FAIL/)

  const table = file.match(
    /def sufficiency_g1_f\([^)]*\) -> Bool:\n {2}match [^\n]*\n {4}case [^\n]*\n {6}(True|False)\{\}/,
  )
  assert.ok(table)
  const flipped = file.replace(
    table[0],
    table[0].replace(/(True|False)\{\}$/, table[1] === 'True' ? 'False{}' : 'True{}'),
  )
  const flippedRun = await verdict(flipped)
  assert.equal(flippedRun.status, 1)
})

test('[bend] a changed goal definition flips an approved example; digests follow the meaning, not the run', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)
  const card = join(root, 'oracle.md')
  const first = await checkAdequacy({ card, cwd: root, bin })
  const again = await checkAdequacy({ card, cwd: root, bin })
  assert.equal(again.inputDigest, first.inputDigest)
  assert.deepEqual(
    again.checks.map(({ kind, target, status }) => [kind, target, status]),
    first.checks.map(({ kind, target, status }) => [kind, target, status]),
  )
  assert.deepEqual(again.minimalPairs, first.minimalPairs)

  await writeFile(card, CARD.replace('the editor sees "Saved"', 'the editor sees the "Saved" toast'))
  const reworded = await checkAdequacy({ card, cwd: root, bin })
  assert.notEqual(reworded.inputDigest, first.inputDigest)

  await writeFile(card, CARD)
  await edit(join(root, 'World.bend'), 'Save.imp(c, h)', 'Save.imp(c, s)')
  const changed = await checkAdequacy({ card, cwd: root, bin })
  assert.notEqual(changed.inputDigest, first.inputDigest)
  const flipped = find(changed, 'example', 'E2')
  assert.equal(flipped.status, 'refuted')
  assert.equal(flipped.reason, 'G1 holds in this world')
  assert.equal(flipped.evidenceKind, 'kernel-computation')
})

test('[bend] the check CLI exits 0 only when every check is proven', async (t) => {
  const bin = await installedBend(t)
  if (!bin) return
  const root = await fixtureCopy(t)
  const cli = () =>
    spawnSync(process.execPath, [join(SCRIPTS, 'oracle-adequacy.mjs'), 'check', '--card', 'oracle.md'], {
      cwd: root,
      encoding: 'utf8',
    })
  const proven = cli()
  assert.equal(proven.status, 0, proven.stderr)
  assert.equal(JSON.parse(proven.stdout).status, 'proven')

  await edit(join(root, 'oracle.md'), /^- Observations:.*$/m, '- Observations: committed ack')
  const refuted = cli()
  assert.equal(refuted.status, 1)
  assert.equal(JSON.parse(refuted.stdout).status, 'refuted')
})
