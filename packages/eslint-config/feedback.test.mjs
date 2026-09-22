/* eslint-disable test/no-import-node-test -- use the built-in runner for ESLint config regression checks */
import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import base from './index.mjs'
import localRules from './local-rules.js'
import next from './next.js'
import quality from './quality.js'
import react from './react.mjs'
import strictTypes from './strict-types.js'
import testing from './testing.js'

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

test('base rejects nested ternaries in JS, TS and JSX but permits a single conditional', async () => {
  for (const extension of ['js', 'ts', 'jsx', 'tsx']) {
    const file = path.join(cwd, `sample-conditional.${extension}`)
    await reports(untyped, 'export const label = (a, b) => a ? "a" : b ? "b" : "c"', 'no-nested-ternary', file)
    await reports(untyped, 'export const label = (a, b) => a ? b ? "a" : "b" : "c"', 'no-nested-ternary', file)
    const messages = await messagesFor(untyped, 'export const label = (a) => a ? "a" : "b"', file)
    assert.deepEqual(messages.filter((message) => message.ruleId?.includes('ternary')), [])
  }
  await reports(untyped, 'export const Label = ({ a, b }) => <div>{a ? "a" : b ? "b" : "c"}</div>', 'no-nested-ternary')
})

test('quality composition keeps one owner for nested conditionals and detects duplicate branches', async () => {
  const eslint = createLinter([...base, ...quality])
  const messages = await messagesFor(eslint, 'export const label = (a, b) => a ? "a" : b ? "b" : "c"')
  assert.equal(messages.filter((message) => message.ruleId === 'no-nested-ternary').length, 1)
  assert.equal(messages.filter((message) => message.ruleId === 'sonarjs/no-nested-conditional').length, 0)
  await reports(eslint, 'export function label(a) { if (a) { return "same" } else { return "same" } }', 'sonarjs/no-all-duplicated-branches')
})

test('quality rules do not run against non-JavaScript languages', async () => {
  const eslint = createLinter([...base, ...quality])
  for (const extension of ['md', 'json', 'yaml']) {
    const config = await eslint.calculateConfigForFile(path.join(cwd, `sample.${extension}`))
    assert.equal(config.rules['sonarjs/max-lines'], undefined)
  }
})

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

test('typed rules do not require a TS project for Markdown code blocks', async () => {
  for (const file of ['guide.md/0_0.ts', 'guide.mdx/0_0.tsx']) {
    const config = await typed.calculateConfigForFile(path.join(cwd, file))
    assert.equal(config.rules['ts/no-floating-promises'], undefined)
    assert.notEqual(config.languageOptions.parserOptions.project, true)
  }
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

test('ai preset adds the AI defects no other preset catches and defers on the rest', async () => {
  const { default: ai } = await import('./ai.js')
  const eslint = createLinter([...base, ...ai])
  const file = path.join(cwd, 'sample-ai.ts')
  const cases = [
    ['no-async-array-callback', 'declare const ids: string[]\nexport const load = (fetchOne: (id: string) => Promise<string>): Promise<string>[] => ids.map(async (id) => fetchOne(id))'],
    ['no-catch-log-rethrow', 'export function run(work: () => void): void { try { work() } catch (error) { console.error(error); throw error } }'],
    ['no-unsafe-deserialize', 'export const parse = (body: string): unknown => JSON.parse(body)'],
    ['no-async-without-await', 'export async function label(): Promise<string> { return "ready" }'],
  ]
  for (const [rule, code] of cases) {
    await reports(eslint, code, `ai-guard/${rule}`, file)
  }

  // Rules another preset already owns, more precisely, stay off - one defect reports once.
  const config = await eslint.calculateConfigForFile(file)
  const deferred = {
    'no-floating-promise': 'ts/no-floating-promises',
    'no-redundant-await': 'unicorn/no-unnecessary-await',
    'no-catch-without-use': 'unicorn/prefer-optional-catch-binding',
    'no-empty-catch': 'sonarjs/no-ignored-exceptions',
    'no-hardcoded-secret': 'sonarjs/no-hardcoded-passwords',
    'no-sql-string-concat': 'sonarjs/sql-queries',
    'no-eval-dynamic': 'no-eval',
    'no-dead-branch': 'ts/no-unnecessary-condition',
    'no-duplicate-logic-block': 'sonarjs/no-identical-functions',
    'no-console-in-handler': 'no-console',
  }
  for (const [rule, owner] of Object.entries(deferred)) {
    assert.equal(config.rules[`ai-guard/${rule}`]?.[0], 0, `${rule} is owned by ${owner}`)
  }
})

test('design preset reports token drift and server/client leaks, and defers a11y and security', async () => {
  const { default: design } = await import('./design.mjs')
  const eslint = createLinter([...base, ...react, ...design])
  const file = path.join(cwd, 'sample-design.tsx')
  const cases = [
    ['no-arbitrary-colors', 'export const Box = () => <div className="bg-[#1A5276]" />'],
    ['no-arbitrary-spacing', 'export const Box = () => <div className="p-[13px]" />'],
    ['no-arbitrary-typography', 'export const Box = () => <div className="text-[13px]" />'],
    ['no-arbitrary-border-radius', 'export const Box = () => <div className="rounded-[7px]" />'],
    ['no-arbitrary-zindex', 'export const Box = () => <div className="z-[100]" />'],
    ['no-placeholder-code', 'export const send = (): void => { throw new Error("Not implemented") }'],
    ['no-leaked-env-on-client', '"use client"\nexport const key = process.env.STRIPE_SECRET_KEY'],
    ['no-server-only-in-client', '"use client"\nimport fs from "node:fs"\nexport const read = (): string => fs.readFileSync("a", "utf8")'],
  ]
  for (const [rule, code] of cases) {
    await reports(eslint, code, `deslint/${rule}`, file)
  }

  // Accessibility, security and Tailwind correctness already have owners.
  const config = await eslint.calculateConfigForFile(file)
  const deferred = {
    'image-alt-text': 'jsx-a11y-x/alt-text',
    'form-labels': 'jsx-a11y-x/label-has-associated-control',
    'aria-validation': 'jsx-a11y-x/role-supports-aria-props',
    'focus-visible-style': '@lodado/local-rules/interaction-hover-needs-focus',
    'no-conflicting-classes': 'better-tailwindcss/no-conflicting-classes',
    'no-hardcoded-secrets': 'sonarjs/no-hardcoded-passwords',
    'no-sql-injection': 'sonarjs/sql-queries',
    'no-eval': 'no-eval',
    'no-empty-catch': 'sonarjs/no-ignored-exceptions',
    'no-async-useeffect': 'react-hooks/set-state-in-effect',
    'no-floating-promise-handler': 'ts/no-floating-promises',
    'no-prod-console': 'no-console',
  }
  for (const [rule, owner] of Object.entries(deferred)) {
    assert.equal(config.rules[`deslint/${rule}`]?.[0], 0, `${rule} is owned by ${owner}`)
  }
})

test('composed presets report console, redundant catch and includes only once', async () => {
  const eslint = createLinter([...base, ...quality, ...localRules])
  const cases = [
    ['console.log("debug")', 'no-console', '@lodado/local-rules/no-console-log'],
    ['export function run(work) { try { return work() } catch (error) { throw error } }', 'no-useless-catch', 'sonarjs/no-useless-catch'],
    ['export const has = (items, item) => items.indexOf(item) !== -1', 'unicorn/prefer-includes', 'e18e/prefer-includes'],
  ]
  for (const [code, owner, duplicate] of cases) {
    const messages = await messagesFor(eslint, code)
    assert.equal(messages.filter((message) => message.ruleId === owner).length, 1, owner)
    assert.equal(messages.filter((message) => message.ruleId === duplicate).length, 0, duplicate)
  }
})

test('quality warns on complexity, skips style metrics and Markdown snippets', async () => {
  const eslint = createLinter([...base, ...quality])
  const config = await eslint.calculateConfigForFile(path.join(cwd, 'sample.ts'))
  assert.equal(config.rules['sonarjs/cognitive-complexity'][0], 1)
  for (const rule of ['max-lines', 'max-lines-per-function', 'no-duplicate-string', 'no-unused-vars', 'block-scoped-var']) {
    assert.equal(config.rules[`sonarjs/${rule}`][0], 0, rule)
  }
  for (const file of ['guide.md/0_0.ts', 'guide.mdx/0_0.tsx']) {
    const snippet = await eslint.calculateConfigForFile(path.join(cwd, file))
    assert.equal(snippet.rules['sonarjs/no-reference-error'], undefined)
  }
})

test('React keeps button safety and a single derived-effect owner', async () => {
  await reports(reactLinter, 'export const Submit = () => <button>Save</button>', '@eslint-react/dom-no-missing-button-type')
  const eslint = createLinter([...base, ...react, ...localRules])
  const config = await eslint.calculateConfigForFile(path.join(cwd, 'sample.tsx'))
  assert.equal(config.rules['react-hooks/set-state-in-effect'][0], 2)
  assert.equal(config.rules['react-you-might-not-need-an-effect/no-derived-state'][0], 0)
  assert.equal(config.rules['@lodado/local-rules/no-derived-state-effect'][0], 0)
})

test('testing routes every supported extension without mixing unit and E2E rules', async () => {
  const eslint = createLinter([...base, ...testing])
  for (const extension of ['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'mts', 'cts']) {
    const unit = await eslint.calculateConfigForFile(path.join(cwd, `sample.test.${extension}`))
    assert.equal(unit.rules['vitest/no-focused-tests'][0], 2, extension)
    assert.equal(unit.rules['playwright/no-wait-for-timeout'], undefined, extension)
    for (const file of [`e2e/sample.spec.${extension}`, `playwright/sample.spec.${extension}`, `sample.e2e.${extension}`]) {
      const e2e = await eslint.calculateConfigForFile(path.join(cwd, file))
      assert.equal(e2e.rules['playwright/no-wait-for-timeout'][0], 2, file)
      assert.equal(e2e.rules['vitest/no-focused-tests'], undefined, file)
    }
  }
})
