import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'
import { classify, gate } from './gate.mjs'
import { act, anchor, newRun, screen } from './test-helpers.mjs'

const blockedCategory = (label, extra = {}) => classify({ action: 'tap', label, ...extra })?.category ?? null

test('classify as commit labels that spend money, send, delete, consent or leave', () => {
  const expected = {
    결제하기: 'payment',
    'Pay now': 'payment',
    Buy: 'payment',
    '구독 시작': 'payment',
    'Start free trial': 'payment',
    '₩9,900': 'payment',
    '$4.99/month': 'payment',
    '회원 탈퇴': 'account-deletion',
    'Delete account': 'account-deletion',
    '약관에 동의': 'legal-consent',
    'I agree': 'legal-consent',
    전송: 'outbound-message',
    Send: 'outbound-message',
    Submit: 'outbound-message',
    공유하기: 'external-transfer',
    'Invite friends': 'external-transfer',
    로그아웃: 'session-end',
    'Sign out': 'session-end',
    삭제: 'destructive',
    'Reset all': 'destructive',
  }
  for (const [label, category] of Object.entries(expected)) assert.equal(blockedCategory(label), category, label)
})

test('classify as labels that only open a screen or list things', () => {
  for (const label of [
    '결제 수단',
    'Payment methods',
    '구독 관리',
    'Subscriptions',
    '댓글',
    'Comments',
    'Posts',
    'Sent',
    'Shared with me',
    'Settings',
    'Sign in',
    'Resend',
  ]) {
    assert.equal(blockedCategory(label), null, label)
  }
})

test('classify as a bare confirmation inside a dialog', () => {
  assert.equal(blockedCategory('OK', { context: '정말 삭제하시겠습니까?' }), 'destructive')
  assert.equal(blockedCategory('Confirm', { context: 'Complete your purchase' }), 'payment')
  assert.equal(blockedCategory('OK', { context: 'Welcome back' }), null)
  assert.equal(
    blockedCategory('Open', { context: 'Delete account' }),
    'account-deletion',
    'dialog text counts for every label',
  )
  assert.equal(blockedCategory('Cancel', { context: 'Delete account' }), null, 'declining is always safe')
})

test('classify as an icon-only button named only by its id', () => {
  assert.equal(classify({ action: 'tap', label: '', id: 'delete_account_btn' })?.category, 'account-deletion')
  assert.equal(classify({ action: 'tap', label: '', id: 'checkoutButton' })?.category, 'payment')
  assert.equal(classify({ action: 'tap', label: '', id: 'btn-Settings' }), null)
})

test('classify as typing into a credential field', () => {
  assert.equal(classify({ action: 'type', label: 'Password' })?.category, 'credential-entry')
  assert.equal(classify({ action: 'type', label: '', id: 'otp_input' })?.category, 'credential-entry')
  assert.equal(classify({ action: 'type', label: 'Search' }), null)
  assert.equal(classify({ action: 'type', label: '', id: 'passwordField' })?.category, 'credential-entry')
  assert.equal(classify({ action: 'tap', label: 'Password' }), null, 'focusing the field is not entering a credential')
})

test('classify as an action without a label or id', () => {
  assert.equal(classify({ action: 'tap' })?.category, 'unidentified-target')
  assert.equal(classify({ action: 'back' }), null)
  assert.equal(classify({ action: 'scroll' }), null)
})

test('gate as a run without a first observation', async () => {
  const { runDir } = await newRun()
  await assert.rejects(gate(runDir, { action: 'tap', label: 'Go' }), /observe --anchor/)
})

test('gate as an unknown action name', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, screen('Home', ['Go']))
  await assert.rejects(gate(runDir, { action: 'teleport', label: 'Go' }), /--action must be one of/)
})

test('gate as a payment button', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, screen('Home', ['Pay now']))
  const verdict = await gate(runDir, { action: 'tap', label: 'Pay now', role: 'button' })
  assert.equal(verdict.decision, 'blocked')
  assert.equal(verdict.category, 'payment')
  assert.equal(typeof verdict.humanAction, 'string')
  assert.equal(verdict.gateId, 'G-0001')
  const logged = (await readFile(join(runDir, 'gates.jsonl'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
  assert.equal(logged.length, 1)
  assert.equal(logged[0].decision, 'blocked')
})

test('gate as an allowed action', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, screen('Home', ['Settings']))
  const verdict = await gate(runDir, { action: 'tap', label: 'Settings', role: 'button', id: 'btn-Settings' })
  assert.equal(verdict.decision, 'allow')
  assert.equal(verdict.actionKey, 'tap:button:#btn-settings')
  assert.deepEqual(verdict.budget, { used: 0, max: 60 })
})

test('gate as a run in public mode', async () => {
  const { runDir } = await newRun({ mode: 'public' })
  await assert.rejects(gate(runDir, { action: 'tap', label: 'Go' }), /Mode public has no device actions/)
})

test('gate as a spent action budget', async () => {
  const { root, runDir } = await newRun({ 'max-actions': '1' })
  await anchor(root, runDir, screen('Home', ['Settings']))
  await act(root, runDir, { action: 'tap', label: 'Settings' }, screen('Settings', ['Back']))
  const verdict = await gate(runDir, { action: 'back' })
  assert.equal(verdict.decision, 'blocked')
  assert.equal(verdict.category, 'budget')
  assert.equal(verdict.humanAction, null)
})

test('gate as an action from a screen at the depth limit', async () => {
  const { root, runDir } = await newRun({ 'max-depth': '1' })
  await anchor(root, runDir, screen('Home', ['Settings']))
  await act(root, runDir, { action: 'tap', label: 'Settings' }, screen('Settings', ['Notifications']))
  const forward = await gate(runDir, { action: 'tap', label: 'Notifications', role: 'button' })
  assert.equal(forward.category, 'depth-limit')
  const back = await gate(runDir, { action: 'back' })
  assert.equal(back.decision, 'allow', 'leaving a deep screen is always allowed')
})

test('gate as the same action repeated past the limit', async () => {
  const { root, runDir } = await newRun()
  await anchor(root, runDir, screen('Home', ['Refresh']))
  for (let i = 0; i < 2; i++)
    await act(root, runDir, { action: 'tap', label: 'Refresh', id: 'btn-Refresh' }, screen('Home', ['Refresh']))
  const verdict = await gate(runDir, { action: 'tap', label: 'Refresh', role: 'button', id: 'btn-Refresh' })
  assert.equal(verdict.category, 'repeat-limit')
})
