import {
  chooseAllowed,
  defineRoutes,
  parseOrderId,
  parseUserId,
  renderLink,
  setField,
  type Callback,
  type Dist,
  type DistributiveOmit,
  type Entry,
  type FieldArgs,
  type Fields,
  type IsNever,
  type LinkProps,
  type MethodCallback,
  type PreserveModifiers,
  type RequestState,
  type RouteRegistry,
  type UserId,
  type Whole,
} from './contracts.js'

// Markers identify harness expectations; tsc does NOT verify their descriptions.
const success: RequestState<number> = { status: 'success', data: 1 }
const idle: RequestState<number> = { status: 'idle' }
// @ts-expect-error witness:payload
const missingData: RequestState<number> = { status: 'success' }

const button = { onClick: () => {} } satisfies LinkProps
renderLink({ ...button })
const href = '/home'
renderLink({ href })
// @ts-expect-error witness:xor-literal
renderLink({ href, onClick: () => {} })
const invalidLink = { href, onClick: () => {} }
// @ts-expect-error witness:xor-variable
renderLink(invalidLink)
// @ts-expect-error witness:xor-spread
renderLink({ ...invalidLink })
// @ts-expect-error witness:xor-undefined
renderLink({ href, onClick: undefined })

setField<Fields>('title', 'ok')
setField<Fields>('count', 1)
// @ts-expect-error witness:tuple-arity
setField<Fields>('title')
const correlated: FieldArgs<Fields> = Math.random() ? ['title', 'ok'] : ['count', 1]
setField<Fields>(...correlated)
const fieldKey: keyof Fields = Math.random() ? 'title' : 'count'
const fieldValue: Fields[keyof Fields] = Math.random() ? 'ok' : 1
// @ts-expect-error witness:correlation
setField<Fields>(fieldKey, fieldValue)

const allowed = ['draft', 'published'] as const
const chosen: 'draft' | 'published' = chooseAllowed(allowed, 'draft')
// @ts-expect-error witness:inference-authority
chooseAllowed(allowed, 'archived')
const inferredRoutes = defineRoutes(['/home', '/settings'])
const routes: readonly ['/home', '/settings'] = inferredRoutes

function assertNever(value: never): never {
  throw new Error(String(value))
}
function exhaust(state: RequestState<number>): string {
  switch (state.status) {
    case 'idle':
      return 'idle'
    case 'loading':
      return 'loading'
    case 'success':
      return String(state.data)
    // mutation:exhaustiveness
    default:
      return assertNever(state)
  }
}

const distributed: Dist<'a' | 1> = ['a']
// @ts-expect-error witness:distribution
const wrongDistributed: Dist<'a' | 1> = [1]
// @ts-expect-error witness:non-distribution
const wrongWhole: Whole<'a' | 1> = ['a']
// @ts-expect-error witness:distributed-never
const wrongNever: Dist<never> = []
const neverDetected: IsNever<never> = true
// @ts-expect-error witness:never-boxing
const wrongNeverDetected: IsNever<never> = false
const omitted: DistributiveOmit<Entry, 'id'> = { kind: 'text', value: 'ok' }
// @ts-expect-error witness:distributive-omit
const wrongOmitted: DistributiveOmit<Entry, 'id'> = { kind: 'text', value: 1 }

const patch: PreserveModifiers<{ readonly name?: string; count: number }> = { count: 1 }
// @ts-expect-error witness:readonly
patch.name = 'changed'

const parsed: UserId = parseUserId('u-1')
// @ts-expect-error witness:raw-brand
const rawId: UserId = 'u-1'
// @ts-expect-error witness:brand-mixing
const wrongId: UserId = parseOrderId('o-1')
const external: unknown = 'u-1'
// @ts-expect-error witness:unknown-before-parser
const unparsedId: UserId = external
const validated: UserId = parseUserId(external)

const callback: Callback = { handle: (value: string) => void value }
// @ts-expect-error witness:callback-variance
const narrowCallback: Callback = { handle: (value: 'narrow') => void value }
const method: MethodCallback = { handle: (value: 'narrow') => void value }

// Variables can carry extra keys: satisfies is not a universal exact-key guard.
const wider = { home: '/', settings: '/', extra: '/' }
const registry = wider satisfies RouteRegistry
const literalRegistry = { home: '/', settings: '/' } satisfies RouteRegistry
// @ts-expect-error witness:registry-missing
const missingRegistry = { home: '/' } satisfies RouteRegistry
// @ts-expect-error witness:registry-extra
const extraRegistry = { home: '/', settings: '/', extra: '/' } satisfies RouteRegistry

const undefinedPayload: RequestState<undefined> = { status: 'success', data: undefined }
// @ts-expect-error witness:required-undefined
const missingUndefined: RequestState<undefined> = { status: 'success' }
