/**
 * Typed strictness preset (flat) - opt-in promise safety, unsafe-any propagation and
 * assertions, redundant conditions and exhaustive discriminated unions. Requires type
 * information; ships `parserOptions.project: true`, override it if the
 * nearest tsconfig.json is not the right project.
 */
module.exports = [
  {
    name: 'lodado/strict-types',
    files: ['**/*.{ts,tsx,mts,cts}'],
    ignores: ['**/*.md/**', '**/*.mdx/**'],

    languageOptions: {
      parserOptions: {
        project: true,
      },
    },
    rules: {
      'ts/no-floating-promises': ['error', { ignoreVoid: false }],
      'ts/no-misused-promises': 'error',
      'ts/no-unsafe-assignment': 'error',
      'ts/no-unsafe-argument': 'error',
      'ts/no-unsafe-call': 'error',
      'ts/no-unsafe-member-access': 'error',
      'ts/no-unsafe-return': 'error',
      'ts/no-unnecessary-condition': 'error',
      // `any` and assertions are how a type contract is bypassed without a type error.
      'ts/no-explicit-any': 'error',
      'ts/no-unsafe-type-assertion': 'error',
      'ts/no-non-null-assertion': 'error',
      'ts/await-thenable': 'error',
      'ts/use-unknown-in-catch-callback-variable': 'error',
      // An agent writes the API it learned; a deprecation since then only shows up with types.
      'ts/no-deprecated': 'warn',
      'ts/switch-exhaustiveness-check': [
        'error',
        {
          allowDefaultCaseForExhaustiveSwitch: false,
          requireDefaultForNonUnion: true,
        },
      ],
    },
  },
]
