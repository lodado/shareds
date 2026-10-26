import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { main } from './cli.mjs'
import { fingerprint } from './fingerprint.mjs'
import { classify, gate } from './gate.mjs'
import { lint } from './lint.mjs'
import { next } from './next.mjs'
import { identify, observe } from './observe.mjs'
import { render } from './render.mjs'
import { loadRun } from './state.mjs'
import { act, anchor, newRun, patchRun, screen, writeSnapshot } from './test-helpers.mjs'

const category = (input) => classify({ action: 'tap', ...input })?.category ?? null
const home = (extra = ['Settings', 'Profile']) => screen('Home', extra)

test('classify as checkout, transfer and deletion labels the first version let through', () => {
  const blocked = {
    결제: 'payment',
    '결제 확인': 'payment',
    구매: 'payment',
    바로구매: 'payment',
    주문: 'payment',
    '카카오페이로 결제': 'payment',
    'Apple Pay로 결제': 'payment',
    정기결제: 'payment',
    선물하기: 'payment',
    송금하기: 'payment',
    이체하기: 'payment',
    출금하기: 'payment',
    매수: 'payment',
    '1만원': 'payment',
    '결제-하기': 'payment',
    'Confirm payment': 'payment',
    'Complete payment': 'payment',
    'Make a payment': 'payment',
    'Order now': 'payment',
    'Book now': 'payment',
    'Start my free trial': 'payment',
    'Try free for 7 days': 'payment',
    'Get Premium': 'payment',
    'Unlock Pro': 'payment',
    Transfer: 'payment',
    Withdraw: 'payment',
    '4,99 €': 'payment',
    '₹499': 'payment',
    'Close my account': 'account-deletion',
    'Request account deletion': 'account-deletion',
    'Withdraw membership': 'account-deletion',
    회원탈퇴: 'account-deletion',
    등록: 'outbound-message',
    '리뷰 남기기': 'outbound-message',
    신고하기: 'outbound-message',
    'Allow all cookies': 'legal-consent',
  }
  for (const [label, expected] of Object.entries(blocked)) assert.equal(category({ label }), expected, label)
})

test('classify as labels that only open payment, order or board screens', () => {
  for (const label of [
    '결제 수단',
    '결제 내역',
    '주문 내역',
    '게시판',
    'Payment methods',
    'Payment history',
    'Orders',
    'Books',
    'Reports',
    'Settings',
  ]) {
    assert.equal(category({ label }), null, label)
  }
})

test('classify as characters that hide a word from a plain match', () => {
  for (const label of ['Pa​y now', '결​제하기', 'Bu­y', '결제-하기', 'Вuy', 'ＰＡＹ ＮＯＷ'])
    assert.equal(category({ label }), 'payment', JSON.stringify(label))
})

test('classify as a confirmation whose meaning sits in the dialog', () => {
  assert.equal(category({ label: '확인' }), 'context-required')
  assert.equal(category({ label: 'OK!' }), 'context-required')
  assert.equal(category({ label: '', id: 'btn_confirm' }), 'context-required')
  assert.equal(category({ label: '확인', context: '결제하시겠습니까?' }), 'payment')
  assert.equal(category({ label: '확인', context: '주문하시겠습니까?' }), 'payment')
  assert.equal(category({ label: 'OK', context: 'Are you sure you want to complete this payment?' }), 'payment')
  assert.equal(category({ label: 'OK!', context: '정말 삭제하시겠습니까?' }), 'destructive')
  assert.equal(
    category({ label: 'Yes, I am sure', context: 'Your account will be permanently deleted.' }),
    'account-deletion',
  )
  assert.equal(category({ label: 'I understand', context: 'Delete account' }), 'account-deletion')
  assert.equal(category({ label: '', id: 'btn_confirm', context: 'Pay ₩10,000?' }), 'payment')
  assert.equal(category({ label: 'OK', context: 'Welcome back' }), null)
  assert.equal(category({ label: '취소', context: '정말 삭제하시겠습니까?' }), null)
})

test('classify as swipe and open actions that carry a target', () => {
  const swipe = (label) => classify({ action: 'swipe', label })?.category ?? null
  assert.equal(swipe('Slide to pay'), 'payment')
  assert.equal(swipe('Delete'), 'destructive')
  assert.equal(swipe(''), null)
  assert.equal(classify({ action: 'open', label: 'myapp://checkout/confirm' })?.category, 'payment')
  assert.equal(classify({ action: 'open', label: 'https://example.com/pricing' }), null)
  assert.equal(classify({ action: 'scroll', label: 'Delete' }), null)
})

test('classify as typing into fields that hold secrets or identity', () => {
  const type = (input) => classify({ action: 'type', ...input })?.category ?? null
  for (const input of [
    { id: 'pwd' },
    { label: '암호' },
    { label: '인증 코드' },
    { label: 'Enter code' },
    { label: 'Card number' },
    { label: 'CVC' },
    { label: 'Email' },
    { label: '아이디' },
    { label: 'Field', role: 'securetextfield' },
  ]) {
    assert.equal(type(input), 'credential-entry', JSON.stringify(input))
  }
  assert.equal(type({ label: 'Search' }), null)
})

test('classify as controls named only by an id, or by nothing readable', () => {
  assert.equal(category({ label: '', id: 'PURCHASEBTN' }), 'payment')
  assert.equal(category({ label: '', id: 'purchasebutton' }), 'payment')
  assert.equal(category({ label: '→' }), 'unidentified-target')
  assert.equal(category({ label: '', id: 'com.shop:id/button2' }), 'unidentified-target')
  assert.equal(category({ label: '5' }), null)
})

test('gate as a target that is not on the current screen', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  const missing = await gate(runDir, { action: 'tap', label: 'Checkout done', role: 'button' })
  assert.deepEqual(
    { decision: missing.decision, category: missing.category },
    { decision: 'blocked', category: 'unknown-target' },
  )
  const spoofed = await gate(runDir, { action: 'tap', label: 'Settings' })
  assert.equal(spoofed.decision, 'allow')
  assert.deepEqual(
    { role: spoofed.role, id: spoofed.id, actionKey: spoofed.actionKey },
    { role: 'button', id: 'btn-Settings', actionKey: 'tap:button:#btn-settings' },
  )
})

test('gate as one label on two controls', async () => {
  const { root, runDir } = await newRun()
  await anchor(
    root,
    runDir,
    screen(
      'Home',
      [],
      [
        { role: 'button', label: 'More', id: 'a' },
        { role: 'link', label: 'More', id: 'b' },
      ],
    ),
  )
  assert.equal((await gate(runDir, { action: 'tap', label: 'More' })).category, 'ambiguous-target')
  assert.equal((await gate(runDir, { action: 'tap', label: 'More', role: 'link' })).decision, 'allow')
})

test('gate as a role and id that differ from the candidate no longer reset the repeat count', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home(['Refresh']))
  for (let i = 0; i < 2; i++)
    await act(root, runDir, { action: 'tap', label: 'Refresh', id: 'btn-Refresh' }, home(['Refresh']))
  for (const input of [
    { label: 'Refresh', role: 'button', id: 'btn-Refresh' },
    { label: 'Refresh' },
    { id: 'btn-Refresh' },
  ]) {
    assert.equal((await gate(runDir, { action: 'tap', ...input })).category, 'repeat-limit', JSON.stringify(input))
  }
})

test('gate as receipts issued and never observed', async () => {
  const { root, runDir } = await newRun({ 'max-actions': '2' })
  await anchor(root, runDir, home(['A', 'B', 'C']))
  assert.equal((await gate(runDir, { action: 'tap', label: 'A' })).decision, 'allow')
  assert.equal((await gate(runDir, { action: 'tap', label: 'B' })).decision, 'allow')
  const third = await gate(runDir, { action: 'tap', label: 'C' })
  assert.deepEqual({ decision: third.decision, category: third.category }, { decision: 'blocked', category: 'budget' })
})

test('gate as a screen visited more often than the limit', async () => {
  const { root, runDir } = await newRun()
  await patchRun(runDir, { maxVisitsPerScreen: 1 })
  await anchor(root, runDir, home())
  await act(root, runDir, { action: 'tap', label: 'Settings' }, screen('Settings', []))
  await act(root, runDir, { action: 'back' }, home())
  const verdict = await gate(runDir, { action: 'tap', label: 'Profile' })
  assert.deepEqual(
    { decision: verdict.decision, category: verdict.category },
    { decision: 'blocked', category: 'visit-limit' },
  )
})

test('gate as five commands issued at once', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home(['A', 'B', 'C', 'D', 'E']))
  const results = await Promise.all(['A', 'B', 'C', 'D', 'E'].map((label) => gate(runDir, { action: 'tap', label })))
  assert.equal(new Set(results.map((result) => result.gateId)).size, 5)
  assert.deepEqual((await lint(runDir)).errors, [])
})

test('gate as a dialog button asked about with and without its dialog text', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, screen('Dialog', ['OK']))
  const bare = await gate(runDir, { action: 'tap', label: 'OK' })
  assert.equal(bare.category, 'context-required')
  const retry = await gate(runDir, { action: 'tap', label: 'OK', context: 'Welcome back' })
  assert.equal(retry.decision, 'allow')
  const logged = await next(runDir)
  assert.equal(logged.recordedBlocked, 0, 'a context-required block is not a final decision')
  await render(runDir)
  assert.match(await readFile(join(runDir, 'report/unknowns.md'), 'utf8'), /## Could not identify the target\n\nNone\./)
})

test('next as a confirm-only button it cannot judge', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, screen('Dialog', ['OK', 'Settings']))
  const result = await next(runDir)
  assert.deepEqual(
    result.candidates.map((c) => [c.label, c.needsContext ?? false]),
    [
      ['OK', true],
      ['Settings', false],
    ],
  )
  assert.equal(result.recordedBlocked, 0)
})

test('next as a route whose step the gate would refuse', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, screen('Home', ['Settings', 'Profile']))
  for (let i = 0; i < 2; i++) {
    await act(root, runDir, { action: 'tap', label: 'Settings' }, screen('Settings', ['Home']))
    await act(root, runDir, { action: 'tap', label: 'Home' }, screen('Home', ['Settings', 'Profile']))
  }
  await act(root, runDir, { action: 'tap', label: 'Settings' }, screen('Settings', ['Home'])).catch(() => null)
  await anchor(root, runDir, screen('Settings', ['Home']))
  const result = await next(runDir)
  assert.equal(result.done, false)
  assert.equal(result.route, null, 'the only edge home is at its repeat limit')
  assert.deepEqual(result.unreachable, ['S-001'])
})

test('next as a limit that is not a positive integer', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  await assert.rejects(main(['next', '--run', runDir, '--limit', 'abc']), /--limit must be a positive integer/)
})

test('fingerprint as the same list with one row or two', () => {
  const list = (n) =>
    screen(
      'Chats',
      [],
      Array.from({ length: n }, (_, i) => ({ role: 'cell', label: `Chat ${i}` })),
    )
  assert.equal(fingerprint(list(1)).screenKey, fingerprint(list(2)).screenKey)
  assert.notEqual(fingerprint(list(1)).stateKey, fingerprint(list(2)).stateKey)
})

test('observe as the same layout under a data-driven heading', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, screen('Alice', ['Message']))
  const result = await act(root, runDir, { action: 'tap', label: 'Message' }, screen('Bob', ['Message']))
  assert.equal(result.classification, 'new-screen')
  assert.ok(result.limitations.includes('same-structure-other-title'))
  const preview = await identify(runDir, { snapshot: await writeSnapshot(root, 'carol', screen('Carol', ['Message'])) })
  assert.deepEqual(
    { screenId: preview.screenId, sameStructureAs: preview.sameStructureAs },
    { screenId: null, sameStructureAs: ['S-001', 'S-002'] },
  )
})

test('observe as a screen the agent decided is the same one', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, screen('Alice', ['Message']))
  await act(root, runDir, { action: 'tap', label: 'Message' }, screen('Bob', ['Message']), { 'screen-id': 'S-001' })
  const later = await act(root, runDir, { action: 'tap', label: 'Message' }, screen('Bob', ['Message']))
  assert.deepEqual(
    { screenId: later.screenId, classification: later.classification },
    { screenId: 'S-001', classification: 'known' },
  )
  const preview = await main([
    'identify',
    '--run',
    runDir,
    '--snapshot',
    await writeSnapshot(root, 'bob', screen('Bob', ['Message'])),
  ])
  assert.equal(preview.screenId, 'S-001')
})

test('observe as a relaunch used to reach past the depth limit', async () => {
  const { root, runDir } = await newRun({ 'max-depth': '1' })
  await anchor(root, runDir, home(['Settings']))
  await act(root, runDir, { action: 'tap', label: 'Settings' }, screen('Settings', ['Notifications']))
  assert.equal((await gate(runDir, { action: 'tap', label: 'Notifications' })).category, 'depth-limit')
  await anchor(root, runDir, screen('Settings', ['Notifications']))
  assert.equal((await loadRun(runDir)).screens[1].depth, 1)
  assert.equal((await gate(runDir, { action: 'tap', label: 'Notifications' })).category, 'depth-limit')
})

test('observe as relaunches after the budget is spent', async () => {
  const { root, runDir } = await newRun({ 'max-actions': '1' })
  await anchor(root, runDir, home())
  await anchor(root, runDir, home())
  await assert.rejects(anchor(root, runDir, screen('Checkout done', [])), /Action budget is spent/)
  assert.equal((await loadRun(runDir)).screens.length, 1)
})

test('observe as a receipt carried to a different screen', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  const receipt = await gate(runDir, { action: 'tap', label: 'Settings' })
  await anchor(root, runDir, screen('Profile', ['Edit']))
  await assert.rejects(
    observe(runDir, { gate: receipt.gateId, snapshot: await writeSnapshot(root, 'x', screen('Settings', [])) }),
    /issued on S-001 but the run is now on S-002/,
  )
})

test('observe as an action that failed on the device', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  const result = await act(root, runDir, { action: 'tap', label: 'Settings' }, screen('Crash dialog', ['Report']), {
    result: 'error',
  })
  assert.deepEqual(
    { screenId: result.screenId, classification: result.classification, transitionId: result.transitionId },
    { screenId: 'S-001', classification: 'failed', transitionId: null },
  )
  const state = await loadRun(runDir)
  assert.equal(state.screens.length, 1)
  assert.equal(
    state.screens[0].candidates.some((c) => c.label === 'Report'),
    false,
  )
})

test('observe as an anchor that failed', async () => {
  const { root, runDir } = await newRun()
  await assert.rejects(
    observe(runDir, { anchor: true, result: 'timeout', snapshot: await writeSnapshot(root, 'x', home()) }),
    /use --result ok/,
  )
})

test('observe as a state kind outside the list on a known state', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  const receipt = await gate(runDir, { action: 'tap', label: 'Settings' })
  await assert.rejects(
    observe(runDir, {
      gate: receipt.gateId,
      'state-kind': 'weird',
      snapshot: await writeSnapshot(root, 'same', home()),
    }),
    /--state-kind must be one of/,
  )
})

test('observe as an interrupted earlier write', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  const file = join(runDir, 'screens.json')
  const data = JSON.parse(await readFile(file, 'utf8'))
  data.screens.push({
    ...data.screens[0],
    id: 'S-002',
    firstObservation: 'O-0002',
    parent: null,
    states: [],
    candidates: [],
  })
  await writeFile(file, JSON.stringify(data))
  assert.ok((await lint(runDir)).errors.some((error) => error.code === 'INCONSISTENT_STATE'))
  await assert.rejects(gate(runDir, { action: 'tap', label: 'Settings' }), /state is inconsistent/)
  await assert.rejects(
    observe(runDir, { anchor: true, snapshot: await writeSnapshot(root, 'x', home()) }),
    /state is inconsistent/,
  )
  await assert.rejects(next(runDir), /state is inconsistent/)
})

test('observe as evidence that already sits at the target path', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  const receipt = await gate(runDir, { action: 'tap', label: 'Settings' })
  await writeFile(join(runDir, 'snapshots/O-0002.json'), 'orphan')
  await assert.rejects(
    observe(runDir, { gate: receipt.gateId, snapshot: await writeSnapshot(root, 'x', screen('Settings', [])) }),
    /already exists; an earlier observe was interrupted/,
  )
  assert.equal(await readFile(join(runDir, 'snapshots/O-0002.json'), 'utf8'), 'orphan')
})

test('lint as a feature claiming a screen its evidence never reached', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  await act(root, runDir, { action: 'tap', label: 'Settings' }, screen('Settings', []))
  const feature = {
    id: 'SET-001',
    name: 'Settings',
    status: 'observed',
    screenIds: ['S-002'],
    transitionIds: ['T-001'],
    evidence: [{ kind: 'observation', ref: 'O-0001' }],
  }
  await writeFile(join(runDir, 'features.json'), JSON.stringify({ features: [feature] }))
  const result = await lint(runDir)
  assert.deepEqual(
    result.errors.map((e) => e.message),
    ['no cited observation touched screen S-002', 'no cited observation produced transition T-001'],
  )
})

test('lint as a serverSide flag written as a string', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  await act(root, runDir, { action: 'tap', label: 'Settings' }, screen('Settings', []))
  const policy = {
    id: 'POL-001',
    category: 'auth',
    statement: 'x',
    status: 'observed',
    serverSide: 'true',
    evidence: [{ kind: 'observation', ref: 'O-0002' }],
  }
  await writeFile(join(runDir, 'policies.json'), JSON.stringify({ policies: [policy] }))
  assert.deepEqual(
    (await lint(runDir)).errors.map((e) => e.code),
    ['SCHEMA'],
  )
})

test('lint as documented and code-backed features', async () => {
  const { runDir } = await newRun({ mode: 'public' })
  const doc = {
    kind: 'document',
    url: 'https://example.com/help',
    fetchedAt: '2026-10-26',
    appVersion: 'unknown',
    region: 'KR',
  }
  const features = [
    { id: 'DOC-001', name: 'From help', status: 'documented', evidence: [doc] },
    { id: 'DOC-002', name: 'No doc', status: 'documented', evidence: [] },
    { id: 'DOC-003', name: 'Guess', status: 'inferred', evidence: [] },
    { id: 'DOC-004', name: 'Open question', status: 'unknown', evidence: [] },
    { id: 'DOC-005', name: 'Bare code claim', status: 'code-backed', evidence: [] },
    {
      id: 'DOC-006',
      name: 'From code',
      status: 'code-backed',
      evidence: [{ kind: 'code', ref: 'a.kt#login', appVersion: '1.0' }],
    },
  ]
  await writeFile(join(runDir, 'features.json'), JSON.stringify({ features }))
  const messages = (await lint(runDir)).errors.map((e) => `${e.where}: ${e.message}`)
  assert.deepEqual(messages, [
    'DOC-002: a documented claim needs document evidence',
    'DOC-003: an inferred claim needs a basis',
    'DOC-005: a code-backed claim needs code evidence',
  ])
})

test('lint as claim files with the wrong shape', async () => {
  const { runDir } = await newRun()
  await writeFile(join(runDir, 'features.json'), '[]')
  await writeFile(join(runDir, 'policies.json'), JSON.stringify({ policies: [null, 'x'] }))
  assert.deepEqual(
    (await lint(runDir)).errors.map((e) => e.code),
    ['SCHEMA', 'SCHEMA', 'SCHEMA'],
  )
})

test('lint as a document fetched "1" or on a made-up date', async () => {
  const { runDir } = await newRun({ mode: 'public' })
  for (const fetchedAt of ['1', 'yesterday', '2026-13-45', '']) {
    const doc = { kind: 'document', url: 'https://example.com', fetchedAt, appVersion: 'unknown', region: 'KR' }
    await writeFile(
      join(runDir, 'policies.json'),
      JSON.stringify({
        policies: [{ id: 'POL-001', category: 'auth', statement: 'x', status: 'documented', evidence: [doc] }],
      }),
    )
    assert.deepEqual(
      (await lint(runDir)).errors.map((e) => e.code),
      ['EVIDENCE_INCOMPLETE'],
      fetchedAt,
    )
  }
})

test('lint as a run file with an unknown platform or a duplicate screen id', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  await patchRun(runDir, { platform: 'windows' })
  const file = join(runDir, 'screens.json')
  const data = JSON.parse(await readFile(file, 'utf8'))
  data.screens.push({ ...data.screens[0] })
  await writeFile(file, JSON.stringify(data))
  assert.deepEqual(
    (await lint(runDir)).errors.map((e) => e.code),
    ['RUN_INVALID', 'DUPLICATE_ID'],
  )
})

test('lint as an observation on a screen that does not exist', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  await writeFile(join(runDir, 'screens.json'), JSON.stringify({ screens: [] }))
  assert.deepEqual(
    (await lint(runDir)).errors.map((e) => e.code),
    ['GRAPH_DANGLING'],
  )
})

test('lint as evidence from an action that changed nothing', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  await act(root, runDir, { action: 'tap', label: 'Profile' }, home())
  const policy = {
    id: 'POL-001',
    category: 'usage',
    statement: 'Profile does nothing while signed out.',
    status: 'observed',
    evidence: [{ kind: 'observation', ref: 'O-0002' }],
  }
  await writeFile(join(runDir, 'policies.json'), JSON.stringify({ policies: [policy] }))
  assert.equal((await loadRun(runDir)).observations[1].result, 'no-change')
  assert.deepEqual((await lint(runDir)).errors, [])
})

test('fingerprint as a snapshot beyond the node limit', () => {
  const wide = { role: 'window', children: Array.from({ length: 20001 }, () => ({ role: 'image' })) }
  assert.throws(() => fingerprint(wide), /exceeds 20000 nodes/)
})

test('render as coverage counted once per blocked action', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, screen('Home', ['Pay now', 'Settings']))
  await next(runDir)
  await gate(runDir, { action: 'tap', label: 'Pay now' })
  await gate(runDir, { action: 'tap', label: 'Pay now' })
  await act(root, runDir, { action: 'tap', label: 'Settings' }, screen('Settings', []))
  await render(runDir)
  assert.match(await readFile(join(runDir, 'report/coverage.md'), 'utf8'), /- Actions blocked: 1\n/)
  assert.equal((await main(['status', '--run', runDir])).blocked, 1)
})

test('render as labels that try to start a new Markdown block', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, screen('Home\n## Injected', ['Pay now\n# Also']))
  await next(runDir)
  await render(runDir)
  for (const name of ['unknowns.md', 'sitemap.md', 'ux-flow.md']) {
    assert.doesNotMatch(await readFile(join(runDir, 'report', name), 'utf8'), /^## Injected|^# Also/m, name)
  }
})

test('render as targets the gate could not identify', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  await gate(runDir, { action: 'tap', label: 'Nope' })
  await render(runDir)
  const unknowns = await readFile(join(runDir, 'report/unknowns.md'), 'utf8')
  assert.match(unknowns, /## Could not identify the target\n\n- S-001 tap "Nope" \(unknown-target\)/)
  assert.match(unknowns, /## Stopped by a limit\n\nNone\./)
})

test('observe as a budget cut after the receipt was issued', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, home())
  const receipt = await gate(runDir, { action: 'tap', label: 'Settings' })
  await patchRun(runDir, { maxActions: 0 })
  await assert.rejects(
    observe(runDir, { gate: receipt.gateId, snapshot: await writeSnapshot(root, 'x', screen('Settings', [])) }),
    /Action budget is spent/,
  )
})
