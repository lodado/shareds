import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import process from 'node:process'
// eslint-disable-next-line test/no-import-node-test -- package test script intentionally uses node --test.
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  evidenceEntries,
  impliedStatus,
  inferTask,
  loadPacks,
  normalize,
  observedCoverage,
  PACKS_DIRECTORY,
  requestedCoverage,
  routeUtterance,
  tokenVocabulary,
  untaggedValues,
  validatePack,
} from '../skills/frontend-interface-design/scripts/pack.mjs'

const packageDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const skillDirectory = join(packageDirectory, 'skills/frontend-interface-design')
const runner = join(skillDirectory, 'scripts/pack.mjs')

const shipped = await loadPacks()
const vocabulary = await tokenVocabulary()
const packOf = (id) => structuredClone(shipped.find(({ pack }) => pack.id === id).pack)
const check = (pack, fileName = `${pack.id}.json`) => validatePack(pack, { fileName, vocabulary })

async function tempPacks(t, packs) {
  const directory = await mkdtemp(join(tmpdir(), 'fid-packs-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  for (const pack of packs) await writeFile(join(directory, `${pack.id}.json`), JSON.stringify(pack))
  return directory
}

test('every shipped pack satisfies the contract and the directory holds nothing else', async () => {
  assert.ok(shipped.length >= 2, 'the skill ships at least the two documented routes')
  for (const { fileName, pack } of shipped) {
    assert.deepEqual(check(pack, fileName), [], `${fileName} must be valid`)
    assert.ok(evidenceEntries(pack).length > 0)
  }
  const files = await readdir(PACKS_DIRECTORY)
  assert.deepEqual(
    files.filter((name) => !name.endsWith('.json')),
    [],
    'packs/ holds JSON packs only',
  )
})

test('a brand name alone never becomes evidence: an unmatched utterance routes to lineage', () => {
  const decision = routeUtterance('예쁜 쇼핑몰 하나 만들어줘', shipped)
  assert.equal(decision.mode, 'lineage')
  assert.equal(decision.packId, null)
  assert.equal(decision.visualAuthority, 'lineage')
  assert.equal(decision.brandFidelityClaim, false)
  assert.match(decision.note, /brand name alone is not evidence/i)
})

test('an observed pack leads only when the task matches; otherwise the scope drops to tokens-only', () => {
  const matched = routeUtterance('Vercel 랜딩페이지처럼 만들어줘', shipped)
  assert.equal(matched.mode, 'reference-informed-adaptation')
  assert.equal(matched.packId, 'vercel-developer-platform')
  assert.equal(matched.scope, 'full')
  assert.equal(matched.taskMatch, true)
  assert.equal(matched.brandFidelityClaim, true)
  assert.equal(matched.visualAuthority, 'vercel-developer-platform')

  // The defect this test exists for: a marketing landing page is not evidence for a dashboard.
  const mismatched = routeUtterance('Vercel UI처럼 배포 현황 대시보드를 만들어줘', shipped)
  assert.equal(mismatched.packId, 'vercel-developer-platform')
  assert.equal(mismatched.taskMatch, false)
  assert.equal(mismatched.scope, 'tokens-only')
  assert.equal(mismatched.brandFidelityClaim, false)
  assert.match(mismatched.note, /Do NOT transfer the layout slots/)

  // And an unknown task is not the same as a matching one.
  const unknown = routeUtterance('Vercel처럼 만들어줘', shipped)
  assert.equal(unknown.taskSource, 'unknown')
  assert.equal(unknown.taskMatch, null)
  assert.equal(unknown.scope, 'tokens-only')
  assert.equal(unknown.brandFidelityClaim, false)
})

test('asking for a device or theme the pack never loaded is a coverage gap, not a reproduction', () => {
  const gap = routeUtterance('Vercel 랜딩페이지처럼 모바일 라이트로 만들어줘', shipped)
  assert.equal(gap.taskMatch, true, 'the task still matches')
  assert.deepEqual(gap.coverage.gaps, ['pair:mobile/light'])
  assert.equal(gap.scope, 'tokens-only')
  assert.equal(gap.brandFidelityClaim, false, 'an unobserved device/theme pair cannot be claimed')

  const covered = routeUtterance('Vercel 랜딩페이지처럼 데스크톱 다크로 만들어줘', shipped)
  assert.deepEqual(covered.coverage.gaps, [])
  assert.equal(covered.brandFidelityClaim, true)

  assert.deepEqual(requestedCoverage('모바일 라이트 화면'), { device: 'mobile', theme: 'light' })
  assert.deepEqual(requestedCoverage('아무 말'), { device: null, theme: null })
  const observed = observedCoverage(packOf('vercel-developer-platform'))
  assert.ok(observed.pairs.includes('desktop/dark'))
  assert.ok(!observed.pairs.includes('mobile/light'))
})

test('an unverified pack never claims brand fidelity and hands authority back to the lineage', () => {
  const decision = routeUtterance('오늘의집 UI처럼 만들어줘', shipped)
  assert.equal(decision.mode, 'unverified-reference')
  assert.equal(decision.packId, 'ohouse-content-commerce')
  assert.equal(decision.evidenceStatus, 'unverified')
  assert.equal(decision.scope, 'pattern-hint')
  assert.equal(decision.brandFidelityClaim, false)
  assert.equal(decision.visualAuthority, 'lineage')
  assert.equal(decision.lineageFallback, 'playful-commerce')
  assert.match(decision.note, /브랜드 재현이 아니다/)

  const pack = packOf('ohouse-content-commerce')
  assert.deepEqual(pack.provenance, [], 'an unverified pack has no provenance')
  assert.ok(pack.accessNote.length > 20, 'and explains why it could not be observed')
  assert.equal(
    evidenceEntries(pack).every((entry) => entry.evidence === 'unverified'),
    true,
    'every value in an unverified pack is unverified',
  )
})

test('when two brands are named the task picks the authority, not the longer alias', () => {
  const decision = routeUtterance('오늘의집이랑 Vercel처럼 쇼핑 홈 만들어줘', shipped)
  assert.equal(decision.packId, 'ohouse-content-commerce', 'the commerce task wins over alias length')
  assert.equal(decision.candidates.length, 2, 'the other brand is recorded, not silently dropped')

  const marketing = routeUtterance('오늘의집이랑 Vercel처럼 랜딩페이지 만들어줘', shipped)
  assert.equal(marketing.packId, 'vercel-developer-platform')
  assert.deepEqual([...marketing.candidates].sort(), ['ohouse-content-commerce', 'vercel-developer-platform'])
})

test('task inference resolves transactions before marketing and returns null when unsure', () => {
  assert.equal(inferTask('가격 결제 페이지 만들어줘'), 'checkout', 'a transaction outranks a pricing page')
  assert.equal(inferTask('배포 현황 화면'), 'product-surface')
  assert.equal(inferTask('랜딩 페이지'), 'developer-platform-marketing')
  assert.equal(inferTask('그냥 화면 하나'), null)
  assert.equal(normalize(' Vercel·UI '), 'vercelui')
})

test('the validator rejects a claim with nothing behind it', () => {
  const blank = packOf('vercel-developer-platform')
  blank.provenance[0].url = ''
  blank.provenance[0].viewportWidth = 0
  const blankProblems = check(blank)
  assert.ok(blankProblems.some((problem) => problem.includes('PROVENANCE_MISSING_FIELD: [0].url')))
  assert.ok(blankProblems.some((problem) => problem.includes('PROVENANCE_MISSING_FIELD: [0].viewportWidth')))

  const blocked = packOf('vercel-developer-platform')
  for (const source of blocked.provenance) source.httpStatus = 403
  assert.ok(
    check(blocked).some((problem) => problem.startsWith('PROVENANCE_NOT_OK_STATUS')),
    'a 403 is a failed observation, not a source',
  )

  const ungraded = packOf('vercel-developer-platform')
  ungraded.tokens['--ring'] = { value: 'hotpink' }
  assert.ok(check(ungraded).includes('UNTAGGED_VALUE: tokens.--ring has a value but no evidence grade'))
  assert.deepEqual(untaggedValues(ungraded), ['tokens.--ring'])

  const unsourced = packOf('vercel-developer-platform')
  unsourced.provenance = []
  assert.ok(
    check(unsourced).some((problem) => problem.startsWith('OBSERVED_WITHOUT_PROVENANCE')),
    'observed values require a source',
  )

  const statusOnly = packOf('vercel-developer-platform')
  statusOnly.provenance = []
  statusOnly.evidenceStatus = 'partial'
  for (const section of ['tokens', 'components']) for (const value of Object.values(statusOnly[section])) value.evidence = 'estimated'
  for (const list of [statusOnly.typeScale, statusOnly.responsive, statusOnly.layout.slots])
    for (const value of list) value.evidence = 'estimated'
  statusOnly.layout.maxWidth.evidence = 'estimated'
  statusOnly.content.evidence = 'estimated'
  statusOnly.taskTransfer.evidence = 'estimated'
  assert.ok(
    check(statusOnly).some((problem) => problem.startsWith('STATUS_WITHOUT_PROVENANCE')),
    'partial still asserts that a page was loaded',
  )
})

test('the validator rejects an overclaimed status, a moving version and an invented token name', () => {
  const overclaimed = packOf('ohouse-content-commerce')
  overclaimed.evidenceStatus = 'observed'
  const problems = check(overclaimed)
  assert.ok(problems.some((problem) => problem.startsWith('STATUS_OVERCLAIMS')))
  assert.ok(problems.some((problem) => problem.startsWith('STATUS_WITHOUT_PROVENANCE')))

  const lying = packOf('ohouse-content-commerce')
  lying.tokens['--background'].evidence = 'observed'
  assert.ok(check(lying).some((problem) => problem.startsWith('UNVERIFIED_PACK_CLAIMS_OBSERVATION')))

  const silent = packOf('ohouse-content-commerce')
  silent.accessNote = null
  assert.ok(check(silent).some((problem) => problem.startsWith('UNVERIFIED_PACK_NEEDS_ACCESS_NOTE')))

  const moving = packOf('vercel-developer-platform')
  moving.primitives[0].version = 'main'
  assert.ok(check(moving).some((problem) => problem.startsWith('PRIMITIVE_VERSION_NOT_PINNED')))

  const unlicensed = packOf('vercel-developer-platform')
  delete unlicensed.primitives[0].license
  assert.ok(check(unlicensed).includes('PRIMITIVE_MISSING_FIELD: [0].license'))

  const invented = packOf('vercel-developer-platform')
  invented.tokens['--brand-blue'] = { value: 'oklch(50% 0.2 250)', light: 'oklch(50% 0.2 250)', evidence: 'estimated' }
  assert.ok(check(invented).some((problem) => problem.startsWith('UNKNOWN_TOKEN_NAME: --brand-blue')))

  const oneTheme = packOf('vercel-developer-platform')
  delete oneTheme.tokens['--background'].light
  assert.ok(check(oneTheme).some((problem) => problem.startsWith('MISSING_THEME_VALUE: --background')))

  assert.equal(impliedStatus([{ evidence: 'observed' }, { evidence: 'unverified' }]), 'partial')
  assert.equal(impliedStatus([{ evidence: 'estimated' }]), 'partial')
  assert.equal(impliedStatus([]), 'unverified')
})

test('routing refuses an invalid pack instead of quietly treating it as a reference', async (t) => {
  const broken = packOf('vercel-developer-platform')
  broken.provenance = []
  const directory = await tempPacks(t, [broken])

  const { packs, rejected } = await loadPacks(directory, { validate: true })
  assert.deepEqual(packs, [], 'an invalid pack is not loadable for routing')
  assert.equal(rejected.length, 1)
  assert.equal(rejected[0].id, 'vercel-developer-platform')
  assert.equal(routeUtterance('Vercel 랜딩페이지처럼', packs).mode, 'lineage')

  const result = spawnSync(process.execPath, [runner, '--route', 'Vercel 랜딩페이지처럼', '--packs', directory], {
    encoding: 'utf8',
  })
  assert.equal(result.status, 1, 'the CLI fails closed')
  assert.match(result.stderr, /failed validation and were not routable/)
  const decision = JSON.parse(result.stdout)
  assert.equal(decision.mode, 'lineage')
  assert.equal(decision.brandFidelityClaim, false)
  assert.equal(decision.rejectedPacks.length, 1)
})

test('the CLI validates, lists and routes the shipped packs', () => {
  const validate = spawnSync(process.execPath, [runner, '--validate'], { encoding: 'utf8' })
  assert.equal(validate.status, 0, validate.stdout)
  assert.match(validate.stdout, /ok vercel-developer-platform\.json — observed/)
  assert.match(validate.stdout, /ok ohouse-content-commerce\.json — unverified/)

  const list = spawnSync(process.execPath, [runner, '--list'], { encoding: 'utf8' })
  assert.match(list.stdout, /vercel-developer-platform\tVercel\tdeveloper-platform-marketing\tobserved/)
  assert.match(list.stdout, /ohouse-content-commerce\t오늘의집\tcontent-commerce-home\tunverified/)

  const route = spawnSync(process.execPath, [runner, '--route', '오늘의집 UI처럼 만들어줘'], { encoding: 'utf8' })
  assert.equal(route.status, 0)
  assert.equal(JSON.parse(route.stdout).evidenceStatus, 'unverified')

  const usage = spawnSync(process.execPath, [runner], { encoding: 'utf8' })
  assert.equal(usage.status, 2)
  assert.match(usage.stderr, /USAGE: pack\.mjs/)
})

test('the observed pack quotes its raw observation and never reproduces brand assets', async () => {
  const pack = packOf('vercel-developer-platform')
  // The primary action must be identified by role, not by frequency: the most common pair on the
  // page is the secondary treatment, and an earlier draft of this pack got that backwards.
  const primary = pack.rawObservations.dark.interactive.find((entry) => entry.role.startsWith('PRIMARY'))
  assert.equal(primary.background, 'rgb(237, 237, 237)')
  assert.equal(primary.foreground, 'rgb(10, 10, 10)')
  assert.ok(
    pack.rawObservations.dark.interactive.some((entry) => entry.count > primary.count && !entry.role.startsWith('PRIMARY')),
    'a more frequent pair exists and is not the primary',
  )
  assert.match(pack.rawObservations.roleAttributionNote, /Frequency alone does not identify the primary action/)
  assert.match(pack.tokens['--primary'].note, /rgb\(237, ?237, ?237\)/)

  const text = await readFile(join(PACKS_DIRECTORY, 'vercel-developer-platform.json'), 'utf8')
  assert.doesNotMatch(text, /base64|data:image|\.svg|\.png/i, 'a pack carries no assets')
  assert.ok(pack.forbidden.some((rule) => /logo/i.test(rule)))
  assert.ok(pack.allowedModifications.some((rule) => /contrast/i.test(rule)))
  assert.ok(pack.taskTransfer.otherTasks.length > 0, 'the pack says what does not transfer')
})
