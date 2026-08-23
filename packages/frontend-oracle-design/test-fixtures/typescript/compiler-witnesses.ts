export {}

type Equal<Actual, Expected> = (<T>() => T extends Actual ? 1 : 2) extends <T>() => T extends Expected ? 1 : 2
  ? true
  : false
type Expect<T extends true> = T

function chooseAllowed<T extends string>(allowed: readonly T[], value: NoInfer<T>): T {
  if (!allowed.includes(value)) throw new Error(`Unexpected value: ${value}`)
  return value
}

const allowedStatuses = ['draft', 'published'] as const
const chosenStatus = chooseAllowed(allowedStatuses, 'draft')
type noinferPreservesTupleAuthority = Expect<Equal<typeof chosenStatus, 'draft' | 'published'>>

// @ts-expect-error NoInfer keeps the second argument from widening the allowed tuple authority.
chooseAllowed(allowedStatuses, 'archived')

type Route = 'home' | 'settings' | 'billing'

const routeTitles = {
  home: 'Home',
  settings: 'Settings',
  billing: 'Billing',
} satisfies Record<Route, string>
type satisfiesKeepsLiteralKeys = Expect<Equal<keyof typeof routeTitles, Route>>

const missingRouteTitles = {
  home: 'Home',
  settings: 'Settings',
  // @ts-expect-error satisfies Record<Route, ...> rejects missing union members.
} satisfies Record<Route, string>
void missingRouteTitles

const extraRouteTitles = {
  home: 'Home',
  settings: 'Settings',
  billing: 'Billing',
  // @ts-expect-error satisfies Record<Route, ...> rejects keys outside the closed union.
  admin: 'Admin',
} satisfies Record<Route, string>
void extraRouteTitles

type DistElement<T> = T extends readonly (infer Item)[] ? Item : T
type BoxedElement<T> = [T] extends [readonly (infer Item)[]] ? Item : T
type BadNeverCheck<T> = T extends never ? true : false
type GoodNeverCheck<T> = [T] extends [never] ? true : false

type distributiveConditionalMapsUnionMembers = Expect<Equal<DistElement<string | readonly number[]>, string | number>>
type boxedConditionalTreatsUnionAsWhole = Expect<
  Equal<BoxedElement<string | readonly number[]>, string | readonly number[]>
>
type distributiveNeverStaysNever = Expect<Equal<BadNeverCheck<never>, never>>
type boxedNeverCheckReturnsBoolean = Expect<Equal<GoodNeverCheck<never>, true>>

type ThemePatch = {
  keep?: 'dark'
  clear: 'dark' | undefined
}

const omitOptional: ThemePatch = { clear: undefined }
const setBoth: ThemePatch = { keep: 'dark', clear: 'dark' }
void omitOptional
void setBoth

// @ts-expect-error exactOptionalPropertyTypes distinguishes omission from explicit undefined.
const explicitUndefinedOptional: ThemePatch = { keep: undefined, clear: 'dark' }
void explicitUndefinedOptional

// @ts-expect-error required properties that include undefined still must be present.
const missingRequiredUndefined: ThemePatch = {}
void missingRequiredUndefined
