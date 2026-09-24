/**
 * Tailwind preset (flat) - opt-in for repos on Tailwind CSS v4. Correctness rules fail
 * lint; class ordering and line wrapping are formatter territory and stay off.
 *
 * `eslint-plugin-better-tailwindcss` and `tailwindcss` are optional peers: install both,
 * then point `settings['better-tailwindcss'].entryPoint` at the CSS file that
 * `@import "tailwindcss"` so unknown classes resolve against the real theme.
 */
const betterTailwind = require('eslint-plugin-better-tailwindcss')
const { CODE_FILES } = require('./code-files')

module.exports = [
  {
    ...betterTailwind.configs['correctness-error'],
    name: 'lodado/tailwind',
    files: CODE_FILES,
    rules: {
      ...betterTailwind.configs['correctness-error'].rules,
      'better-tailwindcss/no-duplicate-classes': 'error',
      'better-tailwindcss/no-deprecated-classes': 'warn',
    },
  },
]
