/** React preset: airbnb style guide minus the rules TypeScript already covers. */
module.exports = {
  extends: ['airbnb', 'plugin:react-you-might-not-need-an-effect/legacy-strict', 'prettier'],
  plugins: ['react', 'react-hooks'],
  rules: {
    // Hooks contract + effect discipline: effects only synchronize external
    // systems - derived state and effect chains must not compile past lint.
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react-hooks/set-state-in-effect': 'error',
    'react-hooks/set-state-in-render': 'error',

    // airbnb re-enables these on top of the base preset - keep the base decision.
    'no-underscore-dangle': 'off',
    'no-unused-vars': 'off',
    'import/extensions': 'off',
    'import/prefer-default-export': 'off',
    'import/no-extraneous-dependencies': [
      'warn',
      {
        devDependencies: false,
        includeInternal: false,
        includeTypes: false,
      },
    ],

    'lines-between-class-members': 'off',
    'class-methods-use-this': 'off',

    'react/prop-types': 'off', // TypeScript covers this
    'react/require-default-props': 'off',
    'react/button-has-type': 'off',
    'react/jsx-no-useless-fragment': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/jsx-props-no-spreading': 'warn',
    'react/jsx-filename-extension': ['error', { extensions: ['.js', '.jsx', '.ts', '.tsx'] }],
    'react/function-component-definition': [
      'error',
      {
        namedComponents: 'arrow-function',
        unnamedComponents: 'arrow-function',
      },
    ],
  },
}
