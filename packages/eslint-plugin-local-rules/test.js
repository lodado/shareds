/* eslint-disable @lodado/local-rules/no-console-log -- test progress output */
/**
 * RuleTester suite for every rule shipped by this plugin.
 * Run with `node test.js` - RuleTester throws on the first mismatch.
 */
const { RuleTester } = require('eslint')

const rules = require('./rules')

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
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
  languageOptions: {
    parser: require('@typescript-eslint/parser'),
    ecmaVersion: 2022,
    sourceType: 'module',
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
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
    // Framework projections and component props are not locally-owned state.
    'type QueryControls = { hasNextPage: boolean; isFetchingNextPage: boolean }',
    'type QueryState = { hasNextPage: boolean; isFetchingNextPage: boolean }',
    'interface FeedProps { hasNextPage: boolean; isFetchingNextPage: boolean }',
    'function Panel() { const [isOpen, setOpen] = useState(false); return isOpen }',
    // Non-boolean state is not a flag pair.
    'function Panel() { const [isOpen] = useState(false); const [name] = useState("") }',
  ],
  invalid: [
    {
      code: 'type LoadState = { isLoading: boolean; isError: boolean; data: Payload }; function Panel() { useState<LoadState>({ isLoading: false, isError: false, data }) }',
      errors: [{ messageId: 'parallelFlags' }],
    },
    {
      code: 'interface SubmitState { isSubmitting: boolean; isDone: boolean }; function Form() { useState<SubmitState>({ isSubmitting: false, isDone: false }) }',
      errors: [{ messageId: 'parallelFlags' }],
    },
    {
      code: 'function Panel() { useState<Readonly<{ isLoading: boolean; isError: boolean }>>({ isLoading: false, isError: false }) }',
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

typedRuleTester.run('no-action-in-state', rules['no-action-in-state'], {
  valid: [
    // Data-only union members - the action lives beside the state, not inside it.
    "type S = { status: 'loading' } | { status: 'failure'; reason: 'network' }",
    // A callback on an ordinary props object is not a state field.
    'type Props = { onRetry: () => void; label: string }',
    // Union members keyed by presence, not by a state discriminant.
    'type Link = { href: string } | { onClick: () => void }',
    // The hook returns the action as a sibling of the state.
    "function useDetail() { const [state] = useState({ status: 'loading' }); return { state, retry } }",
    // A plain object with handlers and no state discriminant stays a handler map.
    'const handlers = { retry: () => load(), cancel: () => abort() }',
  ],
  invalid: [
    {
      code: "type S = { status: 'loading' } | { status: 'failure'; retry: () => void }",
      errors: [{ messageId: 'actionInStateType' }],
    },
    {
      code: "type S = { phase: 'idle'; start: () => Promise<void> } | { phase: 'done' }",
      errors: [{ messageId: 'actionInStateType' }],
    },
    {
      code: "const initial = { status: 'failure', retry: () => undefined }",
      errors: [{ messageId: 'actionInStateValue' }],
    },
    {
      code: "setState({ status: 'failure', reservationId: id, retry: load })",
      errors: [{ messageId: 'actionInStateValue' }],
    },
  ],
})

typedRuleTester.run('no-derived-state-member', rules['no-derived-state-member'], {
  valid: [
    // Members with no fields differ by tag alone, and there the tag is the whole fact.
    "type S = { status: 'idle' } | { status: 'loading' } | { status: 'success'; data: Payload }",
    // Different data per member is what a discriminated union is for.
    "type S = { status: 'ready'; page: Page } | { status: 'failure'; failure: ListFailure }",
    "type S = { status: 'shipping'; address: Address; fieldErrors: FieldErrors } | { status: 'review'; quote: Quote; agreed: boolean }",
    // `type` / `kind` variant unions (actions, events, nodes) legitimately repeat a payload per variant.
    "type Action = { type: 'increment'; by: number } | { type: 'decrement'; by: number }",
    "type Failure = { kind: 'network'; retryable: boolean } | { kind: 'server'; retryable: boolean }",
    // A union of references is not inspected.
    'type S = Ready | Paging',
  ],
  invalid: [
    {
      code: "type OrderTableState = { status: 'ready'; page: Page<OrderRow> } | { status: 'paging'; page: Page<OrderRow> }",
      errors: [{ messageId: 'sameDataDifferentTag', data: { tag: 'paging', sibling: 'ready', fields: 'page' } }],
    },
    {
      // readonly and field order do not change the data a member carries.
      code: "type S = { readonly status: 'open'; readonly id: Id; readonly draft: Draft } | { status: 'saving'; draft: Draft; id: Id }",
      errors: [{ messageId: 'sameDataDifferentTag', data: { tag: 'saving', sibling: 'open', fields: 'draft, id' } }],
    },
    {
      code: "type S = { phase: 'idle'; attempt: number } | { phase: 'retrying'; attempt: number } | { phase: 'loading'; attempt: number }",
      errors: [{ messageId: 'sameDataDifferentTag' }, { messageId: 'sameDataDifferentTag' }],
    },
  ],
})

console.log(`ok  ${Object.keys(rules).length} rules pass RuleTester`)

// ---------- interaction: pattern contract ----------
ruleTester.run('interaction-pattern-contract', rules['interaction-pattern-contract'], {
  valid: [
    // dialog with name and an Escape handler in the component
    `function Dialog({ onClose }) {
      useEffect(() => { const onKey = (e) => { if (e.key === 'Escape') onClose() }; document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey) }, [])
      return <div role="dialog" aria-modal="true" aria-labelledby="t"><h2 id="t">Title</h2></div>
    }`,
    // library primitive owns the contract
    `function Wrapper() { return <Dialog.Content role="dialog" aria-label="x" onEscapeKeyDown={close} /> }`,
    // menu button bound to state with ArrowDown handling
    `function Menu() {
      const [open, setOpen] = useState(false)
      const onKey = (e) => { if (e.key === 'ArrowDown') setOpen(true) }
      return <button aria-haspopup="menu" aria-expanded={open} onKeyDown={onKey}>작업</button>
    }`,
    // combobox bound + ArrowDown
    `function Combo() {
      const [open, setOpen] = useState(false)
      return <input role="combobox" aria-expanded={open} aria-controls="l" onKeyDown={(e) => e.key === "ArrowDown" && setOpen(true)} />
    }`,
    // tabs with arrow handling, tab bound
    `function Tabs() {
      const [i, setI] = useState(0)
      const onKey = (e) => { if (e.key === 'ArrowRight') setI(i + 1); if (e.key === 'ArrowLeft') setI(i - 1) }
      return <div role="tablist"><button role="tab" aria-selected={i === 0} aria-controls="p0" onKeyDown={onKey}>A</button></div>
    }`,
    `function Switch() { const [on, setOn] = useState(false); return <button role="switch" aria-checked={on} onClick={() => setOn(!on)} /> }`,
    `function Faq() { const [open, setOpen] = useState(false); return <button aria-expanded={open} aria-controls="faq" onClick={() => setOpen(!open)}>Q</button> }`,
    // plain button: no pattern
    'const Plain = () => <button onClick={go}>Go</button>',
  ],
  invalid: [
    {
      // menu-button.static-expanded fixture: literal never changes
      code: `function Menu() { const [open, setOpen] = useState(false); return <button aria-haspopup="menu" aria-expanded="false" onKeyDown={(e) => e.key === 'ArrowDown' && setOpen(true)}>작업</button> }`,
      errors: [
        {
          messageId: 'literalState',
          data: {
            pattern: 'menu-button',
            attribute: 'aria-expanded',
            stateName: 'expanded',
            guidance: 'aria-expanded={open}으로 상태에 바인딩. 리터럴 문자열 금지.',
          },
        },
      ],
    },
    {
      // dialog without a name and without Escape
      code: `function Dialog() { return <div role="dialog" aria-modal="true"><h2>Title</h2></div> }`,
      errors: [{ messageId: 'missingAttribute' }, { messageId: 'missingKeyHandler' }],
    },
    {
      // combobox.no-arrow: no ArrowDown anywhere in the component
      code: `function Combo() { const [open, setOpen] = useState(false); return <input role="combobox" aria-expanded={open} aria-controls="l" onChange={() => setOpen(true)} /> }`,
      errors: [
        {
          messageId: 'missingKeyHandler',
          data: {
            pattern: 'combobox',
            keys: 'ArrowDown',
            keyHint:
              'ArrowDown / ArrowUp: 닫힘: 열기. 열림: option 이동 · Enter: 활성 option 선택 후 닫기 · Escape: 닫기(열림) / 값 지우기(닫힘, 선택) · Home / End: 입력 커서 처음/끝',
          },
        },
      ],
    },
    {
      // tabs.no-arrow
      code: `function Tabs() { const [i, setI] = useState(0); return <div role="tablist"><button role="tab" aria-selected={i === 0} aria-controls="p0" onClick={() => setI(0)}>A</button></div> }`,
      errors: [{ messageId: 'missingKeyHandler' }],
    },
    {
      code: `const Tab = () => <button role="tab" aria-selected="true">A</button>`,
      errors: [{ messageId: 'literalState' }, { messageId: 'missingAttribute' }],
    },
    {
      code: `const S = () => <div role="switch" aria-checked={true} onClick={toggle} />`,
      errors: [{ messageId: 'literalState' }],
    },
    {
      code: `const S = () => <button role="switch" onClick={toggle} />`,
      errors: [{ messageId: 'missingAttribute' }],
    },
    {
      code: `const L = () => <ul role="listbox"><li role="option">S</li></ul>`,
      errors: [{ messageId: 'missingKeyHandler' }, { messageId: 'missingAttribute' }],
    },
  ],
})

// ---------- interaction: pattern guess ----------
ruleTester.run('interaction-pattern-guess', rules['interaction-pattern-guess'], {
  valid: [
    // dialog.ok fixture shape: overlay declares its role
    `const D = ({ open }) => open && <div className="fixed inset-0"><div role="dialog" aria-modal="true">x</div></div>`,
    `const M = ({ open }) => open && <ul role="menu"><li role="menuitem">a</li></ul>`,
    // conditional plain content, not a widget
    `const T = ({ ok }) => ok && <p>Saved</p>`,
    `const P = ({ open }) => open && <div className="panel">detail</div>`,
    // presentation-only decorated overlay
    `const B = ({ busy }) => busy && <div className="fixed inset-0" role="presentation" />`,
  ],
  invalid: [
    {
      // div-soup.card-click fixture
      code: `function Card() { const [open, setOpen] = useState(false); return <div><div className="bare" onClick={() => setOpen(true)}>Plan</div>{open && <div className="overlay"><div className="panel"><h2>Plan</h2></div></div>}</div> }`,
      errors: [{ messageId: 'overlayWithoutRole' }],
    },
    {
      code: 'const D = ({ open }) => open && <div className="fixed inset-0 bg-black/40"><div>x</div></div>',
      errors: [{ messageId: 'overlayWithoutRole' }],
    },
    {
      code: 'const D = ({ open }) => open && <div className={cn("fixed inset-0", open && "block")}>x</div>',
      errors: [{ messageId: 'overlayWithoutRole' }],
    },
    {
      code: "const D = ({ open }) => open && <div style={{ position: 'fixed', inset: 0 }}>x</div>",
      errors: [{ messageId: 'overlayWithoutRole' }],
    },
    {
      code: 'const M = ({ open }) => open && <ul className="popup"><li onClick={a}>복제</li></ul>',
      errors: [{ messageId: 'listWithoutRole' }],
    },
  ],
})
