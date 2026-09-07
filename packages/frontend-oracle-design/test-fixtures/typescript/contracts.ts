// Synthetic skill-regression contracts, not approved consumer-product policy.
export type RequestState<T> = { status: 'idle' } | { status: 'loading' } | { status: 'success'; data: T }

export type LinkProps = { href: string; onClick?: never } | { href?: never; onClick: () => void }
export function renderLink(_props: LinkProps): void {}

export type RouteRegistry = Record<'home' | 'settings', string>

export type Fields = { title: string; count: number }
export type FieldArgs<T> = { [K in keyof T]-?: [key: K, value: T[K]] }[keyof T]
export function setField<T>(..._args: FieldArgs<T>): void {}

// Inference authority and literal preservation are separate contracts.
export function chooseAllowed<T extends string>(values: readonly T[], value: NoInfer<T>): T {
  if (!values.includes(value)) throw new Error('unexpected value')
  return value
}
export function defineRoutes<const T extends readonly string[]>(paths: T): T {
  return paths
}

export type Dist<T> = T extends string ? T[] : never
export type Whole<T> = [T] extends [string] ? T[] : never
export type IsNever<T> = [T] extends [never] ? true : false
export type Entry = { kind: 'text'; value: string; id: string } | { kind: 'count'; value: number; id: string }
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type PreserveModifiers<T> = { [K in keyof T as K]: T[K] }

declare const userIdBrand: unique symbol
declare const orderIdBrand: unique symbol
export type UserId = string & { readonly [userIdBrand]: 'UserId' }
export type OrderId = string & { readonly [orderIdBrand]: 'OrderId' }
export function parseUserId(value: unknown): UserId {
  if (typeof value !== 'string' || value.length === 0) throw new Error('invalid id')
  // The parser owns this invariant; a brand is not runtime validation.
  return value as UserId
}
export function parseOrderId(value: unknown): OrderId {
  if (typeof value !== 'string' || value.length === 0) throw new Error('invalid id')
  return value as OrderId
}
export type Callback = { handle: (value: string) => void }
export type MethodCallback = { handle(value: string): void }
