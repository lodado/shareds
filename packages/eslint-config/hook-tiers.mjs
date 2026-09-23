import base from './index.mjs'

/**
 * Hook tiers preset (flat) - opt-in. Reads the tier of a file from its path, so a repo needs no
 * policy file:
 *
 *   <dir>/use<Domain>/index.ts          domain entry  exports the domain hook and its types only
 *   <dir>/use<Domain>/use<Domain>.ts    domain hook   composes micro-hooks and pure functions
 *   <dir>/use<Domain>/use<Micro>/...    micro-hook    connects at most one state owner
 *   other *.tsx / *.jsx                 UI            renders; imports domain entries only
 *   other use*.ts                       view hook     DOM only
 *   other modules                       module        api, pure code, composition roots
 *
 * A domain hook that imports no micro-hook may use one owner and the api directly; its first
 * micro-hook moves every owner into micro-hooks. Owners are state libraries, not routers:
 * reading a route param or navigating is screen work, and wrapping it adds only a rename.
 *
 * A flat-config rule keeps the options of the last matching block, so the tier blocks never
 * overlap, keep the base restrictions, and skip the files `functional` and `testing` own.
 */
export const OWNERS = [
  '@tanstack/react-query',
  'swr',
  'zustand',
  'jotai',
  'valtio',
  'react-redux',
  '@reduxjs/toolkit',
  'react-hook-form',
  '@tanstack/react-form',
]

const TRANSPORT = ['axios', 'ky', 'node-fetch']
const EFFECTS = ['useEffect', 'useLayoutEffect', 'useInsertionEffect']
const OWNER_API = '^(?:use[A-Z]|create$|createStore$|atom$|proxy$|configureStore$|createSlice$)'
const API = '(^|/)api(/|$)'
const HOOK_INTERNALS = '(^|/)use[A-Z][^/]*/.+'
const SERVER = ['**/app/**/{page,layout,template,default,not-found}.{jsx,tsx}']
const SKIP = ['**/*.{test,spec}.*', '**/*.stories.*', '**/*.pure.*', '**/domain/**', '**/selectors/**']

const IN_HOOKS = '**/use[A-Z]*/**'
const ENTRY = '**/use[A-Z]*/index.{js,jsx,ts,tsx}'
const DOMAIN = '**/use[A-Z]*/*.{js,jsx,ts,tsx}'
const MICRO = '**/use[A-Z]*/use[A-Z]*/**/*.{js,jsx,ts,tsx}'
const TOO_DEEP = '**/use[A-Z]*/use[A-Z]*/use[A-Z]*/**/*.{js,jsx,ts,tsx}'

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// esquery attribute regexes are slash-delimited, so a literal slash in the pattern is escaped.
const selectorRegex = (source) => source.replaceAll('/', '\\/')
const MICRO_IMPORT = 'ImportDeclaration[source.value=/^\\.\\/use[A-Z]/]'
const VALUE_IMPORT = ':has(:matches(ImportSpecifier[importKind!="type"], ImportDefaultSpecifier, ImportNamespaceSpecifier))'
const importFrom = (regex) => `ImportDeclaration[importKind!="type"][source.value=/${selectorRegex(regex)}/]${VALUE_IMPORT}`

const selector = (value, message) => ({ selector: value, message })
const EFFECT_MESSAGE = 'Effects belong to a micro-hook or a view hook.'
const EFFECT_ACCESS = [
  selector('MemberExpression[property.name=/^use(Layout|Insertion)?Effect$/]', EFFECT_MESSAGE),
  selector('ObjectPattern > Property[key.name=/^use(Layout|Insertion)?Effect$/]', EFFECT_MESSAGE),
]
const NO_JSX = ['JSXElement', 'JSXFragment'].map((node) =>
  selector(node, 'Hooks return values and actions; rendering belongs to UI.'),
)
const deepHookImport = { regex: HOOK_INTERNALS, message: 'Import a domain hook through its folder entry, not files inside it.' }

const baseRules = base.find(({ name }) => name === 'antfu/javascript/rules')?.rules ?? {}
if (baseRules['no-restricted-imports'])
  throw new Error('hook-tiers: base now sets no-restricted-imports; merge its options into the tier blocks')
const withBase = (ruleId, additions) => [
  baseRules[ruleId]?.[0] ?? 'error',
  ...(baseRules[ruleId]?.slice(1) ?? []),
  ...additions,
]

/**
 * @param {object} [options]
 * @param {string[]} [options.owners] state-owner packages; extend `OWNERS` rather than replace it
 * @param {boolean} [options.strict] the strict profile already owns UI and `ui/` view-hook runtime
 *   checks, so only tier placement is added and each defect reports once
 */
export function hookTiers({ owners = OWNERS, strict = false } = {}) {
  const ownerSource = `^(?:${owners.map(escapeRegex).join('|')})(?:/.*)?$`
  const ownerHooks = (message) => ({ regex: ownerSource, importNamePattern: OWNER_API, allowTypeImports: true, message })
  const restrictImports = ({ react = [], transport = true, patterns = [] }) => [
    'error',
    {
      paths: [
        ...(react.length ? [{ name: 'react', importNames: react, message: 'Effects and subscriptions belong to a micro-hook.' }] : []),
        ...(transport ? TRANSPORT.map((name) => ({ name, message: 'Transport belongs to an api module that a micro-hook calls.' })) : []),
      ],
      patterns,
    },
  ]
  const noFetch = withBase('no-restricted-globals', [
    { name: 'fetch', message: 'Transport belongs to an api module that a micro-hook calls.' },
  ])
  const ownerOf = (name) => importFrom(`^${escapeRegex(name)}(?:/.*)?$`)
  const ownerPairs = (scope, message) =>
    owners.flatMap((first, index) =>
      owners.slice(index + 1).map((second) => selector(`${scope}:has(${ownerOf(first)}):has(${ownerOf(second)})`, message(first, second))),
    )
  const microRules = (extra = []) => ({
    'no-restricted-imports': restrictImports({
      patterns: [
        { regex: '^(\\.\\./)+use[A-Z]', message: 'Micro-hooks do not import other hooks; the domain hook passes values between them.' },
        { regex: '(^|/)hooks/', message: 'Micro-hooks do not import other hooks; the domain hook passes values between them.' },
      ],
    }),
    'no-restricted-syntax': withBase('no-restricted-syntax', [
      ...ownerPairs('Program', (first, second) => `A micro-hook connects one state owner; split ${first} and ${second} into two micro-hooks.`),
      ...NO_JSX,
      ...extra,
    ]),
    'no-restricted-globals': noFetch,
  })
  const uiRuntime = strict
    ? {}
    : {
        'no-restricted-imports': restrictImports({
          react: [...EFFECTS, 'useReducer', 'useSyncExternalStore'],
          patterns: [
            ownerHooks('UI reaches state owners through a domain hook.'),
            deepHookImport,
            { regex: API, message: 'UI does not call api or read its DTOs; a micro-hook owns the request.' },
          ],
        }),
        'no-restricted-syntax': withBase('no-restricted-syntax', EFFECT_ACCESS),
      }

  return [
    {
      name: 'lodado/hook-tiers/ui',
      files: ['**/*.{jsx,tsx}'],
      ignores: [IN_HOOKS, ...SERVER, ...SKIP],
      rules: strict ? { 'no-restricted-imports': restrictImports({ transport: false, patterns: [deepHookImport] }) } : uiRuntime,
    },
    {
      name: 'lodado/hook-tiers/view-hook',
      files: ['**/use[A-Z]*.{js,jsx,ts,tsx}'],
      ignores: [IN_HOOKS, ...SKIP, ...(strict ? ['**/ui/**'] : [])],
      rules: {
        'no-restricted-imports': restrictImports({
          patterns: [
            ownerHooks('A hook outside a use<Domain>/ folder is DOM-only; state owners belong to a micro-hook.'),
            deepHookImport,
            { regex: API, message: 'A hook outside a use<Domain>/ folder is DOM-only; requests belong to a micro-hook.' },
          ],
        }),
        'no-restricted-globals': noFetch,
      },
    },
    {
      name: 'lodado/hook-tiers/module',
      files: ['**/*.{js,mjs,cjs,ts,mts,cts}'],
      ignores: [IN_HOOKS, '**/use[A-Z]*.{js,ts}', ...SKIP],
      rules: {
        'no-restricted-imports': restrictImports({
          transport: false,
          patterns: [ownerHooks('State owners and store definitions live in a micro-hook folder.'), deepHookImport],
        }),
      },
    },
    {
      name: 'lodado/hook-tiers/domain',
      files: [DOMAIN],
      ignores: [MICRO, ENTRY, ...SKIP],
      rules: {
        'no-restricted-imports': restrictImports({
          react: [...EFFECTS, 'useSyncExternalStore'],
          patterns: [
            { regex: '^\\.\\./use[A-Z][^/]*/.', message: 'Compose another domain through its folder entry.' },
            { regex: '(^|/)hooks/use[A-Z][^/]*/.', message: 'Compose another domain through its folder entry.' },
          ],
        }),
        'no-restricted-syntax': withBase('no-restricted-syntax', [
          ...EFFECT_ACCESS,
          ...NO_JSX,
          selector(
            `Program:has(${MICRO_IMPORT}):has(${importFrom(ownerSource)})`,
            'A domain hook that composes micro-hooks leaves owner access to them; move this owner into a micro-hook.',
          ),
          selector(
            `Program:has(${MICRO_IMPORT}):has(${importFrom(API)})`,
            'A domain hook that composes micro-hooks leaves requests to them; move this call into a micro-hook.',
          ),
          ...ownerPairs(
            `Program:not(:has(${MICRO_IMPORT}))`,
            (first, second) => `A domain hook without micro-hooks uses one owner directly; split ${first} and ${second} into micro-hooks.`,
          ),
          selector('ExportNamedDeclaration[declaration=null][exportKind!="type"]', 'A domain hook file exports its own declarations; micro-hooks stay private.'),
          selector('ExportAllDeclaration', 'A domain hook file exports its own declarations; micro-hooks stay private.'),
        ]),
        'no-restricted-globals': noFetch,
      },
    },
    {
      name: 'lodado/hook-tiers/domain-entry',
      files: [ENTRY],
      ignores: [MICRO, ...SKIP],
      rules: {
        'no-restricted-syntax': withBase('no-restricted-syntax', [
          selector('ExportAllDeclaration', 'The domain entry names what it exports.'),
          selector('ExportNamedDeclaration[source.value=/^\\.\\/use[A-Z][^/]*\\//]', 'The domain entry exports the domain hook, never a micro-hook.'),
        ]),
      },
    },
    { name: 'lodado/hook-tiers/micro', files: [MICRO], ignores: SKIP, rules: microRules() },
    {
      name: 'lodado/hook-tiers/two-tiers-only',
      files: [TOO_DEEP],
      ignores: SKIP,
      rules: microRules([selector('Program', 'Hooks have two tiers: a domain folder and its micro-hook folders.')]),
    },
  ]
}

export default hookTiers()
