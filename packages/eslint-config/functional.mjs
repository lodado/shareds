import functionalPlugin from 'eslint-plugin-functional'

const pureFiles = [
  '**/domain/**/*.{ts,mts,cts}',
  '**/selectors/**/*.{ts,mts,cts}',
  '**/reducers/**/*.{ts,mts,cts}',
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
      'no-restricted-globals': [
        'error',
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
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Pass a sampled value; pure functions must not call Math.random().' },
        { object: 'Date', property: 'now', message: 'Pass the current time; pure functions must not call Date.now().' },
        { object: 'globalThis', property: 'fetch', message: 'Move I/O to an adapter and pass data; pure functions must not call globalThis.fetch().' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Pass the current time; pure functions must not construct the current Date.' },
        { selector: "CallExpression[callee.name='Date'][arguments.length=0]", message: 'Pass the current time; pure functions must not call Date().' },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['fs', 'fs/*', 'net', 'net/*', 'http', 'http/*', 'https', 'https/*', 'node:fs', 'node:fs/*', 'node:net', 'node:net/*', 'node:http', 'node:http/*', 'node:https', 'node:https/*'], message: 'Move server I/O to an adapter and pass data; pure functions must not import I/O modules.' }] },
      ],
    },
  },
]
