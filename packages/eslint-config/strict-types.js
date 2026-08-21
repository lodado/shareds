/**
 * Typed strictness preset (flat) - opt-in for repos that want discriminated-union
 * exhaustiveness enforced by machine instead of review. Requires type
 * information; ships `parserOptions.project: true`, override it if the
 * nearest tsconfig.json is not the right project.
 */
module.exports = [
  {
    name: 'lodado/strict-types',
    languageOptions: {
      parserOptions: {
        project: true,
      },
    },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        {
          allowDefaultCaseForExhaustiveSwitch: false,
          requireDefaultForNonUnion: true,
        },
      ],
    },
  },
]
