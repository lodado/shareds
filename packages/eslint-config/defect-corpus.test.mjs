import assert from 'node:assert/strict'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import a11y from './a11y.js'
import ai from './ai.js'
import fsd from './fsd.mjs'
import functional from './functional.mjs'
import base from './index.mjs'
import interaction from './interaction.js'
import localRules from './local-rules.js'
import next from './next.js'
import quality from './quality.js'
import query from './query.js'
import react from './react.mjs'
import strictTypes from './strict-types.js'
import testing from './testing.js'

/**
 * Defect corpus: the spellings coding agents actually produce, each mapped to the one rule that
 * owns it. Under the full composition - in preset order and reversed - every fixture reports that
 * rule exactly once and nothing else, so a defect never goes unreported, never reports twice and
 * never depends on the order a repo spreads its presets in. `ai` is spread last, as documented.
 */
const cwd = path.dirname(fileURLToPath(import.meta.url))
// The fixtures import packages this package does not declare; a consumer declares them.
const ENVIRONMENT = { rules: { 'sonarjs/no-implicit-dependencies': 'off' } }

const PRESETS = [react, next, a11y, localRules, testing, query, quality, fsd, interaction, functional]
const orders = { 'preset order': PRESETS, reversed: [...PRESETS].reverse() }
const linters = Object.fromEntries(
  Object.entries(orders).map(([name, presets]) => [
    name,
    new ESLint({ cwd, overrideConfigFile: true, overrideConfig: [...base, ...presets.flat(), ...ai, ENVIRONMENT] }),
  ]),
)

const component = (body, head = '') => `${head}export function Panel(): React.ReactNode {\n${body}\n}\n`

/** [what the agent wrote, file, code, the rule that owns it] */
const CASES = [
  ['request in a helper beside the component', 'src/components/Orders.tsx', component('  void load()\n  return <ul />', "async function load(): Promise<unknown> {\n  const response = await fetch('/api/orders')\n  return response.json()\n}\n"), '@lodado/local-rules/no-fetch-in-component'],
  ['window.fetch in a component', 'src/components/Orders.tsx', component("  void window.fetch('/api/orders')\n  return <ul />"), '@lodado/local-rules/no-fetch-in-component'],
  ['an HTTP client instance in a component', 'src/components/Orders.tsx', component("  void api.get('/orders')\n  return <ul />", "import ky from 'ky'\n\nconst api = ky.create({ prefixUrl: '/api' })\n\n"), '@lodado/local-rules/no-fetch-in-component'],
  ['an entity importing a feature', 'src/entities/user/model/user.ts', "import { login } from '@/features/auth'\n\nexport const signIn = login\n", '@lodado/local-rules/fsd-layer-direction'],
  ['a sibling slice through import type', 'src/entities/order/model/order.ts', "import type { User } from '@/entities/user'\n\nexport interface Order { user: User }\n", '@lodado/local-rules/fsd-layer-direction'],
  ['a deep import into another slice', 'src/views/login/ui/Page.tsx', "import { LoginForm } from '@/features/auth/ui/LoginForm'\n\nexport const Page = LoginForm\n", '@lodado/local-rules/fsd-no-deep-import'],
  ['an empty catch', 'src/lib/parse.ts', 'export function parse(text: string): unknown {\n  try {\n    return JSON.parse(text)\n  }\n  catch {}\n  return null\n}\n', 'no-empty'],
  ['a swallowed rejection', 'src/lib/save.ts', 'export function save(send: () => Promise<void>): void {\n  send().catch(() => {})\n}\n', '@lodado/local-rules/no-swallowed-rejection'],
  ['a random key while rendering a list', 'src/components/List.tsx', 'export function List({ items }: { items: string[] }): React.ReactNode {\n  return <ul>{items.map((item) => <li key={crypto.randomUUID()}>{item}</li>)}</ul>\n}\n', '@lodado/local-rules/no-nondeterministic-render'],
  ['a double assertion on a payload', 'src/lib/user.ts', 'export interface User { id: string }\nexport function readUser(raw: string): User {\n  return JSON.parse(raw) as unknown as User\n}\n', '@lodado/local-rules/no-response-type-assertion'],
  ['a conditional skip', 'src/lib/save.test.ts', "import { expect, it } from 'vitest'\n\nit.skipIf(Boolean(globalThis.window))('saves', () => {\n  expect(Math.max(1, 2)).toBe(2)\n})\n", '@lodado/local-rules/require-skip-reason'],
  // oracle-ok: fixture of the weak assertion the testing preset must report
  ['a presence-only assertion', 'src/lib/save.test.ts', "import { expect, it } from 'vitest'\n\nit('saves', () => {\n  expect(Math.max(1, 2)).toBeDefined()\n})\n", 'test/no-restricted-matchers'],
  ['a focused unit test', 'src/lib/save.test.ts', "import { expect, it } from 'vitest'\n\nit.only('saves', () => {\n  expect(Math.max(1, 2)).toBe(2)\n})\n", 'test/no-focused-tests'],
  ['a fixed sleep in a test', 'src/lib/save.test.ts', "import { expect, it } from 'vitest'\n\nit('saves', async () => {\n  await new Promise((resolve) => setTimeout(resolve, 100))\n  expect(Math.max(1, 2)).toBe(2)\n})\n", '@lodado/local-rules/no-arbitrary-sleep-in-tests'],
  ['a CSS locator in an e2e spec', 'e2e/checkout.spec.ts', "import { expect, test } from '@playwright/test'\n\ntest('checks out', async ({ page }) => {\n  await expect(page.locator('.btn-primary')).toBeVisible()\n})\n", 'playwright/no-raw-locators'],
  ['a focused e2e test', 'e2e/checkout.spec.ts', "import { expect, test } from '@playwright/test'\n\ntest.only('checks out', async ({ page }) => {\n  await expect(page.getByRole('button')).toBeVisible()\n})\n", 'playwright/no-focused-test'],
  ['a query function without the abort signal', 'src/features/cart/model/useCart.ts', "import { useQuery } from '@tanstack/react-query'\n\nexport function useCart(): unknown {\n  return useQuery({ queryKey: ['cart'], queryFn: () => fetch('/api/cart') }).data\n}\n", '@lodado/local-rules/require-abort-signal-passthrough'],
  ['an async client component', 'src/app/cart/Cart.tsx', "'use client'\n\nexport default async function Cart({ load }: { load: () => Promise<string> }): Promise<React.ReactNode> {\n  const title = await load()\n  return <p>{title}</p>\n}\n", '@next/next/no-async-client-component'],
  ['a live secret key', 'src/lib/stripe.ts', "export const STRIPE_SECRET_KEY = 'sk_live_51HxYzAbCdEfGhIjKlMnOp'\n", 'ai-guard/no-hardcoded-secret'],
  ['an environment read outside config', 'src/features/cart/model/api.ts', "import process from 'node:process'\n\nexport const baseUrl = process.env.API_URL\n", 'node/no-process-env'],
  ['a described disable of a correctness rule', 'src/lib/load.ts', 'export function save(send: () => Promise<void>): void {\n  // eslint-disable-next-line @lodado/local-rules/no-swallowed-rejection -- best effort\n  send().catch(() => {})\n}\n', 'eslint-comments/no-restricted-disable'],
  ['a div acting as a button', 'src/components/Row.tsx', 'export function Row({ onOpen }: { onOpen: () => void }): React.ReactNode {\n  return <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={onOpen}>Open</div>\n}\n', 'jsx-a11y-x/prefer-tag-over-role'],
  ['a hover style whose focus style removes the outline', 'src/components/Save.tsx', 'export function Save(): React.ReactNode {\n  return <button type="button" className="hover:bg-slate-100 focus:outline-none">Save</button>\n}\n', '@lodado/local-rules/interaction-hover-needs-focus'],
]

for (const [label, presets] of Object.entries(linters)) {
  test(`every corpus defect reports once, from its owner (${label})`, async () => {
    for (const [what, file, code, owner] of CASES) {
      const [result] = await presets.lintText(code, { filePath: path.join(cwd, file) })
      const reported = result.messages.map((message) => message.ruleId ?? message.message)
      assert.deepEqual(reported, [owner], `${what} (${file})`)
    }
  })
}

test('typed corpus defects report once, from strict-types', async () => {
  const fixture = path.join(cwd, 'strict-types-fixture/sample.ts')
  const eslint = new ESLint({ cwd, overrideConfigFile: true, overrideConfig: [...base, ...quality, ...strictTypes] })
  const cases = [
    ['an assertion laundered through unknown', 'interface Item { id: string }\nexport function read(value: unknown): Item {\n  return value as Item\n}\n', 'ts/no-unsafe-type-assertion'],
    ['a non-null assertion', 'export function find(items: string[]): string {\n  return items.find((item) => item.length > 1)!\n}\n', 'ts/no-non-null-assertion'],
    ['an explicit any', 'export function keep(value: any): unknown {\n  return value\n}\n', 'ts/no-explicit-any'],
  ]
  for (const [what, code, owner] of cases) {
    const [result] = await eslint.lintText(code, { filePath: fixture })
    assert.deepEqual(result.messages.map((message) => message.ruleId ?? message.message), [owner], what)
  }
})
