/**
 * Typed strictness preset (flat) - opt-in promise safety, unsafe-any propagation,
 * redundant conditions and exhaustive discriminated unions. Requires type
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
