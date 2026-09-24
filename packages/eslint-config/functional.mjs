import localRulesPlugin from '@lodado/eslint-plugin-local-rules'
import functionalPlugin from 'eslint-plugin-functional'
import base from './index.mjs'

const { TRANSPORT } = localRulesPlugin.runtimeModules
const ENTROPY = 'Pass the id or time in; pure functions must not generate it.'

const baseRules = base.find(({ name }) => name === 'antfu/javascript/rules')?.rules ?? {}

const withBaseRestrictions = (ruleId, additions) => [
  baseRules[ruleId]?.[0] ?? 'error',
  ...(baseRules[ruleId]?.slice(1) ?? []),
  ...additions,
]

const pureFiles = [
  '**/domain/**/*.{ts,mts,cts}',
  '**/selectors/**/*.{ts,mts,cts}',
  '**/*.pure.{ts,mts,cts}',
]

/** Opt-in rules for pure calculations and explicit side-effect boundaries. */
export default [
  {
    name: 'lodado/functional',
    files: pureFiles,
    ignores: ['**/*.test.*', '**/*.spec.*'],
    plugins: { functional: functionalPlugin },
    languageOptions: {
      parserOptions: { project: true },
    },
    rules: {
      'functional/immutable-data': 'error',
      'functional/prefer-immutable-types': 'warn',
      'functional/no-let': 'warn',
      'no-restricted-globals': withBaseRestrictions('no-restricted-globals', [
        { name: 'fetch', message: 'Move I/O to an adapter and pass data; pure functions must not call fetch.' },
        { name: 'window', message: 'Move browser I/O to an adapter and pass data; pure functions must not access window.' },
        { name: 'document', message: 'Move browser I/O to an adapter and pass data; pure functions must not access document.' },
        { name: 'localStorage', message: 'Move storage I/O to an adapter and pass data; pure functions must not access localStorage.' },
        { name: 'sessionStorage', message: 'Move storage I/O to an adapter and pass data; pure functions must not access sessionStorage.' },
        { name: 'navigator', message: 'Move browser I/O to an adapter and pass data; pure functions must not access navigator.' },
        { name: 'process', message: 'Move process I/O to an adapter and pass data; pure functions must not access process.' },
        { name: 'setTimeout', message: 'Move timers to an adapter and pass data; pure functions must not schedule work.' },
        { name: 'setInterval', message: 'Move timers to an adapter and pass data; pure functions must not schedule work.' },
        { name: 'clearTimeout', message: 'Move timers to an adapter and pass data; pure functions must not manage timers.' },
        { name: 'clearInterval', message: 'Move timers to an adapter and pass data; pure functions must not manage timers.' },
        { name: 'crypto', message: ENTROPY },
        { name: 'performance', message: ENTROPY },
      ]),
      'no-restricted-properties': withBaseRestrictions('no-restricted-properties', [
        { object: 'Math', property: 'random', message: 'Pass a sampled value; pure functions must not call Math.random().' },
        { object: 'Date', property: 'now', message: 'Pass the current time; pure functions must not call Date.now().' },
        { object: 'globalThis', property: 'fetch', message: 'Move I/O to an adapter and pass data; pure functions must not call globalThis.fetch().' },
        // `globalThis.Date.now()` and `globalThis.crypto` reach the same sources through the global object.
        ...['Date', 'Math', 'crypto', 'performance', 'setTimeout', 'setInterval', 'localStorage', 'sessionStorage', 'process', 'navigator', 'document'].map(
          (property) => ({ object: 'globalThis', property, message: 'Pass the value in; pure functions must not read globalThis.' }),
        ),
      ]),
      'no-restricted-syntax': withBaseRestrictions('no-restricted-syntax', [
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Pass the current time; pure functions must not construct the current Date.' },
        { selector: "CallExpression[callee.name='Date'][arguments.length=0]", message: 'Pass the current time; pure functions must not call Date().' },
        // `const d = Date; d.now()` hides the source behind an alias.
        { selector: "VariableDeclarator[init.type='Identifier'][init.name=/^(Date|Math|globalThis|crypto|performance)$/]", message: 'Pass the value in; pure functions must not alias a time or random source.' },
        { selector: 'ImportExpression', message: 'Pure functions do not load modules; import statically or move the load to an adapter.' },
        // Host locale and time zone make the same input format differently on each machine.
        { selector: 'CallExpression[callee.property.name=/^toLocale(Date|Time)?String$/][arguments.length=0]', message: 'Pass the locale and time zone explicitly.' },
        { selector: "NewExpression[callee.object.name='Intl'][arguments.length=0]", message: 'Pass the locale and time zone explicitly.' },
      ]),
      'no-restricted-imports': withBaseRestrictions('no-restricted-imports', [
        {
          paths: ['crypto', 'node:crypto'].map((name) => ({ name, allowImportNames: ['createHash', 'createHmac', 'timingSafeEqual'], message: ENTROPY })),
          patterns: [
            { group: ['fs', 'fs/*', 'net', 'net/*', 'http', 'http/*', 'https', 'https/*', 'child_process', 'node:fs', 'node:fs/*', 'node:net', 'node:net/*', 'node:http', 'node:http/*', 'node:https', 'node:https/*', 'node:child_process'], message: 'Move server I/O to an adapter and pass data; pure functions must not import I/O modules.' },
            { group: TRANSPORT, message: 'Move requests to an adapter and pass data; pure functions must not import an HTTP client.' },
          ],
        },
      ]),
    },
  },
]
