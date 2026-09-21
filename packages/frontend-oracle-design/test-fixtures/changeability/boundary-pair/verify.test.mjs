import assert from 'node:assert/strict'
import test from 'node:test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(process.env.SUBJECT_ROOT ?? '.')
const label = await import(pathToFileURL(resolve(root, process.env.LABEL_MODULE ?? 'wrapper.mjs')))
const lifetime = await import(pathToFileURL(resolve(root, process.env.LIFETIME_MODULE ?? 'lifetime-good.mjs')))

test('public label contract accepts either implementation shape', () => {
  assert.equal(label.renderLabel('Save'), 'Save')
  assert.equal(label.renderLabel(0), '0')
  assert.equal(label.renderLabel(''), '')
})

test('lifetime boundary suppresses late callbacks and duplicate cleanup', () => {
  let emit
  let stopped = 0
  const values = []
  const errors = []
  const originalError = new Error('late')
  const dispose = lifetime.subscribe((onValue, onError) => {
    emit = { onValue, onError }
    return () => { stopped += 1 }
  }, (value) => values.push(value), (error) => errors.push(error))
  emit.onValue('active')
  emit.onError(originalError)
  assert.deepEqual(values, ['active'])
  assert.equal(errors[0], originalError)
  dispose()
  dispose()
  emit.onValue('late')
  emit.onError(originalError)
  assert.deepEqual(values, ['active'])
  assert.equal(errors.length, 1)
  assert.equal(stopped, 1)
})
