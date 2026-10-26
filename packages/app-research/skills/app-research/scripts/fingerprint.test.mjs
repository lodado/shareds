import assert from 'node:assert/strict'
import test from 'node:test'
import { actionKey, fingerprint } from './fingerprint.mjs'
import { screen } from './test-helpers.mjs'

const row = (label) => ({ role: 'cell', label })

test('fingerprint as the same structure with different text', async (t) => {
  await t.test('to be the same screen key when only a label changes', () => {
    const a = fingerprint({
      role: 'window',
      children: [
        { role: 'navigationbar', label: 'Home' },
        { role: 'statictext', label: 'Welcome Ann' },
        { role: 'button', id: 'go', label: 'Go' },
        { role: 'image' },
      ],
    })
    const b = fingerprint({
      role: 'window',
      children: [
        { role: 'navigationbar', label: 'Home' },
        { role: 'statictext', label: 'Welcome Bo' },
        { role: 'button', id: 'go', label: 'Go' },
        { role: 'image' },
      ],
    })
    assert.equal(a.screenKey, b.screenKey)
    assert.notEqual(a.stateKey, b.stateKey)
  })

  await t.test('to be the same state key when only digits change', () => {
    const tree = (n) => ({
      role: 'window',
      children: [
        { role: 'navigationbar', label: 'Inbox' },
        { role: 'statictext', label: `${n} unread` },
        { role: 'button', id: 'x' },
        { role: 'image' },
      ],
    })
    assert.equal(fingerprint(tree(3)).stateKey, fingerprint(tree(40)).stateKey)
  })
})

test('fingerprint as two screens with different headings', () => {
  assert.notEqual(fingerprint(screen('Home', ['Open'])).screenKey, fingerprint(screen('Profile', ['Open'])).screenKey)
})

test('fingerprint as a list whose row count changes', () => {
  const list = (n) =>
    screen(
      'Chats',
      [],
      Array.from({ length: n }, (_, i) => row(`Chat ${i}`)),
    )
  const three = fingerprint(list(3))
  const five = fingerprint(list(5))
  assert.equal(three.screenKey, five.screenKey)
  assert.notEqual(three.stateKey, five.stateKey)
  assert.equal(three.candidates.length, 1, 'repeated rows contribute one representative candidate')
  assert.equal(three.candidates[0].label, 'Chat 0')
})

test('fingerprint as a screen with a spinner appearing', () => {
  const plain = fingerprint(screen('Feed', ['Refresh']))
  const loading = fingerprint(screen('Feed', ['Refresh'], [{ role: 'activityindicator' }]))
  assert.equal(plain.screenKey, loading.screenKey)
  assert.notEqual(plain.stateKey, loading.stateKey)
  assert.equal(plain.loading, false)
  assert.equal(loading.loading, true)
})

test('fingerprint as device-specific field names', () => {
  const tree = {
    type: 'XCUIElementTypeWindow',
    nodes: [
      { type: 'XCUIElementTypeNavigationBar', name: 'Home' },
      { class: 'android.widget.Button', resourceId: 'go', contentDescription: 'Go' },
      { role: 'textfield', identifier: 'q', text: '' },
      { role: 'image' },
    ],
  }
  const result = fingerprint(tree)
  assert.equal(result.title, 'Home')
  assert.deepEqual(
    result.candidates.map(({ action, role, id, label }) => ({ action, role, id, label })),
    [
      { action: 'tap', role: 'button', id: 'go', label: 'Go' },
      { action: 'type', role: 'textfield', id: 'q', label: '' },
    ],
  )
})

test('fingerprint as a thin tree', () => {
  assert.equal(fingerprint({ role: 'window', children: [{ role: 'button', label: 'Go' }] }).confidence, 'low')
  assert.equal(fingerprint(screen('Home', ['Go'])).confidence, 'high')
})

test('fingerprint as malformed input', () => {
  assert.throws(() => fingerprint('text'), /must be an object/)
  assert.throws(() => fingerprint({ role: 'window', children: 'x' }), /children must be an array/)
})

test('actionKey as a label with spacing and case differences', () => {
  assert.equal(actionKey('tap', 'Button', '', '  Sign   In '), actionKey('tap', 'button', '', 'sign in'))
  assert.notEqual(actionKey('tap', 'button', '', 'Page 1'), actionKey('tap', 'button', '', 'Page 2'))
  assert.equal(actionKey('tap', 'button', 'Go_1', 'ignored'), 'tap:button:#go_1')
})
