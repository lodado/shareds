/* eslint-disable @lodado/local-rules/no-console-log -- test progress output */
/**
 * RuleTester suite for every rule shipped by this plugin.
 * Run with `node test.js` - RuleTester throws on the first mismatch.
 */
const { RuleTester } = require('eslint')

const rules = require('./rules')

const ruleTester = new RuleTester({
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
})

ruleTester.run('no-console-log', rules['no-console-log'], {
  valid: ['console.error("boom")', 'logger.log("hi")'],
  invalid: [{ code: 'console.log("hi")', errors: 1 }],
})

ruleTester.run('no-complex-ternary', rules['no-complex-ternary'], {
  valid: [
    'const label = isOpen ? "close" : "open"',
    'const dir = current.dir === "asc" ? "desc" : "asc"',
    'const view = count > 0 ? renderList() : renderEmpty()',
    'const next = flag ? { key, dir: "asc" } : null',
  ],
  invalid: [
    {
      code: 'const dir = a ? (b ? "x" : "y") : "z"',
      errors: [{ messageId: 'nestedTernary' }],
    },
    {
      code: 'const dir = a ? "x" : b ? "y" : "z"',
      errors: [{ messageId: 'nestedTernary' }],
    },
    {
      code: 'const sort = q.sort?.key === key && q.sort.dir === "asc" ? { key, dir: "desc" } : { key, dir: "asc" }',
      errors: [{ messageId: 'complexTest' }],
    },
    {
      code: 'const label = a && b ? "x" : "y"',
      errors: [{ messageId: 'complexTest' }],
    },
    {
      code: 'const name = user?.name ? user.name : "anon"',
      errors: [{ messageId: 'complexTest' }],
    },
  ],
})

ruleTester.run('require-exact-call-count', rules['require-exact-call-count'], {
  valid: [
    'expect(fetchSpy).toHaveBeenCalledTimes(1)',
    'expect(fetchSpy).not.toHaveBeenCalled()',
    'expect(fetchSpy).not.toBeCalled()',
    'expect(fetchSpy).toHaveBeenCalledWith({ id: "n1" })',
    'expect(fetchSpy.mock.calls.length).toBe(2)',
    'expect(items.length).toBeGreaterThan(0)',
  ],
  invalid: [
    { code: 'expect(fetchSpy).toHaveBeenCalled()', errors: [{ messageId: 'exactCount' }] },
    { code: 'expect(fetchSpy).toBeCalled()', errors: [{ messageId: 'exactCount' }] },
    { code: 'expect(fetchSpy).resolves.toHaveBeenCalled()', errors: [{ messageId: 'exactCount' }] },
    { code: 'expect(fetchSpy.mock.calls.length).toBeGreaterThan(0)', errors: [{ messageId: 'exactLength' }] },
    { code: 'expect(fetchSpy.mock.calls.length).toBeTruthy()', errors: [{ messageId: 'exactLength' }] },
  ],
})

ruleTester.run('require-skip-reason', rules['require-skip-reason'], {
  valid: [
    'test("submits once", () => {})',
    '// skip: jsdom cannot observe response ordering - covered by O7 in Playwright\ntest.skip("out of order", () => {})',
    'it.todo("retry recovery") // pending API contract, tracked in ORACLE-12',
    '/* skip: needs a real payment sandbox */\ndescribe.skip("checkout", () => {})',
    '// skip: flaky under CI clock skew\ntest.describe.skip("timers", () => {})',
  ],
  invalid: [
    { code: 'test.skip("out of order", () => {})', errors: [{ messageId: 'missingReason' }] },
    { code: 'it.skip("retry", () => {})', errors: [{ messageId: 'missingReason' }] },
    { code: 'it.todo("retry")', errors: [{ messageId: 'missingReason' }] },
    { code: 'describe.skip("checkout", () => {})', errors: [{ messageId: 'missingReason' }] },
    { code: 'test.describe.skip("timers", () => {})', errors: [{ messageId: 'missingReason' }] },
    { code: 'xit("retry", () => {})', errors: [{ messageId: 'missingReason' }] },
    { code: '//\ntest.skip("out of order", () => {})', errors: [{ messageId: 'missingReason' }] },
  ],
})

ruleTester.run('require-effect-annotation', rules['require-effect-annotation'], {
  valid: [
    '// sync: window resize -> local size state, cleanup removes the listener\nuseEffect(() => {}, [])',
    'useEffect(() => {}, []) // sync: analytics SDK page view, no cleanup needed',
    '// sync: IntersectionObserver, cleanup disconnects\nReact.useLayoutEffect(() => {}, [])',
    'useMemo(() => compute(a), [a])',
  ],
  invalid: [
    { code: 'useEffect(() => {}, [])', errors: [{ messageId: 'missingAnnotation' }] },
    { code: 'React.useEffect(() => {}, [])', errors: [{ messageId: 'missingAnnotation' }] },
    { code: 'useLayoutEffect(() => {}, [])', errors: [{ messageId: 'missingAnnotation' }] },
    { code: '// \nuseEffect(() => {}, [])', errors: [{ messageId: 'missingAnnotation' }] },
  ],
})

ruleTester.run('no-refetch-in-effect', rules['no-refetch-in-effect'], {
  valid: [
    'const onClick = () => { refetch() }',
    'useEffect(() => { subscribe() }, [])',
    'useEffect(() => {}, [refetch])',
    'useQuery({ queryKey: ["list", filter], queryFn })',
  ],
  invalid: [
    { code: 'useEffect(() => { refetch() }, [filter])', errors: [{ messageId: 'refetchInEffect' }] },
    { code: 'useEffect(() => { query.refetch() }, [filter])', errors: [{ messageId: 'refetchInEffect' }] },
    { code: 'useLayoutEffect(() => { refetch() }, [filter])', errors: [{ messageId: 'refetchInEffect' }] },
    { code: 'useEffect(() => { if (filter) { refetch() } }, [filter])', errors: [{ messageId: 'refetchInEffect' }] },
  ],
})

ruleTester.run('no-use-client-above-leaf', rules['no-use-client-above-leaf'], {
  valid: [
    { code: "'use client'\nexport const Button = () => null", filename: 'app/ui/Button.tsx' },
    { code: 'export default function Page() {}', filename: 'app/page.tsx' },
    { code: "'use client'\nexport const useThing = () => null", filename: 'src/app/(shop)/cart/model/useThing.ts' },
    { code: "'use strict'\nexport default function Page() {}", filename: 'app/page.tsx' },
  ],
  invalid: [
    {
      code: "'use client'\nexport default function Page() {}",
      filename: 'app/page.tsx',
      errors: [{ messageId: 'clientBoundaryTooHigh' }],
    },
    {
      code: "'use client'\nexport default function Layout({ children }) { return children }",
      filename: 'src/app/(shop)/cart/layout.tsx',
      errors: [{ messageId: 'clientBoundaryTooHigh' }],
    },
    {
      code: "'use client'\nexport default function Template({ children }) { return children }",
      filename: 'app/dashboard/template.jsx',
      errors: [{ messageId: 'clientBoundaryTooHigh' }],
    },
  ],
})

ruleTester.run('no-arbitrary-sleep-in-tests', rules['no-arbitrary-sleep-in-tests'], {
  valid: [
    { code: 'await waitFor(() => expect(save).toHaveBeenCalledTimes(1))', filename: 'form.test.tsx' },
    { code: 'vi.advanceTimersByTime(1000)', filename: 'form.test.tsx' },
    { code: 'deferred.resolve(response)', filename: 'form.test.tsx' },
    { code: 'await waitForRequest(page)', filename: 'e2e/checkout.spec.ts' },
    // Production code has its own reasons to wait - this rule is about test determinism.
    { code: 'await new Promise((resolve) => setTimeout(resolve, 100))', filename: 'src/retry.ts' },
  ],
  invalid: [
    {
      code: 'await new Promise((resolve) => setTimeout(resolve, 100))',
      filename: 'form.test.tsx',
      errors: [{ messageId: 'arbitrarySleep' }],
    },
    { code: 'await sleep(100)', filename: 'form.test.tsx', errors: [{ messageId: 'arbitrarySleep' }] },
    { code: 'await delay(50)', filename: 'e2e/checkout.spec.ts', errors: [{ messageId: 'arbitrarySleep' }] },
    {
      code: 'await new Promise((resolve) => { setTimeout(resolve, 0) })',
      filename: '__tests__/form.js',
      errors: [{ messageId: 'arbitrarySleep' }],
    },
  ],
})

ruleTester.run('no-fetch-in-component', rules['no-fetch-in-component'], {
  valid: [
    'export const loadItem = (id) => fetch(`/api/items/${id}`)',
    'const Item = ({ data }) => <li>{data.name}</li>',
    'const Panel = ({ id }) => { const { data } = useQuery({ queryKey: ["item", id], queryFn: loadItem }); return <div>{data}</div> }',
    'export async function GET() { return fetch("/api/items") }',
  ],
  invalid: [
    {
      code: 'const Item = ({ id }) => { const onClick = () => { fetch(`/api/items/${id}`) }; return <button onClick={onClick} /> }',
      errors: [{ messageId: 'transportInComponent' }],
    },
    {
      code: 'function Panel() { useEffect(() => { fetch("/api/x") }, []); return <div /> }',
      errors: [{ messageId: 'transportInComponent' }],
    },
    {
      code: 'const Panel = () => { axios.get("/api/x"); return <div /> }',
      errors: [{ messageId: 'transportInComponent' }],
    },
    {
      code: 'const row = () => { fetch("/api/x"); return <tr /> }',
      errors: [{ messageId: 'transportInComponent' }],
    },
  ],
})

ruleTester.run('require-abort-signal-passthrough', rules['require-abort-signal-passthrough'], {
  valid: [
    'useQuery({ queryKey: key, queryFn: ({ signal }) => fetch(url, { signal }) })',
    'useQuery({ queryKey: key, queryFn: () => fetch(url) })',
    'useQuery({ queryKey: key, queryFn: ({ signal }) => client.get(url, { signal }) })',
    'useQuery({ queryKey: key, queryFn: async ({ signal }) => { const res = await fetch(url, { method: "POST", signal }); return res.json() } })',
  ],
  invalid: [
    {
      code: 'useQuery({ queryKey: key, queryFn: ({ signal }) => fetch(url) })',
      errors: [{ messageId: 'missingSignalPassthrough' }],
    },
    {
      code: 'useQuery({ queryKey: key, queryFn: async ({ signal }) => { const res = await fetch(url, { method: "POST" }); return res.json() } })',
      errors: [{ messageId: 'missingSignalPassthrough' }],
    },
  ],
})

ruleTester.run('scenario-test-filename', rules['scenario-test-filename'], {
  valid: [
    { code: 'export const x = 1', filename: 'Button.scenario.test.tsx' },
    { code: 'export const x = 1', filename: 'format.unit.test.ts' },
    { code: 'export const x = 1', filename: 'e2e/checkout.spec.ts' },
    { code: 'export const x = 1', filename: 'src/index.ts' },
  ],
  invalid: [
    { code: 'export const x = 1', filename: 'Button.test.tsx', errors: [{ messageId: 'unconventionalName' }] },
    { code: 'export const x = 1', filename: 'src/format.test.ts', errors: [{ messageId: 'unconventionalName' }] },
  ],
})

ruleTester.run('no-css-locator-without-reason', rules['no-css-locator-without-reason'], {
  valid: [
    { code: 'page.getByRole("button", { name: "Save" })', filename: 'e2e/checkout.spec.ts' },
    { code: 'page.locator("[data-testid=\\"cart\\"]")', filename: 'e2e/checkout.spec.ts' },
    { code: 'page.locator("role=button[name=\\"Save\\"]")', filename: 'e2e/checkout.spec.ts' },
    {
      code: '// CSS is the only handle - the legacy widget renders no accessible name\npage.locator(".legacy-widget")',
      filename: 'e2e/checkout.spec.ts',
    },
    { code: 'page.locator(".legacy-widget")', filename: 'src/app.ts' },
  ],
  invalid: [
    { code: 'page.locator(".legacy-widget")', filename: 'e2e/checkout.spec.ts', errors: [{ messageId: 'cssLocator' }] },
    { code: 'page.locator("div > span")', filename: 'e2e/checkout.spec.ts', errors: [{ messageId: 'cssLocator' }] },
    {
      code: 'const row = page.locator("#row-1")',
      filename: 'e2e/checkout.spec.ts',
      errors: [{ messageId: 'cssLocator' }],
    },
  ],
})

ruleTester.run('no-derived-state-effect', rules['no-derived-state-effect'], {
  valid: [
    'useEffect(() => { setSize(window.innerWidth) }, [])',
    'useEffect(() => { setUser(mapUser(data)) }, [data])',
    'useEffect(() => { setOpen(true) }, [])',
    'useEffect(() => { setTotal(price * quantity); track("recalc") }, [price, quantity])',
    'useEffect(() => { if (price) { setTotal(price) } }, [price])',
  ],
  invalid: [
    {
      code: 'useEffect(() => { setFullName(first + " " + last) }, [first, last])',
      errors: [{ messageId: 'derivedStateInEffect' }],
    },
    {
      code: 'useEffect(() => { setTotal(price * quantity) }, [price, quantity])',
      errors: [{ messageId: 'derivedStateInEffect' }],
    },
    { code: 'useEffect(() => setVisible(count > 0), [count])', errors: [{ messageId: 'derivedStateInEffect' }] },
  ],
})

ruleTester.run('fsd-no-deep-import', rules['fsd-no-deep-import'], {
  valid: [
    { code: "import { LoginForm } from '@/features/auth'", filename: '/repo/src/views/login/ui/Page.tsx' },
    { code: "import { auth } from '@/features/auth/index'", filename: '/repo/src/views/login/ui/Page.tsx' },
    { code: "import { repo } from '@/features/auth/index.server'", filename: '/repo/src/app/api/login/route.ts' },
    { code: "import { repo } from '@/features/auth/api/server'", filename: '/repo/src/app/api/login/route.ts' },
    { code: "import { UserRef } from '@/entities/user/@x/order'", filename: '/repo/src/entities/order/model/order.ts' },
    // internal imports within the same slice stay free
    {
      code: "import { store } from '@/features/auth/model/store'",
      filename: '/repo/src/features/auth/ui/LoginForm.tsx',
    },
    { code: "import { store } from '../model/store'", filename: '/repo/src/features/auth/ui/LoginForm.tsx' },
    { code: "import { format } from '@/shared/lib/format-date'", filename: '/repo/src/views/login/ui/Page.tsx' },
  ],
  invalid: [
    {
      code: "import { LoginForm } from '@/features/auth/ui/LoginForm'",
      filename: '/repo/src/views/login/ui/Page.tsx',
      errors: [{ messageId: 'deepImport' }],
    },
    {
      code: "import { store } from '../../features/auth/model/store'",
      filename: '/repo/src/views/login/ui/Page.tsx',
      errors: [{ messageId: 'deepImport' }],
    },
    {
      code: "export { likePost } from '@/features/like/model/mutation'",
      filename: '/repo/src/widgets/feed/index.ts',
      errors: [{ messageId: 'deepImport' }],
    },
  ],
})

ruleTester.run('fsd-no-banned-segments', rules['fsd-no-banned-segments'], {
  valid: [
    { code: 'export {}', filename: '/repo/src/features/auth/ui/LoginForm.tsx' },
    { code: 'export {}', filename: '/repo/src/features/auth/model/useLogin.ts' },
    // outside sliced layers the convention does not apply
    { code: 'export {}', filename: '/repo/src/shared/hooks/useDebounce.ts' },
  ],
  invalid: [
    { code: 'export {}', filename: '/repo/src/features/auth/components/LoginForm.tsx', errors: 1 },
    { code: 'export {}', filename: '/repo/src/features/auth/hooks/useLogin.ts', errors: 1 },
    { code: 'export {}', filename: '/repo/src/entities/product/utils/format.ts', errors: 1 },
  ],
})

ruleTester.run('fsd-no-driver-outside-repository', rules['fsd-no-driver-outside-repository'], {
  valid: [
    { code: "import { drizzle } from 'drizzle-orm'", filename: '/repo/src/shared/api/db/client.ts' },
    { code: "import pg from 'pg'", filename: '/repo/src/entities/product/api/product.repository.ts' },
    { code: "import { sql } from 'drizzle-orm/sql'", filename: '/repo/src/shared/api/db/seed.ts' },
    { code: "import { z } from 'zod'", filename: '/repo/src/app/api/products/route.ts' },
  ],
  invalid: [
    {
      code: "import pg from 'pg'",
      filename: '/repo/src/app/api/products/route.ts',
      errors: [{ messageId: 'driverOutsideBoundary' }],
    },
    {
      code: "import { drizzle } from 'drizzle-orm'",
      filename: '/repo/src/features/like/model/useToggleLike.ts',
      errors: [{ messageId: 'driverOutsideBoundary' }],
    },
    {
      code: "const pg = require('pg')",
      filename: '/repo/src/views/products/ui/Page.tsx',
      errors: [{ messageId: 'driverOutsideBoundary' }],
    },
  ],
})

/** The state-modeling rules read TypeScript type nodes, so they need the TS parser. */
const typedRuleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
})

typedRuleTester.run('require-discriminated-state', rules['require-discriminated-state'], {
  valid: [
    // One member per state - every field belongs to the state that owns it.
    "type S = { status: 'editing'; amount: number } | { status: 'success'; paymentId: string }",
    // A discriminant with no optional siblings is already exhaustive.
    "type S = { status: 'idle' | 'done'; amount: number }",
    // Optional fields without a state discriminant are ordinary props.
    'type Props = { label?: string; icon?: string }',
  ],
  invalid: [
    {
      code: "type S = { status: 'idle' | 'loading' | 'failure'; data?: Payload; error?: string }",
      errors: [{ messageId: 'optionalSoup' }],
    },
    {
      code: "interface S { phase: 'draft' | 'sent'; sentAt?: string }",
      errors: [{ messageId: 'optionalSoup' }],
    },
  ],
})

typedRuleTester.run('no-boolean-state-flags', rules['no-boolean-state-flags'], {
  valid: [
    "type S = { status: 'loading' | 'error' }",
    // A single flag cannot contradict another one.
    'type S = { isOpen: boolean; label: string }',
    'function Panel() { const [isOpen, setOpen] = useState(false); return isOpen }',
    // Non-boolean state is not a flag pair.
    'function Panel() { const [isOpen] = useState(false); const [name] = useState("") }',
  ],
  invalid: [
    {
      code: 'type S = { isLoading: boolean; isError: boolean; data: Payload }',
      errors: [{ messageId: 'parallelFlags' }],
    },
    {
      code: 'function Form() { const [isSubmitting] = useState(false); const [isDone] = useState(false) }',
      errors: [{ messageId: 'parallelState' }],
    },
  ],
})

typedRuleTester.run('no-response-type-assertion', rules['no-response-type-assertion'], {
  valid: [
    'const payload = schema.parse(await response.json())',
    // Asserting to unknown still forces narrowing afterwards.
    'const payload = (await response.json()) as unknown',
    'const count = value as number',
  ],
  invalid: [
    {
      code: 'const payload = (await response.json()) as PaymentResponse',
      errors: [{ messageId: 'assertedPayload' }],
    },
    {
      code: 'const cached = JSON.parse(raw) as CartState',
      errors: [{ messageId: 'assertedPayload' }],
    },
  ],
})

console.log(`ok  ${Object.keys(rules).length} rules pass RuleTester`)
