/* eslint-disable test/no-import-node-test -- use the built-in runner for ESLint config regression checks */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import base from './index.mjs'
import next from './next.js'
import react from './react.mjs'
import strictTypes from './strict-types.js'

const cwd = path.dirname(fileURLToPath(import.meta.url))
const typedFile = path.join(cwd, 'strict-types-fixture/sample.ts')
const createLinter = (configs) => new ESLint({ cwd, overrideConfigFile: true, overrideConfig: configs })
const typed = createLinter([...base, ...strictTypes])
const untyped = createLinter(base)
const reactLinter = createLinter([...base, ...react])

const messagesFor = async (eslint, code, filePath = path.join(cwd, 'sample.tsx')) => {
  const [result] = await eslint.lintText(code, { filePath })
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages))
  return result.messages
}

const reports = async (eslint, code, ruleId, filePath) => {
  const messages = await messagesFor(eslint, code, filePath)
  assert.ok(messages.some((message) => message.ruleId === ruleId), `${ruleId}: ${JSON.stringify(messages)}`)
}

test('typed feedback rejects unhandled promises and any propagation', async () => {
  const cases = [
    ['no-floating-promises', 'Promise.resolve(1)'],
    ['no-floating-promises', 'void Promise.resolve(1)'],
    ['no-misused-promises', 'declare const pending: Promise<boolean>; if (pending) { void 0 }'],
    ['no-unsafe-assignment', 'export const payload = JSON.parse("{}")'],
    ['no-unsafe-argument', 'declare function save(value: string): void; save(JSON.parse("{}"))'],
    ['no-unsafe-call', 'declare const run: any; run()'],
    ['no-unsafe-member-access', 'declare const payload: any; export const value = payload.name'],
    ['no-unsafe-return', 'export function parse(): unknown[] { return JSON.parse("[]") }'],
    ['no-unnecessary-condition', 'export function label(value: string) { return value?.length }'],
  ]
  for (const [rule, code] of cases) {
    await reports(typed, code, `ts/${rule}`, typedFile)
  }
})

test('handled promises and unknown narrowing pass typed feedback', async () => {
  const messages = await messagesFor(typed, `
export async function parse(): Promise<number> {
  const value: unknown = await Promise.resolve(42)
  return typeof value === 'number' ? value : 0
}
`, typedFile)
  assert.deepEqual(messages.filter((message) => message.ruleId?.startsWith('ts/')), [])
})

test('typed rules do not force JavaScript config files into a TS project', async () => {
  const config = await typed.calculateConfigForFile(path.join(cwd, 'eslint.config.mjs'))
  assert.equal(config.languageOptions.parserOptions.project, undefined)
  assert.equal(config.rules['ts/switch-exhaustiveness-check'], undefined)
  await messagesFor(typed, 'export default []', path.join(cwd, 'eslint.config.mjs'))
})

test('suppression comments must name rules and explain a necessary exception', async () => {
  await reports(untyped, '// eslint-disable-next-line no-debugger\ndebugger', 'eslint-comments/require-description')
  await reports(untyped, '/* eslint-disable -- deliberate test */\ndebugger', 'eslint-comments/no-unlimited-disable')
  const unused = await messagesFor(untyped, '// eslint-disable-next-line no-debugger -- deliberate test\nexport const value = 1')
  assert.ok(unused.some((message) => message.ruleId === null && message.severity === 2 && /Unused eslint-disable/.test(message.message)))
  const valid = await messagesFor(untyped, '// eslint-disable-next-line no-debugger -- intentional debugger fixture\ndebugger')
  assert.deepEqual(valid, [])
})

test('React compiler diagnostics and exhaustive dependencies remain errors after Next composition', async () => {
  const eslint = createLinter([...base, ...react, ...next])
  const config = await eslint.calculateConfigForFile(path.join(cwd, 'sample.tsx'))
  for (const rule of ['purity', 'immutability', 'refs', 'static-components', 'exhaustive-deps', 'error-boundaries', 'globals', 'use-memo']) {
    assert.equal(config.rules[`react-hooks/${rule}`]?.[0], 2, rule)
  }
  for (const resource of ['event-listener', 'fetch', 'intersection-observer', 'interval', 'resize-observer', 'timeout']) {
    assert.equal(config.rules[`@eslint-react/web-api-no-leaked-${resource}`]?.[0], 1, resource)
  }
  // ESLint React ports of the compiler rules stay off so one defect reports once.
  for (const rule of ['rules-of-hooks', 'purity', 'set-state-in-effect', 'exhaustive-deps']) {
    assert.equal(config.rules[`@eslint-react/${rule}`]?.[0], 0, rule)
  }
  assert.equal(config.rules['@eslint-react/no-class-component']?.[0], 2)
  assert.equal(config.rules['@next/next/no-img-element']?.[0], 1)
})

test('React purity and immutability report real render defects', async () => {
  await reports(reactLinter, 'export const Clock = () => <span>{Date.now()}</span>', 'react-hooks/purity')
  await reports(reactLinter, 'export const Label = (props) => { props.name = "changed"; return <span>{props.name}</span> }', 'react-hooks/immutability')
  await reports(reactLinter, 'import { useRef } from "react"; export const RefValue = () => { const ref = useRef(0); return <span>{ref.current}</span> }', 'react-hooks/refs')
  await reports(reactLinter, 'export const Outer = () => { const Inner = () => <span />; return <Inner /> }', 'react-hooks/static-components')
})

test('effect resources must be released, while symmetric cleanup is accepted', async () => {
  const effect = (cleanup) => `
import { useEffect } from 'react'
export const Listener = () => {
  useEffect(() => {
    const onResize = () => undefined
    window.addEventListener('resize', onResize)
    ${cleanup}
  }, [])
  return null
}
`
  await reports(reactLinter, effect(''), '@eslint-react/web-api-no-leaked-event-listener')
  const messages = await messagesFor(reactLinter, effect("return () => window.removeEventListener('resize', onResize)"))
  assert.deepEqual(messages.filter((message) => message.ruleId?.startsWith('@eslint-react/web-api-')), [])
})

test('base flags async and dependency habits that pass the type checker', async () => {
  const cases = [
    ['unicorn/no-useless-promise-resolve-reject', 'export async function load() { return Promise.resolve(1) }'],
    ['unicorn/no-unnecessary-await', 'export async function load() { return await 1 }'],
    ['unicorn/no-thenable', 'export const box = { then() { return 1 } }'],
    ['unicorn/no-useless-spread', 'export const copy = [...[1, 2]]'],
    ['unicorn/no-immediate-mutation', 'const items = []\nitems.push(1)\nexport { items }'],
    ['unicorn/prefer-optional-catch-binding', 'try { JSON.parse("{") } catch (error) { console.error("bad") }'],
    ['e18e/ban-dependencies', "import isOdd from 'is-odd'\nexport { isOdd }"],
  ]
  for (const [rule, code] of cases) {
    await reports(untyped, code, rule, path.join(cwd, 'sample-habits.ts'))
  }
})

test('tailwind preset reports conflicting and unknown classes against the CSS entry point', async () => {
  const { default: tailwind } = await import('./tailwind.js')
  const eslint = createLinter([
    ...base,
    ...react,
    ...tailwind,
    { settings: { 'better-tailwindcss': { entryPoint: path.join(cwd, 'tailwind-fixture/app.css') } } },
  ])
  await reports(eslint, 'export const Box = () => <div className="p-2 p-4" />', 'better-tailwindcss/no-conflicting-classes')
  await reports(eslint, 'export const Box = () => <div className="text-brandish" />', 'better-tailwindcss/no-unknown-classes')
  const config = await eslint.calculateConfigForFile(path.join(cwd, 'sample.tsx'))
  assert.equal(config.rules['better-tailwindcss/enforce-consistent-class-order'], undefined)
})
